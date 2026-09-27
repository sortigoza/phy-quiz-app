import { describe, expect, it } from 'vitest';
import { encouragement } from './encouragement';

describe('encouragement', () => {
  it('celebrates full marks', () => {
    expect(encouragement(10, 10)).toMatch(/full marks/i);
  });

  it('gives one line per score band, the same across a band and different across its edge', () => {
    // Bands: none right, under half, half to under 80%, 80% to all but full marks, full marks.
    const [zero, low, lowTop, mid, midTop, high, highTop, full] = [
      [0, 10],
      [1, 10],
      [49, 100],
      [5, 10],
      [79, 100],
      [8, 10],
      [9, 10],
      [10, 10],
    ].map(([correct, count]) => encouragement(correct!, count!));
    expect(low).toBe(lowTop);
    expect(mid).toBe(midTop);
    expect(high).toBe(highTop);
    expect(new Set([zero, low, mid, high, full]).size).toBe(5);
  });

  it('keeps full marks and none right for exactly that, where the percentage would round to them', () => {
    expect(encouragement(199, 200)).toBe(encouragement(9, 10));
    expect(encouragement(1, 201)).toBe(encouragement(1, 10));
  });

  it('points a low score at the explanations rather than at the score', () => {
    expect(encouragement(0, 10)).toMatch(/explanation/i);
    expect(encouragement(3, 10)).toMatch(/explanation/i);
  });
});
