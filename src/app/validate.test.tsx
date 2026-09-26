import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { App } from '../App';
import { db } from '../storage/db';

const question = (id: string) => ({
  id,
  prompt: `Question ${id}: what is $5 \\times 3$?`,
  options: [
    { id: 'a', text: '15' },
    { id: 'b', text: '8' },
  ],
  answer: 'a',
  explanation: 'Multiply.',
});

const bank = {
  formatVersion: 1,
  id: 'test.arithmetic',
  version: '1.0.0',
  title: 'Arithmetic',
  questions: [question('q1'), question('q2')],
};

function file(text: string, name = 'arithmetic.json'): File {
  return new File([text], name);
}

async function openValidate(user: UserEvent): Promise<HTMLElement> {
  await user.click(await screen.findByRole('button', { name: /validate a bank/i }));
  return screen.findByRole('region', { name: /validate a bank/i });
}

async function check(user: UserEvent, chosen: File): Promise<HTMLElement> {
  const region = await openValidate(user);
  await user.upload(within(region).getByLabelText(/choose a file/i), chosen);
  return region;
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('the validate screen', () => {
  it('says a valid bank is valid, and never adds it to the library', async () => {
    const user = userEvent.setup();
    render(<App />);
    const region = await check(user, file(JSON.stringify(bank)));

    expect(await within(region).findByRole('status')).toHaveTextContent(
      /arithmetic\.json is a valid bank.*Arithmetic.*2 questions/i,
    );
    expect(await db.banks.count()).toBe(0);

    await user.click(within(region).getByRole('button', { name: /back to library/i }));
    expect(await screen.findByText(/no question banks yet/i)).toBeInTheDocument();
  });

  it('accepts a YAML bank', async () => {
    const yaml = [
      'formatVersion: 1',
      'id: test.arithmetic',
      'version: 1.0.0',
      'title: Arithmetic',
      'questions:',
      '  - id: q1',
      "    prompt: 'What is $5 \\times 3$?'",
      '    options: [{ id: a, text: "15" }, { id: b, text: "8" }]',
      '    answer: a',
      '    explanation: Multiply.',
    ].join('\n');
    const user = userEvent.setup();
    render(<App />);
    const region = await check(user, file(yaml, 'arithmetic.yaml'));
    expect(await within(region).findByRole('status')).toHaveTextContent(/is a valid bank/i);
  });

  it('names the field holding an unescaped LaTeX command', async () => {
    const broken = JSON.stringify(bank).replace('\\\\times', '\\times');
    const user = userEvent.setup();
    render(<App />);
    const region = await check(user, file(broken));

    const alert = await within(region).findByRole('alert');
    expect(alert).toHaveTextContent(/questions\[0\]\.prompt/);
    expect(alert).toHaveTextContent(/unescaped LaTeX command/);
    expect(await db.banks.count()).toBe(0);
  });

  it('lists at most 20 problems, and says how many more there are', async () => {
    const questions = Array.from({ length: 30 }, (_, index) => ({
      ...question(`q${index}`),
      answer: 'z',
    }));
    const user = userEvent.setup();
    render(<App />);
    const region = await check(user, file(JSON.stringify({ ...bank, questions })));

    const alert = await within(region).findByRole('alert');
    expect(within(alert).getAllByRole('listitem')).toHaveLength(20);
    expect(alert).toHaveTextContent(/and 10 more/i);
  });

  it('checks a file dropped onto it', async () => {
    const user = userEvent.setup();
    render(<App />);
    const region = await openValidate(user);

    fireEvent.drop(within(region).getByText(/drop a bank file here/i), {
      dataTransfer: { files: [file(JSON.stringify(bank))] },
    });
    expect(await within(region).findByRole('status')).toHaveTextContent(/is a valid bank/i);
  });

  it('is where Help returns to when opened from it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openValidate(user);
    await user.click(screen.getByRole('button', { name: /^help$/i }));
    await user.click(screen.getByRole('button', { name: /close help/i }));
    expect(await screen.findByRole('region', { name: /validate a bank/i })).toBeInTheDocument();
  });
});
