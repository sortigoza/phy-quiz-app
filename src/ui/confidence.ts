import type { Confidence } from '../domain/attempt';

/** How each confidence level is named on screen. */
export const confidenceLabel: Record<Confidence, string> = {
  sure: 'Sure',
  unsure: 'Unsure',
  guess: 'Guess',
};
