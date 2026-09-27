/**
 * The one line of encouragement the review opens with, keyed to the score band.
 * Every band points at the review below it, since that is where the learning is.
 */

/** Bands by their lowest percentage, highest first. */
const bands: readonly { from: number; line: string }[] = [
  { from: 100, line: 'Full marks. Read the explanations anyway: they may say something new.' },
  { from: 80, line: 'Strong work. The few you missed are worth a closer look.' },
  { from: 50, line: 'A solid base. The explanations below will fill in the gaps.' },
  { from: 1, line: 'A start. Each explanation below is a step forward.' },
  { from: 0, line: 'Every question is still to learn, and each explanation below teaches one.' },
];

/** The line for a score given as a whole-number percentage. */
export function encouragement(percent: number): string {
  const band = bands.find(({ from }) => percent >= from) ?? bands[bands.length - 1]!;
  return band.line;
}
