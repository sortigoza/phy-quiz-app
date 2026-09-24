import { beforeEach, describe, expect, it } from 'vitest';
import { writeHistoryFile } from './domain/history-file';
import { filterHistory, historyChoices, importHistory } from './history';
import { db, listAttempts, recordSubmittedAttempt } from './storage/db';
import { attemptRecord } from './test/attempts';

const exportedAt = new Date('2026-09-24T08:30:00.000Z');

/** Three classmates' attempts, as one of them exported them. */
const anna = attemptRecord();
const ben = attemptRecord({ id: '01890a5d-ac96-774b-bcce-b302099a8058', name: 'Ben' });
const cleo = attemptRecord({ id: '01890a5d-ac96-774b-bcce-b302099a8059', name: 'Cleo' });

function historyFile(attempts: unknown[]): string {
  return writeHistoryFile(attempts as never, exportedAt, '0.1.0');
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('filtering history', () => {
  const units2 = attemptRecord({
    id: '01890a5d-ac96-774b-bcce-b302099a805a',
    bankVersion: '2.0.0',
    bankTitle: 'SI units, revised',
    submittedAt: '2026-09-24T09:00:00.000Z',
  });
  const optics = attemptRecord({
    id: '01890a5d-ac96-774b-bcce-b302099a805b',
    name: 'Ben',
    bankId: 'test.optics',
    bankTitle: 'Optics',
  });
  const history = [units2, anna, optics, ben];

  it('keeps everything when no filter is set', () => {
    expect(filterHistory(history, {})).toEqual(history);
  });

  it('keeps one participant’s attempts, by their exact name', () => {
    expect(filterHistory(history, { name: 'Ben' })).toEqual([optics, ben]);
  });

  it('keeps one bank’s attempts across its versions', () => {
    expect(filterHistory(history, { bankId: 'test.units' })).toEqual([units2, anna, ben]);
  });

  it('combines the two filters', () => {
    expect(filterHistory(history, { name: 'Ben', bankId: 'test.units' })).toEqual([ben]);
  });

  it('offers each name once, alphabetically, and each bank once under its newest title', () => {
    expect(historyChoices(history)).toEqual({
      names: ['Anna', 'Ben'],
      banks: [
        { bankId: 'test.optics', title: 'Optics' },
        { bankId: 'test.units', title: 'SI units, revised' },
      ],
    });
  });
});

describe('importing a history file', () => {
  it('adds every attempt, marked imported, and says how many', async () => {
    const report = await importHistory(historyFile([anna, ben]));

    expect(report).toEqual({ ok: true, added: 2, duplicates: 0, rejected: [] });
    const held = await listAttempts();
    expect(held.map((attempt) => attempt.name).sort()).toEqual(['Anna', 'Ben']);
    expect(held.every((attempt) => attempt.origin === 'imported')).toBe(true);
  });

  it('changes nothing the second time the same file is imported', async () => {
    const file = historyFile([anna, ben, cleo]);
    await importHistory(file);
    const afterFirst = await listAttempts();

    const second = await importHistory(file);

    expect(second).toEqual({ ok: true, added: 0, duplicates: 3, rejected: [] });
    expect(await listAttempts()).toEqual(afterFirst);
  });

  it('keeps the record already held when an id collides, so a local attempt stays local', async () => {
    await recordSubmittedAttempt(anna);

    const report = await importHistory(historyFile([{ ...anna, name: 'Someone else' }, ben]));

    expect(report).toMatchObject({ added: 1, duplicates: 1 });
    expect(await db.attempts.get(anna.id)).toEqual(anna);
  });

  it('counts an attempt repeated within one file as a duplicate', async () => {
    const report = await importHistory(historyFile([anna, anna]));
    expect(report).toMatchObject({ added: 1, duplicates: 1 });
    expect(await listAttempts()).toHaveLength(1);
  });

  it('skips a malformed attempt, reports why, and imports the others', async () => {
    const report = await importHistory(historyFile([anna, { ...ben, answers: [] }, cleo]));

    expect(report).toEqual({
      ok: true,
      added: 2,
      duplicates: 0,
      rejected: [{ position: 2, reason: expect.stringMatching(/^answers/) }],
    });
  });

  it('imports nothing from a file it cannot read', async () => {
    const report = await importHistory('{"format":"physics-quiz-history","formatVersion":9}');
    expect(report).toMatchObject({ ok: false });
    expect(await listAttempts()).toEqual([]);
  });
});
