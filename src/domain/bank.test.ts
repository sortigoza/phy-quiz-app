import { describe, expect, it } from 'vitest';
import { bankLanguage, fingerprint, parseBank } from './bank';

/** A minimal bank that satisfies every rule. Tests mutate copies of this. */
function validBank(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    id: 'se.kth.mechanics.kinematics',
    version: '1.0.0',
    title: 'Kinematics in one dimension',
    questions: [
      {
        id: 'free-fall-speed',
        prompt: 'A ball falls from rest for $1.00\\,\\mathrm{s}$. What is its speed?',
        options: [
          { id: 'a', text: '$4.91\\,\\mathrm{m/s}$', why: 'That is the average speed.' },
          { id: 'b', text: '$9.81\\,\\mathrm{m/s}$' },
        ],
        answer: 'b',
        explanation: 'From rest, $v = gt$.',
      },
    ],
    ...overrides,
  };
}

function parse(bank: unknown) {
  return parseBank(JSON.stringify(bank));
}

/** The issue paths of a failed parse, for asserting where an error was reported. */
function issuePaths(result: ReturnType<typeof parseBank>): string[] {
  return result.ok ? [] : result.issues.map((issue) => issue.path);
}

function issueText(result: ReturnType<typeof parseBank>): string {
  return result.ok
    ? ''
    : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
}

describe('parseBank', () => {
  it('accepts a minimal valid bank', () => {
    const result = parse(validBank());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bank.id).toBe('se.kth.mechanics.kinematics');
    expect(result.bank.questions).toHaveLength(1);
  });

  it('defaults a question type to single-choice', () => {
    const result = parse(validBank());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bank.questions[0]?.type).toBe('single-choice');
  });

  it('accepts every optional field', () => {
    const result = parse(
      validBank({
        $schema: 'https://example.test/schema/bank-v1.schema.json',
        description: 'Constant acceleration and free fall.',
        author: 'A. Teacher',
        license: 'CC-BY-4.0',
        language: 'en',
        tags: ['mechanics'],
        defaultQuestionCount: 10,
      }),
    );
    expect(issueText(result)).toBe('');
    expect(result.ok).toBe(true);
  });

  describe('rejects structurally broken input', () => {
    it('reports malformed JSON as a single readable issue rather than throwing', () => {
      const result = parseBank('{ not json');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.message).toMatch(/not valid json/i);
    });

    it('rejects a bank that is not an object', () => {
      expect(parseBank('[]').ok).toBe(false);
      expect(parseBank('"a string"').ok).toBe(false);
      expect(parseBank('null').ok).toBe(false);
    });

    it('says plainly when valid JSON is not a question bank at all', () => {
      for (const text of ['{"name": "my-package", "version": "1.0.0"}', '[]', '42']) {
        const result = parseBank(text);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]?.message).toMatch(/not a question bank/i);
      }
    });

    it('rejects an unknown format version, naming the version it understands', () => {
      const result = parse(validBank({ formatVersion: 2 }));
      expect(result.ok).toBe(false);
      expect(issueText(result)).toMatch(/formatVersion/);
    });
  });

  describe('rejects unknown keys, so a typo cannot pass silently', () => {
    it('at the top level', () => {
      const result = parse(validBank({ titel: 'oops' }));
      expect(result.ok).toBe(false);
      expect(issueText(result)).toMatch(/titel/);
    });

    it('in a question', () => {
      const bank = validBank();
      (bank['questions'] as Record<string, unknown>[])[0]!['explaination'] = 'typo';
      const result = parse(bank);
      expect(result.ok).toBe(false);
      expect(issueText(result)).toMatch(/explaination/);
    });

    it('in an option', () => {
      const bank = validBank();
      const question = (bank['questions'] as Record<string, unknown>[])[0]!;
      (question['options'] as Record<string, unknown>[])[0]!['correct'] = true;
      const result = parse(bank);
      expect(result.ok).toBe(false);
      expect(issueText(result)).toMatch(/correct/);
    });
  });

  describe('enforces the rules that make a bank gradeable', () => {
    it('requires the answer to name an existing option, and says which exist', () => {
      const bank = validBank();
      (bank['questions'] as Record<string, unknown>[])[0]!['answer'] = 'e';
      const result = parse(bank);
      expect(result.ok).toBe(false);
      expect(issuePaths(result)).toContain('questions[0].answer');
      expect(issueText(result)).toMatch(/does not match any option id/i);
      expect(issueText(result)).toMatch(/a, b/);
    });

    it('rejects duplicate question ids', () => {
      const bank = validBank();
      const questions = bank['questions'] as Record<string, unknown>[];
      questions.push({ ...questions[0]! });
      const result = parse(bank);
      expect(result.ok).toBe(false);
      expect(issueText(result)).toMatch(/duplicate question id/i);
      expect(issueText(result)).toMatch(/free-fall-speed/);
    });

    it('rejects duplicate option ids within a question', () => {
      const bank = validBank();
      const question = (bank['questions'] as Record<string, unknown>[])[0]!;
      question['options'] = [
        { id: 'a', text: 'first' },
        { id: 'a', text: 'second' },
      ];
      const result = parse(bank);
      expect(result.ok).toBe(false);
      expect(issuePaths(result)).toContain('questions[0].options');
      expect(issueText(result)).toMatch(/duplicate option id/i);
    });

    it('requires an explanation, because a bank without one is a scoreboard', () => {
      const bank = validBank();
      delete (bank['questions'] as Record<string, unknown>[])[0]!['explanation'];
      const result = parse(bank);
      expect(result.ok).toBe(false);
      expect(issuePaths(result)).toContain('questions[0].explanation');
    });

    it('requires at least two options', () => {
      const bank = validBank();
      const question = (bank['questions'] as Record<string, unknown>[])[0]!;
      question['options'] = [{ id: 'a', text: 'only one' }];
      question['answer'] = 'a';
      expect(parse(bank).ok).toBe(false);
    });

    it('requires at least one question', () => {
      expect(parse(validBank({ questions: [] })).ok).toBe(false);
    });

    it('requires a semver bank version', () => {
      expect(parse(validBank({ version: 'v1' })).ok).toBe(false);
      expect(parse(validBank({ version: '1.0' })).ok).toBe(false);
      expect(parse(validBank({ version: '1.0.0' })).ok).toBe(true);
      expect(parse(validBank({ version: '1.0.0-draft.2' })).ok).toBe(true);
    });

    it('constrains the bank id to a shareable shape', () => {
      expect(parse(validBank({ id: 'Has Spaces' })).ok).toBe(false);
      expect(parse(validBank({ id: 'ab' })).ok).toBe(false);
      expect(parse(validBank({ id: 'kth.mechanics_1-a' })).ok).toBe(true);
    });
  });

  it('reports every problem in one pass rather than stopping at the first', () => {
    const bank = validBank({ version: 'nope', titel: 'typo' });
    const result = parse(bank);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('never returns a partial bank when it fails', () => {
    const result = parse(validBank({ version: 'nope' }));
    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty('bank');
  });
});

describe('fingerprint', () => {
  it('is eight hex characters', async () => {
    await expect(fingerprint('{}')).resolves.toMatch(/^[0-9a-f]{8}$/);
  });

  it('is stable for identical bytes', async () => {
    const text = JSON.stringify(validBank());
    expect(await fingerprint(text)).toBe(await fingerprint(text));
  });

  it('changes when a single character changes', async () => {
    const before = await fingerprint(JSON.stringify(validBank()));
    const after = await fingerprint(JSON.stringify(validBank({ title: 'Kinematics!' })));
    expect(before).not.toBe(after);
  });

  it('is computed over exact bytes, so formatting alone changes it', async () => {
    const bank = validBank();
    const compact = await fingerprint(JSON.stringify(bank));
    const pretty = await fingerprint(JSON.stringify(bank, null, 2));
    expect(compact).not.toBe(pretty);
  });
});

describe('bankLanguage', () => {
  function languageOf(overrides: Record<string, unknown>): string {
    const result = parse(validBank(overrides));
    if (!result.ok) throw new Error(issueText(result));
    return bankLanguage(result.bank);
  }

  it("is the bank's declared language", () => {
    expect(languageOf({ language: 'sv' })).toBe('sv');
  });

  it('is English when the bank declares none', () => {
    expect(languageOf({})).toBe('en');
  });
});
