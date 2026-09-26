import { describe, expect, it } from 'vitest';
import { attemptRecord } from '../test/attempts';
import type { AttemptAnswer } from './attempt';
import type { Bank, BankQuestion } from './bank';
import { practiseFilter, tagBreakdown, type TagRow } from './tag-breakdown';

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
  id: 'test.units',
  version: '2.0.0',
  title: 'SI units',
  questions: [
    question('q1', ['force']),
    question('q2', ['energy', 'force']),
    question('q3'),
    question('q4', ['energy']),
  ],
};

const right = (questionId: string, extra: Partial<AttemptAnswer> = {}): AttemptAnswer => ({
  questionId,
  chosenOptionId: 'a',
  correctOptionId: 'a',
  ...extra,
});
const wrong = (questionId: string, extra: Partial<AttemptAnswer> = {}): AttemptAnswer => ({
  questionId,
  chosenOptionId: 'b',
  correctOptionId: 'a',
  ...extra,
});
const blank = (questionId: string): AttemptAnswer => ({
  questionId,
  chosenOptionId: null,
  correctOptionId: 'a',
});

function attemptOf(answers: AttemptAnswer[], overrides = {}) {
  return attemptRecord({
    answers,
    questionCount: answers.length,
    correctCount: answers.filter((answer) => answer.chosenOptionId === answer.correctOptionId)
      .length,
    durationMs: answers.length * 60_000,
    ...overrides,
  });
}

/** Rows as `label correct/total`, to compare order and tallies at a glance. */
function tallies(rows: TagRow[]): string[] {
  return rows.map((row) => {
    const label = row.kind === 'tag' ? row.tag : row.kind;
    return `${label} ${row.correct}/${row.total}`;
  });
}

describe('tagBreakdown', () => {
  it('tallies each tag, counting a question under every tag it carries, weakest first', () => {
    const rows = tagBreakdown(
      [attemptOf([right('q1'), wrong('q2'), right('q3')]), attemptOf([right('q4'), blank('q2')])],
      bank,
    );
    expect(tallies(rows)).toEqual(['energy 1/3', 'force 1/3', 'untagged 1/1']);
  });

  it('counts an unanswered question as wrong, as the score does', () => {
    expect(tallies(tagBreakdown([attemptOf([blank('q1')])], bank))).toEqual(['force 0/1']);
  });

  it('puts answers to questions the edition no longer shows under archived, last', () => {
    const rows = tagBreakdown(
      [attemptOf([right('gone'), wrong('q1', { chosenOptionId: 'z' }), wrong('q4')])],
      bank,
    );
    expect(tallies(rows)).toEqual(['energy 0/1', 'archived 1/2']);
  });

  it('marks rows with fewer than five answers as low data', () => {
    const five = attemptOf(['q1', 'q1', 'q1', 'q1', 'q1'].map((id) => right(id)));
    const rows = tagBreakdown([five, attemptOf([right('q4')])], bank);
    // Both all correct, so the one with more answers comes first.
    expect(rows.map((row) => [row.kind === 'tag' && row.tag, row.lowData])).toEqual([
      ['force', false],
      ['energy', true],
    ]);
  });

  it('counts the confident errors under each tag', () => {
    const rows = tagBreakdown(
      [attemptOf([wrong('q2', { confidence: 'sure' }), wrong('q1', { confidence: 'guess' })])],
      bank,
    );
    expect(rows.map((row) => [row.kind === 'tag' && row.tag, row.confidentErrors])).toEqual([
      ['force', 1],
      ['energy', 1],
    ]);
  });

  it('leaves out attempts that are not counted, and attempts on other banks', () => {
    const rows = tagBreakdown(
      [
        attemptOf([right('q1')]),
        attemptOf([wrong('q1')], { durationMs: 1_000 }),
        attemptOf([wrong('q1')], { bankId: 'test.optics' }),
        attemptOf([wrong('q4')], { durationMs: 1_000, countedOverride: true }),
      ],
      bank,
    );
    expect(tallies(rows)).toEqual(['energy 0/1', 'force 1/1']);
  });

  it('is empty when there is nothing to count', () => {
    expect(tagBreakdown([], bank)).toEqual([]);
  });
});

describe('practiseFilter', () => {
  it('aims a quiz at a row’s tag or at the untagged questions, and never at archived ones', () => {
    const rows = tagBreakdown([attemptOf([right('q1'), right('q3'), right('gone')])], bank);
    expect(rows.map(practiseFilter)).toEqual([
      { tags: ['force'], untagged: false },
      { tags: [], untagged: true },
      undefined,
    ]);
  });
});
