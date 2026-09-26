import { describe, expect, it } from 'vitest';
import type { AttemptAnswer } from './attempt';
import type { BankOption, BankQuestion } from './bank';
import type { AttemptReview } from './review';
import { reviewMarkdown } from './review-markdown';
import { attemptRecord } from '../test/attempts';

const velocity: BankQuestion = {
  id: 'velocity',
  type: 'single-choice',
  prompt: 'A car covers $d = 100\\,\\text{m}$ in $t = 5\\,\\text{s}$.\nWhat is its mean speed?',
  options: [
    { id: 'a', text: '$20\\,\\text{m/s}$' },
    { id: 'b', text: '$500\\,\\text{m/s}$', why: 'That is $d \\cdot t$, not $d / t$.' },
    { id: 'c', text: '$0.05\\,\\text{m/s}$' },
  ],
  answer: 'a',
  explanation: 'Mean speed is distance over time: $v = d / t = 20\\,\\text{m/s}$.',
  tags: ['kinematics', 'units'],
};

const force: BankQuestion = {
  id: 'force',
  type: 'single-choice',
  prompt: 'What is the SI unit of force?',
  options: [
    { id: 'a', text: 'Joule' },
    { id: 'b', text: 'Newton' },
  ],
  answer: 'b',
  explanation: 'The newton, $1\\,\\text{N} = 1\\,\\text{kg m/s}^2$.',
};

const power: BankQuestion = {
  id: 'power',
  type: 'single-choice',
  prompt: 'What is the SI unit of power?',
  options: [
    { id: 'a', text: 'Watt' },
    { id: 'b', text: 'Volt' },
  ],
  answer: 'a',
  explanation: 'The watt, one joule per second.',
  tags: ['units'],
};

const answers: AttemptAnswer[] = [
  {
    questionId: 'velocity',
    chosenOptionId: 'b',
    correctOptionId: 'a',
    confidence: 'sure',
    response: 'Multiply distance by time,\nso 500.',
    selfGrade: 'no',
  },
  {
    questionId: 'force',
    chosenOptionId: 'b',
    correctOptionId: 'b',
    confidence: 'unsure',
    responseSkipped: true,
  },
  { questionId: 'power', chosenOptionId: null, correctOptionId: 'a' },
  {
    questionId: 'energy',
    chosenOptionId: 'a',
    correctOptionId: 'a',
    confidence: 'guess',
    response: 'Joules, as for work.',
  },
];

/** An answer-first attempt on a tag filter, shown against a later edition that dropped a question. */
const attempt = attemptRecord({
  bankTitle: 'Mechanics basics',
  bankVersion: '1.0.0',
  name: 'Anna',
  submittedAt: '2026-09-23T10:03:20.000Z',
  durationMs: 200_000,
  questionCount: 4,
  correctCount: 2,
  answers,
  mode: 'answer-first',
  tagFilter: { tags: ['kinematics', 'units'], untagged: true },
});

/** Options in presentation order, which need not be the bank's. */
function shuffled(question: BankQuestion): BankOption[] {
  return [...question.options].reverse();
}

const review: AttemptReview = {
  edition: 'other',
  version: '1.1.0',
  mismatch: false,
  language: 'en',
  questions: [
    { kind: 'question', question: velocity, options: shuffled(velocity), answer: answers[0]! },
    { kind: 'question', question: force, options: force.options, answer: answers[1]! },
    { kind: 'question', question: power, options: power.options, answer: answers[2]! },
    { kind: 'archived', answer: answers[3]! },
  ],
};

describe('reviewMarkdown', () => {
  it('writes the whole review as self-contained Markdown', () => {
    expect(reviewMarkdown(attempt, review)).toBe(
      `# Review: Mechanics basics

- **Bank:** Mechanics basics, version 1.0.0
- **Participant:** Anna
- **Date:** 2026-09-23 10:03 UTC
- **Score:** 2 of 4 correct (50%)
- **Duration:** 3 min 20 s
- **Attempt code:** 84S-N02Q
- **Mode:** Answer first
- **Tag filter:** kinematics, units, untagged

Questions are shown from version 1.1.0 of the bank, as the edition this attempt was taken on is not in the library. Questions that edition cannot show as they were answered are marked archived.

## Question 1: Wrong

- **Tags:** kinematics, units
- **Confidence:** Sure

A car covers $d = 100\\,\\text{m}$ in $t = 5\\,\\text{s}$.
What is its mean speed?

**Options:**

1. $0.05\\,\\text{m/s}$
2. **(chosen)** $500\\,\\text{m/s}$
3. **(correct)** $20\\,\\text{m/s}$

**Response:**

> Multiply distance by time,
> so 500.

**Self-grade:** No

**Explanation:**

Mean speed is distance over time: $v = d / t = 20\\,\\text{m/s}$.

**About the chosen option:**

That is $d \\cdot t$, not $d / t$.

## Question 2: Correct

- **Tags:** none
- **Confidence:** Unsure

What is the SI unit of force?

**Options:**

1. Joule
2. **(correct, chosen)** Newton

**Response:** skipped

**Explanation:**

The newton, $1\\,\\text{N} = 1\\,\\text{kg m/s}^2$.

## Question 3: Not answered

- **Tags:** units

What is the SI unit of power?

**Options:**

1. **(correct)** Watt
2. Volt

**Explanation:**

The watt, one joule per second.

## Question 4: Correct (archived)

- **Confidence:** Guess

Archived question: this edition of the bank no longer has it as it was answered. The chosen option was \`a\`. The correct option was \`a\`.

**Response:**

> Joules, as for work.

**Self-grade:** not graded

## Across the attempt

- **Calibration:** Sure: 0/1 (0%) · Unsure: 1/1 (100%) · Guess: 1/1 (100%)
- **Confident errors:** Question 1
- **Self-grade:** Yes 0 · Partly 0 · No 1
`,
    );
  });

  it('leaves out what an attempt did not record', () => {
    const plain = attemptRecord();
    const markdown = reviewMarkdown(plain, { edition: 'none' });

    expect(markdown).not.toMatch(/Mode|Tag filter|Confidence|Self-grade|Calibration|Across/);
    expect(markdown).toContain(
      'SI units is not in the library, so only what the attempt recorded is shown.',
    );
    expect(markdown).toContain(
      '## Question 2: Not answered\n\nQuestion not shown: its bank is not in the library. The correct option was `b`.',
    );
  });

  it('says when the edition shown is a changed copy of the one the attempt names', () => {
    const markdown = reviewMarkdown(attemptRecord(), {
      edition: 'other',
      version: '1.0.0',
      mismatch: false,
      language: 'en',
      questions: [],
    });
    expect(markdown).toContain('Questions are shown from a changed copy of version 1.0.0');
  });

  it('marks an imported attempt as unverified', () => {
    const imported = attemptRecord({ origin: 'imported' });
    expect(reviewMarkdown(imported, { edition: 'none' })).toContain(
      '- **Score:** 1 of 2 correct (50%), unverified: imported, not taken in this browser',
    );
  });

  it('says when the attempt does not match the edition it names', () => {
    const markdown = reviewMarkdown(attemptRecord(), {
      edition: 'other',
      version: '1.0.0',
      mismatch: true,
      language: 'en',
      questions: [],
    });
    expect(markdown).toContain(
      'The answers of this attempt do not match version 1.0.0 of the bank in the library, though it names that edition. Questions are shown by id.',
    );
  });
});
