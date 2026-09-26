import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { AttemptReview } from '../domain/review';
import type { Selection } from '../domain/selection';
import type { Attempt } from '../domain/attempt';
import { attemptRecord } from '../test/attempts';
import { Review } from './Review';

/**
 * The review of an attempt saved before confidence was asked for (ticket 17),
 * which carries no confidence at all.
 */

const selection: Selection = ['q1', 'q2'].map((id) => ({
  question: {
    id,
    type: 'single-choice',
    prompt: `Prompt of ${id}`,
    options: [
      { id: 'a', text: `Option a of ${id}` },
      { id: 'b', text: `Option b of ${id}` },
    ],
    answer: id === 'q1' ? 'a' : 'b',
    explanation: `Explanation of ${id}`,
  },
  options: [
    { id: 'a', text: `Option a of ${id}` },
    { id: 'b', text: `Option b of ${id}` },
  ],
}));

describe('reviewing an attempt without confidence', () => {
  it('says confidence was not recorded, in place of the badges, calibration and confident errors', () => {
    const attempt = attemptRecord();
    const review: AttemptReview = {
      edition: 'same',
      language: 'en',
      questions: selection.map(({ question, options }, index) => ({
        kind: 'question',
        question,
        options,
        answer: attempt.answers[index] as Attempt['answers'][number],
      })),
    };
    render(<Review attempt={attempt} review={review} backTo="library" onDone={() => {}} />);

    // Once in the score line, and on the one answered question in place of its badge.
    expect(screen.getAllByText(/confidence not recorded/i)).toHaveLength(2);
    expect(screen.queryByText(/confidence: /i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Sure: /)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /confident errors/i })).not.toBeInTheDocument();
  });
});

describe('self-grades of questions the review cannot show', () => {
  const attempt = attemptRecord({
    mode: 'answer-first',
    answers: [
      { questionId: 'q1', chosenOptionId: 'a', correctOptionId: 'a', response: 'Kept in the bank' },
      { questionId: 'q9', chosenOptionId: 'a', correctOptionId: 'a', response: 'No longer held' },
    ],
    correctCount: 2,
  });

  it('counts only responses shown beside their explanation as still to grade', () => {
    const [first] = selection;
    const review: AttemptReview = {
      edition: 'other',
      version: '2.0.0',
      mismatch: false,
      language: 'en',
      questions: [
        {
          kind: 'question',
          question: first!.question,
          options: first!.options,
          answer: attempt.answers[0]!,
        },
        { kind: 'archived', answer: attempt.answers[1]! },
      ],
    };
    render(<Review attempt={attempt} review={review} backTo="history" onDone={() => {}} />);
    expect(screen.getByText(/^Self-grade:/)).toHaveTextContent(
      'Self-grade: Yes 0 · Partly 0 · No 0 · 1 to grade',
    );
    expect(screen.getAllByRole('group', { name: /did your own answer match/i })).toHaveLength(1);
  });

  it('asks for none when the bank is no longer held', () => {
    render(
      <Review attempt={attempt} review={{ edition: 'none' }} backTo="history" onDone={() => {}} />,
    );
    expect(screen.getByText(/^Self-grade:/)).not.toHaveTextContent(/to grade/);
  });
});
