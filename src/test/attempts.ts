import type { Attempt } from '../domain/attempt';

/**
 * A valid attempt record for tests that need one without taking a quiz: 1 of 2
 * correct, the second question unanswered. Its code is the one its id derives.
 */
export function attemptRecord(overrides: Partial<Attempt> = {}): Attempt {
  return {
    id: '01890a5d-ac96-774b-bcce-b302099a8057',
    code: '84S-N02Q',
    name: 'Anna',
    bankId: 'test.units',
    bankVersion: '1.0.0',
    bankFingerprint: 'a1b2c3d4',
    bankTitle: 'SI units',
    startedAt: '2026-09-23T10:00:00.000Z',
    submittedAt: '2026-09-23T10:03:20.000Z',
    durationMs: 200_000,
    seed: 12345,
    questionCount: 2,
    correctCount: 1,
    answers: [
      { questionId: 'q1', chosenOptionId: 'a', correctOptionId: 'a' },
      { questionId: 'q2', chosenOptionId: null, correctOptionId: 'b' },
    ],
    appVersion: '0.1.0',
    origin: 'local',
    ...overrides,
  };
}
