import { describe, expect, it } from 'vitest';
import type { AttemptAnswer } from './attempt';
import { calibration, confidenceRecorded, confidentErrors } from './confidence';

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
