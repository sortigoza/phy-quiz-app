import { describe, expect, it } from 'vitest';
import { attemptRecord } from '../test/attempts';
import type { AttemptAnswer } from './attempt';
import { asksSelfGrade, selfGradeTally, withSelfGrade } from './self-grade';

describe('self-grades', () => {
  const answers: AttemptAnswer[] = [
    {
      questionId: 'q1',
      chosenOptionId: 'a',
      correctOptionId: 'a',
      response: 'F = ma',
      selfGrade: 'yes',
    },
    {
      questionId: 'q2',
      chosenOptionId: 'b',
      correctOptionId: 'a',
      response: 'Energy is work',
      selfGrade: 'no',
    },
    { questionId: 'q3', chosenOptionId: 'a', correctOptionId: 'a', response: 'Watts, I think' },
    { questionId: 'q4', chosenOptionId: 'c', correctOptionId: 'a', responseSkipped: true },
    {
      questionId: 'q5',
      chosenOptionId: null,
      correctOptionId: 'a',
      response: 'No idea at all',
      selfGrade: 'partly',
    },
    { questionId: 'q6', chosenOptionId: 'a', correctOptionId: 'a' },
  ];

  it('asks for a self-grade only where a response was written', () => {
    expect(answers.filter(asksSelfGrade).map((answer) => answer.questionId)).toEqual([
      'q1',
      'q2',
      'q3',
      'q5',
    ]);
  });

  it('counts each self-grade, and the responses still to grade', () => {
    expect(selfGradeTally(answers)).toEqual({ yes: 1, partly: 1, no: 1, ungraded: 1 });
  });
});

describe('grading a response', () => {
  const written = attemptRecord({
    answers: [
      { questionId: 'q1', chosenOptionId: 'a', correctOptionId: 'a', response: 'Newton, kg m/s²' },
      { questionId: 'q2', chosenOptionId: null, correctOptionId: 'b', responseSkipped: true },
    ],
    mode: 'answer-first',
  });

  it('writes the self-grade on the answer and changes nothing else', () => {
    const graded = withSelfGrade(written, 'q1', 'partly');
    expect(graded).toEqual({
      ...written,
      answers: [{ ...written.answers[0], selfGrade: 'partly' }, written.answers[1]],
    });
  });

  it('can change its mind', () => {
    const regraded = withSelfGrade(withSelfGrade(written, 'q1', 'no'), 'q1', 'yes');
    expect(regraded.answers[0]?.selfGrade).toBe('yes');
  });

  it('refuses a question with no written response', () => {
    expect(() => withSelfGrade(written, 'q2', 'yes')).toThrow(/no response/i);
    expect(() => withSelfGrade(written, 'q9', 'yes')).toThrow(/no response/i);
  });

  it('refuses an imported attempt, which stays read-only', () => {
    expect(() => withSelfGrade({ ...written, origin: 'imported' }, 'q1', 'yes')).toThrow(
      /imported/i,
    );
  });
});
