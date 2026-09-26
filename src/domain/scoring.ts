import { CONFIDENCE_LEVELS, type AttemptAnswer, type Confidence } from './attempt';

/**
 * Scoring: one point per question, no partial credit, no negative marking.
 * An unanswered question scores as wrong.
 *
 * Only the counts are ever stored. The percentage is always derived from them,
 * so it can never disagree with the answers it summarises.
 */

/** How one question went. Unanswered is kept distinct from wrong, though both score zero. */
export type Outcome = 'correct' | 'wrong' | 'unanswered';

export function outcome(answer: AttemptAnswer): Outcome {
  if (answer.chosenOptionId === null) return 'unanswered';
  return answer.chosenOptionId === answer.correctOptionId ? 'correct' : 'wrong';
}

export function correctCount(answers: readonly AttemptAnswer[]): number {
  return answers.filter((answer) => outcome(answer) === 'correct').length;
}

/** The score as a whole-number percentage, for display and ranking. */
export function percentage(correct: number, questionCount: number): number {
  return questionCount === 0 ? 0 : Math.round((correct / questionCount) * 100);
}

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
