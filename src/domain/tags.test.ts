import { describe, expect, it } from 'vitest';
import type { Bank, BankQuestion } from './bank';
import { drawSelection } from './selection';
import { bankTags, isWholeBank, qualifyingQuestions } from './tags';

function question(id: string, tags?: string[]): BankQuestion {
  return {
    id,
    type: 'single-choice',
    prompt: `Prompt ${id}`,
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    answer: 'a',
    explanation: 'Because.',
    ...(tags && { tags }),
  };
}

const bank: Bank = {
  formatVersion: 1,
  id: 'test.bank',
  version: '1.0.0',
  title: 'Test bank',
  questions: [
    question('q1', ['optics']),
    question('q2', ['waves', 'optics']),
    question('q3'),
    question('q4', ['waves']),
    question('q5', []),
    question('q6', ['energy']),
  ],
};

const ids = (questions: readonly BankQuestion[]) => questions.map(({ id }) => id);

describe('bankTags', () => {
  it("lists the bank's tags alphabetically with their question counts, and counts the untagged", () => {
    expect(bankTags(bank)).toEqual({
      tags: [
        { tag: 'energy', count: 1 },
        { tag: 'optics', count: 2 },
        { tag: 'waves', count: 2 },
      ],
      untagged: 2,
    });
  });
});

describe('qualifyingQuestions', () => {
  it('takes the whole bank when no filter is given, or the filter is empty', () => {
    expect(ids(qualifyingQuestions(bank, undefined))).toEqual(ids(bank.questions));
    expect(ids(qualifyingQuestions(bank, { tags: [], untagged: false }))).toEqual(
      ids(bank.questions),
    );
  });

  it('takes a question carrying any chosen tag, in bank order', () => {
    expect(ids(qualifyingQuestions(bank, { tags: ['waves', 'energy'], untagged: false }))).toEqual([
      'q2',
      'q4',
      'q6',
    ]);
  });

  it('takes untagged questions when asked, alone or beside tags', () => {
    expect(ids(qualifyingQuestions(bank, { tags: [], untagged: true }))).toEqual(['q3', 'q5']);
    expect(ids(qualifyingQuestions(bank, { tags: ['energy'], untagged: true }))).toEqual([
      'q3',
      'q5',
      'q6',
    ]);
  });
});

describe('isWholeBank', () => {
  it('is true for a missing or empty filter only', () => {
    expect(isWholeBank(undefined)).toBe(true);
    expect(isWholeBank({ tags: [], untagged: false })).toBe(true);
    expect(isWholeBank({ tags: ['optics'], untagged: false })).toBe(false);
    expect(isWholeBank({ tags: [], untagged: true })).toBe(false);
  });
});

describe('drawSelection with a tag filter', () => {
  it('draws only qualifying questions, clamped to how many there are', () => {
    const drawn = drawSelection(bank, 10, 7, { tags: ['optics'], untagged: false });
    expect(ids(drawn.map(({ question }) => question)).sort()).toEqual(['q1', 'q2']);
  });

  it('draws exactly as without a filter when the filter is empty', () => {
    const shape = (selection: ReturnType<typeof drawSelection>) =>
      selection.map(
        ({ question, options }) => `${question.id}:${options.map((option) => option.id).join('')}`,
      );
    expect(shape(drawSelection(bank, 4, 42, { tags: [], untagged: false }))).toEqual(
      shape(drawSelection(bank, 4, 42)),
    );
  });

  it('replays the same filtered selection from the same seed', () => {
    const filter = { tags: ['waves'], untagged: true };
    expect(drawSelection(bank, 3, 99, filter)).toEqual(drawSelection(bank, 3, 99, filter));
  });
});
