import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBank } from './bank';

/**
 * The example banks are documentation, so they have to stay valid against the
 * real schema. Ticket 13 adds the standalone validation script for CI; this
 * keeps them honest in the meantime.
 */

const examplesDir = join(import.meta.dirname, '..', '..', 'examples');
const exampleFiles = readdirSync(examplesDir).filter((name) => name.endsWith('.json'));

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
