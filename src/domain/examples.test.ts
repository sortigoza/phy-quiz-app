import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBank } from './bank';
import { isBankRepository, parseBankRepository } from './bank-repository';

/**
 * The example banks are documentation, so they have to stay valid against the
 * real schema, and the example repository has to list only banks that exist. Ticket 13 adds the standalone validation script for CI; this
 * keeps them honest in the meantime.
 */

const examplesDir = join(import.meta.dirname, '..', '..', 'examples');
const read = (filename: string) => readFileSync(join(examplesDir, filename), 'utf8');
const jsonFiles = readdirSync(examplesDir).filter((name) => name.endsWith('.json'));
const exampleFiles = jsonFiles.filter((name) => !isBankRepository(read(name)));
const repositoryFiles = jsonFiles.filter((name) => isBankRepository(read(name)));

describe('the example banks', () => {
  it('exist', () => {
    expect(exampleFiles.length).toBeGreaterThan(0);
  });

  it.each(exampleFiles)('%s validates against the bank schema', (filename) => {
    const result = parseBank(readFileSync(join(examplesDir, filename), 'utf8'));
    const problems = result.ok
      ? ''
      : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    expect(problems).toBe('');
    expect(result.ok).toBe(true);
  });

  it.each(exampleFiles)('%s explains its distractors', (filename) => {
    const result = parseBank(readFileSync(join(examplesDir, filename), 'utf8'));
    if (!result.ok) throw new Error('bank did not parse');
    for (const question of result.bank.questions) {
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
