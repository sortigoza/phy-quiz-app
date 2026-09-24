/**
 * A small Standard MIDI File reader: enough to turn a score into timed notes.
 *
 * It reads formats 0 and 1 with a ticks-per-quarter-note division, follows the
 * tempo map, and pairs note-ons with note-offs. Everything else (controllers,
 * program changes, lyrics) is read past and dropped, because the player only
 * needs pitch, time and loudness. Pure: no DOM, no Web Audio.
 */

export type Note = {
  /** MIDI note number: 60 is middle C, 69 is A4 at 440 Hz. */
  pitch: number;
  /** 0 to 1. */
  velocity: number;
  /** Seconds from the start of the file. */
  start: number;
  /** Seconds. */
  duration: number;
  /**
   * Which line of music the note belongs to: the track in a format 1 file,
   * the channel in a format 0 file, numbered from 0 among those with notes.
   */
  voice: number;
};

export type Score = {
  /** Sorted by start, then pitch. */
  notes: Note[];
  /** Seconds, to the end of the last note. */
  duration: number;
};

export class MidiError extends Error {
  override name = 'MidiError';
}

/** Microseconds per quarter note when a file sets no tempo: 120 bpm. */
const DEFAULT_TEMPO = 500_000;

type TempoChange = { tick: number; microsecondsPerQuarter: number };
type RawNote = { pitch: number; velocity: number; on: number; off: number; line: number };

export function parseMidi(bytes: Uint8Array): Score {
  const reader = new Reader(bytes);

  if (reader.ascii(4) !== 'MThd') throw new MidiError('Not a MIDI file: no MThd header.');
  const headerLength = reader.uint32();
  const format = reader.uint16();
  const trackCount = reader.uint16();
  const division = reader.uint16();
  reader.skip(headerLength - 6);

  if (format > 1) throw new MidiError(`MIDI format ${format} is not supported, only 0 and 1.`);
  if (division & 0x8000) throw new MidiError('SMPTE time division is not supported.');
  if (division === 0) throw new MidiError('The MIDI header gives zero ticks per quarter note.');

  const tempos: TempoChange[] = [];
  const raw: RawNote[] = [];

  for (let track = 0; track < trackCount; track++) {
    if (reader.ascii(4) !== 'MTrk') throw new MidiError(`Track ${track} has no MTrk header.`);
    const length = reader.uint32();
    const end = reader.offset + length;
    readTrack(reader.slice(end), track, format, tempos, raw);
    reader.offset = end;
  }

  const seconds = secondsAt(tempos, division);
  const voiceOf = new Map(
    [...new Set(raw.map((note) => note.line))]
      .sort((a, b) => a - b)
      .map((line, voice) => [line, voice]),
  );
  const notes = raw
    .map((note) => {
      const start = seconds(note.on);
      return {
        pitch: note.pitch,
        velocity: note.velocity / 127,
        start,
        duration: seconds(note.off) - start,
        voice: voiceOf.get(note.line) ?? 0,
      };
    })
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);

  return {
    notes,
    duration: notes.reduce((latest, note) => Math.max(latest, note.start + note.duration), 0),
  };
}

function readTrack(
  reader: Reader,
  track: number,
  format: number,
  tempos: TempoChange[],
  raw: RawNote[],
): void {
  let tick = 0;
  let runningStatus: number | undefined;
  // Notes sounding, by channel and pitch. A list, so a pitch struck twice
  // before its first release is closed in order.
  const sounding = new Map<number, Array<{ velocity: number; on: number }>>();

  const release = (channel: number, pitch: number) => {
    const held = sounding.get(channel * 128 + pitch)?.shift();
    if (held)
      raw.push({
        pitch,
        velocity: held.velocity,
        on: held.on,
        off: tick,
        line: format === 0 ? channel : track,
      });
  };

  while (reader.remaining > 0) {
    tick += reader.varint();
    let status = reader.uint8();

    if (status === 0xff) {
      const type = reader.uint8();
      const data = reader.bytes(reader.varint());
      if (type === 0x51 && data.length === 3) {
        tempos.push({
          tick,
          microsecondsPerQuarter: (data[0]! << 16) | (data[1]! << 8) | data[2]!,
        });
      }
      if (type === 0x2f) break;
      runningStatus = undefined;
      continue;
    }
    if (status === 0xf0 || status === 0xf7) {
      reader.skip(reader.varint());
      runningStatus = undefined;
      continue;
    }

    if (status < 0x80) {
      if (runningStatus === undefined)
        throw new MidiError(`Track ${track} has data with no status byte.`);
      reader.offset -= 1;
      status = runningStatus;
    } else {
      runningStatus = status;
    }

    const kind = status >> 4;
    const channel = status & 0x0f;
    if (kind === 0x8 || kind === 0x9) {
      const pitch = reader.uint8();
      const velocity = reader.uint8();
      // A note-on at velocity 0 is a note-off, and most files use it that way.
      if (kind === 0x9 && velocity > 0) {
        const key = channel * 128 + pitch;
        sounding.set(key, [...(sounding.get(key) ?? []), { velocity, on: tick }]);
      } else {
        release(channel, pitch);
      }
    } else {
      // Program change and channel pressure carry one data byte; the rest two.
      reader.skip(kind === 0xc || kind === 0xd ? 1 : 2);
    }
  }

  // A note never released ends with its track.
  for (const [key, held] of sounding) {
    for (let i = held.length; i > 0; i--) release(Math.floor(key / 128), key % 128);
  }
}

/**
 * Converts ticks to seconds through the tempo map. Tempo changes may come from
 * any track, and apply from their tick onwards to every track.
 */
function secondsAt(tempos: TempoChange[], division: number): (tick: number) => number {
  const sorted = [...tempos].sort((a, b) => a.tick - b.tick);
  const segments: Array<{ tick: number; seconds: number; secondsPerTick: number }> = [];
  let tick = 0;
  let seconds = 0;
  let secondsPerTick = DEFAULT_TEMPO / 1e6 / division;
  for (const change of sorted) {
    seconds += (change.tick - tick) * secondsPerTick;
    tick = change.tick;
    secondsPerTick = change.microsecondsPerQuarter / 1e6 / division;
    segments.push({ tick, seconds, secondsPerTick });
  }

  return (at) => {
    let segment = { tick: 0, seconds: 0, secondsPerTick: DEFAULT_TEMPO / 1e6 / division };
    for (const candidate of segments) {
      if (candidate.tick > at) break;
      segment = candidate;
    }
    return segment.seconds + (at - segment.tick) * segment.secondsPerTick;
  };
}

class Reader {
  offset = 0;
  private readonly data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }

  uint8(): number {
    if (this.remaining < 1) throw new MidiError('The MIDI file ends in the middle of an event.');
    return this.data[this.offset++]!;
  }

  uint16(): number {
    return (this.uint8() << 8) | this.uint8();
  }

  uint32(): number {
    return this.uint16() * 0x10000 + this.uint16();
  }

  /** A variable-length quantity: seven bits a byte, high bit set on all but the last. */
  varint(): number {
    let value = 0;
    for (let i = 0; i < 4; i++) {
      const byte = this.uint8();
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new MidiError('A MIDI length or time is longer than four bytes.');
  }

  bytes(length: number): Uint8Array {
    if (this.remaining < length)
      throw new MidiError('The MIDI file ends in the middle of an event.');
    const bytes = this.data.subarray(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  skip(length: number): void {
    this.bytes(length);
  }

  ascii(length: number): string {
    return String.fromCharCode(...this.bytes(length));
  }

  /** A reader over the bytes from here to `end`, for one track. */
  slice(end: number): Reader {
    if (end > this.data.length) throw new MidiError('A MIDI track runs past the end of the file.');
    return new Reader(this.data.subarray(this.offset, end));
  }
}
