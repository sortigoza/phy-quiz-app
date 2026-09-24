import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../App';
import type { Music } from '../music/player';
import { db, getMusicOn, setMusicOn } from '../storage/db';
import { bankFile } from '../test/quiz';

/**
 * The library's background music, driven through the whole app: it plays on
 * the home screen and nowhere else, and it can be turned off for good.
 */

function fakeMusic() {
  let playing = false;
  const music = {
    play: vi.fn(() => (playing = true)),
    stop: vi.fn(() => (playing = false)),
    unlock: vi.fn(),
  } satisfies Music;
  return { music, isPlaying: () => playing };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('background music', () => {
  it('plays on the library once the setting is read', async () => {
    const { music, isPlaying } = fakeMusic();
    render(<App music={music} />);
    await waitFor(() => expect(isPlaying()).toBe(true));
    expect(await screen.findByRole('button', { name: 'Music' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('stops when a quiz is opened, and starts again back on the library', async () => {
    const user = userEvent.setup();
    const { music, isPlaying } = fakeMusic();
    render(<App music={music} />);
    await waitFor(() => expect(isPlaying()).toBe(true));

    await user.upload(screen.getByLabelText(/bank file/i), bankFile());
    await user.click(await screen.findByRole('button', { name: /start SI units/i }));
    await screen.findByRole('heading', { name: /SI units/ });

    expect(isPlaying()).toBe(false);
    expect(screen.queryByRole('button', { name: 'Music' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(isPlaying()).toBe(true));
  });

  it('stops on every other screen: history and help', async () => {
    const user = userEvent.setup();
    const { music, isPlaying } = fakeMusic();
    render(<App music={music} />);
    await waitFor(() => expect(isPlaying()).toBe(true));

    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(isPlaying()).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(isPlaying()).toBe(false);
  });

  it('passes the first click on to the player, so the browser lets it sound', async () => {
    const user = userEvent.setup();
    const { music } = fakeMusic();
    render(<App music={music} />);
    await screen.findByRole('button', { name: 'Music' });

    await user.click(screen.getByRole('heading', { name: 'Physics Quiz' }));

    expect(music.unlock).toHaveBeenCalled();
  });

  it('turns off, and stays off after a reload', async () => {
    const user = userEvent.setup();
    const { music, isPlaying } = fakeMusic();
    const { unmount } = render(<App music={music} />);
    const toggle = await screen.findByRole('button', { name: 'Music' });

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(isPlaying()).toBe(false);
    await waitFor(async () => expect(await getMusicOn()).toBe(false));

    unmount();
    const reloaded = fakeMusic();
    render(<App music={reloaded.music} />);
    expect(await screen.findByRole('button', { name: 'Music' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(reloaded.music.play).not.toHaveBeenCalled();
  });

  it('never starts, not even briefly, when it was turned off before', async () => {
    await setMusicOn(false);
    const { music } = fakeMusic();
    render(<App music={music} />);
    await screen.findByRole('button', { name: 'Music' });
    expect(music.play).not.toHaveBeenCalled();
  });

  it('passes the click that turns music back on to the player', async () => {
    await setMusicOn(false);
    const user = userEvent.setup();
    const { music, isPlaying } = fakeMusic();
    render(<App music={music} />);

    await user.click(await screen.findByRole('button', { name: 'Music' }));

    expect(music.unlock).toHaveBeenCalled();
    expect(isPlaying()).toBe(true);
  });
});
