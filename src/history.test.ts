import { beforeEach, describe, expect, it } from 'vitest';
import { createAttempt } from './domain/attempt';
import type { Bank } from './domain/bank';
import { writeHistoryFile } from './domain/history-file';
import { drawSelection } from './domain/selection';
import {
  filterHistory,
  historyFilterValues,
  importHistory,
  newestEdition,
  reviewFromHistory,
} from './history';
import { addBankFromText } from './library';
import {
  bankKey,
  db,
  deleteBank,
  listAttempts,
  recordSubmittedAttempt,
  setCountedOverride,
} from './storage/db';
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
    expect(historyFilterValues(history)).toEqual({
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

describe('reviewing an attempt from history', () => {
  function bankText(version: string, questionIds: string[]): string {
    const bank: Bank = {
      formatVersion: 1,
      id: 'test.units',
      version,
      title: 'SI units',
      questions: questionIds.map((id) => ({
        id,
        type: 'single-choice',
        prompt: `Prompt ${id}`,
        options: [
          { id: 'a', text: 'A' },
          { id: 'b', text: 'B' },
        ],
        answer: 'a',
        explanation: `Because ${id}.`,
      })),
    };
    return JSON.stringify(bank);
  }

  /** Adds the first edition and takes an attempt of every question on it. */
  async function attemptOnFirstEdition() {
    const added = await addBankFromText(bankText('1.0.0', ['q1', 'q2', 'q3']), {
      kind: 'upload',
      filename: 'units.json',
    });
    if (!added.ok || added.status !== 'added') throw new Error('bank not added');
    const bank = JSON.parse(added.bank.raw) as Bank;
    const selection = drawSelection(bank, 3, 42);
    return createAttempt({
      id: anna.id,
      name: 'Anna',
      bank,
      bankFingerprint: added.bank.fingerprint,
      seed: 42,
      selection,
      chosen: {},
      confidence: {},
      answeredAt: {},
      startedAt: new Date('2026-09-23T10:00:00.000Z'),
      submittedAt: new Date('2026-09-23T10:03:20.000Z'),
      appVersion: '0.1.0',
    });
  }

  it('replays the attempt against the edition it was taken on', async () => {
    const attempt = await attemptOnFirstEdition();
    await addBankFromText(bankText('2.0.0', ['q1', 'q2']), { kind: 'upload', filename: 'v2.json' });

    const review = await reviewFromHistory(attempt);

    expect(review.edition).toBe('same');
  });

  it('uses the newest other edition held when that one is gone', async () => {
    const attempt = await attemptOnFirstEdition();
    await addBankFromText(bankText('2.0.0', ['q1', 'q2']), { kind: 'upload', filename: 'v2.json' });
    await addBankFromText(bankText('3.0.0', ['q1']), { kind: 'upload', filename: 'v3.json' });
    await deleteBank(bankKey('test.units', '1.0.0'));

    const review = await reviewFromHistory(attempt);

    expect(review).toMatchObject({ edition: 'other', version: '3.0.0' });
    if (review.edition === 'none') throw new Error('unreachable');
    expect(review.questions.filter((reviewed) => reviewed.kind === 'archived')).toHaveLength(2);
  });

  it('has only the score when no edition of the bank is held', async () => {
    const attempt = await attemptOnFirstEdition();
    await deleteBank(bankKey('test.units', '1.0.0'));

    expect(await reviewFromHistory(attempt)).toEqual({ edition: 'none' });
  });
});

describe('the newest held edition of a bank', () => {
  function bankText(version: string): string {
    const text = JSON.stringify({
      formatVersion: 1,
      id: 'test.units',
      version,
      title: `SI units ${version}`,
      questions: [
        {
          id: 'q1',
          prompt: 'Prompt q1',
          options: [
            { id: 'a', text: 'A' },
            { id: 'b', text: 'B' },
          ],
          answer: 'a',
          explanation: 'Because.',
        },
      ],
    });
    return text;
  }

  it('is the edition with the highest version, whatever order they were added in', async () => {
    for (const version of ['1.10.0', '2.0.0', '1.2.0']) {
      await addBankFromText(bankText(version), { kind: 'upload', filename: `${version}.json` });
    }
    const newest = await newestEdition('test.units');
    expect(newest?.bank.version).toBe('2.0.0');
    expect(newest?.stored.key).toBe(bankKey('test.units', '2.0.0'));
  });

  it('passes over an edition that no longer opens', async () => {
    await addBankFromText(bankText('1.0.0'), { kind: 'upload', filename: 'v1.json' });
    await addBankFromText(bankText('2.0.0'), { kind: 'upload', filename: 'v2.json' });
    await db.banks.update(bankKey('test.units', '2.0.0'), { raw: '{}' });
    expect((await newestEdition('test.units'))?.bank.version).toBe('1.0.0');
  });

  it('is nothing when no edition is held', async () => {
    expect(await newestEdition('test.units')).toBeUndefined();
  });
});

describe('overruling whether an attempt counts', () => {
  it('records the participant’s ruling on a local attempt, and changes nothing else', async () => {
    await db.attempts.add(anna);
    await setCountedOverride(anna.id, true);
    expect(await db.attempts.get(anna.id)).toEqual({ ...anna, countedOverride: true });
    await setCountedOverride(anna.id, false);
    expect((await db.attempts.get(anna.id))?.countedOverride).toBe(false);
  });

  it('refuses to touch an imported attempt, which is read-only', async () => {
    const imported = { ...anna, origin: 'imported' as const };
    await db.attempts.add(imported);
    await expect(setCountedOverride(anna.id, true)).rejects.toThrow(/imported/);
    expect(await db.attempts.get(anna.id)).toEqual(imported);
  });
});
