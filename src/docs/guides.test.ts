import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBank } from '../domain/bank';
import { isBankRepository, parseBankRepository } from '../domain/bank-repository';
import { fieldReference } from './bank-reference';

/**
 * The guides in `docs/` are hand-written Markdown, held to the app here: every
 * field is documented, every example is one the app accepts, and every error
 * the FAQ quotes is one the validator really emits.
 */

const docsDir = join(import.meta.dirname, '..', '..', 'docs');
const guide = (name: string) => readFileSync(join(docsDir, name), 'utf8');

/** Every fenced block of one language in a Markdown document. */
function blocks(markdown: string, language: string): string[] {
  const fence = new RegExp('```' + language + '\\n([\\s\\S]*?)\\n```', 'g');
  return [...markdown.matchAll(fence)].map((match) => match[1] ?? '');
}

/** Whether a JSON or YAML block is trying to be a bank, as opposed to some other file. */
function looksLikeABank(text: string): boolean {
  return /(^|\n)\s*"?formatVersion"?:/.test(text) && /(^|\n)\s*"?questions"?:/.test(text);
}

const guides = ['bank-format.md', 'authoring-with-ai.md', 'deploy.md', 'development.md'];

describe.each(guides)('%s', (name) => {
  const text = guide(name);

  it('holds only valid JSON in its json blocks', () => {
    for (const block of blocks(text, 'json'))
      expect(() => JSON.parse(block) as unknown).not.toThrow();
  });

  it('holds only banks and repositories the app accepts', () => {
    for (const block of [...blocks(text, 'json'), ...blocks(text, 'yaml')]) {
      if (!isBankRepository(block) && !looksLikeABank(block)) continue;
      const result = isBankRepository(block)
        ? parseBankRepository(block, 'https://example.org/banks/index.json')
        : parseBank(block);
      const issues = result.ok ? [] : result.issues;
      expect(issues, block.slice(0, 200)).toEqual([]);
    }
  });
});

describe('bank-format.md', () => {
  const text = guide('bank-format.md');

  it.each([
    ['bank', fieldReference.bank],
    ['question', fieldReference.question],
    ['option', fieldReference.option],
  ] as const)('documents every %s field in a table', (_, fields) => {
    for (const field of fields) expect(text).toContain(`| \`${field.name}\` |`);
  });

  it('has a minimal example, a full example, and a YAML example', () => {
    expect(text).toMatch(/## Minimal example\n[\s\S]*?```json/);
    expect(text).toMatch(/## Full example\n[\s\S]*?```json/);
    expect(blocks(text, 'yaml').filter(looksLikeABank).length).toBeGreaterThan(0);
  });

  it('warns that every LaTeX backslash must be doubled in JSON', () => {
    expect(text).toMatch(/double every backslash/i);
    expect(text).toContain('"$5 \\\\times 10^{3}$"');
  });

  /**
   * A broken bank, and a sentence the FAQ quotes from the validator's report
   * on it. The sentence must be in the report, and in the FAQ.
   */
  const bank = (question: Record<string, unknown> = {}, top: Record<string, unknown> = {}) =>
    JSON.stringify({
      formatVersion: 1,
      id: 'example.faq',
      version: '1.0.0',
      title: 'FAQ',
      questions: [
        {
          id: 'q1',
          prompt: 'Which?',
          options: [
            { id: 'a', text: 'This one' },
            { id: 'b', text: 'That one' },
          ],
          answer: 'a',
          explanation: 'Because.',
          ...question,
        },
      ],
      ...top,
    });

  const twoQuestions = bank().replace(/(\{"id":"q1".*\})\]/, '$1,$1]');

  it.each([
    [
      'a misspelled field',
      bank({ explanation: undefined, explaination: 'Because.' }),
      'unknown field "explaination": did you mean "explanation"? Misspelled fields are refused, so that nothing is silently lost.',
    ],
    ['a missing field', bank({ explanation: undefined }), 'this field is required and is missing'],
    [
      'an answer naming no option',
      bank({ answer: 'e' }),
      'answer "e" does not match any option id; options are a, b',
    ],
    [
      'a single backslash before t in JSON',
      bank({ prompt: '$5 \times 10^{3}$' }),
      'contains a tab where "\\times" was probably meant: this looks like an unescaped LaTeX command.',
    ],
    [
      'a single backslash before f in JSON',
      bank({ prompt: '$\frac{1}{2}$' }),
      'contains a form feed where "\\frac" was probably meant',
    ],
    [
      'a backslash JSON cannot read',
      bank().replace('Which?', '$\\alpha$'),
      'The text contains "\\alpha": this looks like an unescaped LaTeX command.',
    ],
    [
      'a version that is not semver',
      bank({}, { version: '1.0' }),
      'bank version must be semver, for example 1.0.0',
    ],
    [
      'an id with capitals',
      bank({}, { id: 'Mechanics' }),
      'bank id may contain only lowercase letters, digits, dots, dashes and underscores, and must start with a letter or digit',
    ],
    [
      'another format version',
      bank({}, { formatVersion: 2 }),
      'formatVersion must be 1; this app cannot read other versions of the bank format',
    ],
    [
      'a question id used twice',
      twoQuestions,
      'duplicate question id "q1"; question ids must be unique within a bank',
    ],
    [
      'an option id used twice',
      bank({
        options: [
          { id: 'a', text: 'This one' },
          { id: 'a', text: 'That one' },
        ],
      }),
      'duplicate option id "a" at position 2; option ids must be unique within a question',
    ],
    [
      'one option',
      bank({ options: [{ id: 'a', text: 'This one' }] }),
      'needs at least 2 items, but has 1 item',
    ],
    ['an empty text', bank({ explanation: '' }), 'is empty: it needs some text'],
    [
      'a text over its limit',
      bank({
        options: [
          { id: 'a', text: 'x'.repeat(1001) },
          { id: 'b', text: 'That one' },
        ],
      }),
      'is too long: it may have at most 1000 characters, but has 1001',
    ],
    [
      'a number where text belongs',
      bank({
        options: [
          { id: 'a', text: 42 },
          { id: 'b', text: 'That one' },
        ],
      }),
      'should be text, but is a whole number; put it in quotes',
    ],
    [
      'an unknown difficulty',
      bank({ difficulty: 'tricky' }),
      'must be easy, medium or hard, but is "tricky"',
    ],
    [
      'a JSON file that is not a bank',
      JSON.stringify({ name: 'package', version: '1.0.0' }),
      'this is JSON, but not a question bank: a bank is an object with formatVersion, id, version, title and questions',
    ],
    ['broken JSON', bank().replace('"title"', 'title'), 'this file is not valid JSON:'],
    [
      'a double-quoted YAML string with a backslash',
      'formatVersion: 1\nid: x.yaml\nversion: 1.0.0\ntitle: YAML\nquestions:\n  - id: q\n    prompt: "$\\sigma$"\n',
      'this file is not valid YAML:',
    ],
  ])('quotes the error for %s', (_, input, sentence) => {
    const result = parseBank(input);
    const report = result.ok ? [] : result.issues.map((issue) => issue.message);
    expect(report.join('\n')).toContain(sentence);
    expect(text).toContain(sentence);
  });
});

describe('authoring-with-ai.md', () => {
  const text = guide('authoring-with-ai.md');

  it('has a prompt to copy, which names every field and rule an assistant needs', () => {
    const [prompt] = blocks(text.split('## The prompt to copy')[1] ?? '', 'text');
    expect(prompt).toBeDefined();
    for (const field of [
      ...fieldReference.bank,
      ...fieldReference.question,
      ...fieldReference.option,
    ]) {
      expect(prompt).toContain(field.name);
    }
    expect(prompt).toMatch(/double every backslash/i);
  });

  it('advises on distractors and explanations', () => {
    expect(text).toMatch(/## Writing good distractors/);
    expect(text).toMatch(/## Writing good explanations/);
  });
});

describe('deploy.md', () => {
  const text = guide('deploy.md');

  it('covers GitHub Pages first, then Vercel, Netlify and S3', () => {
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1] ?? '');
    const order = ['GitHub Pages', 'Vercel', 'Netlify', 'S3'].map((host) =>
      headings.findIndex((heading) => heading.includes(host)),
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
