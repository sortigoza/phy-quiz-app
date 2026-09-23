import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Library } from './Library';
import { db } from '../storage/db';

function bankFile(overrides: Record<string, unknown> = {}, filename = 'kinematics.json'): File {
  const bank = {
    formatVersion: 1,
    id: 'kth.kinematics',
    version: '1.0.0',
    title: 'Kinematics in one dimension',
    author: 'A. Teacher',
    questions: [
      {
        id: 'q1',
        prompt: 'A ball falls from rest for one second. What is its speed?',
        options: [
          { id: 'a', text: '4.91 m/s' },
          { id: 'b', text: '9.81 m/s' },
        ],
        answer: 'b',
        explanation: 'From rest, v = gt.',
      },
    ],
    ...overrides,
  };
  return new File([JSON.stringify(bank)], filename, { type: 'application/json' });
}

function rawFile(contents: string, filename = 'broken.json'): File {
  return new File([contents], filename, { type: 'application/json' });
}

async function uploadFile(file: File): Promise<void> {
  const user = userEvent.setup();
  await user.upload(screen.getByLabelText(/bank file/i), file);
}

/** The list of banks, as distinct from the list of validation problems. */
function bankList(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: /question banks/i });
}

/** Bank cards only, ignoring the list items used to report validation problems. */
function bankCards(): HTMLElement[] {
  return screen
    .queryAllByRole('listitem')
    .filter((element) => element.closest('[aria-label="Question banks"]') !== null);
}

beforeEach(async () => {
  await db.banks.clear();
});

describe('Library', () => {
  it('says the library is empty before anything is loaded', async () => {
    render(<Library />);
    expect(await screen.findByText(/no question banks yet/i)).toBeInTheDocument();
  });

  it('shows an uploaded bank, with what a teacher needs to recognise it', async () => {
    render(<Library />);
    await uploadFile(bankFile());

    const item = within(await bankList()).getByRole('listitem');
    expect(within(item).getByText(/kinematics in one dimension/i)).toBeInTheDocument();
    expect(within(item).getByText(/A\. Teacher/)).toBeInTheDocument();
    expect(within(item).getByText(/1 question/i)).toBeInTheDocument();
    expect(within(item).getByText(/1\.0\.0/)).toBeInTheDocument();
  });

  it('shows banks already held when it opens, so they survive a reload', async () => {
    const { unmount } = render(<Library />);
    await uploadFile(bankFile());
    await bankList();
    unmount();

    render(<Library />);
    expect(await screen.findByText(/kinematics in one dimension/i)).toBeInTheDocument();
  });

  it('lists the reasons a bank was rejected, and adds nothing', async () => {
    render(<Library />);
    await uploadFile(bankFile({ questions: [] }, 'empty.json'));

    const problems = await screen.findByRole('alert');
    expect(problems).toHaveTextContent(/empty\.json/);
    expect(problems).toHaveTextContent(/questions/);
    expect(bankCards()).toHaveLength(0);
    expect(await screen.findByText(/no question banks yet/i)).toBeInTheDocument();
  });

  it('explains a file that is not JSON at all', async () => {
    render(<Library />);
    await uploadFile(rawFile('{ not json'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not valid json/i);
  });

  it('clears an earlier rejection once a good bank loads', async () => {
    render(<Library />);
    await uploadFile(rawFile('{ not json'));
    await screen.findByRole('alert');

    await uploadFile(bankFile());
    await bankList();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the same bank is loaded twice', async () => {
    render(<Library />);
    await uploadFile(bankFile());
    await bankList();

    await uploadFile(bankFile());
    expect(await screen.findByRole('status')).toHaveTextContent(/already in your library/i);
    expect(bankCards()).toHaveLength(1);
  });

  it('removes a bank on request', async () => {
    const user = userEvent.setup();
    render(<Library />);
    await uploadFile(bankFile());
    await bankList();

    await user.click(screen.getByRole('button', { name: /remove kinematics in one dimension/i }));

    await waitFor(() => expect(bankCards()).toHaveLength(0));
    expect(await screen.findByText(/no question banks yet/i)).toBeInTheDocument();
  });
});
