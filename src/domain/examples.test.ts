import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Ajv } from 'ajv';
import { describe, expect, it } from 'vitest';
import { BANK_SCHEMA_PATH, bankJsonSchema } from '../docs/bank-json-schema';
import { parseBank, readDocument } from './bank';
import { isBankRepository, parseBankRepository } from './bank-repository';

/**
 * The example banks are documentation, so they have to stay valid against the
 * real schema, and the example repository has to list only banks that exist.
 * CI also runs `pnpm validate-banks examples`, the check a teacher can run on
 * their own banks.
 */

const examplesDir = join(import.meta.dirname, '..', '..', 'examples');
const read = (filename: string) => readFileSync(join(examplesDir, filename), 'utf8');
const files = readdirSync(examplesDir).filter((name) => /\.(json|ya?ml)$/.test(name));
const exampleFiles = files.filter((name) => !isBankRepository(read(name)));
const repositoryFiles = files.filter((name) => isBankRepository(read(name)));

function parsed(filename: string) {
  const result = parseBank(read(filename));
  if (!result.ok) throw new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join('\n'));
  return result.bank;
}

describe('the example banks', () => {
  it('include at least three of around ten questions, one of them in YAML', () => {
    const tenish = exampleFiles.filter((name) => {
      const count = parsed(name).questions.length;
      return count >= 8 && count <= 12;
    });
    expect(tenish.length).toBeGreaterThanOrEqual(3);
    expect(tenish.some((name) => /\.ya?ml$/.test(name))).toBe(true);
  });

  it.each(exampleFiles)('%s validates against the bank schema', (filename) => {
    const result = parseBank(read(filename));
    const problems = result.ok
      ? ''
      : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    expect(problems).toBe('');
    expect(result.ok).toBe(true);
  });

  it.each(exampleFiles)('%s satisfies the published JSON Schema', (filename) => {
    const validate = new Ajv({ strict: false }).compile(bankJsonSchema());
    const document = readDocument(read(filename));
    if (!document.ok) throw new Error(document.issue.message);
    expect(validate(document.document), JSON.stringify(validate.errors)).toBe(true);
  });

  it.each(exampleFiles)('%s declares the published JSON Schema for editors', (filename) => {
    // YAML editors read the schema from a modeline comment rather than a key.
    const declaration = filename.endsWith('.json')
      ? parsed(filename).$schema
      : /^# yaml-language-server: \$schema=(\S+)/.exec(read(filename))?.[1];
    expect(declaration).toMatch(new RegExp(`/${BANK_SCHEMA_PATH.replaceAll('.', '\\.')}$`));
  });

  it.each(exampleFiles)('%s explains every question and every distractor', (filename) => {
    for (const question of parsed(filename).questions) {
      expect(question.explanation.length).toBeGreaterThan(40);
      const wrong = question.options.filter((option) => option.id !== question.answer);
      expect(wrong.every((option) => typeof option.why === 'string' && option.why.length > 0)).toBe(
        true,
      );
    }
  });
});

describe('the example repository', () => {
  it('exists', () => {
    expect(repositoryFiles).toEqual(['physics-course.json']);
  });

  it.each(repositoryFiles)('%s lists every example bank, and nothing else', (filename) => {
    const base = 'https://example.org/examples/';
    const result = parseBankRepository(read(filename), base + filename);
    if (!result.ok) throw new Error(result.issues.map((issue) => issue.message).join('\n'));
    const listed = result.repository.entries.map((entry) => entry.url?.slice(base.length));
    expect(listed.sort()).toEqual([...exampleFiles].sort());
  });
});
