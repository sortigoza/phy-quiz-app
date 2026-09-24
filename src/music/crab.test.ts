import { describe, expect, it } from 'vitest';
import { isCrabCanon } from './crab';
import type { Note, Score } from './midi';

function score(voices: number[][]): Score {
  const notes: Note[] = voices.flatMap((pitches, voice) =>
    pitches.map((pitch, i) => ({ pitch, velocity: 1, start: i, duration: 1, voice })),
  );
  return { notes, duration: Math.max(...voices.map((pitches) => pitches.length)) };
}

// The opening of the royal theme, and the same notes reversed.
const theme = [60, 63, 67, 68, 59];
const reversed = [...theme].reverse();

describe('isCrabCanon', () => {
  it('accepts two voices where the second is the first reversed', () => {
    expect(isCrabCanon(score([theme, reversed]))).toBe(true);
  });

  it('refuses two voices that are the same line forwards', () => {
    expect(isCrabCanon(score([theme, theme]))).toBe(false);
  });

  it('refuses a reversal with one note changed', () => {
    expect(isCrabCanon(score([theme, [59, 68, 67, 63, 61]]))).toBe(false);
  });

  it('refuses one voice, three voices, and no notes at all', () => {
    expect(isCrabCanon(score([theme]))).toBe(false);
    expect(isCrabCanon(score([theme, reversed, theme]))).toBe(false);
    expect(isCrabCanon(score([]))).toBe(false);
  });
});
