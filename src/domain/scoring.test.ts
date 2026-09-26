import { describe, expect, it } from 'vitest';
import type { AttemptAnswer } from './attempt';
import {
  calibration,
  confidenceRecorded,
  confidentErrors,
  correctCount,
  outcome,
  percentage,
} from './scoring';

describe('correctCount', () => {
  it('awards one point for each question whose chosen option is the correct one', () => {
    expect(
      correctCount([
        { questionId: 'q1', chosenOptionId: 'b', correctOptionId: 'b' },
        { questionId: 'q2', chosenOptionId: 'a', correctOptionId: 'c' },
        { questionId: 'q3', chosenOptionId: 'd', correctOptionId: 'd' },
      ]),
    ).toBe(2);
  });

  it('scores an unanswered question as wrong', () => {
    expect(
      correctCount([
        { questionId: 'q1', chosenOptionId: null, correctOptionId: 'b' },
        { questionId: 'q2', chosenOptionId: 'c', correctOptionId: 'c' },
      ]),
    ).toBe(1);
  });

  it('scores nothing for an attempt with no answers given', () => {
    expect(correctCount([{ questionId: 'q1', chosenOptionId: null, correctOptionId: 'a' }])).toBe(
      0,
    );
  });
});

describe('percentage', () => {
  it('derives a whole-number percentage from the counts', () => {
    expect(percentage(7, 10)).toBe(70);
    expect(percentage(2, 3)).toBe(67);
  });

  it('is zero for an empty attempt rather than dividing by zero', () => {
    expect(percentage(0, 0)).toBe(0);
  });
});

describe('outcome', () => {
  it('is correct when the chosen option is the correct one', () => {
    expect(outcome({ questionId: 'q1', chosenOptionId: 'b', correctOptionId: 'b' })).toBe(
      'correct',
    );
  });

  it('is wrong when a distractor was chosen', () => {
    expect(outcome({ questionId: 'q1', chosenOptionId: 'a', correctOptionId: 'b' })).toBe('wrong');
  });

  it('keeps an unanswered question distinct from a wrong one', () => {
    expect(outcome({ questionId: 'q1', chosenOptionId: null, correctOptionId: 'b' })).toBe(
      'unanswered',
    );
  });
});

describe('confidence', () => {
  const answers: AttemptAnswer[] = [
    { questionId: 'q1', chosenOptionId: 'a', correctOptionId: 'a', confidence: 'sure' },
    { questionId: 'q2', chosenOptionId: 'b', correctOptionId: 'a', confidence: 'sure' },
    { questionId: 'q3', chosenOptionId: 'a', correctOptionId: 'a', confidence: 'unsure' },
    { questionId: 'q4', chosenOptionId: 'c', correctOptionId: 'a', confidence: 'guess' },
    { questionId: 'q5', chosenOptionId: null, correctOptionId: 'a' },
    { questionId: 'q6', chosenOptionId: 'c', correctOptionId: 'b', confidence: 'sure' },
  ];

  it('finds the confident errors, the wrong answers given as sure, in attempt order', () => {
    expect(confidentErrors(answers).map((answer) => answer.questionId)).toEqual(['q2', 'q6']);
  });

  it('gives the accuracy at each confidence level, leaving out unanswered questions', () => {
    expect(calibration(answers)).toEqual({
      sure: { correct: 1, total: 3 },
      unsure: { correct: 1, total: 1 },
      guess: { correct: 0, total: 1 },
    });
  });

  it('tells an attempt that recorded confidence from one saved before it existed', () => {
    expect(confidenceRecorded(answers)).toBe(true);
    expect(
      confidenceRecorded([
        { questionId: 'q1', chosenOptionId: 'a', correctOptionId: 'a' },
        { questionId: 'q2', chosenOptionId: null, correctOptionId: 'a' },
      ]),
    ).toBe(false);
  });
});
