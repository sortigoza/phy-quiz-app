import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import { attemptCode, type Attempt, type AttemptAnswer } from '../domain/attempt';
import { correctCount } from '../domain/scoring';
import { db, setLastParticipantName } from '../storage/db';
import { attemptRecord } from '../test/attempts';
import { bankFile } from '../test/quiz';

/**
 * The tag breakdown in history, and the counted-attempt rule that feeds it,
 * driven through the whole app: a participant finding their weak tag and
 * aiming the next quiz at it.
 *
 * The bank tags q1 "mechanics", q2 "energy" and "mechanics", and leaves q3 untagged.
 */

const tagged = () => bankFile({}, { q1: ['mechanics'], q2: ['energy', 'mechanics'] });

const right = (questionId: string): AttemptAnswer => ({
  questionId,
  chosenOptionId: 'a',
  correctOptionId: 'a',
});
const wrong = (questionId: string, sure = false): AttemptAnswer => ({
  questionId,
  chosenOptionId: 'b',
  correctOptionId: 'a',
  ...(sure && { confidence: 'sure' as const }),
});
const blank = (questionId: string): AttemptAnswer => ({
  questionId,
  chosenOptionId: null,
  correctOptionId: 'a',
});

let serial = 0;
function attemptOf(answers: AttemptAnswer[], overrides: Partial<Attempt> = {}): Attempt {
  serial += 1;
  const id = `01890a5d-ac96-774b-bcce-b30209${String(serial).padStart(6, '0')}`;
  return attemptRecord({
    id,
    code: attemptCode(id),
    submittedAt: `2026-09-2${serial % 10}T10:00:00.000Z`,
    answers,
    questionCount: answers.length,
    correctCount: correctCount(answers),
    durationMs: answers.length * 60_000,
    ...overrides,
  });
}

beforeEach(async () => {
  serial = 0;
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function loadBank(user: UserEvent): Promise<void> {
  render(<App />);
  await user.upload(screen.getByLabelText(/bank file/i), tagged());
  await screen.findByRole('button', { name: /start SI units/i });
}

async function openHistory(user: UserEvent, filters: { name?: string; bank?: string } = {}) {
  await user.click(screen.getByRole('button', { name: 'History' }));
  await screen.findByRole('table', { name: /attempts/i });
  if (filters.name) {
    await user.selectOptions(screen.getByLabelText('Participant'), filters.name);
  }
  if (filters.bank) await user.selectOptions(screen.getByLabelText('Bank'), filters.bank);
}

/** The breakdown's rows as `label correct/total (pct%) [low data] [n confident errors]`. */
async function breakdownRows(): Promise<string[]> {
  const table = await screen.findByRole('table', { name: /tag breakdown/i });
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
        .join(' | '),
    );
}

describe('the tag breakdown', () => {
  it('is shown only when history is narrowed to one bank', async () => {
    const user = userEvent.setup();
    await db.attempts.add(attemptOf([right('q1')]));
    await loadBank(user);
    await openHistory(user);
    expect(screen.queryByRole('heading', { name: /tag breakdown/i })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Bank'), 'SI units');
    expect(await screen.findByRole('heading', { name: /tag breakdown/i })).toBeInTheDocument();
  });

  it('shows correct out of total per tag for the chosen participant, weakest first, with low data and confident errors', async () => {
    const user = userEvent.setup();
    await db.attempts.bulkAdd([
      attemptOf([right('q1'), wrong('q2', true), right('q3')]),
      attemptOf([wrong('q1'), blank('q2'), right('q3')]),
      attemptOf([right('q1'), right('q2'), right('q3')], { name: 'Ben' }),
    ]);
    await loadBank(user);
    await openHistory(user, { name: 'Anna', bank: 'SI units' });

    expect(await breakdownRows()).toEqual([
      'energy | 0/2 (0%) Low data | 1',
      'mechanics | 1/4 (25%) Low data | 1',
      'untagged | 2/2 (100%) Low data | 0',
    ]);

    await user.selectOptions(screen.getByLabelText('Participant'), 'Everyone');
    expect(await breakdownRows()).toEqual([
      'energy | 1/3 (33%) Low data | 1',
      'mechanics | 3/6 (50%) | 1',
      'untagged | 3/3 (100%) Low data | 0',
    ]);
  });

  it('puts answers to questions the bank no longer has under archived question', async () => {
    const user = userEvent.setup();
    await db.attempts.add(attemptOf([right('q1'), wrong('retired')]));
    await loadBank(user);
    await openHistory(user, { bank: 'SI units' });

    expect(await breakdownRows()).toEqual([
      'mechanics | 1/1 (100%) Low data | 0',
      'Archived question | 0/1 (0%) Low data | 0',
    ]);
  });

  it('asks for the bank when no edition of it is held', async () => {
    const user = userEvent.setup();
    await db.attempts.add(attemptOf([right('q1')], { bankId: 'test.optics', bankTitle: 'Optics' }));
    await loadBank(user);
    await openHistory(user, { bank: 'Optics' });

    expect(await screen.findByText(/load the bank to see the tag breakdown/i)).toBeInTheDocument();
  });

  it('opens the start screen aimed at a tag, with the name offered, without beginning', async () => {
    const user = userEvent.setup();
    await setLastParticipantName('Anna');
    await db.attempts.add(attemptOf([right('q1'), wrong('q2')]));
    await loadBank(user);
    await openHistory(user, { bank: 'SI units' });

    await user.click(await screen.findByRole('button', { name: /practise energy/i }));

    await screen.findByRole('heading', { name: 'SI units' });
    const tags = screen.getByRole('group', { name: /tags/i });
    expect(within(tags).getByRole('checkbox', { name: /energy/ })).toBeChecked();
    expect(within(tags).getByRole('checkbox', { name: /mechanics/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'All (1)' })).toBeChecked();
    expect(await screen.findByDisplayValue('Anna')).toBeInTheDocument();
    expect(await db.inProgress.count()).toBe(0);
  });
});

describe('counted attempts', () => {
  it('marks an attempt answered too fast as not counted, and leaves it out of the breakdown', async () => {
    const user = userEvent.setup();
    const hasty = attemptOf([wrong('q1'), wrong('q2'), wrong('q3')], { durationMs: 6_000 });
    await db.attempts.bulkAdd([attemptOf([right('q1')]), hasty]);
    await loadBank(user);
    await openHistory(user, { bank: 'SI units' });

    const rows = within(screen.getByRole('table', { name: /attempts/i }))
      .getAllByRole('row')
      .slice(1);
    const hastyRow = rows.find((row) => row.textContent?.includes(hasty.code));
    const steadyRow = rows.find((row) => row !== hastyRow);
    expect(hastyRow).toHaveTextContent(/not counted/i);
    expect(steadyRow).not.toHaveTextContent(/not counted/i);
    expect(await breakdownRows()).toEqual(['mechanics | 1/1 (100%) Low data | 0']);
  });

  it('lets the participant overrule the marker on their own attempt, and remembers it', async () => {
    const user = userEvent.setup();
    const hasty = attemptOf([wrong('q1')], { durationMs: 1_000 });
    await db.attempts.add(hasty);
    await loadBank(user);
    await openHistory(user, { bank: 'SI units' });
    expect(await screen.findByText(/no counted attempts/i)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: `Count attempt ${hasty.code}` }));

    await waitFor(async () =>
      expect(await breakdownRows()).toEqual(['mechanics | 0/1 (0%) Low data | 0']),
    );
    expect(screen.getByRole('table', { name: /attempts/i })).not.toHaveTextContent(/not counted/i);
    expect((await db.attempts.get(hasty.id))?.countedOverride).toBe(true);
  });

  it('offers no way to overrule the marker on an imported attempt', async () => {
    const user = userEvent.setup();
    await db.attempts.add(attemptOf([wrong('q1')], { durationMs: 1_000, origin: 'imported' }));
    await loadBank(user);
    await openHistory(user);

    expect(screen.getByRole('table', { name: /attempts/i })).toHaveTextContent(/not counted/i);
    expect(screen.queryByRole('checkbox', { name: /count attempt/i })).not.toBeInTheDocument();
  });
});
