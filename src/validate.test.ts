import { beforeEach, describe, expect, it } from 'vitest';
import { encryptBank, generateBankKey } from './domain/private-bank';
import { storeBankKey } from './library';
import { db } from './storage/db';
import { validateText } from './validate';

const bank = {
  formatVersion: 1,
  id: 'test.arithmetic',
  version: '1.0.0',
  title: 'Arithmetic',
  questions: [
    {
      id: 'q1',
      prompt: 'What is 5 times 3?',
      options: [
        { id: 'a', text: '15' },
        { id: 'b', text: '8' },
      ],
      answer: 'a',
      explanation: 'Multiply.',
    },
  ],
};

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('validateText', () => {
  it('reports a valid bank, and stores nothing', async () => {
    const result = await validateText(JSON.stringify(bank));
    expect(result).toMatchObject({ ok: true, kind: 'bank', bank: { title: 'Arithmetic' } });
    expect(await db.banks.count()).toBe(0);
  });

  it('reports the issues of an invalid bank', async () => {
    const result = await validateText(JSON.stringify({ ...bank, titel: 'x' }));
    expect(result).toMatchObject({
      ok: false,
      kind: 'bank',
      issues: [{ path: 'titel' }],
    });
  });

  it('checks a bank repository as a repository', async () => {
    const repository = JSON.stringify({
      formatVersion: 1,
      title: 'A course',
      banks: [{ url: 'a.json' }, { url: 'b.json' }],
    });
    expect(await validateText(repository)).toEqual({
      ok: true,
      kind: 'repository',
      title: 'A course',
      count: 2,
    });
  });

  it('opens a private bank with a key already held, and says so when there is none', async () => {
    const raw = generateBankKey();
    const encrypted = await encryptBank(JSON.stringify(bank), raw);

    expect(await validateText(encrypted)).toMatchObject({ ok: false, kind: 'private' });

    await storeBankKey(raw);
    expect(await validateText(encrypted)).toMatchObject({ ok: true, kind: 'bank' });
  });
});
