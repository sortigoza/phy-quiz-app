import { beforeEach, describe, expect, it } from 'vitest';
import { attemptRecord } from '../test/attempts';
import {
  addAttempts,
  bankKey,
  db,
  getAttemptMode,
  gradeResponse,
  listAttempts,
  recordSubmittedAttempt,
  setAttemptMode,
  deleteBank,
  getBank,
  getBankKey,
  listBanks,
  putBank,
  putBankKey,
  type StoredBank,
} from './db';

function storedBank(overrides: Partial<StoredBank> = {}): StoredBank {
  const id = overrides.id ?? 'kth.kinematics';
  const version = overrides.version ?? '1.0.0';
  return {
    key: bankKey(id, version),
    id,
    version,
    title: 'Kinematics',
    questionCount: 10,
    fingerprint: 'a1b2c3d4',
    source: { kind: 'upload', filename: 'kinematics.json' },
    addedAt: '2026-09-23T10:00:00.000Z',
    raw: '{}',
    ...overrides,
  };
}

beforeEach(async () => {
  await db.banks.clear();
});

describe('bankKey', () => {
  it('identifies a bank by id and version together', () => {
    expect(bankKey('kth.kinematics', '1.0.0')).not.toBe(bankKey('kth.kinematics', '1.1.0'));
    expect(bankKey('kth.kinematics', '1.0.0')).toBe(bankKey('kth.kinematics', '1.0.0'));
  });
});

describe('the bank store', () => {
  it('round trips a bank', async () => {
    const bank = storedBank();
    await putBank(bank);
    expect(await getBank(bank.key)).toEqual(bank);
  });

  it('keeps two versions of the same bank side by side', async () => {
    await putBank(storedBank({ version: '1.0.0' }));
    await putBank(storedBank({ version: '2.0.0' }));
    expect(await listBanks()).toHaveLength(2);
  });

  it('replaces a bank stored under the same id and version', async () => {
    await putBank(storedBank({ fingerprint: 'aaaaaaaa' }));
    await putBank(storedBank({ fingerprint: 'bbbbbbbb' }));
    const banks = await listBanks();
    expect(banks).toHaveLength(1);
    expect(banks[0]?.fingerprint).toBe('bbbbbbbb');
  });

  it('lists banks newest first', async () => {
    await putBank(storedBank({ id: 'older', addedAt: '2026-01-01T00:00:00.000Z' }));
    await putBank(storedBank({ id: 'newest', addedAt: '2026-06-01T00:00:00.000Z' }));
    await putBank(storedBank({ id: 'middle', addedAt: '2026-03-01T00:00:00.000Z' }));
    expect((await listBanks()).map((bank) => bank.id)).toEqual(['newest', 'middle', 'older']);
  });

  it('deletes a bank without touching the others', async () => {
    await putBank(storedBank({ id: 'keep' }));
    await putBank(storedBank({ id: 'remove' }));
    await deleteBank(bankKey('remove', '1.0.0'));
    expect((await listBanks()).map((bank) => bank.id)).toEqual(['keep']);
  });

  it('reports nothing for a bank that was never stored', async () => {
    expect(await getBank('missing@1.0.0')).toBeUndefined();
  });
});

describe('the bank key store', () => {
  async function storedKey(kid: string) {
    return {
      kid,
      key: await crypto.subtle.importKey('raw', new Uint8Array(32), 'AES-GCM', false, ['decrypt']),
      addedAt: '2026-09-23T10:00:00.000Z',
    };
  }

  beforeEach(async () => {
    await db.bankKeys.clear();
  });

  it('holds a key as a non-extractable CryptoKey, looked up by kid', async () => {
    await putBankKey(await storedKey('kid-a'));
    const held = await getBankKey('kid-a');
    expect(held?.key).toBeInstanceOf(CryptoKey);
    expect(held?.key.extractable).toBe(false);
    expect(await getBankKey('kid-b')).toBeUndefined();
  });

  it('deletes a key when the last bank opened with it leaves the library', async () => {
    await putBankKey(await storedKey('kid-a'));
    await putBank(storedBank({ version: '1.0.0', kid: 'kid-a' }));
    await putBank(storedBank({ version: '1.1.0', kid: 'kid-a' }));

    await deleteBank(bankKey('kth.kinematics', '1.0.0'));
    expect(await getBankKey('kid-a')).toBeDefined();

    await deleteBank(bankKey('kth.kinematics', '1.1.0'));
    expect(await getBankKey('kid-a')).toBeUndefined();
  });

  it('keeps keys that belong to other banks', async () => {
    await putBankKey(await storedKey('kid-a'));
    await putBankKey(await storedKey('kid-b'));
    await putBank(storedBank({ id: 'first', kid: 'kid-a' }));
    await putBank(storedBank({ id: 'second', kid: 'kid-b' }));
    await putBank(storedBank({ id: 'plain' }));

    await deleteBank(bankKey('first', '1.0.0'));
    await deleteBank(bankKey('plain', '1.0.0'));
    expect(await getBankKey('kid-a')).toBeUndefined();
    expect(await getBankKey('kid-b')).toBeDefined();
  });

  it('lets a key go when its bank is replaced by an edition under a rotated key', async () => {
    await putBankKey(await storedKey('old'));
    await putBankKey(await storedKey('new'));
    await putBank(storedBank({ kid: 'old' }));

    await putBank(storedBank({ kid: 'new' }));
    expect(await getBankKey('old')).toBeUndefined();
    expect(await getBankKey('new')).toBeDefined();
  });

  it('keeps a private repository’s key while any bank it delivered remains', async () => {
    await putBankKey(await storedKey('course'));
    await putBank(storedBank({ id: 'public-one', repositoryKids: ['course'] }));
    await putBank(storedBank({ id: 'private-one', kid: 'bank', repositoryKids: ['course'] }));

    await deleteBank(bankKey('public-one', '1.0.0'));
    expect(await getBankKey('course')).toBeDefined();

    await deleteBank(bankKey('private-one', '1.0.0'));
    expect(await getBankKey('course')).toBeUndefined();
  });

  it('lets a repository key go when its last bank is replaced by one from elsewhere', async () => {
    await putBankKey(await storedKey('course'));
    await putBank(storedBank({ repositoryKids: ['course'] }));

    await putBank(storedBank());
    expect(await getBankKey('course')).toBeUndefined();
  });

  it('keeps each repository’s key while a bank both delivered remains', async () => {
    await putBankKey(await storedKey('course-a'));
    await putBankKey(await storedKey('course-b'));
    await putBank(storedBank({ repositoryKids: ['course-a', 'course-b'] }));
    expect(await getBankKey('course-a')).toBeDefined();
    expect(await getBankKey('course-b')).toBeDefined();

    await deleteBank(bankKey('kth.kinematics', '1.0.0'));
    expect(await db.bankKeys.count()).toBe(0);
  });
});

describe('the attempt mode setting', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('is standard until another is chosen, and then remembers it', async () => {
    expect(await getAttemptMode()).toBe('standard');
    await setAttemptMode('answer-first');
    expect(await getAttemptMode()).toBe('answer-first');
  });
});

describe('self-grading a held attempt', () => {
  const written = attemptRecord({
    mode: 'answer-first',
    answers: [
      { questionId: 'q1', chosenOptionId: 'a', correctOptionId: 'a', response: 'Newton, kg m/s²' },
      { questionId: 'q2', chosenOptionId: null, correctOptionId: 'b', responseSkipped: true },
    ],
  });

  beforeEach(async () => {
    await db.attempts.clear();
  });

  it('writes the self-grade into the stored attempt and returns it', async () => {
    await recordSubmittedAttempt(written);
    const graded = await gradeResponse(written.id, 'q1', 'yes');
    expect(graded.answers[0]?.selfGrade).toBe('yes');
    expect(await listAttempts()).toEqual([graded]);
  });

  it('refuses an imported attempt and leaves it as it was', async () => {
    await addAttempts([{ ...written, origin: 'imported' }]);
    await expect(gradeResponse(written.id, 'q1', 'yes')).rejects.toThrow(/imported/i);
    expect((await listAttempts())[0]?.answers[0]).not.toHaveProperty('selfGrade');
  });

  it('refuses an attempt no longer held', async () => {
    await expect(gradeResponse(written.id, 'q1', 'yes')).rejects.toThrow(/no longer/i);
  });
});
