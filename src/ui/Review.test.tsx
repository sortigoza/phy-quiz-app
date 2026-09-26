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
