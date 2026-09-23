import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import { encodeBankKey, encryptBank, generateBankKey } from '../domain/private-bank';
import { db, listAttempts } from '../storage/db';

/**
 * A private bank end to end: opened from a bank link, taken like any other,
 * leaving an attempt that says nothing of the key it was opened with.
 */

const bankText = JSON.stringify({
  formatVersion: 1,
  id: 'test.private',
  version: '1.0.0',
  title: 'A private bank',
  questions: [
    {
      id: 'q1',
      prompt: 'What is the SI unit of force?',
      options: [
        { id: 'a', text: 'Newton' },
        { id: 'b', text: 'Pascal' },
      ],
      answer: 'a',
      explanation: 'Force is measured in newtons.',
    },
  ],
});

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('taking a private bank', () => {
  it('leaves an attempt that carries no bank key', async () => {
    const key = generateBankKey();
    const jwe = await encryptBank(bankText, key);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(jwe))),
    );
    const user = userEvent.setup();
    render(<App bankLink={{ kind: 'bank-link', url: 'https://example.org/p.json', key }} />);

    await user.click(await screen.findByRole('button', { name: /start a private bank/i }));
    await user.type(screen.getByLabelText(/your name/i), 'Anna');
    await user.click(screen.getByRole('button', { name: /begin/i }));
    await user.click(await screen.findByRole('radio', { name: /newton/i }));
    await user.click(screen.getByRole('button', { name: /submit/i }));
    await screen.findByText(/force is measured in newtons/i);

    const [attempt] = await listAttempts();
    expect(attempt).toMatchObject({ bankId: 'test.private', correctCount: 1 });
    const recorded = JSON.stringify(attempt);
    expect(recorded).not.toContain(encodeBankKey(key));
    expect(recorded).not.toContain('kid');
  });
});
