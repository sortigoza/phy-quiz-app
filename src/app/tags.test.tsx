import { beforeEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { db, listAttempts } from '../storage/db';
import {
  answerCurrent,
  bankFile,
  currentQuestion,
  loadBankAndOpenStart,
  prompts,
} from '../test/quiz';

/**
 * The tag filter on the start screen, driven through the whole app: aiming a
 * quiz at what the participant wants to practise.
 */

const tagged = () => bankFile({}, { q1: ['mechanics'], q2: ['energy', 'mechanics'] });

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

function tagGroup(): HTMLElement {
  return screen.getByRole('group', { name: /tags/i });
}

describe('the tag filter', () => {
  it("offers the bank's tags with their question counts, and the untagged, none chosen", async () => {
    await loadBankAndOpenStart(userEvent.setup(), tagged());
    const boxes = within(tagGroup()).getAllByRole('checkbox');
    expect(boxes.map((box) => box.closest('label')?.textContent)).toEqual([
      'energy (1)',
      'mechanics (2)',
      'untagged (1)',
    ]);
    for (const box of boxes) expect(box).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'All (3)' })).toBeInTheDocument();
  });

  it('is not offered for a bank without tags', async () => {
    await loadBankAndOpenStart(userEvent.setup());
    expect(screen.queryByRole('group', { name: /tags/i })).not.toBeInTheDocument();
  });

  it('clamps the count to the questions carrying any chosen tag, and says so', async () => {
    const user = userEvent.setup();
    await loadBankAndOpenStart(user, tagged());
    await user.click(within(tagGroup()).getByRole('checkbox', { name: /energy/ }));
    await user.click(within(tagGroup()).getByRole('checkbox', { name: /untagged/ }));

    expect(screen.getByRole('radio', { name: 'All (2)' })).toBeChecked();
    expect(
      screen.getByText('2 questions carry the chosen tags, so the quiz asks all 2.'),
    ).toBeInTheDocument();
  });

  it('draws only qualifying questions, and records the filter on the attempt', async () => {
    const user = userEvent.setup();
    await loadBankAndOpenStart(user, tagged());
    await user.type(screen.getByLabelText(/your name/i), 'Anna');
    await user.click(within(tagGroup()).getByRole('checkbox', { name: /mechanics/ }));
    await user.click(screen.getByRole('button', { name: /begin/i }));

    expect(await screen.findByText(/question 1 of 2/i)).toBeInTheDocument();
    const seen = [currentQuestion()];
    await answerCurrent(user, { q1: 'right', q2: 'right' });
    await user.click(screen.getByRole('button', { name: /next/i }));
    seen.push(currentQuestion());
    await answerCurrent(user, { q1: 'right', q2: 'right' });
    expect(seen.sort()).toEqual(['q1', 'q2']);

    await user.click(screen.getByRole('button', { name: /submit/i }));
    await screen.findByRole('heading', { name: /review/i });
    const [attempt] = await listAttempts();
    expect(attempt?.tagFilter).toEqual({ tags: ['mechanics'], untagged: false });
    expect(attempt?.answers.map((answer) => answer.questionId).sort()).toEqual(['q1', 'q2']);
    expect(screen.queryByText(prompts.q3)).not.toBeInTheDocument();
  });

  it('is not remembered for the next attempt', async () => {
    const user = userEvent.setup();
    await loadBankAndOpenStart(user, tagged());
    await user.type(screen.getByLabelText(/your name/i), 'Anna');
    await user.click(within(tagGroup()).getByRole('checkbox', { name: /energy/ }));
    await user.click(screen.getByRole('button', { name: /begin/i }));
    await screen.findByRole('group', { name: /SI unit/ });
    await answerCurrent(user, { q2: 'right' });
    await user.click(await screen.findByRole('button', { name: /submit/i }));
    await user.click(await screen.findByRole('button', { name: /back to library/i }));

    await user.click(await screen.findByRole('button', { name: /start SI units/i }));
    await screen.findByRole('heading', { name: /SI units/ });
    for (const box of within(tagGroup()).getAllByRole('checkbox')) expect(box).not.toBeChecked();
  });
});
