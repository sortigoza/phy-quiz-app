import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backwards, crabCanonMidi, forwards, LINE, midiPitch, OUTPUT } from './crab-canon';

describe('crab-canon', () => {
  it('names pitches the MIDI way, middle C being 60', () => {
    expect(midiPitch('C4')).toBe(60);
    expect(midiPitch('Db5')).toBe(73);
    expect(midiPitch('B3')).toBe(59);
  });

  it('transcribes 18 bars of 4/4', () => {
    expect(LINE.reduce((eighths, [, length]) => eighths + length, 0)).toBe(18 * 8);
  });

  it('reverses a line in time as well as in pitch', () => {
    const line = forwards([
      ['C4', 2],
      ['r', 1],
      ['G4', 1],
    ]);
    expect(backwards(line)).toEqual([
      { pitch: 67, on: 0, off: 240 },
      { pitch: 60, on: 480, off: 960 },
    ]);
  });

  it('matches the committed file, so the two cannot drift apart', () => {
    expect(new Uint8Array(readFileSync(OUTPUT))).toEqual(crabCanonMidi());
  });
});
