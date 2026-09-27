import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { encryptBank, generateBankKey } from '../src/domain/private-bank';
import { run } from './validate-banks';

function bankText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    formatVersion: 1,
    id: 'kth.exam-prep',
    version: '1.0.0',
    title: 'Exam preparation',
    questions: [
      {
        id: 'q1',
        prompt: 'A ball falls from rest for one second. What is its speed?',
        options: [
          { id: 'a', text: '4.91 m/s' },
          { id: 'b', text: '9.81 m/s' },
        ],
        answer: 'b',
        explanation: 'From rest, v = gt.',
      },
    ],
    ...overrides,
  });
}

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'validate-banks-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Runs the CLI from the temporary directory, capturing what it prints. */
async function cli(...args: string[]) {
  let stdout = '';
  let stderr = '';
  const code = await run(args, {
    cwd: dir,
    stdout: (text) => (stdout += text),
    stderr: (text) => (stderr += text),
  });
  return { code, stdout, stderr };
}

describe('validate-banks', () => {
  it('passes a valid bank, naming it and counting its questions', async () => {
    await writeFile(join(dir, 'bank.json'), bankText());
    const { code, stdout } = await cli('bank.json');
    expect(code).toBe(0);
    expect(stdout).toContain('bank.json');
    expect(stdout).toContain('Exam preparation');
    expect(stdout).toContain('1 question');
  });

  it('fails an invalid bank, with every issue at its path', async () => {
    await writeFile(join(dir, 'bank.json'), bankText({ version: '1.0', colour: 'blue' }));
    const { code, stdout } = await cli('bank.json');
    expect(code).toBe(1);
    expect(stdout).toContain('version: bank version must be semver');
    expect(stdout).toContain('colour: unknown field "colour"');
  });

  it('validates YAML banks with the same rules', async () => {
    await writeFile(
      join(dir, 'bank.yaml'),
      'formatVersion: 1\nid: kth.yaml\nversion: 1.0.0\ntitle: A YAML bank\nquestions: []\n',
    );
    const { code, stdout } = await cli('bank.yaml');
    expect(code).toBe(1);
    expect(stdout).toContain('questions: needs at least 1 item');
  });

  it('validates every bank in a directory, and fails if any one fails', async () => {
    await mkdir(join(dir, 'banks', 'nested'), { recursive: true });
    await writeFile(join(dir, 'banks', 'good.json'), bankText());
    await writeFile(join(dir, 'banks', 'nested', 'bad.json'), bankText({ formatVersion: 2 }));
    await writeFile(join(dir, 'banks', 'notes.txt'), 'not a bank');
    const { code, stdout } = await cli('banks');
    expect(code).toBe(1);
    expect(stdout).toContain('good.json');
    expect(stdout).toContain('bad.json');
    expect(stdout).not.toContain('notes.txt');
  });

  it('passes a repository whose relative entries exist beside it', async () => {
    await writeFile(join(dir, 'bank.json'), bankText());
    await writeFile(
      join(dir, 'course.json'),
      JSON.stringify({ formatVersion: 1, title: 'A course', banks: [{ url: 'bank.json' }] }),
    );
    const { code, stdout } = await cli('course.json');
    expect(code).toBe(0);
    expect(stdout).toContain('A course');
  });

  it('fails a repository that lists a bank missing from beside it', async () => {
    await writeFile(
      join(dir, 'course.json'),
      JSON.stringify({ formatVersion: 1, title: 'A course', banks: [{ url: 'missing.json' }] }),
    );
    const { code, stdout } = await cli('course.json');
    expect(code).toBe(1);
    expect(stdout).toContain('banks[0].url');
    expect(stdout).toContain('missing.json');
  });

  it('skips a private bank without failing, since only its plaintext can be checked', async () => {
    const encrypted = await encryptBank(bankText(), generateBankKey());
    await writeFile(join(dir, 'exam.bank.jwe.json'), encrypted);
    const { code, stdout } = await cli('exam.bank.jwe.json');
    expect(code).toBe(0);
    expect(stdout).toMatch(/private/i);
  });

  it('fails when a path does not exist', async () => {
    const { code, stderr } = await cli('nowhere.json');
    expect(code).toBe(1);
    expect(stderr).toContain('nowhere.json');
  });

  it('prints usage and fails when given nothing to check', async () => {
    const { code, stderr } = await cli();
    expect(code).toBe(2);
    expect(stderr).toMatch(/usage/i);
  });

  it('passes every example bank that ships with the app', async () => {
    const { code, stdout } = await cli(join(import.meta.dirname, '..', 'examples'));
    expect(stdout).toContain('energy-and-momentum.yaml');
    expect(code).toBe(0);
  });
});
