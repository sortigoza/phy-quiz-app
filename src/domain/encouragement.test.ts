import { describe, expect, it } from 'vitest';
import { encouragement } from './encouragement';

describe('encouragement', () => {
  it('celebrates full marks', () => {
    expect(encouragement(100)).toMatch(/full marks/i);
  });

  it('gives one line per score band, the same across a band and different across its edge', () => {
    // Bands: 0, 1 to 49, 50 to 79, 80 to 99, 100.
    const lines = [0, 1, 49, 50, 79, 80, 99, 100].map(encouragement);
    const [zero, low, lowTop, mid, midTop, high, highTop, full] = lines;
    expect(low).toBe(lowTop);
    expect(mid).toBe(midTop);
    expect(high).toBe(highTop);
    expect(new Set([zero, low, mid, high, full]).size).toBe(5);
  });

  it('points a low score at the explanations rather than at the score', () => {
    expect(encouragement(0)).toMatch(/explanation/i);
    expect(encouragement(30)).toMatch(/explanation/i);
  });
});
