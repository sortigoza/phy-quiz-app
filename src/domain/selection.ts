import type { Bank, BankOption, BankQuestion } from './bank';

/**
 * Choosing which questions an attempt asks, and in what order.
 *
 * Everything here is driven by a recorded 32-bit seed, so any attempt can be
 * reconstructed exactly: the review, a history entry and a share link all
 * replay the selection from the seed rather than storing it. That makes the
 * shuffle part of the stored data format. It must not change within v1.
 */

/** One question as presented in an attempt, with its options in presentation order. */
export type SelectedQuestion = {
  question: BankQuestion;
  options: BankOption[];
};

/** The questions of one attempt, in the order they are presented. */
export type Selection = SelectedQuestion[];

/** The question count offered when a bank does not name its own. */
const FALLBACK_QUESTION_COUNT = 10;

/** Mulberry32: a small, fast, well-distributed 32-bit PRNG. Returns floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, drawing from the given generator. */
function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/**
 * Draws `count` questions from the bank, clamped to its size, with each
 * question's options shuffled. The same bank, count and seed always give the
 * same selection.
 */
export function drawSelection(bank: Bank, count: number, seed: number): Selection {
  const random = mulberry32(seed);
  // Questions are shuffled whole before taking the first `count`, so the
  // option shuffles below consume the generator in a fixed order.
  const questions = shuffle(bank.questions, random).slice(0, Math.max(0, count));
  return questions.map((question) => ({ question, options: shuffle(question.options, random) }));
}

/** A fresh seed for a new attempt. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] as number;
}

/**
 * The question count the start screen offers first: the bank's own default, or
 * 10, never more than the bank holds. `clamped` says when the bank was too small
 * for that, so the screen can tell the participant why.
 */
export function defaultQuestionCount(bank: Bank): { count: number; clamped: boolean } {
  const wanted = bank.defaultQuestionCount ?? FALLBACK_QUESTION_COUNT;
  const available = bank.questions.length;
  return wanted > available
    ? { count: available, clamped: true }
    : { count: wanted, clamped: false };
}
