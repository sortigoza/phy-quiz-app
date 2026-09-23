import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

describe('upgrading a library made before private banks', () => {
  it('keeps every bank, attempt and attempt in progress, and starts with no bank keys', async () => {
    // The schema as it stood at version 3, written before the app's own
    // module has opened the database.
    const old = new Dexie('physics-quiz');
    old.version(1).stores({ banks: 'key, id, addedAt' });
    old.version(2).stores({ attempts: 'id, bankId, name, submittedAt', settings: 'key' });
    old.version(3).stores({ inProgress: 'key' });
    await old
      .table('banks')
      .put({ key: 'kth.kinematics@1.0.0', id: 'kth.kinematics', addedAt: 'x' });
    await old
      .table('attempts')
      .put({ id: 'attempt-1', bankId: 'kth.kinematics', submittedAt: 'y' });
    await old.table('inProgress').put({ key: 'current', bankKey: 'kth.kinematics@1.0.0' });
    old.close();

    const { db, listBanks, listAttempts, getBankKey, getInProgress } = await import('./db');
    expect((await listBanks()).map((bank) => bank.key)).toEqual(['kth.kinematics@1.0.0']);
    expect((await listAttempts()).map((attempt) => attempt.id)).toEqual(['attempt-1']);
    expect(await getInProgress()).toMatchObject({ bankKey: 'kth.kinematics@1.0.0' });
    expect(await getBankKey('anything')).toBeUndefined();
    expect(await db.banks.where('kid').equals('anything').count()).toBe(0);
  });
});
