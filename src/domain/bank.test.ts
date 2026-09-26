import { describe, expect, it } from 'vitest';
import { bankLanguage, compareVersions, fingerprint, parseBank } from './bank';

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

describe('compareVersions', () => {
  it('orders versions numerically, with a release above its pre-releases', () => {
    const versions = ['1.10.0', '1.2.0', '2.0.0-beta', '2.0.0', '1.2.0+build', '0.9.9'];
    expect([...versions].sort(compareVersions)).toEqual([
      '0.9.9',
      '1.2.0',
      '1.2.0+build',
      '1.10.0',
      '2.0.0-beta',
      '2.0.0',
    ]);
  });
});

/** The first question of a bank as JSON text, with `prompt` spliced in raw, unescaped. */
function jsonWithRawPrompt(rawPrompt: string): string {
  const text = JSON.stringify(validBank());
  const prompt = (validBank()['questions'] as Record<string, unknown>[])[0]!['prompt'] as string;
  return text.replace(JSON.stringify(prompt), `"${rawPrompt}"`);
}

describe('the backslash detector', () => {
  it.each([
    ['\\times', 'a tab', '\\times'],
    ['\\frac{1}{2}', 'a form feed', '\\frac'],
    ['\\beta', 'a backspace', '\\beta'],
    ['\\rho', 'a carriage return', '\\rho'],
    ['\\nabla', 'a line break', '\\nabla'],
    ['\\nu_0', 'a line break', '\\nu'],
  ])('reports "%s" in JSON as an unescaped LaTeX command, naming the field', (latex, what, command) => {
    const result = parseBank(jsonWithRawPrompt(`What is $5 ${latex} 3$?`));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find((found) => found.path === 'questions[0].prompt');
    expect(issue?.message).toMatch(/unescaped LaTeX command/);
    expect(issue?.message).toContain(what);
    expect(issue?.message).toContain(command);
    expect(issue?.message).toContain(`\\${command}`);
  });

  it('turns the parse error of a backslash JSON cannot read into the same advice', () => {
    const result = parseBank(jsonWithRawPrompt('What is $\\alpha$?'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toMatch(/not valid JSON/);
    expect(result.issues[0]?.message).toMatch(/unescaped LaTeX command/);
    expect(result.issues[0]?.message).toContain('\\alpha');
  });

  it('leaves line breaks that are only Markdown alone', () => {
    const result = parseBank(
      jsonWithRawPrompt('Which holds?\\n\\n- energy\\n- $u = at$\\n- nothing else'),
    );
    expect(issueText(result)).toBe('');
  });

  it('catches the same mistake in a double-quoted YAML string', () => {
    const yaml = [
      'formatVersion: 1',
      'id: se.kth.mechanics.kinematics',
      'version: 1.0.0',
      'title: Kinematics',
      'questions:',
      '  - id: q1',
      '    prompt: "What is $\\alpha$?"',
      '    options: [{ id: a, text: one }, { id: b, text: two }]',
      '    answer: a',
      '    explanation: Because.',
    ].join('\n');
    const result = parseBank(yaml);
    expect(result.ok).toBe(false);
    expect(issuePaths(result)).toContain('questions[0].prompt');
    expect(issueText(result)).toMatch(/unescaped LaTeX command/);
  });
});

describe('YAML banks', () => {
  const yaml = [
    'formatVersion: 1',
    'id: se.kth.mechanics.kinematics',
    'version: 1.0.0',
    'title: Kinematics in one dimension',
    'questions:',
    '  - id: free-fall-speed',
    "    prompt: 'A ball falls from rest for $1.00\\,\\mathrm{s}$. What is its speed?'",
    '    options:',
    "      - { id: a, text: '$4.91\\,\\mathrm{m/s}$', why: 'That is the average speed.' }",
    "      - { id: b, text: '$9.81\\,\\mathrm{m/s}$' }",
    '    answer: b',
    "    explanation: 'From rest, $v = gt$.'",
  ].join('\n');

  it('produces exactly the bank the same file written as JSON produces', () => {
    expect(parseBank(yaml)).toEqual(parse(validBank()));
    expect(parseBank(yaml).ok).toBe(true);
  });

  it('produces exactly the issues the same broken file written as JSON produces', () => {
    const brokenYaml = yaml
      .replace('answer: b', 'answer: e')
      .replace('version: 1.0.0', 'version: 1.0.0\ntitel: typo');
    const brokenJson = validBank({ titel: 'typo' });
    (brokenJson['questions'] as Record<string, unknown>[])[0]!['answer'] = 'e';
    const fromYaml = parseBank(brokenYaml);
    expect(fromYaml.ok).toBe(false);
    expect(fromYaml).toEqual(parse(brokenJson));
  });

  it('reports a YAML syntax error with where it is', () => {
    const result = parseBank('formatVersion: 1\nquestions:\n  - id: a\n   prompt: bad indent');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.message).toMatch(/not valid YAML/);
    expect(result.issues[0]?.message).toMatch(/line \d+/);
  });

  it('says plainly when YAML is not a question bank', () => {
    const result = parseBank('name: my-package\nversion: 1.0.0');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues).toEqual([{ path: '', message: expect.stringMatching(/not a question bank/) }]);
  });
});

describe('issue messages a teacher can act on', () => {
  function messageAt(result: ReturnType<typeof parseBank>, path: string): string | undefined {
    return result.ok ? undefined : result.issues.find((issue) => issue.path === path)?.message;
  }

  it('says a required field is missing', () => {
    const bank = validBank();
    delete (bank['questions'] as Record<string, unknown>[])[0]!['explanation'];
    expect(messageAt(parse(bank), 'questions[0].explanation')).toMatch(/missing/);
  });

  it('names an unknown field at its own path and suggests the field it resembles', () => {
    const bank = validBank();
    (bank['questions'] as Record<string, unknown>[])[0]!['explaination'] = 'typo';
    const message = messageAt(parse(bank), 'questions[0].explaination');
    expect(message).toMatch(/unknown field/);
    expect(message).toMatch(/did you mean "explanation"/);
  });

  it('reports each unknown field of one object separately', () => {
    expect(issuePaths(parse(validBank({ titel: 'a', auther: 'b' })))).toEqual(
      expect.arrayContaining(['titel', 'auther']),
    );
  });

  it('says what type a field should be', () => {
    expect(messageAt(parse(validBank({ title: 42 })), 'title')).toMatch(/should be text/);
    expect(messageAt(parse(validBank({ questions: {} })), 'questions')).toMatch(/should be a list/);
    expect(messageAt(parse(validBank({ defaultQuestionCount: 2.5 })), 'defaultQuestionCount')).toMatch(
      /whole number/,
    );
  });

  it('gives lengths and counts in plain words', () => {
    expect(messageAt(parse(validBank({ title: '' })), 'title')).toMatch(/is empty/);
    expect(messageAt(parse(validBank({ title: 'x'.repeat(201) })), 'title')).toMatch(
      /at most 200 characters/,
    );
    expect(messageAt(parse(validBank({ questions: [] })), 'questions')).toMatch(
      /at least 1 item/,
    );
  });

  it('lists the allowed values of a field that has few', () => {
    const bank = validBank();
    (bank['questions'] as Record<string, unknown>[])[0]!['difficulty'] = 'tricky';
    expect(messageAt(parse(bank), 'questions[0].difficulty')).toMatch(/easy, medium or hard/);
  });

  it('keeps no Zod wording anywhere', () => {
    const bank = validBank({ title: 42, titel: 'x', questions: [{ id: 1 }], version: '1' });
    expect(issueText(parse(bank))).not.toMatch(/Invalid input|Too small|Too big|Unrecognized key/);
  });
});
