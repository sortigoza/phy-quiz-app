import { describe, expect, it } from 'vitest';
import type { Bank } from '../domain/bank';
import { drawSelection } from '../domain/selection';
import type { InProgressAttempt } from '../quiz';
import type { StoredBank } from '../storage/db';
import { attemptRecord } from '../test/attempts';
import { reducer, type AppState } from './state';

/**
 * The guards of answer-first mode, which hold whatever the screen offers: no
 * option before the options are revealed, no reveal without a response long
 * enough, and no change to a response once revealed.
 */

const bank: Bank = {
  formatVersion: 1,
  id: 'test.bank',
  version: '1.0.0',
  title: 'Test bank',
  questions: [
    {
      id: 'q1',
      type: 'single-choice',
      prompt: 'One?',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      answer: 'a',
      explanation: 'Because.',
    },
  ],
};

function attemptState(mode: InProgressAttempt['mode']): AppState {
  return {
    screen: 'attempt',
    index: 0,
    inProgress: {
      stored: {} as StoredBank,
      bank,
      name: 'Anna',
      seed: 1,
      selection: drawSelection(bank, 1, 1),
      mode,
      chosen: {},
      confidence: {},
      answeredAt: {},
      responses: {},
      revealed: {},
      startedAt: new Date('2026-09-26T10:00:00Z'),
    },
  };
}

function inProgress(state: AppState): InProgressAttempt {
  if (state.screen !== 'attempt') throw new Error('Not on the attempt screen');
  return state.inProgress;
}

describe('answer-first mode', () => {
  const start = attemptState('answer-first');

  it('chooses no option while the options are hidden', () => {
    const next = reducer(start, {
      type: 'choose',
      questionId: 'q1',
      optionId: 'a',
      at: '2026-09-26T10:01:00.000Z',
    });
    expect(inProgress(next).chosen).toEqual({});
  });

  it('reveals the options only once the response is at least 10 characters', () => {
    const short = reducer(start, {
      type: 'write-response',
      questionId: 'q1',
      text: '  too short ',
    });
    expect(
      inProgress(reducer(short, { type: 'reveal', questionId: 'q1', reveal: 'written' })).revealed,
    ).toEqual({});

    const long = reducer(start, { type: 'write-response', questionId: 'q1', text: 'Long enough.' });
    const revealed = reducer(long, { type: 'reveal', questionId: 'q1', reveal: 'written' });
    expect(inProgress(revealed).revealed).toEqual({ q1: 'written' });
    expect(
      inProgress(
        reducer(revealed, {
          type: 'choose',
          questionId: 'q1',
          optionId: 'b',
          at: '2026-09-26T10:01:00.000Z',
        }),
      ).chosen,
    ).toEqual({ q1: 'b' });
  });

  it('keeps a revealed response read-only', () => {
    const long = reducer(start, { type: 'write-response', questionId: 'q1', text: 'Long enough.' });
    const revealed = reducer(long, { type: 'reveal', questionId: 'q1', reveal: 'written' });
    const edited = reducer(revealed, {
      type: 'write-response',
      questionId: 'q1',
      text: 'Changed my mind',
    });
    expect(inProgress(edited).responses).toEqual({ q1: 'Long enough.' });
  });

  it('skips the response, dropping any draft, and cannot then be revealed again as written', () => {
    const draft = reducer(start, {
      type: 'write-response',
      questionId: 'q1',
      text: 'Half an idea',
    });
    const skipped = reducer(draft, { type: 'reveal', questionId: 'q1', reveal: 'skipped' });
    expect(inProgress(skipped)).toMatchObject({ responses: {}, revealed: { q1: 'skipped' } });
    const again = reducer(skipped, { type: 'reveal', questionId: 'q1', reveal: 'written' });
    expect(inProgress(again).revealed).toEqual({ q1: 'skipped' });
  });
});

describe('standard mode', () => {
  it('takes no response', () => {
    const start = attemptState('standard');
    const next = reducer(start, { type: 'write-response', questionId: 'q1', text: 'Long enough.' });
    expect(inProgress(next).responses).toEqual({});
  });
});

describe('a self-grade written in review', () => {
  const attempt = attemptRecord({
    answers: [
      { questionId: 'q1', chosenOptionId: 'a', correctOptionId: 'a', response: 'Long enough.' },
    ],
    questionCount: 1,
  });
  const review: AppState = {
    screen: 'review',
    attempt,
    back: { screen: 'library' },
    review: {
      edition: 'same',
      language: 'en',
      questions: [
        {
          kind: 'question',
          question: bank.questions[0]!,
          options: bank.questions[0]!.options,
          answer: attempt.answers[0]!,
        },
      ],
    },
  };

  it('replaces the attempt and its answers in the review on screen', () => {
    const graded = { ...attempt, answers: [{ ...attempt.answers[0]!, selfGrade: 'yes' as const }] };
    const next = reducer(review, { type: 'annotated', attempt: graded });
    expect(next).toMatchObject({ screen: 'review', attempt: graded });
    expect(
      next.screen === 'review' &&
        next.review.edition === 'same' &&
        next.review.questions[0]?.answer.selfGrade,
    ).toBe('yes');
  });

  it('ignores an annotation of another attempt', () => {
    const other = { ...attempt, id: '01890a5d-ac96-774b-bcce-000000000000' };
    expect(reducer(review, { type: 'annotated', attempt: other })).toBe(review);
  });
});
