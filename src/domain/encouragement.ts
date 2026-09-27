/**
 * The one line of encouragement the review opens with, keyed to the score band.
 * Every band points at the review below it, since that is where the learning is.
 *
 * Bands are judged from the counts, not the rounded percentage, so full marks
 * and none right mean exactly that on a long attempt too.
 */

/** Bands by the lowest share of questions right they take, highest first. */
const bands: readonly { from: number; line: string }[] = [
  { from: 0.8, line: 'Strong work. The few you missed are worth a closer look.' },
  { from: 0.5, line: 'A solid base. The explanations below will fill in the gaps.' },
  { from: 0, line: 'A start. Each explanation below is a step forward.' },
];

export function encouragement(correct: number, questionCount: number): string {
  if (questionCount > 0 && correct === questionCount)
    return 'Full marks. Read the explanations anyway: they may say something new.';
  if (correct === 0)
    return 'Every question is still to learn, and each explanation below teaches one.';
  const share = correct / questionCount;
  return (bands.find(({ from }) => share >= from) ?? bands[bands.length - 1]!).line;
}
