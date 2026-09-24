import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isCrabCanon } from './crab';
import { parseMidi, type Note, type Score } from './midi';

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

  it('refuses the right pitches reversed in the wrong rhythm', () => {
    const canon = score([theme, reversed]);
    const [first, ...rest] = canon.notes.filter((note) => note.voice === 1);
    const stretched = { ...first!, duration: 2 };
    const notes = [...canon.notes.filter((note) => note.voice === 0), stretched, ...rest];
    expect(isCrabCanon({ ...canon, notes })).toBe(false);
  });

  it('refuses one voice, three voices, and no notes at all', () => {
    expect(isCrabCanon(score([theme]))).toBe(false);
    expect(isCrabCanon(score([theme, reversed, theme]))).toBe(false);
    expect(isCrabCanon(score([]))).toBe(false);
  });
});

describe('the shipped file', () => {
  it('is a crab canon: two voices, the second the first reversed', () => {
    const bytes = readFileSync(
      join(import.meta.dirname, '..', '..', 'public', 'music', 'crab-canon.mid'),
    );
    const canon = parseMidi(new Uint8Array(bytes));
    // Canon 1 a 2 is 18 bars of one line, 89 notes, heard at once forwards and backwards.
    expect(canon.notes.filter((note) => note.voice === 0)).toHaveLength(89);
    expect(isCrabCanon(canon)).toBe(true);
  });
});
