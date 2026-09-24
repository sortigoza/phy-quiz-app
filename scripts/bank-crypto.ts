import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseBank, type BankIssue } from '../src/domain/bank';
import { isBankRepository, parseBankRepository } from '../src/domain/bank-repository';
import {
  bankKeyFromJwk,
  bankKeyToJwk,
  bankLink,
  decryptBank,
  encodeBankKey,
  encryptBank,
  generateBankKey,
  readPrivateBankHeader,
} from '../src/domain/private-bank';

/**
 * The author CLI for private banks and private repositories. See SPEC
 * sections 3.4.3 and 3.5.1.
 *
 *   pnpm bank-crypto encrypt <bank-or-repository-file> --out <file> --url <public URL> [--app-url <url>] [--rotate]
 *   pnpm bank-crypto decrypt <file> --key <key-file>
 *
 * A teacher runs it from their private repo, where the plaintext banks and
 * their keys live. It validates with the app's own parsers, so the two cannot
 * disagree about what a valid bank or repository is.
 */

/** The live app, which bank links open unless `--app-url` says otherwise. */
export const DEFAULT_APP_URL = 'https://sortigoza.github.io/phy-quiz-app/';

const USAGE = `Usage:
  pnpm bank-crypto encrypt <bank-or-repository-file> --out <file> --url <public URL of that file> [--app-url <url>] [--rotate]
  pnpm bank-crypto decrypt <file> --key <key-file>`;

export type Io = {
  /** The directory relative paths are read from: the author's, not this repo's. */
  cwd: string;
  /** Writes exactly the text given: lines carry their own newlines. */
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

class CliError extends Error {}

async function readText(path: string, what: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    throw new CliError(`Could not read the ${what} ${path}.`);
  }
}

async function readKeyFile(path: string): Promise<Uint8Array> {
  let jwk: unknown;
  try {
    jwk = JSON.parse(await readText(path, 'key file'));
  } catch (cause) {
    if (cause instanceof CliError) throw cause;
    jwk = null;
  }
  const key = bankKeyFromJwk(jwk);
  if (!key)
    throw new CliError(`${path} is not a bank key: expected a JWK with kty "oct" and a 256-bit k.`);
  return key;
}

async function exists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

function requireUrl(value: string | undefined, flag: string): string {
  if (value === undefined) throw new CliError(`${flag} is required.\n\n${USAGE}`);
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    // Reported below.
  }
  throw new CliError(`${flag} must be a web address starting with https://, not ${value}.`);
}

function problemList(issues: BankIssue[]): string {
  return issues
    .map(({ path, message }) => (path ? `  ${path} ${message}` : `  ${message}`))
    .join('\n');
}

const KEY_SUFFIX = '.key.json';

/** What a key is for. Repository keys live apart, so a repository never shares a bank's key by sharing its id. */
type KeyOwner = { kind: 'bank' | 'repository'; id: string };

function keyPathFor(io: Io, { kind, id }: KeyOwner): string {
  const folder = kind === 'bank' ? 'keys' : join('keys', 'repositories');
  return resolve(io.cwd, folder, `${id}${KEY_SUFFIX}`);
}

function rotationWarning({ kind, id }: KeyOwner): string {
  const repositories =
    kind === 'bank'
      ? ' Encrypt every private repository listing this bank again, or its key there goes out of date.'
      : '';
  return `Rotated the key for ${id}. Earlier links will not open new editions: send the new link to everyone who should keep access.${repositories}\n`;
}

/**
 * The key for a bank or repository: the one in `keys/<id>.key.json` (or
 * `keys/repositories/<id>.key.json`), created there on first use, or replaced
 * when rotating.
 */
async function keyFor(io: Io, owner: KeyOwner, rotate: boolean): Promise<Uint8Array> {
  const keyPath = keyPathFor(io, owner);
  if ((await exists(keyPath)) && !rotate) return readKeyFile(keyPath);
  if (rotate && (await exists(keyPath))) io.stderr(rotationWarning(owner));
  const key = generateBankKey();
  await mkdir(dirname(keyPath), { recursive: true });
  await writeFile(keyPath, `${JSON.stringify(bankKeyToJwk(key), null, 2)}\n`, { mode: 0o600 });
  return key;
}

type EncryptTarget = {
  file: string;
  out: string;
  fileUrl: string;
  appUrl: string;
  rotate: boolean;
};

/**
 * Encrypts a repository under its own key, with each entry that names a bank
 * carrying that bank's key instead. The key-bearing plaintext exists only in
 * memory: it is encrypted in the same step, and never written.
 */
async function encryptRepository(plaintext: string, target: EncryptTarget, io: Io): Promise<void> {
  const parsed = parseBankRepository(plaintext);
  if (!parsed.ok) {
    throw new CliError(
      `${target.file} is not a valid bank repository. Nothing was encrypted.\n${problemList(parsed.issues)}`,
    );
  }
  const { id, title } = parsed.repository;
  if (id === undefined) {
    throw new CliError(
      `${target.file} needs an id to be encrypted: it names the repository's key file, which every edition shares.`,
    );
  }

  // Validated above, so the entries have exactly the shape the schema allows.
  const document = JSON.parse(plaintext) as { banks: { url: string; bank?: string }[] };
  const missing: string[] = [];
  const banks = [];
  for (const [index, { bank, ...entry }] of document.banks.entries()) {
    if (bank === undefined) {
      banks.push(entry);
      continue;
    }
    const keyPath = keyPathFor(io, { kind: 'bank', id: bank });
    if (!(await exists(keyPath))) {
      missing.push(
        `  banks[${index}] names ${bank}, which has no key in keys/ yet; encrypt that bank first.`,
      );
      continue;
    }
    banks.push({ ...entry, key: encodeBankKey(await readKeyFile(keyPath)) });
  }
  if (missing.length > 0) {
    throw new CliError(`Nothing was encrypted.\n${missing.join('\n')}`);
  }

  const key = await keyFor(io, { kind: 'repository', id }, target.rotate);
  const keyed = JSON.stringify({ ...document, banks }, null, 2);
  await writeFile(resolve(io.cwd, target.out), `${await encryptBank(keyed, key)}\n`);
  const privateCount = banks.filter((entry) => 'key' in entry).length;
  io.stdout(
    `Encrypted ${title}, listing ${banks.length} banks (${privateCount} private), to ${target.out}. Publish it at ${target.fileUrl}, then send this bank link:\n`,
  );
  io.stdout(`${bankLink(target.appUrl, target.fileUrl, key)}\n`);
}

async function encrypt(args: string[], io: Io): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      url: { type: 'string' },
      'app-url': { type: 'string' },
      rotate: { type: 'boolean', default: false },
    },
  });
  const [bankFile] = positionals;
  if (bankFile === undefined || positionals.length > 1) throw new CliError(USAGE);
  if (values.out === undefined) throw new CliError(`--out is required.\n\n${USAGE}`);
  const fileUrl = requireUrl(values.url, '--url');
  const appUrl = requireUrl(values['app-url'] ?? DEFAULT_APP_URL, '--app-url');

  const plaintext = await readText(resolve(io.cwd, bankFile), 'bank file');
  if (isBankRepository(plaintext)) {
    const target = { file: bankFile, out: values.out, fileUrl, appUrl, rotate: values.rotate };
    return encryptRepository(plaintext, target, io);
  }
  const parsed = parseBank(plaintext);
  if (!parsed.ok) {
    throw new CliError(
      `${bankFile} is not a valid bank. Nothing was encrypted.\n${problemList(parsed.issues)}`,
    );
  }

  const key = await keyFor(io, { kind: 'bank', id: parsed.bank.id }, values.rotate);

  await writeFile(resolve(io.cwd, values.out), `${await encryptBank(plaintext, key)}\n`);
  io.stdout(
    `Encrypted ${parsed.bank.title} v${parsed.bank.version} to ${values.out}. Publish it at ${fileUrl}, then send this bank link:\n`,
  );
  io.stdout(`${bankLink(appUrl, fileUrl, key)}\n`);
}

async function decrypt(args: string[], io: Io): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { key: { type: 'string' } },
  });
  const [file] = positionals;
  if (file === undefined || positionals.length > 1) throw new CliError(USAGE);
  if (values.key === undefined) throw new CliError(`--key is required.\n\n${USAGE}`);

  const text = await readText(resolve(io.cwd, file), 'file');
  if (readPrivateBankHeader(text) === null) throw new CliError(`${file} is not a private bank.`);

  const decrypted = await decryptBank(text, await readKeyFile(resolve(io.cwd, values.key)));
  if (!decrypted.ok) {
    throw new CliError(
      `Could not decrypt ${file} with ${values.key}: the file is damaged, or it belongs to a different key.`,
    );
  }
  if (isBankRepository(decrypted.plaintext)) {
    io.stdout(await withBankIds(decrypted.plaintext, io));
    return;
  }
  // Byte for byte, so it can be redirected and compared with the original.
  io.stdout(decrypted.plaintext);
}

/**
 * A decrypted repository as its author wrote it: each entry's key replaced by
 * the id of the bank whose key file in `keys/` matches, so no key reaches the
 * terminal.
 */
async function withBankIds(plaintext: string, io: Io): Promise<string> {
  const idsByKey = new Map<string, string>();
  const keysDir = resolve(io.cwd, 'keys');
  const names = await readdir(keysDir).catch(() => []);
  for (const name of names.filter((each) => each.endsWith(KEY_SUFFIX))) {
    const key = await readKeyFile(resolve(keysDir, name)).catch(() => null);
    if (key) idsByKey.set(encodeBankKey(key), name.slice(0, -KEY_SUFFIX.length));
  }

  const document = JSON.parse(plaintext) as { banks: { url: string; key?: string }[] };
  const banks = document.banks.map(({ key, ...entry }) =>
    key === undefined
      ? entry
      : { ...entry, bank: idsByKey.get(key) ?? 'unknown: no key file in keys/ matches' },
  );
  return `${JSON.stringify({ ...document, banks }, null, 2)}\n`;
}

/** Runs one command, and returns the process exit code. */
export async function run([command, ...args]: string[], io: Io): Promise<number> {
  try {
    if (command === 'encrypt') await encrypt(args, io);
    else if (command === 'decrypt') await decrypt(args, io);
    else throw new CliError(USAGE);
    return 0;
  } catch (cause) {
    if (cause instanceof CliError) {
      io.stderr(`${cause.message}\n`);
      return 1;
    }
    // parseArgs reports unknown flags this way; anything else is a bug worth its stack.
    if (cause instanceof TypeError && 'code' in cause) {
      io.stderr(`${cause.message}\n\n${USAGE}\n`);
      return 1;
    }
    throw cause;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2), {
    // pnpm runs scripts from this repo; the author's paths are relative to where they typed the command.
    cwd: process.env.INIT_CWD ?? process.cwd(),
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  });
}
