import type { AttemptAnswer } from './attempt';

/**
 * Scoring: one point per question, no partial credit, no negative marking.
 * An unanswered question scores as wrong.
 *
 * Only the counts are ever stored. The percentage is always derived from them,
 * so it can never disagree with the answers it summarises.
 */

/** How one question went. Unanswered is kept distinct from wrong, though both score zero. */
export type Outcome = 'correct' | 'wrong' | 'unanswered';

/** How each outcome is named, on screen and in a copied review. */
export const outcomeLabel: Record<Outcome, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  unanswered: 'Not answered',
};

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
