import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import { db, listAttempts, setLastParticipantName } from '../storage/db';

/**
 * The attempt flow, driven through the whole app the way a participant uses it:
 * library, start, one question per screen, submit, review.
 *
 * The selection is shuffled, so the bank is written to make every question
 * recognisable by its prompt and every option recognisable by its text.
 */

const prompts = {
  q1: 'What is the SI unit of force?',
  q2: 'What is the SI unit of energy?',
  q3: 'What is the SI unit of power?',
};

function bankFile(overrides: Record<string, unknown> = {}): File {
  const question = (id: keyof typeof prompts, right: string) => ({
    id,
    prompt: prompts[id],
    options: [
      { id: 'a', text: `${right}, the right one` },
      { id: 'b', text: `Pascal, wrong for ${id}`, why: `Pascal is pressure, not what ${id} asks.` },
      { id: 'c', text: `Kelvin, wrong for ${id}` },
    ],
    answer: 'a',
    explanation: `The answer to ${id} is ${right}.`,
  });

  const bank = {
    formatVersion: 1,
    id: 'test.units',
    version: '1.0.0',
    title: 'SI units',
    questions: [question('q1', 'Newton'), question('q2', 'Joule'), question('q3', 'Watt')],
    ...overrides,
  };
  return new File([JSON.stringify(bank)], 'units.json', { type: 'application/json' });
}

type Plan = Partial<Record<keyof typeof prompts, 'right' | 'wrong'>>;

/** Which question is on screen, by its prompt. */
function currentQuestion(): keyof typeof prompts {
  const legend = screen.getByRole('group', { name: /SI unit/ });
  const entry = Object.entries(prompts).find(([, prompt]) => legend.textContent?.includes(prompt));
  if (!entry) throw new Error('No known question on screen');
  return entry[0] as keyof typeof prompts;
}

async function answerCurrent(user: UserEvent, plan: Plan): Promise<void> {
  const choice = plan[currentQuestion()];
  if (choice === undefined) return;
  await user.click(
    screen.getByRole('radio', { name: choice === 'right' ? /right one/ : /Pascal/ }),
  );
}

async function loadBankAndOpenStart(user: UserEvent, file = bankFile()): Promise<void> {
  render(<App />);
  await user.upload(screen.getByLabelText(/bank file/i), file);
  await user.click(await screen.findByRole('button', { name: /start SI units/i }));
  await screen.findByRole('heading', { name: /SI units/ });
}

async function startQuiz(user: UserEvent, name = 'Anna'): Promise<void> {
  await loadBankAndOpenStart(user);
  const nameField = screen.getByLabelText(/your name/i);
  await user.clear(nameField);
  await user.type(nameField, name);
  await user.click(screen.getByRole('radio', { name: /all/i }));
  await user.click(screen.getByRole('button', { name: /begin/i }));
  // Beginning saves the name first, so the attempt screen arrives asynchronously.
  await screen.findByText(/question 1 of/i);
}

/** Answers every question according to the plan, then presses submit. */
async function answerAllAndSubmit(user: UserEvent, plan: Plan): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await answerCurrent(user, plan);
    if (i < 2) await user.click(screen.getByRole('button', { name: /next/i }));
  }
  await user.click(screen.getByRole('button', { name: /submit/i }));
}

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

  it('remembers the name for next time', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna');
    await answerAllAndSubmit(user, { q1: 'right', q2: 'right', q3: 'right' });
    await user.click(await screen.findByRole('button', { name: /back to library/i }));

    await user.click(await screen.findByRole('button', { name: /start SI units/i }));
    expect(await screen.findByDisplayValue('Anna')).toBeInTheDocument();
  });
});
