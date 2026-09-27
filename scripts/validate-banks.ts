import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseBank, type BankIssue } from '../src/domain/bank';
import { isBankRepository, parseBankRepository } from '../src/domain/bank-repository';
import { readPrivateBankHeader } from '../src/domain/private-bank';

/**
 * Checks bank files the way the app checks them on load, from the command line.
 *
 *   pnpm validate-banks <file-or-directory>...
 *
 * A directory is searched, with its subdirectories, for `.json`, `.yaml` and
 * `.yml` files. Banks and bank repositories are both understood; a repository
 * must also have every relative entry on disk beside it. A private bank is
 * ciphertext and is skipped: validate its plaintext before encrypting.
 *
 * CI runs it on `examples/`. Exits 1 when any file fails, 2 on a usage error.
 */

const USAGE = 'Usage: pnpm validate-banks <file-or-directory>...';

const BANK_EXTENSIONS = new Set(['.json', '.yaml', '.yml']);

export type Io = {
  /** The directory relative paths are read from: the author's, not this repo's. */
  cwd: string;
  /** Writes exactly the text given: lines carry their own newlines. */
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

type Verdict =
  | { status: 'passed'; summary: string }
  | { status: 'failed'; issues: BankIssue[] }
  | { status: 'skipped'; reason: string };

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Every bank file at a path: the file itself, or those in a directory tree, in order. */
async function bankFilesAt(path: string): Promise<string[]> {
  if (!(await stat(path)).isDirectory()) return [path];
  const names = await readdir(path, { recursive: true });
  return names
    .filter((name) => BANK_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort()
    .map((name) => resolve(path, name));
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function checkRepository(text: string, path: string): Promise<Verdict> {
  const parsed = parseBankRepository(text, pathToFileURL(path).href);
  if (!parsed.ok) return { status: 'failed', issues: parsed.issues };

  const issues: BankIssue[] = [];
  for (const [index, entry] of parsed.repository.entries.entries()) {
    // Entries on the web are the app's to fetch; entries beside the file must be there.
    if (entry.url?.startsWith('file:') && !(await isFile(fileURLToPath(entry.url)))) {
      issues.push({
        path: `banks[${index}].url`,
        message: `"${entry.given}" is not beside this repository, so the app could not load it`,
      });
    }
  }
  if (issues.length > 0) return { status: 'failed', issues };
  const count = parsed.repository.entries.length;
  return {
    status: 'passed',
    summary: `bank repository "${parsed.repository.title}", ${plural(count, 'bank')}`,
  };
}

async function verdictFor(path: string): Promise<Verdict> {
  const text = await readFile(path, 'utf8');
  if (readPrivateBankHeader(text)) {
    return {
      status: 'skipped',
      reason: 'a private bank: validate its plaintext before encrypting',
    };
  }
  if (isBankRepository(text)) return checkRepository(text, path);

  const parsed = parseBank(text);
  if (!parsed.ok) return { status: 'failed', issues: parsed.issues };
  return {
    status: 'passed',
    summary: `"${parsed.bank.title}", ${plural(parsed.bank.questions.length, 'question')}`,
  };
}

/** Checks every file named, and returns the process exit code. */
export async function run(args: string[], io: Io): Promise<number> {
  if (args.length === 0) {
    io.stderr(`${USAGE}\n`);
    return 2;
  }

  let failed = 0;
  let checked = 0;
  for (const arg of args) {
    const path = resolve(io.cwd, arg);
    let files: string[];
    try {
      files = await bankFilesAt(path);
    } catch {
      io.stderr(`✗ ${arg}: no such file or directory\n`);
      failed++;
      continue;
    }

    for (const file of files) {
      const shown = relative(io.cwd, file) || file;
      const verdict = await verdictFor(file);
      checked++;
      if (verdict.status === 'skipped') io.stdout(`- ${shown}: skipped, ${verdict.reason}\n`);
      else if (verdict.status === 'passed') io.stdout(`✓ ${shown}: ${verdict.summary}\n`);
      else {
        failed++;
        io.stdout(`✗ ${shown}\n`);
        for (const issue of verdict.issues) {
          io.stdout(`    ${issue.path === '' ? '' : `${issue.path}: `}${issue.message}\n`);
        }
      }
    }
  }

  io.stdout(`\n${plural(checked, 'file')} checked, ${failed} failed.\n`);
  return failed > 0 ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2), {
    // pnpm runs scripts from this repo; the author's paths are relative to where they typed the command.
    cwd: process.env.INIT_CWD ?? process.cwd(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
