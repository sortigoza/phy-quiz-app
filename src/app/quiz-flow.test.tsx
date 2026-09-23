import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, listAttempts, setLastParticipantName } from '../storage/db';
import {
  answerAllAndSubmit,
  answerCurrent,
  bankFile,
  currentQuestion,
  loadBankAndOpenStart,
  prompts,
  startQuiz,
} from '../test/quiz';

/**
 * The attempt flow, driven through the whole app the way a participant uses it:
 * library, start, one question per screen, submit, review.
 */

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('taking a quiz', () => {
  it('offers the last name used in this browser', async () => {
    await setLastParticipantName('Björn Larsson');
    await loadBankAndOpenStart(userEvent.setup());
    expect(await screen.findByDisplayValue('Björn Larsson')).toBeInTheDocument();
  });

  it("defaults the question count to the bank's own default, clamped to the bank size with a note", async () => {
    await loadBankAndOpenStart(userEvent.setup(), bankFile({ defaultQuestionCount: 20 }));
    expect(screen.getByRole('radio', { name: /all/i })).toBeChecked();
    expect(screen.getByText(/only has 3 questions/i)).toBeInTheDocument();
  });

  it('presents one question at a time as native radios, with progress', async () => {
    const user = userEvent.setup();
    await startQuiz(user);

    expect(screen.getByText(/question 1 of 3/i)).toBeInTheDocument();
    const group = screen.getByRole('group', { name: /SI unit/ });
    expect(group.tagName).toBe('FIELDSET');
    expect(within(group).getAllByRole('radio')).toHaveLength(3);
  });

  it('keeps answers when moving back and forth before submitting', async () => {
    const user = userEvent.setup();
    await startQuiz(user);

    const first = currentQuestion();
    await answerCurrent(user, { [first]: 'wrong' });
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(currentQuestion()).not.toBe(first);
    expect(screen.getByText(/question 2 of 3/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(currentQuestion()).toBe(first);
    expect(screen.getByRole('radio', { name: /Pascal/ })).toBeChecked();
  });

  it('warns about unanswered questions before scoring, and lets the participant go back', async () => {
    const user = userEvent.setup();
    await startQuiz(user);
    await answerAllAndSubmit(user, { q1: 'right' });

    expect(await screen.findByRole('alert')).toHaveTextContent(/2 questions unanswered/i);
    await user.click(screen.getByRole('button', { name: /keep answering/i }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await listAttempts()).toHaveLength(0);
  });

  it('reviews every question: correct option, chosen option, explanation, and the chosen distractor’s note', async () => {
    const user = userEvent.setup();
    await startQuiz(user);
    await answerAllAndSubmit(user, { q1: 'right', q2: 'wrong' });
    await user.click(await screen.findByRole('button', { name: /submit anyway/i }));

    expect(await screen.findByRole('heading', { name: /review/i })).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 correct/i)).toBeInTheDocument();

    const reviewOf = (id: keyof typeof prompts) =>
      screen.getByRole('article', { name: new RegExp(prompts[id]) });

    const right = reviewOf('q1');
    expect(within(right).getByText('Correct')).toBeInTheDocument();
    expect(right).toHaveTextContent('The answer to q1 is Newton.');
    expect(right).not.toHaveTextContent(/Pascal is pressure/);

    const wrong = reviewOf('q2');
    expect(
      within(wrong)
        .getByText(/Joule, the right one/)
        .closest('li'),
    ).toHaveTextContent(/correct answer/i);
    expect(
      within(wrong)
        .getByText(/Pascal, wrong for q2/)
        .closest('li'),
    ).toHaveTextContent(/you chose/i);
    expect(within(wrong).getByText('Wrong')).toBeInTheDocument();
    expect(wrong).toHaveTextContent('The answer to q2 is Joule.');
    expect(wrong).toHaveTextContent('Pascal is pressure, not what q2 asks.');

    const blank = reviewOf('q3');
    expect(blank).toHaveTextContent(/not answered/i);
    expect(blank).not.toHaveTextContent(/you chose/i);
    expect(blank).toHaveTextContent('The answer to q3 is Watt.');
  });

  it('records the attempt with every field the spec lists', async () => {
    const user = userEvent.setup();
    await startQuiz(user, '  Anna   Svensson ');
    await answerAllAndSubmit(user, { q1: 'right', q2: 'wrong', q3: 'right' });
    await screen.findByRole('heading', { name: /review/i });

    const [attempt] = await listAttempts();
    const bank = (await db.banks.toArray())[0];
    expect(attempt).toMatchObject({
      name: 'Anna Svensson',
      bankId: 'test.units',
      bankVersion: '1.0.0',
      bankFingerprint: bank?.fingerprint,
      bankTitle: 'SI units',
      questionCount: 3,
      correctCount: 2,
      origin: 'local',
    });
    expect(attempt?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(attempt?.code).toMatch(/^[0-9A-Z]{3}-[0-9A-Z]{4}$/);
    expect(attempt?.seed).toEqual(expect.any(Number));
    expect(attempt?.durationMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(attempt?.submittedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(attempt?.startedAt ?? ''),
    );
    expect(attempt?.answers).toHaveLength(3);
    expect(attempt?.appVersion).toBeTruthy();
  });

  it('asks before the page is closed or reloaded mid-attempt, and not once it is submitted', async () => {
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const user = userEvent.setup();
    expect(leave()).toBe(false);

    await startQuiz(user);
    expect(leave()).toBe(true);

    await answerAllAndSubmit(user, { q1: 'right', q2: 'right', q3: 'right' });
    await screen.findByRole('heading', { name: /review/i });
    expect(leave()).toBe(false);
  });

  it('remembers the name for next time', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna');
    await answerAllAndSubmit(user, { q1: 'right', q2: 'right', q3: 'right' });
    await user.click(await screen.findByRole('button', { name: /back to library/i }));

    await user.click(await screen.findByRole('button', { name: /start SI units/i }));
    expect(await screen.findByDisplayValue('Anna')).toBeInTheDocument();
  });
});
