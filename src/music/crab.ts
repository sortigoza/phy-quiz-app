import type { Score } from './midi';

/**
 * True when a score is a crab canon: two voices, the second the first played
 * backwards.
 *
 * Only the order of pitches is compared, not their timing: a performed MIDI
 * file shortens notes for articulation, which moves where a reversed note
 * would start without changing what the canon is. The check exists to prove
 * that the file shipped as Bach's Canon 1 a 2 really is one.
 */
export function isCrabCanon(score: Score): boolean {
  const voices = [0, 1].map((voice) =>
    score.notes.filter((note) => note.voice === voice).map((note) => note.pitch),
  );
  const [forwards = [], backwards = []] = voices;
  if (score.notes.some((note) => note.voice > 1) || forwards.length === 0) return false;
  return (
    forwards.length === backwards.length &&
    forwards.every((pitch, i) => pitch === backwards[backwards.length - 1 - i])
  );
}
