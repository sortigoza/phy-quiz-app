import { z } from 'zod';

/**
 * The question bank format, version 1.
 *
 * This schema is the project's contract with bank authors, so it is strict in
 * both directions: unknown keys fail loudly (a misspelled `explaination` must
 * not silently produce a bank with no explanations), and the rules that make a
 * bank gradeable at all are enforced here rather than discovered mid-quiz.
 *
 * See SPEC.md section 2 for the normative field reference.
 */

/** The only bank format version this app understands. */
export const BANK_FORMAT_VERSION = 1;

const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const bankIdPattern = /^[a-z0-9][a-z0-9._-]*$/;

// The three schemas are exported so documentation can be checked against them.
// Everything else should go through `parseBank`, which reports errors by path.

export const optionSchema = z.strictObject({
  id: z.string().min(1).max(16),
  text: z.string().min(1).max(1000),
  why: z.string().min(1).max(2000).optional(),
});

export const questionSchema = z
  .strictObject({
    id: z.string().min(1).max(128),
    type: z.literal('single-choice').default('single-choice'),
    prompt: z.string().min(1).max(4000),
    options: z.array(optionSchema).min(2).max(8),
    answer: z.string().min(1).max(16),
    explanation: z.string().min(1).max(4000),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  })
  .superRefine((question, ctx) => {
    const seen = new Set<string>();
    for (const [index, option] of question.options.entries()) {
      if (seen.has(option.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: `duplicate option id "${option.id}" at position ${index + 1}; option ids must be unique within a question`,
        });
      }
      seen.add(option.id);
    }

    if (!seen.has(question.answer)) {
      ctx.addIssue({
        code: 'custom',
        path: ['answer'],
        message: `answer "${question.answer}" does not match any option id; options are ${[...seen].join(', ')}`,
      });
    }
  });

export const bankSchema = z
  .strictObject({
    $schema: z.string().max(500).optional(),
    formatVersion: z.literal(BANK_FORMAT_VERSION, {
      error: `formatVersion must be ${BANK_FORMAT_VERSION}; this app cannot read other versions of the bank format`,
    }),
    id: z
      .string()
      .min(3)
      .max(128)
      .regex(
        bankIdPattern,
        'bank id may contain only lowercase letters, digits, dots, dashes and underscores, and must start with a letter or digit',
      ),
    version: z.string().regex(semver, 'bank version must be semver, for example 1.0.0'),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(2000).optional(),
    author: z.string().min(1).max(200).optional(),
    license: z.string().min(1).max(100).optional(),
    language: z.string().min(2).max(35).optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional(),
    defaultQuestionCount: z.int().min(1).max(500).optional(),
    questions: z.array(questionSchema).min(1).max(500),
  })
  .superRefine((bank, ctx) => {
    const seen = new Set<string>();
    for (const [index, question] of bank.questions.entries()) {
      if (seen.has(question.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['questions', index, 'id'],
          message: `duplicate question id "${question.id}"; question ids must be unique within a bank`,
        });
      }
      seen.add(question.id);
    }
  });

export type Bank = z.infer<typeof bankSchema>;
export type BankQuestion = Bank['questions'][number];
export type BankOption = BankQuestion['options'][number];

/** One problem with a bank file, addressed at the field that caused it. */
export type BankIssue = {
  /** Dotted and bracketed path into the document, e.g. `questions[7].answer`. */
  path: string;
  message: string;
};

export type ParseBankResult = { ok: true; bank: Bank } | { ok: false; issues: BankIssue[] };

/** Renders a Zod path the way a bank author reads their own file. */
function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((rendered, segment) => {
    if (typeof segment === 'number') return `${rendered}[${segment}]`;
    return rendered === '' ? String(segment) : `${rendered}.${String(segment)}`;
  }, '');
}

/**
 * Parses and validates the text of a bank file.
 *
 * Either the whole bank is valid or none of it is returned: a partially
 * accepted bank would produce a quiz nobody could trust.
 */
export function parseBank(text: string): ParseBankResult {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch (cause) {
    return {
      ok: false,
      issues: [
        {
          path: '',
          message: `this file is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
        },
      ],
    };
  }

  const result = bankSchema.safeParse(document);
  if (result.success) return { ok: true, bank: result.data };

  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: formatPath(issue.path),
      message: issue.message,
    })),
  };
}

/**
 * A short hash of the exact bytes of a bank file.
 *
 * Bank authors forget to bump their version when they fix a typo, which would
 * leave a leaderboard silently comparing results from two different sets of
 * questions. The fingerprint is what notices.
 */
export async function fingerprint(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** The language assumed for a bank that does not declare one. */
const DEFAULT_BANK_LANGUAGE = 'en';

/** The BCP 47 tag of the language the bank is written in. */
export function bankLanguage(bank: Bank): string {
  return bank.language ?? DEFAULT_BANK_LANGUAGE;
}
