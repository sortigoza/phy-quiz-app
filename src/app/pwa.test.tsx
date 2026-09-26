import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import type { Pwa, PwaState } from '../pwa';
import { db } from '../storage/db';
import { answerAllAndSubmit, startQuiz } from '../test/quiz';

/**
 * The installed app, driven through the whole app: a waiting update is
 * offered rather than applied, never during an attempt, and the browser's
 * install offer becomes a button on the library.
 */

/** A service worker and browser whose state the test sets. */
function fakePwa(initial: Partial<PwaState> = {}) {
  let state: PwaState = { updateWaiting: false, installable: false, ...initial };
  const listeners = new Set<() => void>();
  const pwa = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot: () => state,
    applyUpdate: vi.fn(),
    install: vi.fn(() => Promise.resolve(set({ installable: false }))),
  } satisfies Pwa;
  function set(next: Partial<PwaState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }
  return { pwa, set: (next: Partial<PwaState>) => act(() => set(next)) };
}

const updateOffer = () => screen.queryByRole('status', { name: /new version/i });

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('a waiting update', () => {
  it('is offered on the library, and reloading applies it', async () => {
    const user = userEvent.setup();
    const { pwa, set } = fakePwa();
    render(<App pwa={pwa} />);
    expect(updateOffer()).not.toBeInTheDocument();

    set({ updateWaiting: true });
    expect(updateOffer()).toBeInTheDocument();
    expect(pwa.applyUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /reload/i }));
    expect(pwa.applyUpdate).toHaveBeenCalledOnce();
  });

  it('can be put off for now', async () => {
    const user = userEvent.setup();
    const { pwa } = fakePwa({ updateWaiting: true });
    render(<App pwa={pwa} />);

    await user.click(screen.getByRole('button', { name: /not now/i }));
    expect(updateOffer()).not.toBeInTheDocument();
    expect(pwa.applyUpdate).not.toHaveBeenCalled();
  });

  it('is never offered during an attempt, even with help open, and is offered after submit', async () => {
    const user = userEvent.setup();
    const { pwa, set } = fakePwa();
    await startQuiz(user, 'Anna', 'standard', <App pwa={pwa} />);

    set({ updateWaiting: true });
    expect(updateOffer()).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(updateOffer()).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /close help/i }));

    await answerAllAndSubmit(user, { q1: 'right', q2: 'right', q3: 'right' });
    await screen.findByRole('heading', { name: /review/i });
    expect(updateOffer()).toBeInTheDocument();
  });

  it('that arrived before the attempt is hidden while it runs', async () => {
    const user = userEvent.setup();
    const { pwa } = fakePwa({ updateWaiting: true });
    await startQuiz(user, 'Anna', 'standard', <App pwa={pwa} />);
    expect(updateOffer()).not.toBeInTheDocument();
  });
});

describe('the install button', () => {
  it('appears on the library when the browser offers installation, and installs', async () => {
    const user = userEvent.setup();
    const { pwa, set } = fakePwa();
    render(<App pwa={pwa} />);
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();

    set({ installable: true });
    await user.click(screen.getByRole('button', { name: /install/i }));
    expect(pwa.install).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
  });

  it('is only on the library', async () => {
    const user = userEvent.setup();
    const { pwa } = fakePwa({ installable: true });
    render(<App pwa={pwa} />);
    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(screen.queryByRole('button', { name: /install/i })).not.toBeInTheDocument();
  });
});
