import { describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { storageProblem } from './problems';

describe('storageProblem', () => {
  it('points at a private window when the browser refuses storage outright', () => {
    const blocked = [
      new Dexie.MissingAPIError('IndexedDB API missing'),
      new Dexie.OpenFailedError(new DOMException('The operation is insecure.', 'SecurityError')),
      new Dexie.OpenFailedError(new DOMException('No mutations allowed', 'InvalidStateError')),
    ];
    for (const error of blocked) {
      expect(storageProblem(error)).toMatch(/private or incognito window/i);
    }
  });

  it('says the device is full when the quota is exceeded, however it is wrapped', () => {
    const full = [
      new DOMException('Quota exceeded', 'QuotaExceededError'),
      new Dexie.QuotaExceededError('Quota exceeded'),
      new Dexie.AbortError('Transaction aborted', new DOMException('', 'QuotaExceededError')),
    ];
    for (const error of full) {
      expect(storageProblem(error)).toMatch(/out of storage space/i);
    }
  });

  it('falls back to what went wrong for anything else', () => {
    expect(storageProblem(new Error('Disk on fire'))).toMatch(
      /could not use .*storage.*Disk on fire/i,
    );
  });
});
