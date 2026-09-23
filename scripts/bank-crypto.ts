import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseBank } from '../src/domain/bank';
import {
  bankKeyFromJwk,
  bankKeyToJwk,
  bankLink,
  decryptBank,
  encryptBank,
  generateBankKey,
  readPrivateBankHeader,
} from '../src/domain/private-bank';

/**
 * The author CLI for private banks. See SPEC section 3.4.3.
 *
 *   pnpm bank-crypto encrypt <bank-file> --out <file> --url <public URL> [--app-url <url>] [--rotate]
 *   pnpm bank-crypto decrypt <file> --key <key-file>
 *
 * A teacher runs it from their private repo, where the plaintext bank and its
 * key live. It validates with the app's own parser, so the two cannot disagree
 * about what a valid bank is.
 */

/** The live app, which bank links open unless `--app-url` says otherwise. */
export const DEFAULT_APP_URL = 'https://sortigoza.github.io/phy-quiz-app/';

const USAGE = `Usage:
  pnpm bank-crypto encrypt <bank-file> --out <file> --url <public URL of that file> [--app-url <url>] [--rotate]
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
  const parsed = parseBank(plaintext);
  if (!parsed.ok) {
    const problems = parsed.issues.map(({ path, message }) =>
      path ? `  ${path} ${message}` : `  ${message}`,
    );
    throw new CliError(
      `${bankFile} is not a valid bank. Nothing was encrypted.\n${problems.join('\n')}`,
    );
  }

  const keyPath = resolve(io.cwd, 'keys', `${parsed.bank.id}.key.json`);
  let key: Uint8Array;
  if ((await exists(keyPath)) && !values.rotate) {
    key = await readKeyFile(keyPath);
  } else {
    if (values.rotate && (await exists(keyPath))) {
      io.stderr(
        `Rotated the key for ${parsed.bank.id}. Earlier links will not open new editions: send the new link to everyone who should keep access.\n`,
      );
    }
    key = generateBankKey();
    await mkdir(dirname(keyPath), { recursive: true });
    await writeFile(keyPath, `${JSON.stringify(bankKeyToJwk(key), null, 2)}\n`, { mode: 0o600 });
  }

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
  // Byte for byte, so it can be redirected and compared with the original.
  io.stdout(decrypted.plaintext);
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
