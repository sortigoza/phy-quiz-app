import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { db } from '../storage/db';
import { answerAllAndSubmit, startQuiz } from '../test/quiz';

/**
 * Where the focus goes as the participant moves through the app. Each new
 * screen, and each new question, puts the focus on its heading, so a screen
 * reader announces where they are and the next Tab reaches what follows it.
 */

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('focus through the quiz', () => {
  it('leaves the focus alone when the app first opens', () => {
    render(<App />);
    expect(document.body).toHaveFocus();
  });

  it('moves to the heading of each question, then of the review, then of the library', async () => {
    const user = userEvent.setup();
    await startQuiz(user);
    expect(screen.getByRole('heading', { name: 'Question 1 of 3' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByRole('heading', { name: 'Question 2 of 3' })).toHaveFocus();

    // The next Tab reaches the options, not the page header.
    await user.tab();
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /previous/i }));
    await answerAllAndSubmit(user, { q1: 'right', q2: 'right', q3: 'right' });
    expect(await screen.findByRole('heading', { name: 'Review' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: /back to library/i }));
    expect(await screen.findByRole('heading', { name: /your question banks/i })).toHaveFocus();
  });
});
