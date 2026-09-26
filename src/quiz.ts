import {
  createAttempt,
  normaliseName,
  uuidv7,
  type Attempt,
  type AttemptMode,
  type Confidence,
  type Reveal,
} from './domain/attempt';
import { parseBank, type Bank, type ParseBankResult } from './domain/bank';
import { drawSelection, randomSeed, type Selection } from './domain/selection';
import {
  getBank,
  getInProgress,
  recordSubmittedAttempt,
  putInProgress,
  setAttemptMode,
  setLastParticipantName,
  type StoredBank,
} from './storage/db';
import { APP_VERSION } from './version';

/**
 * Starting, saving, resuming and submitting an attempt: every moment the flow
 * touches storage.
 *
 * Between start and submission the sitting lives in memory as an
 * `InProgressAttempt`, and is written to storage on every answer so that a
 * killed tab can resume it.
 */

/** A sitting in progress, from the moment it begins until it is submitted. */
export type InProgressAttempt = {
  stored: StoredBank;
  bank: Bank;
  name: string;
  seed: number;
  selection: Selection;
  mode: AttemptMode;
  /** Chosen option id by question id. */
  chosen: Record<string, string>;
  /** Confidence by question id. Kept when the chosen option changes. */
  confidence: Record<string, Confidence>;
  /** Answer-first mode: the response written so far by question id, a draft until revealed. */
  responses: Record<string, string>;
  /** Answer-first mode: how each question's options were revealed. Missing means still hidden. */
  revealed: Record<string, Reveal>;
  startedAt: Date;
};

/** Whether the options of a question are on screen: always in standard mode, once revealed in answer-first. */
export function optionsShown(inProgress: InProgressAttempt, questionId: string): boolean {
  return inProgress.mode === 'standard' || questionId in inProgress.revealed;
}

/**
 * The 1-based positions of the questions answered without a confidence, which
 * block submission. Unanswered questions need none.
 */
export function missingConfidence(inProgress: InProgressAttempt): number[] {
  return inProgress.selection.flatMap(({ question }, index) =>
    question.id in inProgress.chosen && !(question.id in inProgress.confidence) ? [index + 1] : [],
  );
}

/**
 * Parses a bank held in the library. Every stored bank validated on the way in,
 * but one accepted by an earlier, more lenient version of the app may not any
 * more, so this can fail, and the caller must say so rather than crash.
 */
export function openStoredBank(stored: StoredBank): ParseBankResult {
  return parseBank(stored.raw);
}

/** Starts a sitting on a bank already read from the library, remembering the name and mode for next time. */
export async function beginAttempt(
  stored: StoredBank,
  bank: Bank,
  name: string,
  count: number,
  mode: AttemptMode,
): Promise<InProgressAttempt> {
  const seed = randomSeed();
  const participant = normaliseName(name);
  await setLastParticipantName(participant);
  await setAttemptMode(mode);

  return {
    stored,
    bank,
    name: participant,
    seed,
    selection: drawSelection(bank, count, seed),
    mode,
    chosen: {},
    confidence: {},
    responses: {},
    revealed: {},
    startedAt: new Date(),
  };
}

/** Scores the sitting, records it in history and clears it from in progress. */
export async function submitAttempt(inProgress: InProgressAttempt): Promise<Attempt> {
  const submittedAt = new Date();
  const attempt = createAttempt({
    id: uuidv7(submittedAt),
    name: inProgress.name,
    bank: inProgress.bank,
    bankFingerprint: inProgress.stored.fingerprint,
    seed: inProgress.seed,
    selection: inProgress.selection,
    mode: inProgress.mode,
    chosen: inProgress.chosen,
    confidence: inProgress.confidence,
    responses: inProgress.responses,
    revealed: inProgress.revealed,
    startedAt: inProgress.startedAt,
    submittedAt,
    appVersion: APP_VERSION,
  });

  await recordSubmittedAttempt(attempt);
  return attempt;
}

/** Writes the sitting to storage, so it survives the tab being closed. `index` is the question on screen. */
export async function saveInProgress(inProgress: InProgressAttempt, index: number): Promise<void> {
  await putInProgress({
    bankKey: inProgress.stored.key,
    bankFingerprint: inProgress.stored.fingerprint,
    bankTitle: inProgress.bank.title,
    name: inProgress.name,
    seed: inProgress.seed,
    questionCount: inProgress.selection.length,
    chosen: inProgress.chosen,
    confidence: inProgress.confidence,
    mode: inProgress.mode,
    responses: inProgress.responses,
    revealed: inProgress.revealed,
    startedAt: inProgress.startedAt.toISOString(),
    index,
  });
}

/**
 * An attempt left in progress in this browser. It can be resumed only when its
 * bank is still held, unchanged and readable, because the selection is replayed
 * from the bank; otherwise `blocked` says why, and discarding is the only way on.
 */
export type PendingAttempt = {
  bankTitle: string;
  answered: number;
  total: number;
} & ({ blocked: null; inProgress: InProgressAttempt; index: number } | { blocked: string });

/** The attempt in progress in this browser, if there is one. */
export async function findInProgress(): Promise<PendingAttempt | undefined> {
  const saved = await getInProgress();
  if (!saved) return undefined;

  const summary = {
    bankTitle: saved.bankTitle,
    answered: Object.keys(saved.chosen).length,
    total: saved.questionCount,
  };

  const stored = await getBank(saved.bankKey);
  if (!stored) return { ...summary, blocked: 'Its question bank is no longer in your library.' };
  if (stored.fingerprint !== saved.bankFingerprint) {
    return { ...summary, blocked: 'Its question bank has been replaced since it was started.' };
  }
  const parsed = openStoredBank(stored);
  if (!parsed.ok) return { ...summary, blocked: 'Its question bank can no longer be opened.' };

  return {
    ...summary,
    blocked: null,
    inProgress: {
      stored,
      bank: parsed.bank,
      name: saved.name,
      seed: saved.seed,
      selection: drawSelection(parsed.bank, saved.questionCount, saved.seed),
      mode: saved.mode ?? 'standard',
      chosen: saved.chosen,
      confidence: saved.confidence ?? {},
      responses: saved.responses ?? {},
      revealed: saved.revealed ?? {},
      startedAt: new Date(saved.startedAt),
    },
    index: saved.index,
  };
}
