import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { bankKey, db, putBank } from '../storage/db';
import { answerCurrent, bankFile, currentQuestion, startQuiz } from '../test/quiz';

/**
 * Failures a participant can meet through no fault of their own, and must be
 * able to get past without a blank page.
 */

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('a bank in the library that no longer validates', () => {
  // As if accepted by an earlier, more lenient version of the app.
  const lenient = JSON.stringify({
    formatVersion: 1,
    id: 'old.bank',
    version: '1.0.0',
    title: 'An old bank',
    questions: [{ id: 'q1', prompt: 'Why?', options: [], answer: 'a', explanation: 'Because.' }],
  });

  beforeEach(async () => {
    await putBank({
      key: bankKey('old.bank', '1.0.0'),
      id: 'old.bank',
      version: '1.0.0',
      title: 'An old bank',
      questionCount: 1,
      fingerprint: '0badf00d',
      source: { kind: 'upload', filename: 'old.json' },
      addedAt: '2026-09-01T00:00:00.000Z',
      raw: lenient,
    });
  });

  it('explains the problem when started, and offers to remove it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /start an old bank/i }));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/an old bank can no longer be opened/i);
    expect(alert).toHaveTextContent(/questions\[0\]\.options/);
    expect(screen.getByRole('heading', { name: /your question banks/i })).toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: /remove it/i }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /start an old bank/i })).not.toBeInTheDocument(),
    );
    expect(await db.banks.count()).toBe(0);
  });
});

describe('storage being unavailable', () => {
  it('explains a browser that refuses storage, such as a private window', async () => {
    // Stand in for a browser whose IndexedDB refuses to open for this page.
    const deps = (db as unknown as { _deps: { indexedDB: IDBFactory } })._deps;
    const real = deps.indexedDB;
    db.close({ disableAutoOpen: false });
    deps.indexedDB = {
      open() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    } as unknown as IDBFactory;

    try {
      render(<App />);
      expect(await screen.findByRole('alert')).toHaveTextContent(/private or incognito window/i);
    } finally {
      deps.indexedDB = real;
      db.close({ disableAutoOpen: false });
      await db.open();
    }
  });

  it('explains a full device when a bank cannot be saved', async () => {
    vi.spyOn(db.banks, 'put').mockRejectedValue(
      new DOMException('Quota exceeded', 'QuotaExceededError'),
    );
    render(<App />);
    await userEvent.setup().upload(screen.getByLabelText(/bank file/i), bankFile());

    expect(await screen.findByRole('alert')).toHaveTextContent(/out of storage space/i);
    expect(await db.banks.count()).toBe(0);
  });

  it('warns during a quiz when answers stop being saved, keeping them on screen', async () => {
    const user = userEvent.setup();
    await startQuiz(user);
    vi.spyOn(db.inProgress, 'put').mockRejectedValue(
      new DOMException('Quota exceeded', 'QuotaExceededError'),
    );
    await answerCurrent(user, { [currentQuestion()]: 'right' });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/answers are not being saved/i);
    expect(alert).toHaveTextContent(/out of storage space/i);
    expect(screen.getByRole('radio', { name: /right one/ })).toBeChecked();
  });
});
