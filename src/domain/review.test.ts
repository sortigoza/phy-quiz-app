import { describe, expect, it } from 'vitest';
import { createAttempt, type Attempt } from './attempt';
import type { Bank, BankQuestion } from './bank';
import {
  compareVersions,
  reviewAttempt,
  type AttemptReview,
  type ReviewedQuestion,
} from './review';
import { drawSelection } from './selection';

function question(id: string, answer = 'a'): BankQuestion {
  return {
    id,
    type: 'single-choice',
    prompt: `Prompt ${id}`,
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
      { id: 'c', text: 'C' },
    ],
    answer,
    explanation: `Because ${id}.`,
  };
}

function bankOf(questions: BankQuestion[], version = '1.0.0'): Bank {
  return { formatVersion: 1, id: 'test.bank', version, title: 'Test bank', questions };
}

const firstEdition = bankOf(['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => question(id)));
const seed = 987654321;

/** An attempt on the first edition, with two questions answered: one right, one wrong. */
function attemptOn(bank: Bank, count = 3): Attempt {
  const selection = drawSelection(bank, count, seed);
  const [first, second] = selection;
  return createAttempt({
    id: '01890a5d-ac96-774b-bcce-b302099a8057',
    name: 'Anna',
    bank,
    bankFingerprint: 'first',
    seed,
    selection,
    chosen: { [first?.question.id ?? '']: 'a', [second?.question.id ?? '']: 'b' },
    startedAt: new Date('2026-09-23T10:00:00.000Z'),
    submittedAt: new Date('2026-09-23T10:03:20.000Z'),
    appVersion: '0.1.0',
  });
}

/** Each reviewed question as `id:options` or `archived:id`, to compare shapes. */
function shape(review: AttemptReview): string[] {
  if (review.edition === 'none') return [];
  return review.questions.map((reviewed: ReviewedQuestion) =>
    reviewed.kind === 'archived'
      ? `archived:${reviewed.answer.questionId}`
      : `${reviewed.question.id}:${reviewed.options.map((option) => option.id).join('')}`,
  );
}

describe('reviewAttempt', () => {
  const attempt = attemptOn(firstEdition);

  it('replays the selection from the seed against the edition whose fingerprint matches', () => {
    const review = reviewAttempt(attempt, [
      { bank: bankOf(firstEdition.questions, '2.0.0'), fingerprint: 'second' },
      { bank: firstEdition, fingerprint: 'first' },
    ]);

    expect(review.edition).toBe('same');
    const replayed = drawSelection(firstEdition, 3, seed);
    expect(shape(review)).toEqual(
      replayed.map(
        ({ question, options }) => `${question.id}:${options.map((o) => o.id).join('')}`,
      ),
    );
    if (review.edition === 'none') throw new Error('unreachable');
    expect(review.questions.map((reviewed) => reviewed.answer)).toEqual(attempt.answers);
  });

  it('uses the newest other edition when the exact one is gone, and archives what it lost', () => {
    const [kept, lost, alsoKept] = attempt.answers.map((answer) => answer.questionId);
    const secondEdition = bankOf(
      firstEdition.questions.filter((q) => q.id !== lost),
      '2.0.0',
    );
    const review = reviewAttempt(attempt, [
      { bank: bankOf(firstEdition.questions, '1.10.0-beta'), fingerprint: 'beta' },
      { bank: secondEdition, fingerprint: 'second' },
      { bank: bankOf(firstEdition.questions, '1.10.0'), fingerprint: 'older' },
    ]);

    expect(review).toMatchObject({ edition: 'other', version: '2.0.0' });
    expect(shape(review)).toEqual([`${kept}:abc`, `archived:${lost}`, `${alsoKept}:abc`]);
    if (review.edition === 'none') throw new Error('unreachable');
    // The recorded choice and correctness stand, whatever the edition says now.
    expect(review.questions.map((reviewed) => reviewed.answer)).toEqual(attempt.answers);
  });

  it('archives a question whose recorded options the edition no longer has', () => {
    const [changed] = attempt.answers.map((answer) => answer.questionId);
    const secondEdition = bankOf(
      firstEdition.questions.map((q) =>
        q.id === changed
          ? { ...q, options: q.options.filter((o) => o.id !== 'a'), answer: 'b' }
          : q,
      ),
      '2.0.0',
    );
    const review = reviewAttempt(attempt, [{ bank: secondEdition, fingerprint: 'second' }]);

    expect(shape(review)[0]).toBe(`archived:${changed}`);
  });

  it('falls back to the other-edition path when the fingerprint matches but the replay does not', () => {
    // An imported attempt can claim any fingerprint; its answers are what it recorded.
    const forged = { ...attempt, seed: seed + 1 };
    const review = reviewAttempt(forged, [{ bank: firstEdition, fingerprint: 'first' }]);

    expect(review.edition).toBe('other');
    expect(shape(review).map((entry) => entry.split(':')[0])).toEqual(
      attempt.answers.map((answer) => answer.questionId),
    );
  });

  it('degrades to the score alone when no edition of the bank is held', () => {
    expect(reviewAttempt(attempt, [])).toEqual({ edition: 'none' });
  });
});

describe('compareVersions', () => {
  it('orders versions numerically, with a release above its pre-releases', () => {
    const versions = ['1.10.0', '1.2.0', '2.0.0-beta', '2.0.0', '1.2.0+build', '0.9.9'];
    expect([...versions].sort(compareVersions)).toEqual([
      '0.9.9',
      '1.2.0',
      '1.2.0+build',
      '1.10.0',
      '2.0.0-beta',
      '2.0.0',
    ]);
  });
});
