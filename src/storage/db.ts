import Dexie, { type EntityTable } from 'dexie';
import type { Attempt, AttemptMode, Confidence, Reveal, SelfGrade } from '../domain/attempt';
import { withSelfGrade } from '../domain/self-grade';

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
  /** For a private bank, the decrypted text: the ciphertext is never kept. */
  raw: string;
  /**
   * Set only on a private bank: the id of the bank key it was opened with,
   * which is what keeps that key in the key store. See SPEC section 3.4.6.
   */
  kid?: string | undefined;
  /**
   * Set only on a bank a private repository delivered: the ids of the keys of
   * every repository that did, which the bank keeps in the key store. Two
   * courses can share a bank. SPEC section 3.5.1.
   */
  repositoryKids?: string[] | undefined;
};

/**
 * A bank key, held so later editions of a private bank open without the link.
 * `key` is non-extractable: once stored, no script can read the raw bytes back.
 */
export type StoredBankKey = {
  /** The key's RFC 7638 thumbprint, matched against an encrypted file's `kid`. */
  kid: string;
  key: CryptoKey;
  /** ISO 8601. */
  addedAt: string;
};

/**
 * The one attempt in progress in this browser, if any, under a fixed key so
 * there can never be two.
 *
 * It holds only what cannot be recomputed. The selection and option order are
 * replayed from the bank and the seed, exactly as a review is, and the bank's
 * fingerprint is kept so a bank replaced mid-attempt is noticed rather than
 * replayed into a different selection.
 */
export type StoredInProgress = {
  key: typeof IN_PROGRESS_KEY;
  bankKey: string;
  bankFingerprint: string;
  /** Snapshotted so the attempt can be named even after its bank is removed. */
  bankTitle: string;
  name: string;
  seed: number;
  /** The number of questions drawn, already clamped to the bank. */
  questionCount: number;
  /** Chosen option id by question id. */
  chosen: Record<string, string>;
  /** Confidence by question id. Missing on a record saved before ticket 17. */
  confidence?: Record<string, Confidence>;
  /** Missing on a record saved before ticket 19, which was standard. */
  mode?: AttemptMode;
  /** Answer-first mode: the response written so far, by question id, revealed or not. */
  responses?: Record<string, string>;
  /** Answer-first mode: how each question's options were revealed. */
  revealed?: Record<string, Reveal>;
  /** ISO 8601. */
  startedAt: string;
  /** The question on screen, so resuming lands where the participant was. */
  index: number;
};

const IN_PROGRESS_KEY = 'current';

/** Small preferences remembered in this browser, one row per setting. */
type Setting =
  | { key: 'lastParticipantName'; value: string }
  | { key: 'music'; value: 'on' | 'off' }
  | { key: 'attemptMode'; value: AttemptMode };

const database = new Dexie('physics-quiz') as Dexie & {
  banks: EntityTable<StoredBank, 'key'>;
  attempts: EntityTable<Attempt, 'id'>;
  settings: EntityTable<Setting, 'key'>;
  inProgress: EntityTable<StoredInProgress, 'key'>;
  bankKeys: EntityTable<StoredBankKey, 'kid'>;
};

database.version(1).stores({
  banks: 'key, id, addedAt',
});

database.version(2).stores({
  attempts: 'id, bankId, name, submittedAt',
  settings: 'key',
});

database.version(3).stores({
  inProgress: 'key',
});

// Private banks (v1.1). Banks gain a `kid` index so the key store can tell
// when a key's last bank has gone.
database.version(4).stores({
  banks: 'key, id, addedAt, kid',
  bankKeys: 'kid',
});

// Private repositories (v1.1). Banks gain a multi-entry `repositoryKids`
// index, so a repository's key is let go with the last bank it delivered.
database.version(5).stores({
  banks: 'key, id, addedAt, kid, *repositoryKids',
});

export const db = database;

export function bankKey(id: string, version: string): string {
  return `${id}@${version}`;
}

/**
 * Deletes a key once no bank in the library was opened with it or delivered
 * by the repository it opens. Must run inside a transaction over both tables.
 */
async function releaseKeyIfUnused(kid: string | undefined): Promise<void> {
  if (kid === undefined) return;
  const opened = await db.banks.where('kid').equals(kid).count();
  const delivered = await db.banks.where('repositoryKids').equals(kid).count();
  if (opened + delivered === 0) await db.bankKeys.delete(kid);
}

/** The keys a stored bank holds on to. */
function keysHeldBy(bank: StoredBank | undefined): (string | undefined)[] {
  return [bank?.kid, ...(bank?.repositoryKids ?? [])];
}

export async function putBank(bank: StoredBank): Promise<void> {
  await db.transaction('rw', db.banks, db.bankKeys, async () => {
    const previous = await db.banks.get(bank.key);
    await db.banks.put(bank);
    for (const kid of keysHeldBy(previous)) await releaseKeyIfUnused(kid);
  });
}

export async function getBank(key: string): Promise<StoredBank | undefined> {
  return db.banks.get(key);
}

/** Every bank in the library, newest first. */
export async function listBanks(): Promise<StoredBank[]> {
  return db.banks.orderBy('addedAt').reverse().toArray();
}

/** Every edition of one bank held in the library, in no particular order. */
export async function listEditions(id: string): Promise<StoredBank[]> {
  return db.banks.where('id').equals(id).toArray();
}

/** Deletes a bank, and with it any key it held that no other bank holds. */
export async function deleteBank(key: string): Promise<void> {
  await db.transaction('rw', db.banks, db.bankKeys, async () => {
    const bank = await db.banks.get(key);
    await db.banks.delete(key);
    for (const kid of keysHeldBy(bank)) await releaseKeyIfUnused(kid);
  });
}

/** Deletes a bank key unless some bank in the library was opened with it. */
export async function releaseBankKey(kid: string): Promise<void> {
  await db.transaction('rw', db.banks, db.bankKeys, () => releaseKeyIfUnused(kid));
}

export async function putBankKey(key: StoredBankKey): Promise<void> {
  await db.bankKeys.put(key);
}

export async function getBankKey(kid: string): Promise<StoredBankKey | undefined> {
  return db.bankKeys.get(kid);
}

/**
 * Records an attempt submitted in this browser and clears the in-progress one
 * it came from, in one transaction, so it is never both or neither.
 */
export async function recordSubmittedAttempt(attempt: Attempt): Promise<void> {
  await db.transaction('rw', db.attempts, db.inProgress, async () => {
    await db.attempts.put(attempt);
    await db.inProgress.delete(IN_PROGRESS_KEY);
  });
}

/** Saves the attempt in progress, replacing any other: there is only ever one. */
export async function putInProgress(inProgress: Omit<StoredInProgress, 'key'>): Promise<void> {
  await db.inProgress.put({ ...inProgress, key: IN_PROGRESS_KEY });
}

export async function getInProgress(): Promise<StoredInProgress | undefined> {
  return db.inProgress.get(IN_PROGRESS_KEY);
}

export async function deleteInProgress(): Promise<void> {
  await db.inProgress.delete(IN_PROGRESS_KEY);
}

/**
 * Writes the participant's self-grade of one response into a held attempt and
 * returns the attempt as stored. Only local attempts take it (ADR 0004).
 */
export async function gradeResponse(
  attemptId: string,
  questionId: string,
  grade: SelfGrade,
): Promise<Attempt> {
  return db.transaction('rw', db.attempts, async () => {
    const held = await db.attempts.get(attemptId);
    if (!held) throw new Error('This attempt is no longer in your history.');
    const graded = withSelfGrade(held, questionId, grade);
    await db.attempts.put(graded);
    return graded;
  });
}

/** Every attempt held in this browser, newest first. */
export async function listAttempts(): Promise<Attempt[]> {
  return db.attempts.orderBy('submittedAt').reverse().toArray();
}

/**
 * Adds attempts from elsewhere, never replacing one already held: on a
 * collision of ids the existing record wins, which is what makes importing the
 * same file twice change nothing. Returns how many were added and how many
 * were duplicates, including repeats within `attempts` itself.
 */
export async function addAttempts(
  attempts: readonly Attempt[],
): Promise<{ added: number; duplicates: number }> {
  return db.transaction('rw', db.attempts, async () => {
    const held = await db.attempts.bulkGet(attempts.map((attempt) => attempt.id));
    const seen = new Set(held.flatMap((attempt) => (attempt ? [attempt.id] : [])));
    const fresh: Attempt[] = [];
    for (const attempt of attempts) {
      if (seen.has(attempt.id)) continue;
      seen.add(attempt.id);
      fresh.push(attempt);
    }
    await db.attempts.bulkAdd(fresh);
    return { added: fresh.length, duplicates: attempts.length - fresh.length };
  });
}

/** The name last used to start an attempt here, so the start screen can offer it. */
export async function getLastParticipantName(): Promise<string | undefined> {
  const setting = await db.settings.get('lastParticipantName');
  return setting?.key === 'lastParticipantName' ? setting.value : undefined;
}

/** Whether the library plays its music. On until the participant turns it off. */
export async function getMusicOn(): Promise<boolean> {
  return (await db.settings.get('music'))?.value !== 'off';
}

export async function setMusicOn(on: boolean): Promise<void> {
  await db.settings.put({ key: 'music', value: on ? 'on' : 'off' });
}

/** The mode the last attempt here was started in, so the start screen can offer it again. */
export async function getAttemptMode(): Promise<AttemptMode> {
  const setting = await db.settings.get('attemptMode');
  return setting?.key === 'attemptMode' && setting.value === 'answer-first'
    ? 'answer-first'
    : 'standard';
}

export async function setAttemptMode(mode: AttemptMode): Promise<void> {
  await db.settings.put({ key: 'attemptMode', value: mode });
}

export async function setLastParticipantName(name: string): Promise<void> {
  await db.settings.put({ key: 'lastParticipantName', value: name });
}
