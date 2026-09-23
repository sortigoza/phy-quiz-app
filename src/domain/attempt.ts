import type { Bank } from './bank';
import type { Selection } from './selection';
import { correctCount } from './scoring';

/**
 * The attempt record: one sitting, from start to submission.
 *
 * This is the unit of history, export, share links and any future sync, so its
 * shape is a stored format. It is lean by design: it references questions by
 * id and never snapshots their text, because whoever reads a result has the
 * bank. See SPEC.md section 5.
 */

export type AttemptAnswer = {
  questionId: string;
  /** Null means the question was left unanswered. */
  chosenOptionId: string | null;
  correctOptionId: string;
};

export type Attempt = {
  /** UUIDv7, so ids sort by time. */
  id: string;
  /** Short, human-readable, derived from `id`. Display only: deduplication uses `id`. */
  code: string;
  /** Trimmed and whitespace-collapsed. */
  name: string;
  bankId: string;
  bankVersion: string;
  bankFingerprint: string;
  /** Snapshotted so history reads sensibly after the bank is removed. */
  bankTitle: string;
  /** ISO 8601. */
  startedAt: string;
  /** ISO 8601. */
  submittedAt: string;
  durationMs: number;
  /** 32-bit. Replays the exact selection and option order. */
  seed: number;
  questionCount: number;
  correctCount: number;
  /** In attempt order. */
  answers: AttemptAnswer[];
  appVersion: string;
  origin: 'local' | 'imported';
};

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A participant is identified by the name they type and nothing else. Trimming
 * and collapsing whitespace removes accidental differences; case is kept,
 * because silently merging two real people would be worse than splitting one.
 */
export function normaliseName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/**
 * A UUIDv7 for the given moment: 48 bits of Unix milliseconds, then random bits
 * around the version and variant fields. Sorting the strings sorts by time.
 */
export function uuidv7(now: Date = new Date()): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const ms = now.getTime();
  for (let i = 0; i < 6; i++) {
    bytes[i] = Math.floor(ms / 2 ** (8 * (5 - i))) & 0xff;
  }
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The last 35 bits of the id in Crockford base32, grouped `XXX-XXXX`.
 *
 * The end of a UUIDv7 is random; its start is the timestamp. Taking the code
 * from the start would give every attempt submitted in the same second the
 * same code, which is exactly the classroom case.
 */
export function attemptCode(id: string): string {
  // The last 9 hex digits hold 36 bits; the top one is dropped. Under 2^53, so exact.
  let bits = parseInt(id.replaceAll('-', '').slice(-9), 16) % 2 ** 35;
  let code = '';
  for (let i = 0; i < 7; i++) {
    code = (CROCKFORD[bits % 32] as string) + code;
    bits = Math.floor(bits / 32);
  }
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

export type CreateAttemptInput = {
  id: string;
  name: string;
  bank: Bank;
  bankFingerprint: string;
  seed: number;
  selection: Selection;
  /** Chosen option id by question id. A question missing here was left unanswered. */
  chosen: Readonly<Record<string, string>>;
  startedAt: Date;
  submittedAt: Date;
  appVersion: string;
};

/** Scores a finished sitting and builds its record. */
export function createAttempt(input: CreateAttemptInput): Attempt {
  const answers: AttemptAnswer[] = input.selection.map(({ question }) => ({
    questionId: question.id,
    chosenOptionId: input.chosen[question.id] ?? null,
    correctOptionId: question.answer,
  }));

  return {
    id: input.id,
    code: attemptCode(input.id),
    name: normaliseName(input.name),
    bankId: input.bank.id,
    bankVersion: input.bank.version,
    bankFingerprint: input.bankFingerprint,
    bankTitle: input.bank.title,
    startedAt: input.startedAt.toISOString(),
    submittedAt: input.submittedAt.toISOString(),
    durationMs: input.submittedAt.getTime() - input.startedAt.getTime(),
    seed: input.seed,
    questionCount: answers.length,
    correctCount: correctCount(answers),
    answers,
    appVersion: input.appVersion,
    origin: 'local',
  };
}
