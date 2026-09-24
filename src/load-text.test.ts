import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bankKeyId, encodeBankKey, encryptBank, generateBankKey } from './domain/private-bank';
import { storeBankKey } from './library';
import { loadText } from './load-text';
import { db, getBankKey, listBanks } from './storage/db';

/**
 * Loading the text of any file the library is handed: a bank or a repository,
 * either of them possibly encrypted. SPEC sections 3.4, 3.5 and 3.5.1.
 */

type Fetch = typeof fetch;

const base = 'https://t.github.io/course/';
const upload = { kind: 'upload', filename: 'file.json' } as const;

function bankText(id: string): string {
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
  });
}

function repositoryText(banks: Record<string, unknown>[]): string {
  return JSON.stringify({ formatVersion: 1, id: 'kth.course', title: 'Mechanics', banks });
}

/** Answers each URL under `base` from a table; anything missing is a 404. */
function serve(files: Record<string, string | Error>): Fetch {
  return vi.fn<Fetch>((input) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = files[url.slice(base.length)];
    if (body instanceof Error) return Promise.reject(body);
    return Promise.resolve(
      body === undefined ? new Response('', { status: 404 }) : new Response(body),
    );
  });
}

const fetchOptions = (fetchImpl: Fetch) => ({ fetch: fetchImpl, online: () => true });

beforeEach(async () => {
  await db.banks.clear();
  await db.bankKeys.clear();
});

describe('loadText', () => {
  it('adds a plain bank, exactly as before', async () => {
    const loaded = await loadText(bankText('kth.a'), upload);
    expect(loaded).toMatchObject({ kind: 'bank', result: { ok: true, status: 'added' } });
  });

  it('opens a private repository, and every bank it lists, public or private', async () => {
    const courseKey = generateBankKey();
    const qmKey = generateBankKey();
    const fetchImpl = serve({
      'intro.json': bankText('kth.intro'),
      'qm.json': await encryptBank(bankText('kth.qm'), qmKey),
    });
    const repository = await encryptBank(
      repositoryText([{ url: 'intro.json' }, { url: 'qm.json', key: encodeBankKey(qmKey) }]),
      courseKey,
    );
    const key = await storeBankKey(courseKey);

    const loaded = await loadText(repository, upload, {
      key,
      base: `${base}index.json`,
      ...fetchOptions(fetchImpl),
    });

    expect(loaded).toMatchObject({ kind: 'repository', title: 'Mechanics', private: true });
    if (loaded.kind !== 'repository') return;
    expect(loaded.outcomes.map((outcome) => outcome.kind)).toEqual(['added', 'added']);
    expect(await getBankKey(await bankKeyId(qmKey))).toBeDefined();

    const banks = await listBanks();
    expect(banks.map((bank) => bank.repositoryKids)).toEqual([[key.kid], [key.kid]]);
    expect(banks.find((bank) => bank.id === 'kth.qm')?.kid).toBe(await bankKeyId(qmKey));
  });

  it('opens a later edition of a private repository from the stored key alone', async () => {
    const courseKey = generateBankKey();
    await storeBankKey(courseKey);
    const fetchImpl = serve({ 'a.json': bankText('kth.a') });

    const loaded = await loadText(
      await encryptBank(repositoryText([{ url: 'a.json' }]), courseKey),
      upload,
      { base: `${base}index.json`, ...fetchOptions(fetchImpl) },
    );
    expect(loaded).toMatchObject({ kind: 'repository', outcomes: [{ kind: 'added' }] });
  });

  it('stores each bank key before fetching its bank, so an uploaded copy opens later', async () => {
    const courseKey = generateBankKey();
    const qmKey = generateBankKey();
    const fetchImpl = serve({ 'qm.json': new TypeError('Failed to fetch') });

    const loaded = await loadText(
      await encryptBank(repositoryText([{ url: 'qm.json', key: encodeBankKey(qmKey) }]), courseKey),
      upload,
      { key: await storeBankKey(courseKey), base: `${base}i.json`, ...fetchOptions(fetchImpl) },
    );

    expect(loaded).toMatchObject({ kind: 'repository', outcomes: [{ kind: 'failed' }] });
    const uploaded = await loadText(await encryptBank(bankText('kth.qm'), qmKey), upload);
    expect(uploaded).toMatchObject({ kind: 'bank', result: { ok: true, status: 'added' } });
  });

  it('falls back to a stored key when the course list’s key is out of date, and says so when none opens it', async () => {
    const courseKey = generateBankKey();
    const current = generateBankKey();
    await storeBankKey(current);
    const fetchImpl = serve({
      'held.json': await encryptBank(bankText('kth.held'), current),
      'lost.json': await encryptBank(bankText('kth.lost'), generateBankKey()),
    });
    const stale = encodeBankKey(generateBankKey());

    const loaded = await loadText(
      await encryptBank(
        repositoryText([
          { url: 'held.json', key: stale },
          { url: 'lost.json', key: encodeBankKey(generateBankKey()) },
        ]),
        courseKey,
      ),
      upload,
      { key: await storeBankKey(courseKey), base: `${base}i.json`, ...fetchOptions(fetchImpl) },
    );

    if (loaded.kind !== 'repository') throw new Error('expected a repository');
    expect(loaded.outcomes[0]).toMatchObject({ kind: 'added' });
    expect(loaded.outcomes[1]).toMatchObject({
      kind: 'failed',
      message: expect.stringMatching(/key in the course list is out of date/i) as unknown,
    });
  });

  it('refuses a plaintext repository that carries bank keys, loading nothing', async () => {
    const fetchImpl = serve({});
    const loaded = await loadText(
      repositoryText([{ url: 'qm.json', key: encodeBankKey(generateBankKey()) }]),
      upload,
      { base: `${base}i.json`, ...fetchOptions(fetchImpl) },
    );
    expect(loaded).toMatchObject({
      kind: 'invalid-repository',
      issues: [{ path: 'banks[0].key', message: expect.stringMatching(/public/) as unknown }],
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('asks for a private link when a plaintext repository lists a private bank with no key held', async () => {
    const fetchImpl = serve({
      'qm.json': await encryptBank(bankText('kth.qm'), generateBankKey()),
    });
    const loaded = await loadText(repositoryText([{ url: 'qm.json' }]), upload, {
      base: `${base}i.json`,
      ...fetchOptions(fetchImpl),
    });
    expect(loaded).toMatchObject({
      kind: 'repository',
      private: false,
      outcomes: [
        {
          kind: 'failed',
          message: expect.stringMatching(/private course link or bank link/i) as unknown,
        },
      ],
    });
  });

  it('refuses an encrypted repository listed inside a repository', async () => {
    const innerKey = generateBankKey();
    await storeBankKey(innerKey);
    const fetchImpl = serve({
      'inner.json': await encryptBank(repositoryText([{ url: 'a.json' }]), innerKey),
    });
    const loaded = await loadText(repositoryText([{ url: 'inner.json' }]), upload, {
      base: `${base}i.json`,
      ...fetchOptions(fetchImpl),
    });
    expect(loaded).toMatchObject({
      kind: 'repository',
      outcomes: [{ kind: 'failed', message: expect.stringMatching(/not followed/) as unknown }],
    });
  });

  it('records every private repository that delivered the same bank', async () => {
    const [first, second] = [generateBankKey(), generateBankKey()];
    const fetchImpl = serve({ 'a.json': bankText('kth.a') });
    const course = (key: Uint8Array) => encryptBank(repositoryText([{ url: 'a.json' }]), key);
    const options = { base: `${base}i.json`, ...fetchOptions(fetchImpl) };

    await loadText(await course(first), upload, { key: await storeBankKey(first), ...options });
    await loadText(await course(second), upload, { key: await storeBankKey(second), ...options });

    const [bank] = await listBanks();
    expect(bank?.repositoryKids?.sort()).toEqual(
      [await bankKeyId(first), await bankKeyId(second)].sort(),
    );
  });

  it('never lets an out-of-date entry key take away a key this browser already held', async () => {
    const held = generateBankKey();
    await storeBankKey(held);
    // The entry carries a key this browser holds, but the bank is now under another.
    const fetchImpl = serve({
      'qm.json': await encryptBank(bankText('kth.qm'), generateBankKey()),
    });
    const courseKey = generateBankKey();
    const loaded = await loadText(
      await encryptBank(repositoryText([{ url: 'qm.json', key: encodeBankKey(held) }]), courseKey),
      upload,
      {
        key: await storeBankKey(courseKey),
        base: `${base}i.json`,
        ...fetchOptions(fetchImpl),
      },
    );
    expect(loaded).toMatchObject({ kind: 'repository', outcomes: [{ kind: 'failed' }] });
    expect(await getBankKey(await bankKeyId(held))).toBeDefined();
  });

  it('lets go of an entry key that opens nothing it fetched', async () => {
    const stale = generateBankKey();
    const fetchImpl = serve({ 'a.json': bankText('kth.a') });
    const courseKey = generateBankKey();
    const loaded = await loadText(
      await encryptBank(repositoryText([{ url: 'a.json', key: encodeBankKey(stale) }]), courseKey),
      upload,
      {
        key: await storeBankKey(courseKey),
        base: `${base}i.json`,
        ...fetchOptions(fetchImpl),
      },
    );
    expect(loaded).toMatchObject({ kind: 'repository', outcomes: [{ kind: 'added' }] });
    expect(await getBankKey(await bankKeyId(stale))).toBeUndefined();
  });
});
