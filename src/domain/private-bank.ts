import { GeneralEncrypt, base64url, calculateJwkThumbprint, generalDecrypt } from 'jose';

/**
 * Private banks: a bank encrypted so its file can sit on a public host, opened
 * by a bank link that carries the bank key. See SPEC section 3.4 and ADR 0003.
 *
 * Shared by the app and the author CLI (`scripts/bank-crypto.ts`), so it uses
 * nothing but WebCrypto and `jose`: no DOM and no storage. Everything after
 * decryption is the ordinary bank path; this module never parses a bank.
 */

/** Marks a JWE as one of ours. Only a file carrying it is treated as a private bank. */
export const PRIVATE_BANK_CONTENT_TYPE = 'application/vnd.physics-quiz.bank+json';

const ALGORITHM = 'dir';
const ENCRYPTION = 'A256GCM';
const KEY_BYTES = 32;

/** A new random bank key: 256 bits, the same for every edition of one bank. */
export function generateBankKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES));
}

/** The key as it appears in a bank link: base64url of the raw bytes, not a JWK, to keep links short. */
export function encodeBankKey(key: Uint8Array): string {
  return base64url.encode(key);
}

/** The raw key from a bank link, or null when it is not exactly 32 bytes of base64url. */
export function decodeBankKey(encoded: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const key = base64url.decode(encoded);
    return key.length === KEY_BYTES ? key : null;
  } catch {
    return null;
  }
}

/** The bank key as the JWK the author keeps in `keys/<bank-id>.key.json`. */
export type BankKeyJwk = { kty: 'oct'; k: string };

export function bankKeyToJwk(key: Uint8Array): BankKeyJwk {
  return { kty: 'oct', k: encodeBankKey(key) };
}

/** The raw key from an author's key file, or null when it is not a 256-bit `oct` JWK. */
export function bankKeyFromJwk(jwk: unknown): Uint8Array | null {
  if (typeof jwk !== 'object' || jwk === null) return null;
  const { kty, k } = jwk as Record<string, unknown>;
  if (kty !== 'oct' || typeof k !== 'string') return null;
  return decodeBankKey(k);
}

/**
 * The key's RFC 7638 thumbprint, used as the JWE `kid`. It names the key
 * without revealing it, and tells the app which stored key opens a file.
 */
export function bankKeyId(key: Uint8Array): Promise<string> {
  return calculateJwkThumbprint(bankKeyToJwk(key), 'sha256');
}

/**
 * The key as WebCrypto holds it in the browser: non-extractable, so once it is
 * imported no script on the page can read the raw bytes back.
 */
export function importBankKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    key as Uint8Array<ArrayBuffer>,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypts the text of a bank file as a General JSON JWE.
 *
 * Every header field is protected, and there are no others, so nothing about
 * the bank (not even its title) is readable without the key.
 */
export async function encryptBank(plaintext: string, key: Uint8Array): Promise<string> {
  const jwe = await new GeneralEncrypt(new TextEncoder().encode(plaintext))
    .setProtectedHeader({
      alg: ALGORITHM,
      enc: ENCRYPTION,
      cty: PRIVATE_BANK_CONTENT_TYPE,
      kid: await bankKeyId(key),
    })
    .addRecipient(key)
    .encrypt();
  return JSON.stringify(jwe, null, 2);
}

export type DecryptBankResult = { ok: true; plaintext: string } | { ok: false };

/**
 * The plaintext of a private bank, or nothing at all. AES-GCM authenticates
 * the whole file, protected header included, so a wrong key and a file changed
 * after encryption both fail here, and never yield part of a bank.
 */
export async function decryptBank(
  text: string,
  key: CryptoKey | Uint8Array,
): Promise<DecryptBankResult> {
  try {
    const { plaintext } = await generalDecrypt(JSON.parse(text) as never, key, {
      keyManagementAlgorithms: [ALGORITHM],
      contentEncryptionAlgorithms: [ENCRYPTION],
    });
    return { ok: true, plaintext: new TextDecoder('utf-8', { fatal: true }).decode(plaintext) };
  } catch {
    return { ok: false };
  }
}

/** What can be read of a private bank without its key: which key opens it. */
export type PrivateBankHeader = { kid: string | undefined };

/**
 * Recognises a private bank by its content, never its file name: a JSON object
 * with `protected`, `ciphertext` and `iv`, whose protected header carries our
 * content type. Anything else is null, and goes down the plaintext bank path.
 */
export function readPrivateBankHeader(text: string): PrivateBankHeader | null {
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof document !== 'object' || document === null || Array.isArray(document)) return null;

  const { protected: encoded, ciphertext, iv } = document as Record<string, unknown>;
  if (typeof encoded !== 'string' || typeof ciphertext !== 'string' || typeof iv !== 'string') {
    return null;
  }

  let header: unknown;
  try {
    header = JSON.parse(new TextDecoder().decode(base64url.decode(encoded)));
  } catch {
    return null;
  }
  if (typeof header !== 'object' || header === null) return null;

  const { cty, kid } = header as Record<string, unknown>;
  if (cty !== PRIVATE_BANK_CONTENT_TYPE) return null;
  return { kid: typeof kid === 'string' ? kid : undefined };
}

/**
 * The bank link for an encrypted file. Both parameters live in the fragment,
 * which browsers never send to a server, so the key reaches neither the app's
 * host nor the bank's.
 */
export function bankLink(appUrl: string, fileUrl: string, key: Uint8Array): string {
  const app = new URL(appUrl);
  app.hash = '';
  return `${app.href}#bank=${encodeURIComponent(fileUrl)}&key=${encodeBankKey(key)}`;
}

export type ParsedBankLink =
  /** The fragment is not a bank link at all. */
  | { kind: 'none' }
  /** It is a bank link, but the address or key is missing or mangled, typically by a truncating chat app. */
  | { kind: 'broken' }
  | { kind: 'bank-link'; url: string; key: Uint8Array };

/** Reads a bank link from a URL fragment, with or without its leading `#`. */
export function parseBankLink(fragment: string): ParsedBankLink {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  if (!params.has('bank')) return { kind: 'none' };

  const url = params.get('bank') ?? '';
  const key = decodeBankKey(params.get('key') ?? '');
  if (url === '' || key === null) return { kind: 'broken' };
  return { kind: 'bank-link', url, key };
}
