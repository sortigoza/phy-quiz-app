import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

function Explodes(): never {
  throw new Error('Something deep went wrong');
}

/** A screen that fails until the participant is taken back to the library. */
function Harness() {
  const [screenName, setScreenName] = useState<'broken' | 'library' | 'help'>('broken');
  return (
    <>
      <button type="button" onClick={() => setScreenName('help')}>
        Help
      </button>
      <ErrorBoundary screen={screenName} onBackToLibrary={() => setScreenName('library')}>
        {screenName === 'broken' ? <Explodes /> : <p>The {screenName}</p>}
      </ErrorBoundary>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('an unexpected failure on a screen', () => {
  it('shows a short message and a way back to the library instead of a blank page', async () => {
    // React reports the caught error to the console; that is expected here.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/something went wrong/i);
    expect(alert).toHaveTextContent('Something deep went wrong');

    await userEvent.setup().click(screen.getByRole('button', { name: /back to library/i }));
    expect(screen.getByText('The library')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('gets out of the way when the app moves to another screen by other means', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<Harness />);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByText('The help')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
