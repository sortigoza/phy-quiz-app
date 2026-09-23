import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openBankLink, takeBankLink } from './bank-link';
import {
  bankKeyId,
  bankLink,
  encodeBankKey,
  encryptBank,
  generateBankKey,
} from './domain/private-bank';
import { addBankFromText } from './library';
import { db, listBanks } from './storage/db';

const bankText = JSON.stringify({
  formatVersion: 1,
  id: 'kth.kinematics',
  version: '1.0.0',
  title: 'Kinematics in one dimension',
  questions: [
    {
      id: 'q1',
      prompt: 'A ball falls from rest for one second. What is its speed?',
      options: [
        { id: 'a', text: '4.91 m/s' },
        { id: 'b', text: '9.81 m/s' },
      ],
      answer: 'b',
      explanation: 'From rest, v = gt.',
    },
  ],
});

const fileUrl = 'https://a-teacher.github.io/banks/kinematics.bank.jwe.json';

/** A stand-in for the address bar: a location and the history that rewrites it. */
function addressBar(href: string) {
  const location = new URL(href);
  const history = {
    replaceState: vi.fn((_state: unknown, _unused: string, url: string) => {
      location.href = new URL(url, location.href).href;
    }),
  };
  return { location, history };
}

function respondWith(outcome: Response | Error) {
  return vi.fn(() =>
    outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome),
  );
}

const fetchOptions = (fetch: ReturnType<typeof respondWith>) => ({
  fetch: fetch as unknown as typeof globalThis.fetch,
  online: () => true,
  pageProtocol: 'https:',
});

beforeEach(async () => {
  await Promise.all([db.banks.clear(), db.bankKeys.clear()]);
});

describe('takeBankLink', () => {
  it('reads a bank link and clears it from the address bar at once', () => {
    const key = generateBankKey();
    const { location, history } = addressBar(
      bankLink('https://example.org/app/?lang=sv', fileUrl, key),
    );

    expect(takeBankLink(location, history)).toEqual({ kind: 'bank-link', url: fileUrl, key });
    expect(location.href).toBe('https://example.org/app/?lang=sv');
    expect(location.href).not.toContain(encodeBankKey(key));
  });

  it('clears a broken bank link too, since it may still hold a key', () => {
    const { location, history } = addressBar('https://example.org/app/#bank=x&key=short');
    expect(takeBankLink(location, history)).toEqual({ kind: 'broken' });
    expect(location.hash).toBe('');
  });

  it('leaves any other address alone', () => {
    const { location, history } = addressBar('https://example.org/app/#share=abc');
    expect(takeBankLink(location, history)).toEqual({ kind: 'none' });
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});

describe('openBankLink', () => {
  it('stores the key, fetches the file and adds the decrypted bank', async () => {
    const key = generateBankKey();
    const fetch = respondWith(new Response(await encryptBank(bankText, key)));

    const opened = await openBankLink(
      { kind: 'bank-link', url: fileUrl, key },
      fetchOptions(fetch),
    );

    expect(opened).toMatchObject({ kind: 'fetched', result: { ok: true, status: 'added' } });
    expect(fetch).toHaveBeenCalledWith(fileUrl, expect.anything());
    const [bank] = await listBanks();
    expect(bank?.raw).toBe(bankText);
    expect(bank?.kid).toBe(await bankKeyId(key));
    expect(bank?.source).toEqual({ kind: 'url', url: fileUrl });
  });

  it('keeps the key when the fetch fails, so an uploaded copy opens later', async () => {
    const key = generateBankKey();
    const opened = await openBankLink(
      { kind: 'bank-link', url: fileUrl, key },
      fetchOptions(respondWith(new TypeError('Failed to fetch'))),
    );
    expect(opened).toEqual({ kind: 'unreachable', failure: { kind: 'blocked' } });

    const uploaded = await addBankFromText(await encryptBank(bankText, key), {
      kind: 'upload',
      filename: 'kinematics.bank.jwe.json',
    });
    expect(uploaded).toMatchObject({ ok: true, status: 'added' });
  });

  it('says the key is wrong, not missing, when the link holds another bank’s key', async () => {
    const fetch = respondWith(new Response(await encryptBank(bankText, generateBankKey())));
    const opened = await openBankLink(
      { kind: 'bank-link', url: fileUrl, key: generateBankKey() },
      fetchOptions(fetch),
    );
    expect(opened).toMatchObject({
      kind: 'fetched',
      result: { ok: false, reason: 'undecryptable' },
    });
    expect(await listBanks()).toHaveLength(0);
    // A key that opens nothing is not worth keeping.
    expect(await db.bankKeys.count()).toBe(0);
  });

  it('opens a plaintext bank too, since the link only says where the file is', async () => {
    const fetch = respondWith(new Response(bankText));
    const opened = await openBankLink(
      { kind: 'bank-link', url: fileUrl, key: generateBankKey() },
      fetchOptions(fetch),
    );
    expect(opened).toMatchObject({ kind: 'fetched', result: { ok: true, status: 'added' } });
  });
});
