import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import { db, listAttempts } from '../storage/db';
import {
  answerAllAndSubmit,
  answerCurrent,
  confidenceGroup,
  currentQuestion,
  startQuiz,
} from '../test/quiz';

/**
 * Resuming an interrupted attempt: the tab dies mid-quiz, the app is opened
 * again, and the participant carries on where they left off.
 *
 * Unmounting the app and rendering a fresh one stands in for the killed tab:
 * nothing survives but what was written to storage.
 */

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** The options of the question on screen, in the order they are shown. */
function optionOrder(): string[] {
  const group = screen.getByRole('group', { name: /SI unit/ });
  return within(group)
    .getAllByRole('radio')
    .map((radio) => radio.closest('label')?.textContent ?? '');
}

/** What the participant saw: each question in order, with its options in order. */
async function walkQuestions(user: UserEvent): Promise<string[][]> {
  const seen: string[][] = [];
  for (let i = 0; i < 3; i++) {
    seen.push([currentQuestion(), ...optionOrder()]);
    if (i < 2) await user.click(screen.getByRole('button', { name: /next/i }));
  }
  return seen;
}

/** Answers the first two questions, leaving the participant on the second. */
async function answerTwoThenStop(user: UserEvent): Promise<void> {
  await startQuiz(user);
  await answerCurrent(user, { [currentQuestion()]: 'wrong' });
  await user.click(screen.getByRole('button', { name: /next/i }));
  await answerCurrent(user, { [currentQuestion()]: 'right' });
}

/** The tab is killed and the app opened again. */
function reopen(): void {
  cleanup();
  render(<App />);
}

describe('resuming an interrupted attempt', () => {
  it('offers to resume, naming the bank and the progress', async () => {
    const user = userEvent.setup();
    await answerTwoThenStop(user);

    reopen();

    const offer = await screen.findByRole('region', { name: /quiz in progress/i });
    expect(offer).toHaveTextContent(/SI units/);
    expect(offer).toHaveTextContent(/2 of 3 answered/);
    expect(within(offer).getByRole('button', { name: /resume/i })).toBeInTheDocument();
    expect(within(offer).getByRole('button', { name: /discard/i })).toBeInTheDocument();
  });

  it('resumes at the same question, with the same selection, option order and answers', async () => {
    const user = userEvent.setup();
    await startQuiz(user);
    const before = await walkQuestions(user);
    // Back to the second question, answering the first two on the way.
    await user.click(screen.getByRole('button', { name: /previous/i }));
    await user.click(screen.getByRole('button', { name: /previous/i }));
    const first = currentQuestion();
    await answerCurrent(user, { [first]: 'wrong' });
    await user.click(screen.getByRole('button', { name: /next/i }));
    const second = currentQuestion();
    await answerCurrent(user, { [second]: 'right' });

    reopen();
    await user.click(await screen.findByRole('button', { name: /resume/i }));

    expect(await screen.findByText(/question 2 of 3/i)).toBeInTheDocument();
    expect(currentQuestion()).toBe(second);
    expect(screen.getByRole('radio', { name: /right one/ })).toBeChecked();
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(screen.getByRole('radio', { name: /Pascal/ })).toBeChecked();

    expect(await walkQuestions(user)).toEqual(before);
  });

  it('resumes with the confidence given', async () => {
    const user = userEvent.setup();
    await startQuiz(user);
    await answerCurrent(user, { [currentQuestion()]: 'wrong' }, { [currentQuestion()]: 'guess' });
    await user.click(screen.getByRole('button', { name: /next/i }));

    reopen();
    await user.click(await screen.findByRole('button', { name: /resume/i }));
    await user.click(await screen.findByRole('button', { name: /previous/i }));
    expect(within(confidenceGroup()).getByRole('radio', { name: 'Guess' })).toBeChecked();
  });

  it('resumes an attempt saved before confidence was asked for', async () => {
    const user = userEvent.setup();
    await answerTwoThenStop(user);
    const saved = await db.inProgress.get('current');
    if (!saved) throw new Error('Nothing in progress');
    delete saved.confidence;
    await db.inProgress.put(saved);

    reopen();
    await user.click(await screen.findByRole('button', { name: /resume/i }));
    expect(await screen.findByText(/question 2 of 3/i)).toBeInTheDocument();
    expect(within(confidenceGroup()).getByRole('radio', { name: 'Sure' })).not.toBeChecked();
  });

  it('discards the attempt without recording anything in history', async () => {
    const user = userEvent.setup();
    await answerTwoThenStop(user);

    reopen();
    const offer = await screen.findByRole('region', { name: /quiz in progress/i });
    await user.click(within(offer).getByRole('button', { name: /discard/i }));

    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /quiz in progress/i })).not.toBeInTheDocument(),
    );
    expect(await listAttempts()).toHaveLength(0);
    reopen();
    await screen.findByRole('list', { name: /question banks/i });
    expect(screen.queryByRole('region', { name: /quiz in progress/i })).not.toBeInTheDocument();
  });

  it('leaves nothing in progress once the attempt is submitted', async () => {
    const user = userEvent.setup();
    await startQuiz(user);
    await answerAllAndSubmit(user, { q1: 'right', q2: 'right', q3: 'right' });
    await screen.findByRole('heading', { name: /review/i });

    reopen();
    await screen.findByRole('list', { name: /question banks/i });
    expect(screen.queryByRole('region', { name: /quiz in progress/i })).not.toBeInTheDocument();
    expect(await listAttempts()).toHaveLength(1);
  });

  it('asks before starting another quiz while one is in progress', async () => {
    const user = userEvent.setup();
    await answerTwoThenStop(user);
    reopen();
    await screen.findByRole('region', { name: /quiz in progress/i });

    await user.click(screen.getByRole('button', { name: /start SI units/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/starting SI units discards it/i);
    await user.click(screen.getByRole('button', { name: /keep it/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await db.inProgress.count()).toBe(1);

    await user.click(screen.getByRole('button', { name: /start SI units/i }));
    await user.click(screen.getByRole('button', { name: /discard it and start/i }));
    expect(await screen.findByRole('button', { name: /begin/i })).toBeInTheDocument();
    expect(await db.inProgress.count()).toBe(0);
  });

  it('cannot resume once the bank is removed, but can still discard', async () => {
    const user = userEvent.setup();
    await answerTwoThenStop(user);
    reopen();
    await user.click(await screen.findByRole('button', { name: /remove SI units/i }));

    const offer = await screen.findByRole('region', { name: /quiz in progress/i });
    await waitFor(() => expect(offer).toHaveTextContent(/no longer in your library/i));
    expect(within(offer).queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    await user.click(within(offer).getByRole('button', { name: /discard/i }));
    await waitFor(() => expect(offer).not.toBeInTheDocument());
  });

  it('stops answers changing while a submission is being saved, so it cannot come back as in progress', async () => {
    const user = userEvent.setup();
    await startQuiz(user);
    // Hold the submission mid-save.
    vi.spyOn(db, 'transaction').mockReturnValue(new Promise(() => {}) as never);
    await answerAllAndSubmit(user, { q1: 'right', q2: 'right', q3: 'right' });

    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled();
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });
});
