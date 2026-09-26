import { SELF_GRADES, type Attempt, type AttemptAnswer, type SelfGrade } from './attempt';

/**
 * Self-grades: in answer-first mode, the participant's own judgement, made in
 * review, of whether each response they wrote matched the explanation. None of
 * it changes the score, and it is never checked against anything.
 */

/** Whether the question was taken answer-first: with a response written, or a skipped response. */
export function answeredFirst(answer: AttemptAnswer): boolean {
  return answer.response !== undefined || answer.responseSkipped === true;
}

/** Whether the review asks for a self-grade: only where a response was written. */
export function asksSelfGrade(answer: AttemptAnswer): boolean {
  return answer.response !== undefined;
}

export type SelfGradeTally = Record<SelfGrade, number> & {
  /** Written responses not graded yet. */
  ungraded: number;
};

/** How many responses the participant graded Yes, Partly and No, and how many are still to grade. */
export function selfGradeTally(answers: readonly AttemptAnswer[]): SelfGradeTally {
  const tally: SelfGradeTally = { yes: 0, partly: 0, no: 0, ungraded: 0 };
  for (const answer of answers) {
    if (!asksSelfGrade(answer)) continue;
    if (answer.selfGrade === undefined) tally.ungraded += 1;
    else tally[answer.selfGrade] += 1;
  }
  return tally;
}

/**
 * The attempt with one response self-graded. A submitted attempt is otherwise
 * frozen, and an imported one is read-only altogether (ADR 0004), so this
 * refuses anything else.
 */
export function withSelfGrade(attempt: Attempt, questionId: string, grade: SelfGrade): Attempt {
  if (!SELF_GRADES.includes(grade)) throw new Error(`Unknown self-grade ${String(grade)}`);
  if (attempt.origin !== 'local') {
    throw new Error('An imported attempt is read-only: only local attempts can be self-graded.');
  }
  const answer = attempt.answers.find((candidate) => candidate.questionId === questionId);
  if (!answer || !asksSelfGrade(answer)) {
    throw new Error(`Question ${questionId} has no response to self-grade.`);
  }
  return {
    ...attempt,
    answers: attempt.answers.map((candidate) =>
      candidate === answer ? { ...candidate, selfGrade: grade } : candidate,
    ),
  };
}
