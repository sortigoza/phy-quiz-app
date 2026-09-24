import { z } from 'zod';
import { attemptCode, normaliseName, type Attempt } from './attempt';
import { formatPath } from './bank';
import { correctCount } from './scoring';

/**
 * The history file: attempts exported from one browser, to be imported into
 * another. See SPEC.md sections 6.2 and 6.3.
 *
 * Unlike a bank, this format is read leniently. The envelope's
 * `formatVersion` is bumped only on breaking changes, so a later app may add
 * fields to an attempt without bumping it, and this reader must still take the
 * attempts it can understand. Unknown keys are dropped, not refused.
 */

export const HISTORY_FORMAT = 'physics-quiz-history';

/** The only history file version this app understands. */
export const HISTORY_FORMAT_VERSION = 1;

/** The envelope around exported attempts. */
export type HistoryFile = {
  format: typeof HISTORY_FORMAT;
  formatVersion: typeof HISTORY_FORMAT_VERSION;
  /** ISO 8601. */
  exportedAt: string;
  appVersion: string;
  attempts: Attempt[];
};

/** The text of a history file holding these attempts. */
export function writeHistoryFile(
  attempts: Attempt[],
  exportedAt: Date,
  appVersion: string,
): string {
  const file: HistoryFile = {
    format: HISTORY_FORMAT,
    formatVersion: HISTORY_FORMAT_VERSION,
    exportedAt: exportedAt.toISOString(),
    appVersion,
    attempts,
  };
  return JSON.stringify(file, null, 2);
}

/** `physics-quiz-history-YYYY-MM-DD.json`, dated in the exporter's own time zone. */
export function historyFileName(exportedAt: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const date = `${exportedAt.getFullYear()}-${pad(exportedAt.getMonth() + 1)}-${pad(exportedAt.getDate())}`;
  return `${HISTORY_FORMAT}-${date}.json`;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A moment, written back exactly as `Date.toISOString` writes it. History is
 * sorted by comparing these strings, which only works when every one has the
 * same shape: UTC, with milliseconds.
 */
const isoTime = z.iso.datetime({ offset: true }).transform((time) => new Date(time).toISOString());

const answerSchema = z.object({
  questionId: z.string().min(1).max(128),
  chosenOptionId: z.string().min(1).max(16).nullable(),
  correctOptionId: z.string().min(1).max(16),
});

/**
 * One attempt as it arrives in a file. The code is derived again from the id
 * and the origin is always `imported`, so neither is taken from the file.
 */
const attemptSchema = z
  .object({
    // Lower-cased, so the same attempt cannot slip past deduplication by case.
    id: z
      .string()
      .regex(uuid, 'id must be a UUID')
      .transform((id) => id.toLowerCase()),
    name: z
      .string()
      .transform(normaliseName)
      .pipe(z.string().min(1, 'name must not be empty').max(200)),
    bankId: z.string().min(1).max(128),
    bankVersion: z.string().min(1).max(64),
    bankFingerprint: z.string().min(1).max(64),
    bankTitle: z.string().min(1).max(200),
    startedAt: isoTime,
    submittedAt: isoTime,
    durationMs: z.int().min(0),
    seed: z
      .int()
      .min(0)
      .max(2 ** 32 - 1),
    questionCount: z.int().min(1).max(500),
    correctCount: z.int().min(0),
    answers: z.array(answerSchema).min(1).max(500),
    appVersion: z.string().min(1).max(64),
  })
  .superRefine((attempt, ctx) => {
    if (attempt.submittedAt < attempt.startedAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['submittedAt'],
        message: `submittedAt ${attempt.submittedAt} is before startedAt ${attempt.startedAt}`,
      });
    }
    if (attempt.questionCount !== attempt.answers.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['questionCount'],
        message: `questionCount is ${attempt.questionCount} but there are ${attempt.answers.length} answers`,
      });
    }
    const counted = correctCount(attempt.answers);
    if (attempt.correctCount !== counted) {
      ctx.addIssue({
        code: 'custom',
        path: ['correctCount'],
        message: `correctCount is ${attempt.correctCount} but the answers score ${counted}`,
      });
    }
  })
  .transform((attempt): Attempt => ({
    ...attempt,
    code: attemptCode(attempt.id),
    origin: 'imported',
  }));

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every problem with one attempt, each addressed at its field, in one line. */
function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const path = formatPath(issue.path);
      return path === '' ? issue.message : `${path}: ${issue.message}`;
    })
    .join('; ');
}

/** An attempt in a file that could not be taken, and why. */
export type RejectedAttempt = {
  /** 1-based position in the file's `attempts`. */
  position: number;
  reason: string;
};

export type ReadHistoryFileResult =
  | { ok: true; attempts: Attempt[]; rejected: RejectedAttempt[] }
  /** The file as a whole could not be read; nothing in it was taken. */
  | { ok: false; message: string };

/**
 * Reads the text of a history file. An envelope this app does not understand
 * rejects the whole file; within a good envelope, each attempt stands or falls
 * on its own, so one damaged record never costs the other twenty-nine.
 */
export function readHistoryFile(text: string): ReadHistoryFileResult {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return { ok: false, message: 'This file is not valid JSON.' };
  }

  if (!isObject(document) || document.format !== HISTORY_FORMAT) {
    return {
      ok: false,
      message:
        'This is not a history file. A history file is what History → Export saves, named physics-quiz-history-….json.',
    };
  }
  if (document.formatVersion !== HISTORY_FORMAT_VERSION) {
    return {
      ok: false,
      message: `This history file is format version ${JSON.stringify(document.formatVersion)}, and this app reads only version ${HISTORY_FORMAT_VERSION}. It was probably exported by a newer version of the app.`,
    };
  }
  if (!Array.isArray(document.attempts)) {
    return { ok: false, message: 'This history file is damaged: it has no list of attempts.' };
  }

  const attempts: Attempt[] = [];
  const rejected: RejectedAttempt[] = [];
  for (const [index, candidate] of document.attempts.entries()) {
    const result = attemptSchema.safeParse(candidate);
    if (result.success) attempts.push(result.data);
    else rejected.push({ position: index + 1, reason: describeIssues(result.error.issues) });
  }
  return { ok: true, attempts, rejected };
}
