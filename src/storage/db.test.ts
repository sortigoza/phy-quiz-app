import { beforeEach, describe, expect, it } from 'vitest';
import { bankKey, db, deleteBank, getBank, listBanks, putBank, type StoredBank } from './db';

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
