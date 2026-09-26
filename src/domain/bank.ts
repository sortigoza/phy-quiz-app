import { parse as parseYaml, YAMLParseError } from 'yaml';
import { z } from 'zod';
import { adviceFor, strayControlCharacter, stringsIn, unreadableEscape } from './backslash';
import { teacherMessages, unknownFieldIssues } from './issue-messages';

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

/** A bank id, also the pattern for a repository id and for an entry naming its bank. */
export const bankIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(
    bankIdPattern,
    'bank id may contain only lowercase letters, digits, dots, dashes and underscores, and must start with a letter or digit',
  );

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
    id: bankIdSchema,
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

/** Renders a Zod path the way a person reads their own file, e.g. `questions[7].answer`. */
export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((rendered, segment) => {
    if (typeof segment === 'number') return `${rendered}[${segment}]`;
    return rendered === '' ? String(segment) : `${rendered}.${String(segment)}`;
  }, '');
}

/**
 * Whether a parsed document is at least trying to be a bank. Anything else
 * (another project's JSON file, say) gets one plain sentence instead of a list
 * of every field it lacks.
 */
function looksLikeABank(document: unknown): boolean {
  return (
    typeof document === 'object' &&
    document !== null &&
    !Array.isArray(document) &&
    ('formatVersion' in document || 'questions' in document)
  );
}

/** The two ways a bank may be written. JSON is canonical; YAML means the same thing. SPEC section 2.5. */
export type BankFormat = 'json' | 'yaml';

type ReadDocumentResult =
  | { ok: true; document: unknown; format: BankFormat }
  | { ok: false; issue: BankIssue };

/**
 * Reads a file as JSON or YAML, telling them apart by content alone, so a
 * bank stored as the text it was loaded from reads back the same way.
 *
 * Text JSON can read is JSON. Otherwise, text that starts like a JSON object
 * or array was meant to be JSON, and gets JSON's error; anything else is YAML.
 */
export function readDocument(text: string): ReadDocumentResult {
  try {
    return { ok: true, document: JSON.parse(text), format: 'json' };
  } catch (cause) {
    if (/^\s*[[{]/.test(text)) {
      const escape = unreadableEscape(text);
      const hint = escape
        ? ` The text contains "${escape}": this looks like an unescaped LaTeX command. ${adviceFor(escape)}`
        : '';
      return {
        ok: false,
        issue: { path: '', message: `this file is not valid JSON: ${errorMessage(cause)}.${hint}` },
      };
    }
  }

  try {
    return { ok: true, document: parseYaml(text), format: 'yaml' };
  } catch (cause) {
    const message =
      cause instanceof YAMLParseError
        ? // The first line; the rest is a picture of the offending line.
          (cause.message.split('\n')[0] ?? '').replace(/:$/, '')
        : errorMessage(cause);
    return { ok: false, issue: { path: '', message: `this file is not valid YAML: ${message}` } };
  }
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The fields the object at a path accepts: the bank, a question or an option. */
function fieldsAt(path: PropertyKey[]): string[] {
  const depth = path.filter((segment) => typeof segment === 'string').length;
  const schema = [bankSchema, questionSchema, optionSchema][depth];
  return schema ? Object.keys(schema.shape) : [];
}

/** The problems in a document read from a bank file: stray control characters first, then the schema's. */
function problemsWith(document: unknown): { bank: Bank } | { issues: BankIssue[] } {
  const issues: BankIssue[] = [];
  for (const { path, text } of stringsIn(document)) {
    const problem = strayControlCharacter(text);
    if (problem) issues.push({ path: formatPath(path), message: problem });
  }

  const result = bankSchema.safeParse(document, { error: teacherMessages });
  if (result.success && issues.length === 0) return { bank: result.data };

  for (const issue of result.error?.issues ?? []) {
    const reported =
      issue.code === 'unrecognized_keys'
        ? unknownFieldIssues(issue.path, issue.keys, fieldsAt(issue.path))
        : [issue];
    for (const { path, message } of reported) issues.push({ path: formatPath(path), message });
  }
  return { issues };
}

/**
 * Parses and validates the text of a bank file, JSON or YAML.
 *
 * Either the whole bank is valid or none of it is returned: a partially
 * accepted bank would produce a quiz nobody could trust.
 */
export function parseBank(text: string): ParseBankResult {
  const read = readDocument(text);
  if (!read.ok) return { ok: false, issues: [read.issue] };

  if (!looksLikeABank(read.document)) {
    return {
      ok: false,
      issues: [
        {
          path: '',
          message: `this is ${read.format === 'json' ? 'JSON' : 'YAML'}, but not a question bank: a bank is an object with formatVersion, id, version, title and questions`,
        },
      ],
    };
  }

  const problems = problemsWith(read.document);
  return 'bank' in problems ? { ok: true, bank: problems.bank } : { ok: false, issues: problems.issues };
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

/**
 * Orders two bank versions as semver does, closely enough to find the newest:
 * by major, minor and patch, then a release above its pre-releases. Pre-release
 * labels and build metadata are compared as plain text.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (version: string) => {
    const [core = '', pre] = version.split('+')[0]?.split(/-(.*)/) ?? [];
    return { numbers: core.split('.').map(Number), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    const difference = (x.numbers[i] ?? 0) - (y.numbers[i] ?? 0);
    if (difference !== 0) return difference;
  }
  if (x.pre === undefined || y.pre === undefined) {
    return (x.pre === undefined ? 1 : 0) - (y.pre === undefined ? 1 : 0);
  }
  return x.pre.localeCompare(y.pre);
}
