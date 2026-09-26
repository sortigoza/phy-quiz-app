import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import type { Attempt } from '../domain/attempt';
import { db } from '../storage/db';
import { attemptRecord } from '../test/attempts';
import { answerAllAndSubmit, startQuiz } from '../test/quiz';

/**
 * History, export and import, driven through the whole app: a participant
 * looking back at their attempts, and a teacher gathering a class's files.
 */

const anna = attemptRecord({
  startedAt: '2026-09-22T09:56:40.000Z',
  submittedAt: '2026-09-22T10:00:00.000Z',
});
const ben = attemptRecord({
  id: '01890a5d-ac96-774b-bcce-b302099a8058',
  code: '84S-N02R',
  name: 'Ben',
  submittedAt: '2026-09-23T10:00:00.000Z',
});
const cleoOptics = attemptRecord({
  id: '01890a5d-ac96-774b-bcce-b302099a8059',
  code: '84S-N02S',
  name: 'Cleo',
  bankId: 'test.optics',
  bankTitle: 'Optics',
  submittedAt: '2026-09-24T10:00:00.000Z',
});

function historyFile(attempts: unknown[], name = 'class.json', formatVersion = 1): File {
  const text = JSON.stringify({
    format: 'physics-quiz-history',
    formatVersion,
    exportedAt: '2026-09-24T12:00:00.000Z',
    appVersion: '0.1.0',
    attempts,
  });
  return new File([text], name, { type: 'application/json' });
}

async function openHistory(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('button', { name: 'History' }));
  await screen.findByRole('heading', { name: 'History' });
}

/** The rows of the history table, header excluded. */
async function historyRows(): Promise<HTMLElement[]> {
  const table = await screen.findByRole('table', { name: /attempts/i });
  return within(table).getAllByRole('row').slice(1);
}

/** Catches what the app offers as a download, instead of the browser saving it. */
function catchDownloads(): Array<{ filename: string; blob: Blob }> {
  const downloads: Array<{ filename: string; blob: Blob }> = [];
  let pending: Blob | undefined;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    pending = blob;
    return 'blob:download';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (pending) downloads.push({ filename: this.download, blob: pending });
  });
  return downloads;
}

async function exported(download: { blob: Blob } | undefined): Promise<{ attempts: Attempt[] }> {
  if (!download) throw new Error('Nothing was downloaded');
  return JSON.parse(await download.blob.text()) as { attempts: Attempt[] };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('history', () => {
  it('lists an attempt just taken, with its date, name, bank, score, duration and code', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna');
    await answerAllAndSubmit(user, { q1: 'right', q2: 'right', q3: 'wrong' });
    await screen.findByRole('heading', { name: /review/i });
    const code = screen.getByTitle('Attempt code').textContent ?? '';
    await user.click(screen.getByRole('button', { name: /back to library/i }));

    await openHistory(user);
    const [row, ...others] = await historyRows();
    expect(others).toHaveLength(0);
    expect(row).toHaveTextContent('Anna');
    expect(row).toHaveTextContent('SI units');
    expect(row).toHaveTextContent('2 of 3 (67%)');
    expect(row).toHaveTextContent(code);
    expect(within(row as HTMLElement).getByRole('time')).toHaveAttribute('dateTime');
    expect(row).not.toHaveTextContent(/unverified/i);
  });

  it('lists newest first, and shows the duration readably', async () => {
    await db.attempts.bulkAdd([anna, cleoOptics, ben]);
    render(<App />);
    await openHistory(userEvent.setup());

    const rows = await historyRows();
    expect(rows.map((row) => within(row).getAllByRole('cell')[1]?.textContent)).toEqual([
      'Cleo',
      'Ben',
      'Anna',
    ]);
    expect(rows[0]).toHaveTextContent('3 min 20 s');
  });

  it('says so when there is nothing yet', async () => {
    render(<App />);
    await openHistory(userEvent.setup());
    expect(await screen.findByText(/no attempts yet/i)).toBeInTheDocument();
  });

  it('filters by participant and by bank', async () => {
    await db.attempts.bulkAdd([anna, ben, cleoOptics]);
    const user = userEvent.setup();
    render(<App />);
    await openHistory(user);

    await user.selectOptions(screen.getByLabelText('Participant'), 'Ben');
    expect(await historyRows()).toHaveLength(1);
    expect((await historyRows())[0]).toHaveTextContent('Ben');

    await user.selectOptions(screen.getByLabelText('Participant'), 'Everyone');
    await user.selectOptions(screen.getByLabelText('Bank'), 'Optics');
    const rows = await historyRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('Cleo');
  });

  it('goes back to the library', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openHistory(user);
    await user.click(screen.getByRole('button', { name: /back to library/i }));
    expect(
      await screen.findByRole('heading', { name: /your question banks/i }),
    ).toBeInTheDocument();
  });
});

describe('exporting history', () => {
  it('saves everything in a dated, versioned file', async () => {
    await db.attempts.bulkAdd([anna, ben, cleoOptics]);
    const downloads = catchDownloads();
    const user = userEvent.setup();
    render(<App />);
    await openHistory(user);

    await user.click(screen.getByRole('button', { name: /export all 3/i }));

    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.filename).toMatch(/^physics-quiz-history-\d{4}-\d{2}-\d{2}\.json$/);
    const file = await exported(downloads[0]);
    expect(file).toMatchObject({ format: 'physics-quiz-history', formatVersion: 1 });
    expect(file.attempts.map((attempt) => attempt.name)).toEqual(['Cleo', 'Ben', 'Anna']);
  });

  it('saves only the current filter when asked', async () => {
    await db.attempts.bulkAdd([anna, ben, cleoOptics]);
    const downloads = catchDownloads();
    const user = userEvent.setup();
    render(<App />);
    await openHistory(user);

    expect(screen.queryByRole('button', { name: /export these/i })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Bank'), 'SI units');
    await user.click(screen.getByRole('button', { name: /export these 2/i }));

    const file = await exported(downloads[0]);
    expect(file.attempts.map((attempt) => attempt.name)).toEqual(['Ben', 'Anna']);
  });
});

describe('importing history', () => {
  it('imports a file, reports what happened with the reasons, and badges the attempts unverified', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openHistory(user);

    await user.upload(
      screen.getByLabelText(/import history/i),
      historyFile([anna, { ...ben, correctCount: 3 }, cleoOptics]),
    );

    const report = await screen.findByRole('status');
    expect(report).toHaveTextContent('Imported 2, skipped 0 duplicates, rejected 1 invalid');
    expect(report).toHaveTextContent(/attempt 2.*correctCount is 3 but the answers score 1/i);
    // The table is a live query, which can refresh a moment after the import reports.
    await waitFor(async () => expect(await historyRows()).toHaveLength(2));
    for (const row of await historyRows()) expect(row).toHaveTextContent(/unverified/i);
  });

  it('changes nothing when the same file is imported again', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openHistory(user);
    const file = historyFile([anna, ben]);

    await user.upload(screen.getByLabelText(/import history/i), file);
    await screen.findByText(/imported 2, skipped 0 duplicates/i);
    const before = await db.attempts.toArray();

    await user.upload(screen.getByLabelText(/import history/i), file);
    expect(await screen.findByText(/imported 0, skipped 2 duplicates/i)).toBeInTheDocument();
    expect(await db.attempts.toArray()).toEqual(before);
    expect(await historyRows()).toHaveLength(2);
  });

  it('takes a whole class’s files at once', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openHistory(user);

    await user.upload(screen.getByLabelText(/import history/i), [
      historyFile([anna], 'anna.json'),
      historyFile([ben], 'ben.json'),
      historyFile([cleoOptics], 'cleo.json'),
    ]);

    expect(await screen.findByText(/imported 3, skipped 0 duplicates/i)).toBeInTheDocument();
    // The table is a live query, which can refresh a moment after the import reports.
    await waitFor(async () => expect(await historyRows()).toHaveLength(3));
  });

  it('refuses a file of an unknown version, naming it, and imports nothing from it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openHistory(user);

    await user.upload(
      screen.getByLabelText(/import history/i),
      historyFile([anna], 'future.json', 2),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('future.json');
    expect(alert).toHaveTextContent(/newer version of the app/);
    expect(await db.attempts.count()).toBe(0);
  });
});
