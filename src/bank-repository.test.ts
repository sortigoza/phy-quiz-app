import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadBankRepository } from './bank-repository';
import type { BankRepository } from './domain/bank-repository';
import { encryptBank, generateBankKey } from './domain/private-bank';
import { addBankFromText, storeBankKey } from './library';
import { db, listBanks } from './storage/db';

/**
 * Loading every bank a repository lists: each exactly as if its URL had been
 * pasted alone, and one failing never stopping the others. SPEC section 3.5.
 */

type Fetch = typeof fetch;

function bankText(id: string, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    formatVersion: 1,
    id,
    version: '1.0.0',
    title: `Bank ${id}`,
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
    ...overrides,
  });
}

/** Answers each URL from a table; anything missing is a 404. */
function serve(files: Record<string, string | Error>): Fetch {
  return vi.fn<Fetch>((input) => {
    const body = files[input instanceof Request ? input.url : input.toString()];
    if (body instanceof Error) return Promise.reject(body);
    return Promise.resolve(
      body === undefined ? new Response('', { status: 404 }) : new Response(body),
    );
  });
}

function repository(...urls: (string | null)[]): BankRepository {
  return {
    title: 'Mechanics',
    entries: urls.map((url) => ({ given: url ?? 'relative.json', url })),
  };
}

const options = (fetchImpl: Fetch) => ({ fetch: fetchImpl, online: () => true });

beforeEach(async () => {
  await db.banks.clear();
  await db.bankKeys.clear();
});

describe('loadBankRepository', () => {
  it('adds every bank it lists, reporting each in order', async () => {
    const fetchImpl = serve({
      'https://x.org/a.json': bankText('bank.a'),
      'https://x.org/b.json': bankText('bank.b'),
    });

    const outcomes = await loadBankRepository(
      repository('https://x.org/a.json', 'https://x.org/b.json'),
      options(fetchImpl),
    );

    expect(outcomes.map((outcome) => outcome.kind)).toEqual(['added', 'added']);
    expect((await listBanks()).map((bank) => bank.id).sort()).toEqual(['bank.a', 'bank.b']);
    // Each bank remembers its own address, not the repository's.
    expect(
      (await listBanks())
        .map((bank) => bank.source)
        .sort((a, b) => (a.kind === 'url' && b.kind === 'url' ? a.url.localeCompare(b.url) : 0)),
    ).toEqual([
      { kind: 'url', url: 'https://x.org/a.json' },
      { kind: 'url', url: 'https://x.org/b.json' },
    ]);
  });

  it('keeps going past failures, and says why each one failed', async () => {
    await addBankFromText(bankText('bank.held'), { kind: 'upload', filename: 'held.json' });
    await addBankFromText(bankText('bank.changed'), { kind: 'upload', filename: 'c.json' });
    const fetchImpl = serve({
      'https://x.org/good.json': bankText('bank.good'),
      'https://x.org/held.json': bankText('bank.held'),
      'https://x.org/changed.json': bankText('bank.changed', { title: 'Edited' }),
      'https://x.org/invalid.json': bankText('bank.invalid', { questions: [] }),
      'https://blocked.org/b.json': new TypeError('Failed to fetch'),
      'https://x.org/nested.json': JSON.stringify({ formatVersion: 1, title: 'x', banks: [] }),
    });

    const outcomes = await loadBankRepository(
      repository(
        'https://x.org/good.json',
        'https://x.org/held.json',
        'https://x.org/changed.json',
        'https://x.org/invalid.json',
        'https://blocked.org/b.json',
        'https://x.org/missing.json',
        'https://x.org/nested.json',
        null,
      ),
      options(fetchImpl),
    );

    expect(outcomes.map((outcome) => outcome.kind)).toEqual([
      'added',
      'unchanged',
      'conflict',
      'failed',
      'failed',
      'failed',
      'failed',
      'failed',
    ]);
    const messages = outcomes.map((outcome) => (outcome.kind === 'failed' ? outcome.message : ''));
    expect(messages[3]).toMatch(/not a valid bank.*questions/i);
    expect(messages[4]).toMatch(/cross-origin/i);
    expect(messages[5]).toMatch(/404/);
    expect(messages[6]).toMatch(/repository.*not followed/i);
    expect(messages[7]).toMatch(/relative/i);

    // The changed bank waits for a decision; nothing else was lost or half-added.
    expect((await listBanks()).map((bank) => bank.title).sort()).toEqual([
      'Bank bank.changed',
      'Bank bank.good',
      'Bank bank.held',
    ]);
  });

  it('opens a private bank with a key already stored, and asks for the link otherwise', async () => {
    const known = generateBankKey();
    await storeBankKey(known);
    const fetchImpl = serve({
      'https://x.org/known.json': await encryptBank(bankText('bank.known'), known),
      'https://x.org/unknown.json': await encryptBank(bankText('bank.unknown'), generateBankKey()),
    });

    const outcomes = await loadBankRepository(
      repository('https://x.org/known.json', 'https://x.org/unknown.json'),
      options(fetchImpl),
    );

    expect(outcomes[0]).toMatchObject({ kind: 'added', bank: { id: 'bank.known' } });
    expect(outcomes[1]).toMatchObject({
      kind: 'failed',
      message: expect.stringMatching(/link your teacher sent/) as unknown,
    });
  });

  it('fetches a few at a time, and reports progress as each settles', async () => {
    let inFlight = 0;
    let most = 0;
    const fetchImpl = vi.fn<Fetch>(async (input) => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return new Response(
        bankText(`bank.${(input instanceof Request ? input.url : input.toString()).slice(-6, -5)}`),
      );
    });
    const progress: number[] = [];

    const urls = [...'abcdefghij'].map((letter) => `https://x.org/${letter}.json`);
    await loadBankRepository(repository(...urls), {
      ...options(fetchImpl),
      onProgress: (settled) => progress.push(settled),
    });

    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(most).toBe(4);
    expect(progress).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
