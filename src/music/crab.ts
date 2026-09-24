import type { Note, Score } from './midi';

/** How far apart two times may be and still count as the same, in seconds. */
const TOLERANCE = 0.001;

/**
 * True when a score is a crab canon: two voices, the second the first played
 * backwards, in pitch and in time. Reversed, a note that sounds from `start`
 * to `start + duration` sounds from `end - (start + duration)` to
 * `end - start`, where `end` is the end of the score.
 *
 * The check exists to prove that the file shipped as Bach's Canon 1 a 2
 * really is one. That file is sequenced with full note lengths, so the
 * reversal is exact.
 */
export function isCrabCanon(score: Score): boolean {
  if (score.notes.some((note) => note.voice > 1)) return false;
  const [forwards, backwards] = [0, 1].map((voice) =>
    score.notes.filter((note) => note.voice === voice),
  ) as [Note[], Note[]];
  if (forwards.length === 0 || forwards.length !== backwards.length) return false;

  const end = score.duration;
  const same = (a: number, b: number) => Math.abs(a - b) < TOLERANCE;
  return forwards.every((note, i) => {
    const reflection = backwards[backwards.length - 1 - i]!;
    return (
      reflection.pitch === note.pitch &&
      same(reflection.start, end - note.start - note.duration) &&
      same(reflection.duration, note.duration)
    );
  });
}
