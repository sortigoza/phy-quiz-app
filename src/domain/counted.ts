import type { Attempt } from './attempt';

/**
 * Counted attempts: the ones that feed the tag breakdown.
 *
 * An attempt answered faster than anyone could read the questions says nothing
 * about what the participant knows, so it is not counted. It stays in history,
 * and the participant may overrule the judgement on their own attempt.
 */

/** The average time a question below which an attempt is not counted. */
export const MIN_MS_PER_QUESTION = 5_000;

/** Whether the attempt was answered no faster, on average, than `MIN_MS_PER_QUESTION` a question. */
export function atReadingPace(attempt: Attempt): boolean {
  return attempt.durationMs / attempt.questionCount >= MIN_MS_PER_QUESTION;
}

/** Whether the attempt counts: the participant's override if they gave one, the reading pace otherwise. */
export function isCounted(attempt: Attempt): boolean {
  return attempt.countedOverride ?? atReadingPace(attempt);
}
