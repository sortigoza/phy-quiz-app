import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Writes `public/music/crab-canon.mid`, the library's background music:
 * J. S. Bach, The Musical Offering (BWV 1079), Canon 1 a 2, the Crab Canon.
 *
 *   pnpm crab-canon
 *
 * Bach wrote the canon as a single line of 18 bars, to be played forwards by
 * one player and backwards by the other at the same time. So only that line
 * is transcribed here, and the second voice is computed as its exact
 * retrograde, in pitch and in time. The work is in the public domain (1747),
 * and this sequencing of it is dedicated to the public domain under CC0 1.0.
 * See ticket 15 for how the notes were checked.
 */

/** Every duration below is counted in eighth notes. */
const EIGHTHS_PER_QUARTER = 2;
/** Ticks per quarter note in the file. */
const DIVISION = 480;
/** A calm reading tempo: 72 quarter notes a minute, so one pass lasts a minute. */
const QUARTERS_PER_MINUTE = 72;
const VELOCITY = 80;

type Pitch =
  `${'C' | 'C#' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'F#' | 'G' | 'Ab' | 'A' | 'Bb' | 'B'}${3 | 4 | 5}`;
/** A note or a rest ('r'), and its length in eighth notes. */
type Event = [Pitch | 'r', number];

/**
 * The line as Bach wrote it, in C minor, 4/4. Ties are written as one longer
 * note, so a row ends where a phrase does rather than at every bar line.
 */
// prettier-ignore
export const LINE: Event[] = [
  // Bars 1 to 9: the royal theme, which Frederick the Great gave Bach to improvise on.
  ['C4', 4], ['Eb4', 4], ['G4', 4], ['Ab4', 4],
  ['B3', 4], ['r', 2], ['G4', 4], ['F#4', 4], ['F4', 4], ['E4', 4], ['Eb4', 4],
  ['D4', 2], ['Db4', 2], ['C4', 2], ['B3', 2], ['G3', 2], ['C4', 2], ['F4', 2],
  ['Eb4', 4], ['D4', 4], ['C4', 4], ['Eb4', 4],
  // Bars 10 to 18: Bach's counter-line, in running eighths.
  ['G4', 1], ['F4', 1], ['G4', 1], ['C5', 1], ['G4', 1], ['Eb4', 1], ['D4', 1], ['Eb4', 1],
  ['F4', 1], ['G4', 1], ['A4', 1], ['B4', 1], ['C5', 1], ['Eb4', 1], ['F4', 1], ['G4', 1],
  ['Ab4', 1], ['D4', 1], ['Eb4', 1], ['F4', 1], ['G4', 1], ['F4', 1], ['Eb4', 1], ['D4', 1],
  ['Eb4', 1], ['F4', 1], ['G4', 1], ['Ab4', 1], ['Bb4', 1], ['Ab4', 1], ['G4', 1], ['F4', 1],
  ['G4', 1], ['Ab4', 1], ['Bb4', 1], ['C5', 1], ['Db5', 1], ['Bb4', 1], ['Ab4', 1], ['G4', 1],
  ['A4', 1], ['B4', 1], ['C5', 1], ['D5', 1], ['Eb5', 1], ['C5', 1], ['B4', 1], ['A4', 1],
  ['B4', 1], ['C5', 1], ['D5', 1], ['Eb5', 1], ['F5', 1], ['D5', 1], ['G4', 1], ['D5', 1],
  ['C5', 1], ['D5', 1], ['Eb5', 1], ['F5', 1], ['Eb5', 1], ['D5', 1], ['C5', 1], ['B4', 1],
  ['C5', 2], ['G4', 2], ['Eb4', 2], ['C4', 2],
];

const SEMITONES: Record<string, number> = {
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  Eb: 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  Ab: 8,
  A: 9,
  Bb: 10,
  B: 11,
};

/** MIDI note number: C4, middle C, is 60. */
export function midiPitch(pitch: Pitch): number {
  const octave = Number(pitch.slice(-1));
  return 12 * (octave + 1) + SEMITONES[pitch.slice(0, -1)]!;
}

type TimedNote = { pitch: number; on: number; off: number };

/** The line as notes with start and end ticks, rests dropped. */
export function forwards(line: Event[] = LINE): TimedNote[] {
  const ticksPerEighth = DIVISION / EIGHTHS_PER_QUARTER;
  const notes: TimedNote[] = [];
  let tick = 0;
  for (const [pitch, eighths] of line) {
    const length = eighths * ticksPerEighth;
    if (pitch !== 'r') notes.push({ pitch: midiPitch(pitch), on: tick, off: tick + length });
    tick += length;
  }
  return notes;
}

/** The same notes read from the last bar to the first. */
export function backwards(notes: TimedNote[]): TimedNote[] {
  const end = Math.max(...notes.map((note) => note.off));
  return notes
    .map((note) => ({ pitch: note.pitch, on: end - note.off, off: end - note.on }))
    .reverse();
}

function varint(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

const uint32 = (value: number) => [
  value >>> 24,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));
const meta = (type: number, data: number[]) => [0xff, type, ...varint(data.length), ...data];

/** A track from events at absolute ticks, closed with end-of-track. */
function track(events: Array<{ tick: number; bytes: number[] }>): number[] {
  let last = 0;
  const body = events.flatMap(({ tick, bytes }) => {
    const delta = tick - last;
    last = tick;
    return [...varint(delta), ...bytes];
  });
  body.push(0, ...meta(0x2f, []));
  return [...ascii('MTrk'), ...uint32(body.length), ...body];
}

function voiceTrack(name: string, channel: number, notes: TimedNote[]): number[] {
  // Note-offs sort before note-ons at the same tick, so a repeated pitch
  // is released before it is struck again.
  const events = notes
    .flatMap(({ pitch, on, off }) => [
      { tick: on, order: 1, bytes: [0x90 | channel, pitch, VELOCITY] },
      { tick: off, order: 0, bytes: [0x80 | channel, pitch, 0] },
    ])
    .sort((a, b) => a.tick - b.tick || a.order - b.order);
  return track([{ tick: 0, bytes: meta(0x03, ascii(name)) }, ...events]);
}

/** A format 1 file: a tempo track, then the line forwards and backwards. */
export function crabCanonMidi(): Uint8Array {
  const microsecondsPerQuarter = Math.round(60_000_000 / QUARTERS_PER_MINUTE);
  const conductor = track([
    {
      tick: 0,
      bytes: meta(0x03, ascii('J. S. Bach, The Musical Offering, BWV 1079: Canon 1 a 2')),
    },
    {
      tick: 0,
      bytes: meta(0x02, ascii('Public domain. This sequencing: CC0 1.0, Physics Quiz.')),
    },
    {
      tick: 0,
      bytes: meta(0x51, [
        microsecondsPerQuarter >> 16,
        (microsecondsPerQuarter >> 8) & 0xff,
        microsecondsPerQuarter & 0xff,
      ]),
    },
    { tick: 0, bytes: meta(0x58, [4, 2, 24, 8]) },
    // C minor: three flats.
    { tick: 0, bytes: meta(0x59, [0x100 - 3, 1]) },
  ]);
  const line = forwards();
  const header = [...ascii('MThd'), ...uint32(6), 0, 1, 0, 3, DIVISION >> 8, DIVISION & 0xff];
  return new Uint8Array([
    ...header,
    ...conductor,
    ...voiceTrack('Forwards', 0, line),
    ...voiceTrack('Backwards', 1, backwards(line)),
  ]);
}

export const OUTPUT = join(import.meta.dirname, '..', 'public', 'music', 'crab-canon.mid');

if (process.argv[1] === import.meta.filename) {
  writeFileSync(OUTPUT, crabCanonMidi());
  console.log(`Wrote ${OUTPUT}`);
}
