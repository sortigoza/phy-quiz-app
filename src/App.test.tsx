import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import pkg from '../package.json' with { type: 'json' };
import { App } from './App';
import { encryptBank, generateBankKey } from './domain/private-bank';
import { db } from './storage/db';

const bankText = JSON.stringify({
  formatVersion: 1,
  id: 'kth.kinematics',
  version: '1.0.0',
  title: 'Kinematics in one dimension',
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
});

describe('App', () => {
  it('names the app', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Physics Quiz');
  });

  it('shows the version from the package manifest in the footer', () => {
    render(<App />);
    expect(screen.getByRole('contentinfo')).toHaveTextContent(`v${pkg.version}`);
  });

  describe('opened with a bank link', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('opens the private bank once, and not again on returning to the library', async () => {
      await Promise.all(db.tables.map((table) => table.clear()));
      const key = generateBankKey();
      const fetchMock = vi.fn(async () => new Response(await encryptBank(bankText, key)));
      vi.stubGlobal('fetch', fetchMock);
      const user = userEvent.setup();

      render(
        <StrictMode>
          <App bankLink={{ kind: 'bank-link', url: 'https://example.org/b.json', key }} />
        </StrictMode>,
      );
      expect(await screen.findByText(/added kinematics/i)).toBeInTheDocument();

      // The list refreshes after the notice, and on a slow machine noticeably so.
      await user.click(await screen.findByRole('button', { name: /start kinematics/i }));
      await user.click(await screen.findByRole('button', { name: /^back$/i }));
      await screen.findByRole('heading', { name: /your question banks/i });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(/opening the bank/i)).not.toBeInTheDocument();
    });
  });
});
