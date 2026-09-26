import { CONFIDENCE_LEVELS, type AttemptAnswer, type Confidence } from './attempt';
import { outcome, percentage } from './scoring';

/**
 * What the participant's confidence says about an attempt: which mistakes they
 * were sure of, and how often they were right at each level. None of it
 * changes the score.
 */

/** How each confidence level is named, on screen and in a copied review. */
export const confidenceLabel: Record<Confidence, string> = {
  sure: 'Sure',
  unsure: 'Unsure',
  guess: 'Guess',
};

/**
 * The wrong answers the participant was sure of, in attempt order. They are the
 * mistakes most worth correcting, because feedback on them sticks best.
 */
export function confidentErrors(answers: readonly AttemptAnswer[]): AttemptAnswer[] {
  return answers.filter((answer) => answer.confidence === 'sure' && outcome(answer) === 'wrong');
}

/**
 * Whether the attempt asked for confidence. Attempts saved before it was asked
 * for carry none at all, which is different from an attempt that has some.
 */
export function confidenceRecorded(answers: readonly AttemptAnswer[]): boolean {
  return answers.some((answer) => answer.confidence !== undefined);
}

export type Tally = { correct: number; total: number };

/** How often the participant was right at each confidence level they gave. */
export function calibration(answers: readonly AttemptAnswer[]): Record<Confidence, Tally> {
  const tallies = Object.fromEntries(
    CONFIDENCE_LEVELS.map((level) => [level, { correct: 0, total: 0 }]),
  ) as Record<Confidence, Tally>;
  for (const answer of answers) {
    if (answer.confidence === undefined) continue;
    const tally = tallies[answer.confidence];
    tally.total += 1;
    if (outcome(answer) === 'correct') tally.correct += 1;
  }
  return tallies;
}

/** "Sure: 6/7 (86%) · Unsure: 1/2 (50%)", leaving out levels never given. */
export function calibrationLine(answers: readonly AttemptAnswer[]): string {
  const tallies = calibration(answers);
  return CONFIDENCE_LEVELS.filter((level) => tallies[level].total > 0)
    .map((level) => {
      const { correct, total } = tallies[level];
      return `${confidenceLabel[level]}: ${correct}/${total} (${percentage(correct, total)}%)`;
    })
    .join(' · ');
}
