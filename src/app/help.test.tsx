import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import { parseBank } from '../domain/bank';
import { fieldReference } from '../docs/bank-reference';
import { db } from '../storage/db';

async function openHelp(user: UserEvent): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: /^help$/i }));
  return screen.findByRole('region', { name: /help/i });
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('Help', () => {
  it('is reachable from the library with nothing loaded, and leads back', async () => {
    const user = userEvent.setup();
    render(<App />);
    const help = await openHelp(user);

    expect(within(help).getByRole('heading', { name: /take a quiz/i })).toBeInTheDocument();
    expect(
      within(help).getByRole('heading', { name: /write a question bank/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close help/i }));
    expect(
      await screen.findByRole('heading', { name: /your question banks/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ['bank', fieldReference.bank],
    ['question', fieldReference.question],
    ['option', fieldReference.option],
  ] as const)('documents every %s field', async (_, fields) => {
    render(<App />);
    const help = await openHelp(userEvent.setup());
    for (const field of fields) {
      expect(within(help).getAllByText(field.name, { selector: 'code' }).length).toBeGreaterThan(0);
    }
  });

  it('shows only example banks that the app would accept', async () => {
    render(<App />);
    const help = await openHelp(userEvent.setup());
    const examples = help.querySelectorAll('pre[data-example]');

    expect(examples.length).toBeGreaterThan(0);
    for (const example of examples) {
      expect(parseBank(example.textContent ?? '')).toMatchObject({ ok: true });
    }
  });

  it('explains the backslash trap and admits maths is not rendered yet', async () => {
    render(<App />);
    const help = await openHelp(userEvent.setup());
    expect(help).toHaveTextContent(/double every backslash/i);
    expect(help).toHaveTextContent(/raw text/i);
  });

  it('offers the example bank as a download, and points agents at llms.txt', async () => {
    render(<App />);
    const help = await openHelp(userEvent.setup());

    const download = within(help).getByRole('link', { name: /download the example bank/i });
    expect(download).toHaveAttribute('href', 'examples/kinematics.json');
    expect(download).toHaveAttribute('download');
    expect(within(help).getByRole('link', { name: /llms\.txt/i })).toHaveAttribute(
      'href',
      'llms.txt',
    );
  });

  it('can be opened mid-attempt without losing the attempt', async () => {
    const user = userEvent.setup();
    render(<App />);

    const bank = {
      formatVersion: 1,
      id: 'test.help',
      version: '1.0.0',
      title: 'Help test',
      questions: ['one', 'two'].map((id) => ({
        id,
        prompt: `Question ${id}`,
        options: [
          { id: 'a', text: `Right for ${id}` },
          { id: 'b', text: `Wrong for ${id}` },
        ],
        answer: 'a',
        explanation: 'Because.',
      })),
    };
    await user.upload(
      screen.getByLabelText(/bank file/i),
      new File([JSON.stringify(bank)], 'help.json', { type: 'application/json' }),
    );
    await user.click(await screen.findByRole('button', { name: /start help test/i }));
    await user.type(screen.getByLabelText(/your name/i), 'Anna');
    await user.click(screen.getByRole('button', { name: /begin/i }));
    await user.click(screen.getByRole('button', { name: /next/i }));
    await user.click(screen.getByRole('radio', { name: /wrong for/i }));

    await openHelp(user);
    await user.click(screen.getByRole('button', { name: /close help/i }));

    expect(await screen.findByText(/question 2 of 2/i)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /wrong for/i })).toBeChecked();
  });
});
