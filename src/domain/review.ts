import type { Attempt, AttemptAnswer } from './attempt';
import { bankLanguage, type Bank, type BankOption, type BankQuestion } from './bank';
import { drawSelection, type Selection } from './selection';

/**
 * What a review shows: every question of an attempt, beside what was recorded
 * for it.
 *
 * An attempt references its questions by id and never snapshots their text
 * (see `attempt.ts`), so the review is rebuilt from a held bank. Against the
 * exact edition the attempt was taken on, the selection is replayed from the
 * seed and the review looks exactly as it did after submission. Against any
 * other edition, the questions are looked up by id, in attempt order, and one
 * that edition cannot show is an archived question. Either way the recorded
 * answers stand: the score is never recomputed from a bank.
 */

export type ReviewedQuestion =
  | {
      kind: 'question';
      question: BankQuestion;
      /** In presentation order when replayed, otherwise in the bank's order. */
      options: BankOption[];
      answer: AttemptAnswer;
    }
  /** No longer in the edition shown, so only the recorded choice and correctness remain. */
  | { kind: 'archived'; answer: AttemptAnswer };

export type AttemptReview =
  /** The edition the attempt was taken on. */
  | { edition: 'same'; language: string; questions: ReviewedQuestion[] }
  /** Another edition of the same bank, which the review must say it is using. */
  | { edition: 'other'; version: string; language: string; questions: ReviewedQuestion[] }
  /** No edition of the bank is held: there is only the score. */
  | { edition: 'none' };

/** An edition of a bank held in the library. */
export type HeldEdition = { bank: Bank; fingerprint: string };

/** The review of a selection just answered, in the order it was presented. */
export function reviewSelection(attempt: Attempt, selection: Selection): ReviewedQuestion[] {
  const answerById = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  return selection.map(({ question, options }) => ({
    kind: 'question',
    question,
    options,
    answer: answerById.get(question.id) ?? {
      questionId: question.id,
      chosenOptionId: null,
      correctOptionId: question.answer,
    },
  }));
}

/**
 * The review of an attempt against the editions of its bank held, in any
 * order. Editions of other banks are ignored.
 */
export function reviewAttempt(attempt: Attempt, editions: readonly HeldEdition[]): AttemptReview {
  const own = editions
    .filter(({ bank }) => bank.id === attempt.bankId)
    .sort((a, b) => compareVersions(b.bank.version, a.bank.version));

  const exact = own.find(({ fingerprint }) => fingerprint === attempt.bankFingerprint);
  if (exact) {
    const selection = drawSelection(exact.bank, attempt.questionCount, attempt.seed);
    // An imported attempt can name any fingerprint, so the replay must agree with its answers.
    if (replays(attempt, selection)) {
      return {
        edition: 'same',
        language: bankLanguage(exact.bank),
        questions: reviewSelection(attempt, selection),
      };
    }
  }

  const newest = own.find((edition) => edition !== exact) ?? exact;
  if (!newest) return { edition: 'none' };
  const byId = new Map(newest.bank.questions.map((question) => [question.id, question]));
  return {
    edition: 'other',
    version: newest.bank.version,
    language: bankLanguage(newest.bank),
    questions: attempt.answers.map((answer) => lookUp(answer, byId.get(answer.questionId))),
  };
}

/**
 * Orders two bank versions as semver does, closely enough to find the newest:
 * by major, minor and patch, then a release above its pre-releases. Pre-release
 * labels and build metadata are compared as plain text.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => {
    const [core = '', pre] = version.split('+')[0]?.split(/-(.*)/) ?? [];
    return { numbers: core.split('.').map(Number), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const difference = (x.numbers[i] ?? 0) - (y.numbers[i] ?? 0);
    if (difference !== 0) return difference;
  }
  if (x.pre === undefined || y.pre === undefined) {
    return (x.pre === undefined ? 1 : 0) - (y.pre === undefined ? 1 : 0);
  }
  return x.pre.localeCompare(y.pre);
}

function replays(attempt: Attempt, selection: Selection): boolean {
  return (
    selection.length === attempt.answers.length &&
    selection.every(({ question }, index) => question.id === attempt.answers[index]?.questionId)
  );
}

/** A recorded answer beside its question, unless the question cannot show what was recorded. */
function lookUp(answer: AttemptAnswer, question: BankQuestion | undefined): ReviewedQuestion {
  const has = (id: string) => question?.options.some((option) => option.id === id) === true;
  if (
    !question ||
    !has(answer.correctOptionId) ||
    (answer.chosenOptionId !== null && !has(answer.chosenOptionId))
  ) {
    return { kind: 'archived', answer };
  }
  return { kind: 'question', question, options: question.options, answer };
}
