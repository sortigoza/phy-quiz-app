import { describe, expect, it } from 'vitest';
import { MidiError, parseMidi } from './midi';

/** A variable-length quantity, as MIDI writes delta times and lengths. */
function varint(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >> 7; rest > 0; rest >>= 7) bytes.unshift((rest & 0x7f) | 0x80);
  return bytes;
}

function uint32(value: number): number[] {
  return [value >>> 24, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0));

/** One track from `[delta, ...event bytes]` pairs, closed with end-of-track. */
function track(events: number[][]): number[] {
  const body = [
    ...events.flatMap(([delta, ...event]) => [...varint(delta!), ...event]),
    0,
    0xff,
    0x2f,
    0,
  ];
  return [...ascii('MTrk'), ...uint32(body.length), ...body];
}

function midi(tracks: number[][], { format = 1, division = 480 } = {}): Uint8Array {
  const header = [
    ...ascii('MThd'),
    ...uint32(6),
    0,
    format,
    0,
    tracks.length,
    division >> 8,
    division & 0xff,
  ];
  return new Uint8Array([...header, ...tracks.flat()]);
}

/** Set tempo, in microseconds per quarter note. */
const tempo = (microseconds: number) => [
  0xff,
  0x51,
  3,
  microseconds >> 16,
  (microseconds >> 8) & 0xff,
  microseconds & 0xff,
];
const on = (pitch: number, velocity = 100, channel = 0) => [0x90 | channel, pitch, velocity];
const off = (pitch: number, channel = 0) => [0x80 | channel, pitch, 0];

describe('parseMidi', () => {
  it('times notes at the default 120 bpm when the file sets no tempo', () => {
    const score = parseMidi(
      midi([
        track([
          [0, ...on(60)],
          [480, ...off(60)],
          [0, ...on(62)],
          [240, ...off(62)],
        ]),
      ]),
    );

    expect(score.notes).toEqual([
      { pitch: 60, velocity: 100 / 127, start: 0, duration: 0.5, voice: 0 },
      { pitch: 62, velocity: 100 / 127, start: 0.5, duration: 0.25, voice: 0 },
    ]);
    expect(score.duration).toBe(0.75);
  });

  it('follows a tempo change from its tick onwards, in every track', () => {
    const conductor = track([
      [0, ...tempo(1_000_000)],
      [480, ...tempo(250_000)],
    ]);
    const melody = track([
      [0, ...on(60)],
      [480, ...off(60)],
      [0, ...on(64)],
      [480, ...off(64)],
    ]);

    const [first, second] = parseMidi(midi([conductor, melody])).notes;

    // One beat at 60 bpm, then one at 240 bpm.
    expect(first).toMatchObject({ start: 0, duration: 1 });
    expect(second).toMatchObject({ start: 1, duration: 0.25 });
  });

  it('treats a note-on at velocity zero as a note-off', () => {
    const score = parseMidi(
      midi([
        track([
          [0, ...on(60)],
          [960, ...on(60, 0)],
        ]),
      ]),
    );
    expect(score.notes).toEqual([expect.objectContaining({ pitch: 60, duration: 1 })]);
  });

  it('reads running status, where a repeated status byte is left out', () => {
    // Note on C, then E and the two releases sent with the status byte omitted.
    const score = parseMidi(
      midi([
        track([
          [0, 0x90, 60, 90],
          [0, 64, 90],
          [480, 60, 0],
          [0, 64, 0],
        ]),
      ]),
    );
    expect(score.notes.map((note) => [note.pitch, note.duration])).toEqual([
      [60, 0.5],
      [64, 0.5],
    ]);
  });

  it('closes a pitch struck twice in the order it was struck', () => {
    const score = parseMidi(
      midi([
        track([
          [0, ...on(60, 50)],
          [240, ...on(60, 100)],
          [240, ...off(60)],
          [240, ...off(60)],
        ]),
      ]),
    );
    expect(score.notes.map(({ start, duration, velocity }) => [start, duration, velocity])).toEqual(
      [
        [0, 0.5, 50 / 127],
        [0.25, 0.5, 100 / 127],
      ],
    );
  });

  it('ends a note never released with its track', () => {
    const score = parseMidi(
      midi([
        track([
          [0, ...on(60)],
          [960, 0xff, 0x01, 1, 0x41],
        ]),
      ]),
    );
    expect(score.notes).toEqual([expect.objectContaining({ pitch: 60, duration: 1 })]);
  });

  it('numbers voices by track in format 1, counting only tracks with notes', () => {
    const conductor = track([[0, ...tempo(500_000)]]);
    const upper = track([
      [0, ...on(72)],
      [480, ...off(72)],
    ]);
    const lower = track([
      [0, ...on(48)],
      [480, ...off(48)],
    ]);

    const score = parseMidi(midi([conductor, upper, lower]));

    expect(score.notes.map((note) => [note.pitch, note.voice])).toEqual([
      [48, 1],
      [72, 0],
    ]);
  });

  it('numbers voices by channel in format 0', () => {
    const both = track([
      [0, ...on(72, 100, 3)],
      [0, ...on(48, 100, 9)],
      [480, ...off(72, 3)],
      [0, ...off(48, 9)],
    ]);
    const score = parseMidi(midi([both], { format: 0 }));
    expect(score.notes.map((note) => [note.pitch, note.voice])).toEqual([
      [48, 1],
      [72, 0],
    ]);
  });

  it('reads past controllers, program changes, pitch bends and system exclusive messages', () => {
    const score = parseMidi(
      midi([
        track([
          [0, 0xc0, 19],
          [0, 0xb0, 7, 100],
          [0, 0xf0, 3, 1, 2, 0xf7],
          [0, ...on(60)],
          [0, 0xe0, 0, 64],
          [480, ...off(60)],
        ]),
      ]),
    );
    expect(score.notes).toEqual([expect.objectContaining({ pitch: 60, duration: 0.5 })]);
  });

  it('refuses what it cannot read, with a MidiError', () => {
    expect(() => parseMidi(new Uint8Array(ascii('RIFF....')))).toThrow(MidiError);
    expect(() => parseMidi(midi([track([])], { division: 0x8000 | 25 }))).toThrow(/SMPTE/);
    expect(() => parseMidi(midi([track([])]).subarray(0, 20))).toThrow(MidiError);
    expect(() => parseMidi(midi([track([[0, 60, 100]])]))).toThrow(/no status byte/);
  });
});
