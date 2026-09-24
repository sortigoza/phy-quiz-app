import { describe, expect, it } from 'vitest';
import { attemptRecord as attempt } from '../test/attempts';
import { historyFileName, readHistoryFile, writeHistoryFile } from './history-file';

const exportedAt = new Date('2026-09-24T08:30:00.000Z');

function fileWith(document: unknown): string {
  return JSON.stringify(document);
}

function envelope(attempts: unknown[], overrides: Record<string, unknown> = {}): string {
  return fileWith({
    format: 'physics-quiz-history',
    formatVersion: 1,
    exportedAt: exportedAt.toISOString(),
    appVersion: '0.1.0',
    attempts,
    ...overrides,
  });
}

describe('writing a history file', () => {
  it('wraps the attempts in a versioned envelope', () => {
    const written = JSON.parse(writeHistoryFile([attempt()], exportedAt, '0.2.0'));
    expect(written).toEqual({
      format: 'physics-quiz-history',
      formatVersion: 1,
      exportedAt: '2026-09-24T08:30:00.000Z',
      appVersion: '0.2.0',
      attempts: [attempt()],
    });
  });

  it('names the file by the date it was exported', () => {
    expect(historyFileName(new Date(2026, 8, 4, 23, 59))).toBe(
      'physics-quiz-history-2026-09-04.json',
    );
  });
});

describe('reading a history file', () => {
  it('reads back what was written, marking every attempt imported', () => {
    const read = readHistoryFile(writeHistoryFile([attempt()], exportedAt, '0.1.0'));
    expect(read).toEqual({
      ok: true,
      attempts: [attempt({ origin: 'imported' })],
      rejected: [],
    });
  });
});

describe('reading a file that is not a history file this app understands', () => {
  it('rejects text that is not JSON', () => {
    expect(readHistoryFile('{"format":')).toEqual({
      ok: false,
      message: expect.stringMatching(/not valid JSON/),
    });
  });

  it('rejects JSON that is not a history file, such as a question bank', () => {
    const bank = fileWith({ formatVersion: 1, id: 'test.units', questions: [] });
    expect(readHistoryFile(bank)).toEqual({
      ok: false,
      message: expect.stringMatching(/not a history file/),
    });
  });

  it('rejects an envelope version it does not know, rather than guessing', () => {
    expect(readHistoryFile(envelope([attempt()], { formatVersion: 2 }))).toEqual({
      ok: false,
      message: expect.stringMatching(/version 2.*newer version of the app/),
    });
  });

  it('rejects an envelope without a list of attempts', () => {
    expect(readHistoryFile(envelope([], { attempts: { one: attempt() } }))).toEqual({
      ok: false,
      message: expect.stringMatching(/list of attempts/),
    });
  });
});

describe('reading the attempts in a history file', () => {
  it('skips a malformed attempt with its position and reason, and keeps the rest', () => {
    const second = attempt({ id: '01890a5d-ac96-774b-bcce-b302099a8058' });
    const read = readHistoryFile(envelope([attempt(), { ...attempt(), seed: 'lucky' }, second]));
    expect(read).toEqual({
      ok: true,
      attempts: [attempt({ origin: 'imported' }), expect.objectContaining({ id: second.id })],
      rejected: [{ position: 2, reason: expect.stringMatching(/^seed: /) }],
    });
  });

  it('rejects an attempt whose claimed score its own answers contradict', () => {
    expect(readHistoryFile(envelope([attempt({ correctCount: 2 })]))).toEqual({
      ok: true,
      attempts: [],
      rejected: [
        { position: 1, reason: 'correctCount: correctCount is 2 but the answers score 1' },
      ],
    });
  });

  it('rejects an entry that is not an attempt at all', () => {
    expect(readHistoryFile(envelope(['Anna got 10 out of 10']))).toMatchObject({
      ok: true,
      attempts: [],
      rejected: [{ position: 1 }],
    });
  });

  it('derives the attempt code from the id rather than trusting the file', () => {
    expect(readHistoryFile(envelope([attempt({ code: 'AAA-AAAA' })]))).toMatchObject({
      ok: true,
      attempts: [{ code: '84S-N02Q' }],
    });
  });

  it('marks an attempt imported whatever origin the file claims', () => {
    expect(readHistoryFile(envelope([attempt({ origin: 'local' })]))).toMatchObject({
      ok: true,
      attempts: [{ origin: 'imported' }],
    });
  });

  it('lower-cases the id, so the same attempt cannot slip past deduplication by case', () => {
    const shouted = attempt({ id: '01890A5D-AC96-774B-BCCE-B302099A8057' });
    expect(readHistoryFile(envelope([shouted]))).toMatchObject({
      ok: true,
      attempts: [{ id: '01890a5d-ac96-774b-bcce-b302099a8057' }],
    });
  });

  it('writes times the way this app does, so history sorts newest first', () => {
    const read = readHistoryFile(
      envelope([
        attempt({ startedAt: '2026-09-23T10:00:00Z', submittedAt: '2026-09-23T12:03:20+02:00' }),
      ]),
    );
    expect(read).toMatchObject({
      ok: true,
      attempts: [
        { startedAt: '2026-09-23T10:00:00.000Z', submittedAt: '2026-09-23T10:03:20.000Z' },
      ],
    });
  });

  it('rejects an attempt submitted before it started', () => {
    const read = readHistoryFile(envelope([attempt({ startedAt: '2026-09-23T11:00:00.000Z' })]));
    expect(read).toMatchObject({
      ok: true,
      attempts: [],
      rejected: [{ position: 1, reason: expect.stringMatching(/^submittedAt: .*before/) }],
    });
  });

  it('accepts fields a later version of the app may add, and drops them', () => {
    expect(readHistoryFile(envelope([{ ...attempt(), device: 'phone' }]))).toEqual({
      ok: true,
      attempts: [attempt({ origin: 'imported' })],
      rejected: [],
    });
  });
});
