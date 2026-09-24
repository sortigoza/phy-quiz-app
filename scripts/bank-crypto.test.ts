import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openBankLink } from '../src/bank-link';
import { addBankFromText, storeBankKey } from '../src/library';
import { loadText } from '../src/load-text';
import {
  bankKeyFromJwk,
  decryptBank,
  encodeBankKey,
  importBankKey,
  parseBankLink,
} from '../src/domain/private-bank';
import { db, deleteBank, listBanks } from '../src/storage/db';
import { DEFAULT_APP_URL, run } from './bank-crypto';

function bankText(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
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
    },
    null,
    2,
  );
}

const publicUrl = 'https://a-teacher.github.io/banks/exam-prep.bank.jwe.json';

let dir: string;

/** Runs the CLI in the author's private repo, capturing what it prints. */
async function cli(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(args, {
    cwd: dir,
    stdout: (line) => out.push(line),
    stderr: (line) => err.push(line),
  });
  return { code, stdout: out.join(''), stderr: err.join('') };
}

async function writeBank(text: string, name = 'exam-prep.json'): Promise<void> {
  await writeFile(join(dir, name), text);
}

function encrypt(...extra: string[]) {
  return cli(
    'encrypt',
    'exam-prep.json',
    '--out',
    'out.bank.jwe.json',
    '--url',
    publicUrl,
    ...extra,
  );
}

/** The key carried by the link the CLI printed. */
function linkKey(stdout: string): Uint8Array {
  const link = parseBankLink(new URL(stdout.trim().split('\n').at(-1) ?? '').hash);
  if (link.kind !== 'bank-link') throw new Error(`no bank link in: ${stdout}`);
  return link.key;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'bank-crypto-'));
  await Promise.all([db.banks.clear(), db.bankKeys.clear()]);
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('bank-crypto encrypt', () => {
  it('writes the encrypted file and prints a bank link to the live app', async () => {
    await writeBank(bankText());
    const { code, stdout } = await encrypt();

    expect(code).toBe(0);
    const link = new URL(stdout.trim().split('\n').at(-1) ?? '');
    expect(`${link.origin}${link.pathname}`).toBe(DEFAULT_APP_URL);
    expect(parseBankLink(link.hash)).toMatchObject({ kind: 'bank-link', url: publicUrl });

    const jwe = await readFile(join(dir, 'out.bank.jwe.json'), 'utf8');
    expect(jwe).not.toContain('Exam preparation');
    expect(jwe).not.toContain('kth.exam-prep');
  });

  it('links to another deployment of the app when told to', async () => {
    await writeBank(bankText());
    const { stdout } = await encrypt('--app-url', 'http://localhost:5173/');
    expect(stdout).toContain('http://localhost:5173/#bank=');
  });

  it('creates the bank key on first use, and reuses it for every later edition', async () => {
    await writeBank(bankText());
    const first = await encrypt();
    const keyFile = JSON.parse(await readFile(join(dir, 'keys/kth.exam-prep.key.json'), 'utf8'));
    expect(keyFile).toMatchObject({ kty: 'oct', k: expect.any(String) });

    await writeBank(bankText({ version: '1.1.0' }));
    const second = await encrypt();
    expect(linkKey(second.stdout)).toEqual(linkKey(first.stdout));
  });

  it('replaces the key on --rotate, and warns that old links will not open new editions', async () => {
    await writeBank(bankText());
    const first = await encrypt();
    const rotated = await encrypt('--rotate');

    expect(rotated.code).toBe(0);
    expect(linkKey(rotated.stdout)).not.toEqual(linkKey(first.stdout));
    expect(rotated.stderr).toMatch(/earlier links will not open/i);
  });

  it('refuses an invalid bank with the same field-path errors as the app, writing nothing', async () => {
    const invalid = JSON.parse(bankText()) as { questions: { answer: string }[] };
    invalid.questions[0]!.answer = 'e';
    await writeBank(JSON.stringify(invalid));

    const { code, stdout, stderr } = await encrypt();
    expect(code).not.toBe(0);
    expect(stdout).toBe('');
    expect(stderr).toContain('questions[0].answer');
    expect(stderr).toContain('answer "e" does not match any option id; options are a, b');
    await expect(readFile(join(dir, 'out.bank.jwe.json'))).rejects.toThrow();
    await expect(readFile(join(dir, 'keys/kth.exam-prep.key.json'))).rejects.toThrow();
  });

  it('refuses to run without the file’s public URL, which the link needs', async () => {
    await writeBank(bankText());
    const { code, stderr } = await cli('encrypt', 'exam-prep.json', '--out', 'out.json');
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/--url/);
  });
});

describe('bank-crypto decrypt', () => {
  it('prints the plaintext bank exactly as it was', async () => {
    await writeBank(bankText());
    await encrypt();

    const { code, stdout } = await cli(
      'decrypt',
      'out.bank.jwe.json',
      '--key',
      'keys/kth.exam-prep.key.json',
    );
    expect(code).toBe(0);
    expect(stdout).toBe(bankText());
  });

  it('says so when the key does not open the file', async () => {
    await writeBank(bankText());
    await encrypt();
    await writeBank(bankText({ id: 'kth.other' }), 'other.json');
    await cli('encrypt', 'other.json', '--out', 'other.jwe.json', '--url', publicUrl);

    const { code, stderr } = await cli(
      'decrypt',
      'out.bank.jwe.json',
      '--key',
      'keys/kth.other.key.json',
    );
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/could not decrypt/i);
  });
});

describe('from the author CLI to the app', () => {
  it('opens a bank the CLI encrypted, and a second edition from the stored key alone', async () => {
    await writeBank(bankText());
    const { stdout } = await encrypt();
    const upload = { kind: 'upload', filename: 'out.bank.jwe.json' } as const;

    // What opening the bank link does: keep its key, then add the file.
    await storeBankKey(linkKey(stdout));
    const first = await addBankFromText(
      await readFile(join(dir, 'out.bank.jwe.json'), 'utf8'),
      upload,
    );
    expect(first).toMatchObject({ ok: true, status: 'added', bank: { raw: bankText() } });

    // The next edition arrives with no link at all.
    await writeBank(bankText({ version: '1.1.0', title: 'Exam preparation, revised' }));
    await encrypt();
    const second = await addBankFromText(
      await readFile(join(dir, 'out.bank.jwe.json'), 'utf8'),
      upload,
    );
    expect(second).toMatchObject({ ok: true, status: 'added' });

    expect((await listBanks()).map((bank) => bank.title).sort()).toEqual([
      'Exam preparation',
      'Exam preparation, revised',
    ]);
  });
});

describe('bank-crypto with a bank repository', () => {
  const site = 'https://a-teacher.github.io/banks/';

  function repositoryText(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify(
      {
        formatVersion: 1,
        id: 'kth.course',
        title: 'Mechanics',
        banks: [{ url: 'intro.json' }, { url: 'exam-prep.bank.jwe.json', bank: 'kth.exam-prep' }],
        ...overrides,
      },
      null,
      2,
    );
  }

  async function encryptExamPrep() {
    await writeBank(bankText());
    return cli(
      'encrypt',
      'exam-prep.json',
      '--out',
      'exam-prep.bank.jwe.json',
      '--url',
      `${site}exam-prep.bank.jwe.json`,
    );
  }

  function encryptCourse(...extra: string[]) {
    return cli(
      'encrypt',
      'course.json',
      '--out',
      'course.jwe.json',
      '--url',
      `${site}course.jwe.json`,
      ...extra,
    );
  }

  function banksOf(json: string): unknown[] {
    return (JSON.parse(json) as { banks: unknown[] }).banks;
  }

  async function keyFile(name: string): Promise<Uint8Array> {
    const key = bankKeyFromJwk(JSON.parse(await readFile(join(dir, 'keys', name), 'utf8')));
    if (!key) throw new Error(`no key in ${name}`);
    return key;
  }

  it('encrypts the repository under its own key, carrying each listed bank’s key', async () => {
    await encryptExamPrep();
    await writeBank(repositoryText(), 'course.json');

    const { code, stdout } = await encryptCourse();
    expect(code).toBe(0);
    expect(linkKey(stdout)).toEqual(await keyFile('repositories/kth.course.key.json'));

    const decrypted = await decryptBank(
      await readFile(join(dir, 'course.jwe.json'), 'utf8'),
      await importBankKey(await keyFile('repositories/kth.course.key.json')),
    );
    if (!decrypted.ok) throw new Error('did not decrypt');
    expect(banksOf(decrypted.plaintext)).toEqual([
      { url: 'intro.json' },
      {
        url: 'exam-prep.bank.jwe.json',
        key: encodeBankKey(await keyFile('kth.exam-prep.key.json')),
      },
    ]);
  });

  it('refuses a repository without an id, and one naming a bank with no key yet', async () => {
    await writeBank(repositoryText({ id: undefined }), 'course.json');
    const noId = await encryptCourse();
    expect(noId.code).not.toBe(0);
    expect(noId.stderr).toMatch(/needs an id/i);

    await writeBank(repositoryText(), 'course.json');
    const noKey = await encryptCourse();
    expect(noKey.code).not.toBe(0);
    expect(noKey.stderr).toMatch(/banks\[1\].*kth\.exam-prep.*encrypt that bank first/is);
    await expect(readFile(join(dir, 'course.jwe.json'))).rejects.toThrow();
  });

  it('refuses a repository that already carries keys in plain text', async () => {
    await writeBank(
      repositoryText({ banks: [{ url: 'a.json', key: encodeBankKey(new Uint8Array(32)) }] }),
      'course.json',
    );
    const { code, stderr } = await encryptCourse();
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/now public/i);
  });

  it('keeps a repository’s key apart from a bank’s, even when they share an id', async () => {
    await encryptExamPrep();
    await writeBank(repositoryText({ id: 'kth.exam-prep' }), 'course.json');
    const { stdout } = await encryptCourse();
    expect(linkKey(stdout)).not.toEqual(await keyFile('kth.exam-prep.key.json'));
  });

  it('warns on rotating a bank that repositories listing it must be encrypted again', async () => {
    await encryptExamPrep();
    const { stderr } = await cli(
      'encrypt',
      'exam-prep.json',
      '--out',
      'x.json',
      '--url',
      publicUrl,
      '--rotate',
    );
    expect(stderr).toMatch(/private repository listing this bank/i);
  });

  it('decrypts a repository showing bank ids, never keys', async () => {
    await encryptExamPrep();
    await writeBank(repositoryText(), 'course.json');
    await encryptCourse();
    await rm(join(dir, 'keys', 'kth.exam-prep.key.json'));
    await writeBank(repositoryText({ id: 'kth.other' }), 'other.json');

    const { code, stdout } = await cli(
      'decrypt',
      'course.jwe.json',
      '--key',
      'keys/repositories/kth.course.key.json',
    );
    expect(code).toBe(0);
    expect(stdout).not.toMatch(/"key"/);
    expect(banksOf(stdout)[1]).toEqual({
      url: 'exam-prep.bank.jwe.json',
      bank: expect.stringMatching(/unknown/i) as unknown,
    });
  });

  it('from the CLI to the app: one link opens the whole course, and later editions need no link', async () => {
    await encryptExamPrep();
    await writeBank(bankText({ id: 'kth.forces', title: 'Forces' }), 'forces.json');
    await cli(
      'encrypt',
      'forces.json',
      '--out',
      'forces.bank.jwe.json',
      '--url',
      `${site}forces.bank.jwe.json`,
    );
    await writeFile(join(dir, 'intro.json'), bankText({ id: 'kth.intro', title: 'Intro' }));
    const course = repositoryText({
      banks: [
        { url: 'intro.json' },
        { url: 'exam-prep.bank.jwe.json', bank: 'kth.exam-prep' },
        { url: 'forces.bank.jwe.json', bank: 'kth.forces' },
      ],
    });
    await writeBank(course, 'course.json');
    const { stdout } = await encryptCourse();

    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : input.toString();
      try {
        return new Response(await readFile(join(dir, url.slice(site.length)), 'utf8'));
      } catch {
        return new Response('', { status: 404 });
      }
    });
    const options = { fetch: fetchImpl as typeof fetch, online: () => true };

    const link = parseBankLink(new URL(stdout.trim().split('\n').at(-1) ?? '').hash);
    if (link.kind !== 'bank-link') throw new Error('no link');
    const opened = await openBankLink(link, options);
    expect(opened).toMatchObject({
      kind: 'repository',
      outcomes: [{ kind: 'added' }, { kind: 'added' }, { kind: 'added' }],
    });
    // The course's key and both private banks' keys.
    expect(await db.bankKeys.count()).toBe(3);

    // The next edition of the course adds a bank, and opens from the stored key alone.
    await writeFile(join(dir, 'extra.json'), bankText({ id: 'kth.extra', title: 'Extra' }));
    await writeBank(
      repositoryText({
        banks: [...(JSON.parse(course) as { banks: object[] }).banks, { url: 'extra.json' }],
      }),
      'course.json',
    );
    await encryptCourse();
    const second = await loadText(
      await readFile(join(dir, 'course.jwe.json'), 'utf8'),
      { kind: 'upload', filename: 'course.jwe.json' },
      { ...options, base: `${site}course.jwe.json` },
    );
    expect(second).toMatchObject({
      kind: 'repository',
      outcomes: [
        { kind: 'unchanged' },
        { kind: 'unchanged' },
        { kind: 'unchanged' },
        { kind: 'added' },
      ],
    });
    expect(await db.bankKeys.count()).toBe(3);

    // Removing everything the course delivered lets every key go.
    for (const bank of await listBanks()) await deleteBank(bank.key);
    expect(await db.bankKeys.count()).toBe(0);
  });
});
