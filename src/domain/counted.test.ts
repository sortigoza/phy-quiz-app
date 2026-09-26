import { describe, expect, it } from 'vitest';
import { attemptRecord } from '../test/attempts';
import { isCounted, MIN_MS_PER_QUESTION } from './counted';

describe('isCounted', () => {
  it('counts an attempt answered at a plausible reading pace', () => {
    expect(
      isCounted(attemptRecord({ questionCount: 2, durationMs: 2 * MIN_MS_PER_QUESTION })),
    ).toBe(true);
  });

  it('does not count an attempt averaging under the threshold a question', () => {
    expect(
      isCounted(attemptRecord({ questionCount: 2, durationMs: 2 * MIN_MS_PER_QUESTION - 1 })),
    ).toBe(false);
  });

  it("follows the participant's override either way", () => {
    expect(isCounted(attemptRecord({ durationMs: 1_000, countedOverride: true }))).toBe(true);
    expect(isCounted(attemptRecord({ durationMs: 200_000, countedOverride: false }))).toBe(false);
  });
});
