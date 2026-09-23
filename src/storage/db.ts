import Dexie, { type EntityTable } from 'dexie';
import type { Attempt } from '../domain/attempt';

/**
 * Where a bank came from. Recorded so the library can show it, and so ticket 05
 * can offer to re-fetch a bank that arrived by URL.
 */
export type BankSource = { kind: 'upload'; filename: string } | { kind: 'url'; url: string };

/**
 * A bank as held in this browser.
 *
 * `raw` is the exact text that was loaded and is the single source of truth:
 * the parsed bank is derived from it on demand, and the fingerprint is computed
 * over it, so the two can never disagree. The denormalised fields exist so the
 * library screen can render without parsing every bank it holds.
 */
export type StoredBank = {
  /** `id@version`. Two versions of one bank are two rows. */
  key: string;
  id: string;
  version: string;
  title: string;
  author?: string | undefined;
  questionCount: number;
  fingerprint: string;
  source: BankSource;
  /** ISO 8601. */
  addedAt: string;
  raw: string;
};

/** Small preferences remembered in this browser, one row per setting. */
type Setting = { key: 'lastParticipantName'; value: string };

const database = new Dexie('physics-quiz') as Dexie & {
  banks: EntityTable<StoredBank, 'key'>;
  attempts: EntityTable<Attempt, 'id'>;
  settings: EntityTable<Setting, 'key'>;
};

database.version(1).stores({
  banks: 'key, id, addedAt',
});

database.version(2).stores({
  attempts: 'id, bankId, name, submittedAt',
  settings: 'key',
});

export const db = database;

export function bankKey(id: string, version: string): string {
  return `${id}@${version}`;
}

export async function putBank(bank: StoredBank): Promise<void> {
  await db.banks.put(bank);
}

export async function getBank(key: string): Promise<StoredBank | undefined> {
  return db.banks.get(key);
}

/** Every bank in the library, newest first. */
export async function listBanks(): Promise<StoredBank[]> {
  return db.banks.orderBy('addedAt').reverse().toArray();
}

export async function deleteBank(key: string): Promise<void> {
  await db.banks.delete(key);
}

export async function putAttempt(attempt: Attempt): Promise<void> {
  await db.attempts.put(attempt);
}

/** Every attempt held in this browser, newest first. */
export async function listAttempts(): Promise<Attempt[]> {
  return db.attempts.orderBy('submittedAt').reverse().toArray();
}

/** The name last used to start an attempt here, so the start screen can offer it. */
export async function getLastParticipantName(): Promise<string | undefined> {
  return (await db.settings.get('lastParticipantName'))?.value;
}

export async function setLastParticipantName(name: string): Promise<void> {
  await db.settings.put({ key: 'lastParticipantName', value: name });
}
