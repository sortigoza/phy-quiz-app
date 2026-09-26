import { describe, expect, it } from 'vitest';
import type { Bank } from './bank';
import {
  attemptCode,
  createAttempt,
  normaliseName,
  uuidv7,
  type CreateAttemptInput,
} from './attempt';
import { drawSelection } from './selection';

const bank: Bank = {
  formatVersion: 1,
  id: 'test.bank',
  version: '2.1.0',
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
      answer: 'b',
      explanation: 'Because.',
    },
    {
      id: 'q2',
      type: 'single-choice',
      prompt: 'Two?',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      answer: 'a',
      explanation: 'Because.',
    },
    {
      id: 'q3',
      type: 'single-choice',
      prompt: 'Three?',
      options: [
        { id: 'a', text: 'A' },
        { id: 'b', text: 'B' },
      ],
      answer: 'a',
      explanation: 'Because.',
    },
  ],
};

describe('attemptCode', () => {
  it('renders the last 35 bits of the id in Crockford base32, grouped for reading aloud', () => {
    // 0x2099a8057 = 01000 00100 11001 10101 00000 00010 10111 (35 bits)
    //             =   8     4     S     N     0     2     Q
    expect(attemptCode('01890a5d-ac96-774b-bcce-b302099a8057')).toBe('84S-N02Q');
  });

  it('comes from the random end of the id, so attempts submitted together still differ', () => {
    // The leading bits of a UUIDv7 are the timestamp: a class submitting in
    // the same second would all read out the same code if it came from there.
    const sameMoment = new Date('2026-09-23T10:00:00Z');
    const codes = new Set(Array.from({ length: 50 }, () => attemptCode(uuidv7(sameMoment))));
    expect(codes.size).toBe(50);
  });

  it('never uses the letters Crockford base32 leaves out', () => {
    expect(attemptCode('00000000-0000-7000-8007-ffffffffffff')).toBe('ZZZ-ZZZZ');
  });
});

describe('uuidv7', () => {
  it('produces a version 7, variant 10 UUID', () => {
    expect(uuidv7(new Date('2026-09-23T10:00:00Z'))).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('sorts by the time it was made', () => {
    const earlier = uuidv7(new Date('2026-09-23T10:00:00Z'));
    const later = uuidv7(new Date('2026-09-23T10:00:01Z'));
    expect([later, earlier].sort()).toEqual([earlier, later]);
  });

  it('carries the millisecond timestamp in its first 48 bits', () => {
    const at = new Date('2026-09-23T10:00:00.123Z');
    const hex = uuidv7(at).replaceAll('-', '').slice(0, 12);
    expect(parseInt(hex, 16)).toBe(at.getTime());
  });
});

describe('normaliseName', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseName('  Anna   Maria\t Svensson ')).toBe('Anna Maria Svensson');
  });

  it('does not case-fold, because anna and Anna may be two people', () => {
    expect(normaliseName('anna')).toBe('anna');
  });
});

const input: CreateAttemptInput = {
  id: '01890a5d-ac96-774b-bcce-b302099a8057',
  name: 'Anna',
  bank,
  bankFingerprint: 'deadbeef',
  seed: 42,
  selection: drawSelection(bank, 3, 42),
  mode: 'standard',
  chosen: {},
  confidence: {},
  answeredAt: {},
  responses: {},
  revealed: {},
  startedAt: new Date('2026-09-23T10:00:00.000Z'),
  submittedAt: new Date('2026-09-23T10:04:30.500Z'),
  appVersion: '0.1.0',
};

describe('createAttempt', () => {
  const selection = drawSelection(bank, 3, 42);
  const [first, second] = selection.map(({ question }) => question.id);

  const attempt = createAttempt({
    ...input,
    id: '01890a5d-ac96-774b-bcce-b302099a8057',
    name: '  Anna  Svensson ',
    bank,
    bankFingerprint: 'deadbeef',
    seed: 42,
    selection,
    // Right on the first question, wrong on the second, third left blank.
    chosen: {
      [first as string]: bank.questions.find((q) => q.id === first)?.answer as string,
      [second as string]: bank.questions.find((q) => q.id === second)?.answer === 'a' ? 'b' : 'a',
    },
    confidence: { [first as string]: 'sure', [second as string]: 'guess' },
    answeredAt: {
      [first as string]: '2026-09-23T10:01:00.000Z',
      [second as string]: '2026-09-23T10:02:00.000Z',
    },
    startedAt: new Date('2026-09-23T10:00:00.000Z'),
    submittedAt: new Date('2026-09-23T10:04:30.500Z'),
    appVersion: '0.1.0',
  });

  it('records the answers in attempt order, with unanswered questions as null', () => {
    expect(attempt.answers.map((answer) => answer.questionId)).toEqual(
      selection.map(({ question }) => question.id),
    );
    expect(attempt.answers[2]?.chosenOptionId).toBeNull();
  });

  it('records the confidence given with each chosen option', () => {
    expect(attempt.answers.map((answer) => answer.confidence)).toEqual([
      'sure',
      'guess',
      undefined,
    ]);
  });

  it('never records a confidence for an unanswered question', () => {
    const third = selection[2]?.question.id as string;
    const blank = createAttempt({
      ...input,
      id: '01890a5d-ac96-774b-bcce-b302099a8057',
      name: 'Anna',
      bank,
      bankFingerprint: 'deadbeef',
      seed: 42,
      selection,
      chosen: {},
      confidence: { [third]: 'sure' },
      answeredAt: { [third]: '2026-09-23T10:01:00.000Z' },
      startedAt: new Date('2026-09-23T10:00:00.000Z'),
      submittedAt: new Date('2026-09-23T10:04:30.500Z'),
      appVersion: '0.1.0',
    });
    expect(blank.answers.every((answer) => !('confidence' in answer))).toBe(true);
    expect(blank.answers.every((answer) => !('answeredAt' in answer))).toBe(true);
  });

  it('records when each chosen option was last changed', () => {
    expect(attempt.answers.map((answer) => answer.answeredAt)).toEqual([
      '2026-09-23T10:01:00.000Z',
      '2026-09-23T10:02:00.000Z',
      undefined,
    ]);
  });

  it('records no tag filter when the attempt drew from the whole bank', () => {
    expect('tagFilter' in attempt).toBe(false);
  });

  it('records the tag filter the selection was drawn with', () => {
    const tagFilter = { tags: ['optics'], untagged: true };
    const filtered = createAttempt({
      id: '01890a5d-ac96-774b-bcce-b302099a8057',
      name: 'Anna',
      bank,
      bankFingerprint: 'deadbeef',
      seed: 42,
      selection,
      tagFilter,
      mode: 'standard',
      chosen: {},
      confidence: {},
      answeredAt: {},
      responses: {},
      revealed: {},
      startedAt: new Date('2026-09-23T10:00:00.000Z'),
      submittedAt: new Date('2026-09-23T10:04:30.500Z'),
      appVersion: '0.1.0',
    });
    expect(filtered.tagFilter).toEqual(tagFilter);
  });

  it('scores the attempt', () => {
    expect(attempt.questionCount).toBe(3);
    expect(attempt.correctCount).toBe(1);
  });

  it('records every field the attempt record carries', () => {
    expect(attempt).toMatchObject({
      id: '01890a5d-ac96-774b-bcce-b302099a8057',
      code: '84S-N02Q',
      name: 'Anna Svensson',
      bankId: 'test.bank',
      bankVersion: '2.1.0',
      bankFingerprint: 'deadbeef',
      bankTitle: 'Test bank',
      startedAt: '2026-09-23T10:00:00.000Z',
      submittedAt: '2026-09-23T10:04:30.500Z',
      durationMs: 270_500,
      seed: 42,
      appVersion: '0.1.0',
      origin: 'local',
    });
  });

  it('records the correct option for every question, so history reads without the bank', () => {
    expect(attempt.answers.map((answer) => [answer.questionId, answer.correctOptionId])).toEqual(
      selection.map(({ question }) => [question.id, question.answer]),
    );
  });

  it('records the mode it was taken in', () => {
    expect(attempt.mode).toBe('standard');
  });

  it('records no responses in standard mode, even if some were somehow given', () => {
    const standard = createAttempt({
      ...input,
      responses: { [first as string]: 'Force is mass times acceleration.' },
      revealed: { [first as string]: 'written' },
    });
    expect(standard.answers.some((answer) => 'response' in answer)).toBe(false);
    expect(standard.answers.some((answer) => 'responseSkipped' in answer)).toBe(false);
  });
});

describe('createAttempt in answer-first mode', () => {
  const selection = drawSelection(bank, 3, 42);
  const [first, second, third] = selection.map(({ question }) => question.id) as [
    string,
    string,
    string,
  ];

  const attempt = createAttempt({
    ...input,
    mode: 'answer-first',
    chosen: { [first]: 'a', [second]: 'b' },
    confidence: { [first]: 'sure', [second]: 'guess' },
    // The first written and revealed, the second skipped, the third drafted but never revealed.
    responses: { [first]: '  Because $F = ma$.  ', [third]: 'Still thinking about it' },
    revealed: { [first]: 'written', [second]: 'skipped' },
  });

  it('records the mode', () => {
    expect(attempt.mode).toBe('answer-first');
  });

  it('records a written response, trimmed, and marks a skipped one', () => {
    expect(attempt.answers[0]).toMatchObject({ response: 'Because $F = ma$.' });
    expect(attempt.answers[0]).not.toHaveProperty('responseSkipped');
    expect(attempt.answers[1]).toMatchObject({ responseSkipped: true });
    expect(attempt.answers[1]).not.toHaveProperty('response');
  });

  it('keeps no draft of a question whose options were never revealed', () => {
    expect(attempt.answers[2]).not.toHaveProperty('response');
    expect(attempt.answers[2]).not.toHaveProperty('responseSkipped');
  });

  it('records no self-grade, which is made only in review', () => {
    expect(attempt.answers.some((answer) => 'selfGrade' in answer)).toBe(false);
  });
});
