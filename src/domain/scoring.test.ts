import { describe, expect, it } from 'vitest';
import { correctCount, outcome, percentage } from './scoring';

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
