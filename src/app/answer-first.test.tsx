import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import { addAttempts, db, listAttempts } from '../storage/db';
import {
  answerCurrent,
  confidenceGroup,
  currentQuestion,
  loadBankAndOpenStart,
  startQuiz,
  writeAndReveal,
} from '../test/quiz';

/**
 * Answer-first mode, driven through the whole app: the participant writes
 * their own answer before the options appear, and grades it against the
 * explanation in review.
 */

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

function responseField(): HTMLElement {
  return screen.getByRole('textbox', { name: /your answer or reasoning/i });
}

function revealButton(): HTMLElement {
  return screen.getByRole('button', { name: /reveal options/i });
}

/** The option radios of the question on screen. */
function options(): HTMLElement[] {
  return within(screen.getByRole('group', { name: /SI unit/ })).queryAllByRole('radio');
}

async function next(user: UserEvent): Promise<void> {
  await user.click(screen.getByRole('button', { name: /next/i }));
}

/**
 * Takes a whole answer-first attempt: a written response and a right answer on
 * the first question, a skipped response and a wrong answer on the second, and
 * the third never revealed.
 */
async function takeAnswerFirstAttempt(user: UserEvent): Promise<void> {
  await startQuiz(user, 'Anna', 'answer-first');
  await writeAndReveal(user, 'My own reasoning here');
  await answerCurrent(user, { [currentQuestion()]: 'right' });
  await next(user);
  await user.click(screen.getByRole('button', { name: /skip/i }));
  await answerCurrent(user, { [currentQuestion()]: 'wrong' }, { [currentQuestion()]: 'guess' });
  await next(user);
  await user.click(screen.getByRole('button', { name: /submit/i }));
  await user.click(await screen.findByRole('button', { name: /submit anyway/i }));
  await screen.findByRole('heading', { name: /review/i });
}

describe('choosing the mode', () => {
  it('offers Standard and Answer first, Standard by default', async () => {
    await loadBankAndOpenStart(userEvent.setup());
    expect(screen.getByRole('radio', { name: /^standard/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^answer first/i })).not.toBeChecked();
  });

  it('remembers the last mode chosen', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna', 'answer-first');
    // Put aside the attempt just begun, so the library offers a fresh start.
    await db.inProgress.clear();
    cleanup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /start SI units/i }));
    expect(await screen.findByRole('radio', { name: /^answer first/i })).toBeChecked();
  });
});

describe('answering first', () => {
  it('shows the prompt and a response field, with the options hidden', async () => {
    await startQuiz(userEvent.setup(), 'Anna', 'answer-first');
    expect(screen.getByRole('group', { name: /SI unit/ })).toBeInTheDocument();
    expect(responseField()).toBeInTheDocument();
    expect(options()).toHaveLength(0);
    expect(screen.queryByRole('group', { name: /how sure/i })).not.toBeInTheDocument();
  });

  it('reveals the options only once the response is at least 10 characters', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna', 'answer-first');
    expect(revealButton()).toBeDisabled();
    await user.type(responseField(), '  Newton  ');
    expect(revealButton()).toBeDisabled();
    await user.type(responseField(), 's, kg m');
    expect(revealButton()).toBeEnabled();

    await user.click(revealButton());
    expect(options()).toHaveLength(3);
    expect(responseField()).toHaveAttribute('readonly');
    expect(responseField()).toHaveValue('  Newton  s, kg m');
    expect(confidenceGroup()).toBeInTheDocument();
  });

  it('skips the response, revealing the options without one', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna', 'answer-first');
    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(options()).toHaveLength(3);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText(/skipped writing/i)).toBeInTheDocument();
  });

  it('previews maths in the response as it is typed', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna', 'answer-first');
    await user.type(responseField(), 'Since $F = ma$');
    const preview = screen.getByRole('group', { name: /preview/i });
    expect(preview.querySelector('.katex')).not.toBeNull();
  });

  it('keeps each question’s own response and reveal when moving back and forth', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna', 'answer-first');
    await writeAndReveal(user, 'First question answer');
    await next(user);
    await user.type(responseField(), 'A draft');
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(responseField()).toHaveValue('First question answer');
    expect(options()).toHaveLength(3);
    await next(user);
    expect(responseField()).toHaveValue('A draft');
    expect(options()).toHaveLength(0);
  });
});

describe('number keys', () => {
  it('select an option in standard mode', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna');
    await user.keyboard('2');
    expect(options()[1]).toBeChecked();
  });

  it('select nothing before the options are revealed, and type into the response instead', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna', 'answer-first');
    await user.keyboard('1');
    await user.type(responseField(), '1 newton is 1 kg m');
    expect(responseField()).toHaveValue('1 newton is 1 kg m');
    await user.click(revealButton());
    expect(options().some((radio) => (radio as HTMLInputElement).checked)).toBe(false);

    await user.keyboard('3');
    expect(options()[2]).toBeChecked();
  });

  it('do not select while the focus is in the read-only response', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna', 'answer-first');
    await writeAndReveal(user, 'My own reasoning');
    await user.click(responseField());
    await user.keyboard('1');
    expect(options().some((radio) => (radio as HTMLInputElement).checked)).toBe(false);
  });
});

describe('storing an answer-first attempt', () => {
  it('records the mode, the responses written and the responses skipped', async () => {
    const user = userEvent.setup();
    await takeAnswerFirstAttempt(user);
    const [attempt] = await listAttempts();
    expect(attempt?.mode).toBe('answer-first');
    expect(
      attempt?.answers.map(({ response, responseSkipped }) => [response, responseSkipped]),
    ).toEqual([
      ['My own reasoning here', undefined],
      [undefined, true],
      [undefined, undefined],
    ]);
  });

  it('resumes with each response, draft or revealed, where it was', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna', 'answer-first');
    await writeAndReveal(user, 'Revealed answer');
    await next(user);
    await user.type(responseField(), 'A draft');

    cleanup();
    render(<App />);
    await user.click(await screen.findByRole('button', { name: /resume/i }));

    expect(await screen.findByText(/question 2 of 3/i)).toBeInTheDocument();
    expect(responseField()).toHaveValue('A draft');
    expect(options()).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /previous/i }));
    expect(responseField()).toHaveValue('Revealed answer');
    expect(responseField()).toHaveAttribute('readonly');
    expect(options()).toHaveLength(3);
  });

  it('leaves standard mode without responses or self-grades', async () => {
    const user = userEvent.setup();
    await startQuiz(user, 'Anna');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(options()).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      await answerCurrent(user, { [currentQuestion()]: 'right' });
      if (i < 2) await next(user);
    }
    await user.click(screen.getByRole('button', { name: /submit/i }));
    await screen.findByRole('heading', { name: /review/i });
    expect(
      screen.queryByRole('group', { name: /did your own answer match/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/self-grade/i)).not.toBeInTheDocument();
    const [attempt] = await listAttempts();
    expect(attempt?.mode).toBe('standard');
  });
});

describe('self-grading in review', () => {
  function selfGradeGroups(): HTMLElement[] {
    return screen.queryAllByRole('group', { name: /did your own answer match/i });
  }

  it('shows the response beside the explanation and asks whether it matched', async () => {
    const user = userEvent.setup();
    await takeAnswerFirstAttempt(user);
    const [first, second] = screen.getAllByRole('article');
    expect(first).toHaveTextContent(/your response.*My own reasoning here/i);
    expect(
      within(first as HTMLElement).getByRole('group', { name: /did your own answer match/i }),
    ).toBeInTheDocument();
    // A skipped response asks for no self-grade.
    expect(second).toHaveTextContent(/skipped writing/i);
    expect(selfGradeGroups()).toHaveLength(1);
  });

  it('stores the self-grade and counts it in the summary', async () => {
    const user = userEvent.setup();
    await takeAnswerFirstAttempt(user);
    const summary = screen.getByText(/self-grade/i);
    expect(summary).toHaveTextContent(/1 to grade/i);

    await user.click(
      within(selfGradeGroups()[0] as HTMLElement).getByRole('radio', { name: 'Partly' }),
    );
    expect(await screen.findByText(/Partly 1/)).toBeInTheDocument();
    expect(screen.getByText(/self-grade/i)).not.toHaveTextContent(/to grade/i);
    const [attempt] = await listAttempts();
    expect(attempt?.answers[0]?.selfGrade).toBe('partly');
  });

  it('can be graded later, from history', async () => {
    const user = userEvent.setup();
    await takeAnswerFirstAttempt(user);
    await user.click(screen.getByRole('button', { name: /back to library/i }));
    await user.click(screen.getByRole('button', { name: 'History' }));
    const table = await screen.findByRole('table', { name: /attempts/i });
    await user.click(within(table).getByRole('button', { name: /review/i }));
    await screen.findByRole('heading', { name: /review/i });

    await user.click(
      within(selfGradeGroups()[0] as HTMLElement).getByRole('radio', { name: 'No' }),
    );
    expect(await screen.findByText(/No 1/)).toBeInTheDocument();
    expect((await listAttempts())[0]?.answers[0]?.selfGrade).toBe('no');
  });

  it('copies the review as Markdown, with the self-grade just given', async () => {
    const user = userEvent.setup();
    await takeAnswerFirstAttempt(user);
    await user.click(
      within(selfGradeGroups()[0] as HTMLElement).getByRole('radio', { name: 'Partly' }),
    );
    await screen.findByText(/Partly 1/);

    await user.click(screen.getByRole('button', { name: /copy as markdown/i }));
    await screen.findByText(/copied the review/i);

    const markdown = await navigator.clipboard.readText();
    expect(markdown).toMatch(/^# Review: /);
    expect(markdown).toContain('- **Participant:** Anna\n');
    expect(markdown).toContain('- **Mode:** Answer first\n');
    expect(markdown).toContain('> My own reasoning here\n\n**Self-grade:** Partly');
    expect(markdown).toContain('**Response:** skipped');
    expect(markdown).toContain('## Question 3: Not answered');
  });

  it('leaves an imported attempt’s self-grades read-only', async () => {
    const user = userEvent.setup();
    await takeAnswerFirstAttempt(user);
    const [taken] = await listAttempts();
    if (!taken) throw new Error('No attempt');
    await db.attempts.clear();
    await addAttempts([
      {
        ...taken,
        origin: 'imported',
        answers: taken.answers.map((answer, index) =>
          index === 0 ? { ...answer, selfGrade: 'yes' } : answer,
        ),
      },
    ]);
    await user.click(screen.getByRole('button', { name: /back to library/i }));
    await user.click(screen.getByRole('button', { name: 'History' }));
    const table = await screen.findByRole('table', { name: /attempts/i });
    await user.click(await within(table).findByRole('button', { name: /review/i }));
    await screen.findByRole('heading', { name: /review/i });

    const group = selfGradeGroups()[0] as HTMLElement;
    expect(group).toBeDisabled();
    expect(within(group).getByRole('radio', { name: 'Yes' })).toBeChecked();
  });
});
