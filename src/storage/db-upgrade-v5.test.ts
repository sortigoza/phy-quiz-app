import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';

describe('upgrading a library made before private repositories', () => {
  it('keeps every bank and bank key', async () => {
    // The schema as it stood at version 4, written before the app's own
    // module has opened the database.
    const old = new Dexie('physics-quiz');
    old.version(1).stores({ banks: 'key, id, addedAt' });
    old.version(2).stores({ attempts: 'id, bankId, name, submittedAt', settings: 'key' });
    old.version(3).stores({ inProgress: 'key' });
    old.version(4).stores({ banks: 'key, id, addedAt, kid', bankKeys: 'kid' });
    await old
      .table('banks')
      .put({ key: 'kth.qm@1.0.0', id: 'kth.qm', addedAt: 'x', kid: 'bank-kid' });
    await old.table('bankKeys').put({ kid: 'bank-kid', key: 'stand-in', addedAt: 'x' });
    old.close();

    const { db, listBanks, getBankKey } = await import('./db');
    expect((await listBanks()).map((bank) => bank.kid)).toEqual(['bank-kid']);
    expect(await getBankKey('bank-kid')).toBeDefined();
    expect(await db.banks.where('repositoryKids').equals('anything').count()).toBe(0);
  });
});
