import { describe, expect, it } from 'vitest';
import type { Bank } from './bank';
import { defaultQuestionCount, drawSelection } from './selection';

function bankOf(questionCount: number, overrides: Partial<Bank> = {}): Bank {
  return {
    formatVersion: 1,
    id: 'test.bank',
    version: '1.0.0',
    title: 'Test bank',
    questions: Array.from({ length: questionCount }, (_, index) => ({
      id: `q${index + 1}`,
      type: 'single-choice' as const,
      prompt: `Question ${index + 1}`,
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
        { id: 'c', text: 'C' },
        { id: 'd', text: 'D' },
      ],
      answer: 'a',
      explanation: 'Because.',
    })),
    ...overrides,
  };
}

/** The part of a selection that must be reproducible: which questions, in what order, with what option order. */
function shape(selection: ReturnType<typeof drawSelection>): string[] {
  return selection.map(
    ({ question, options }) => `${question.id}:${options.map((o) => o.id).join('')}`,
  );
}

describe('drawSelection', () => {
  it('draws the same questions in the same order with the same option order for the same seed', () => {
    const bank = bankOf(30);
    expect(shape(drawSelection(bank, 10, 123456789))).toEqual(
      shape(drawSelection(bank, 10, 123456789)),
    );
  });

  it('draws a different selection for a different seed', () => {
    const bank = bankOf(30);
    expect(shape(drawSelection(bank, 10, 1))).not.toEqual(shape(drawSelection(bank, 10, 2)));
  });

  it('keeps producing the selection recorded against a seed, so stored attempts can be replayed', () => {
    // A golden value. If this changes, every attempt already recorded would
    // replay with different questions: the shuffle must never change in v1.
    expect(shape(drawSelection(bankOf(6), 3, 42))).toEqual(['q2:dbac', 'q1:cabd', 'q5:bacd']);
  });

  it('draws the requested number of distinct questions from the bank', () => {
    const bank = bankOf(30);
    const ids = drawSelection(bank, 10, 7).map(({ question }) => question.id);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    for (const id of ids) expect(bank.questions.map((q) => q.id)).toContain(id);
  });

  it('draws the whole bank when asked for more questions than it holds', () => {
    expect(drawSelection(bankOf(4), 10, 7)).toHaveLength(4);
  });

  it('shuffles options without losing or inventing any', () => {
    for (const { options } of drawSelection(bankOf(20), 20, 99)) {
      expect(options.map((o) => o.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    }
  });

  it('actually reorders options, rather than presenting the answer in the authored position', () => {
    const firstOptions = drawSelection(bankOf(20), 20, 99).map(({ options }) => options[0]?.id);
    expect(new Set(firstOptions).size).toBeGreaterThan(1);
  });
});

describe('defaultQuestionCount', () => {
  it("uses the bank's own default", () => {
    expect(defaultQuestionCount(bankOf(30, { defaultQuestionCount: 20 }))).toEqual({
      count: 20,
      clamped: false,
    });
  });

  it('falls back to 10 when the bank names no default', () => {
    expect(defaultQuestionCount(bankOf(30))).toEqual({ count: 10, clamped: false });
  });

  it('clamps to the size of the bank and says so', () => {
    expect(defaultQuestionCount(bankOf(6, { defaultQuestionCount: 20 }))).toEqual({
      count: 6,
      clamped: true,
    });
  });
});
