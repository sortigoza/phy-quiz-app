import { createAttempt, normaliseName, uuidv7, type Attempt } from './domain/attempt';
import { parseBank, type Bank } from './domain/bank';
import { drawSelection, randomSeed, type Selection } from './domain/selection';
import { putAttempt, setLastParticipantName, type StoredBank } from './storage/db';
import { APP_VERSION } from './version';

/**
 * Starting and submitting an attempt: the two moments the flow touches storage.
 *
 * Between them the sitting lives in memory as an `InProgressAttempt`. Ticket 07 persists it on
 * every answer so a killed tab can resume.
 */

/** A sitting in progress, from the moment it begins until it is submitted. */
export type InProgressAttempt = {
  stored: StoredBank;
  bank: Bank;
  name: string;
  seed: number;
  selection: Selection;
  /** Chosen option id by question id. */
  chosen: Record<string, string>;
  startedAt: Date;
};

/**
 * Parses a bank held in the library. Every stored bank validated on the way in,
 * so a failure here means the store itself was tampered with or corrupted.
 */
export function readStoredBank(stored: StoredBank): Bank {
  const parsed = parseBank(stored.raw);
  if (!parsed.ok) throw new Error(`Stored bank ${stored.key} no longer validates`);
  return parsed.bank;
}

/** Starts a sitting on a bank already read from the library, remembering the name for next time. */
export async function beginAttempt(
  stored: StoredBank,
  bank: Bank,
  name: string,
  count: number,
): Promise<InProgressAttempt> {
  const seed = randomSeed();
  const participant = normaliseName(name);
  await setLastParticipantName(participant);

  return {
    stored,
    bank,
    name: participant,
    seed,
    selection: drawSelection(bank, count, seed),
    chosen: {},
    startedAt: new Date(),
  };
}

/** Scores the sitting and records it in history. */
export async function submitAttempt(inProgress: InProgressAttempt): Promise<Attempt> {
  const submittedAt = new Date();
  const attempt = createAttempt({
    id: uuidv7(submittedAt),
    name: inProgress.name,
    bank: inProgress.bank,
    bankFingerprint: inProgress.stored.fingerprint,
    seed: inProgress.seed,
    selection: inProgress.selection,
    chosen: inProgress.chosen,
    startedAt: inProgress.startedAt,
    submittedAt,
    appVersion: APP_VERSION,
  });

  await putAttempt(attempt);
  return attempt;
}
