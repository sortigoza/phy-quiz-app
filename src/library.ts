import { fingerprint, parseBank, type BankIssue } from './domain/bank';
import {
  bankKeyId,
  decryptBank,
  importBankKey,
  readPrivateBankHeader,
} from './domain/private-bank';
import {
  bankKey,
  getBank,
  getBankKey,
  putBank,
  putBankKey,
  type BankSource,
  type StoredBank,
  type StoredBankKey,
} from './storage/db';

/**
 * Adding a bank to the library: decrypt if private, parse, fingerprint, store.
 *
 * This is the only entry point the UI needs. Keeping the steps together is
 * what guarantees a stored bank is always one that validated, and that its
 * fingerprint always describes the bytes actually held.
 */

/** What adding a bank did to the library, so the UI can say something true. */
export type AddBankStatus =
  /** Not previously held. */
  | 'added'
  /** Same id and version, different bytes, and the caller asked to overwrite the stored copy. */
  | 'replaced'
  /** Byte-identical to the copy already held. Nothing changed. */
  | 'unchanged';

export type AddBankResult =
  | { ok: true; bank: StoredBank; status: AddBankStatus }
  /**
   * Same id and version as a bank already held, but different bytes: the author
   * changed it without bumping the version. Nothing was stored; `bank` is what
   * would replace `existing` if the caller asks again with `replace: true`.
   */
  | { ok: true; bank: StoredBank; status: 'conflict'; existing: StoredBank }
  /** Not a valid bank. `private` when it was a private bank that decrypted to this. */
  | { ok: false; reason: 'invalid'; issues: BankIssue[]; private: boolean }
  /** A private bank, and no stored key opens it. */
  | { ok: false; reason: 'no-key' }
  /** A private bank that did not decrypt: damaged, altered, or the wrong key. */
  | { ok: false; reason: 'undecryptable' };

export type AddBankOptions = {
  /** Overwrite a held bank with the same id and version but different bytes. */
  replace?: boolean;
  /**
   * The key to open a private bank with, rather than the stored key its `kid`
   * names. A bank link passes its own key, so a link whose key belongs to a
   * different bank says so rather than asking for the link.
   */
  key?: StoredBankKey | undefined;
  /** The key id of the private repository delivering this bank, recorded on it. SPEC section 3.5.1. */
  repositoryKid?: string | undefined;
};

/** What to tell the person when a private bank cannot be opened. SPEC section 3.4.4. */
export const privateBankMessage = {
  'no-key': 'This is a private bank. Open the link your teacher sent to unlock it.',
  undecryptable:
    'This private bank could not be opened. The file is damaged or was changed after it was encrypted, or the link’s key belongs to a different bank.',
} as const;

/**
 * Imports a bank key from a bank link and keeps it, so this bank and its later
 * editions open without the link, including from a file uploaded by hand.
 */
export async function storeBankKey(raw: Uint8Array): Promise<StoredBankKey> {
  const stored: StoredBankKey = {
    kid: await bankKeyId(raw),
    key: await importBankKey(raw),
    addedAt: new Date().toISOString(),
  };
  await putBankKey(stored);
  return stored;
}

export type OpenedText =
  /** `kid` is the key it was decrypted with, or undefined when it was never encrypted. */
  | { ok: true; plaintext: string; kid: string | undefined }
  | { ok: false; reason: 'no-key' | 'undecryptable' };

/**
 * The plaintext of a file, decrypting it first if it is encrypted: with the
 * given key if there is one, otherwise with the stored key its `kid` names.
 */
export async function openText(
  text: string,
  givenKey: StoredBankKey | undefined,
): Promise<OpenedText> {
  const header = readPrivateBankHeader(text);
  if (header === null) return { ok: true, plaintext: text, kid: undefined };

  const key = givenKey ?? (header.kid === undefined ? undefined : await getBankKey(header.kid));
  if (!key) return { ok: false, reason: 'no-key' };

  const decrypted = await decryptBank(text, key.key);
  if (!decrypted.ok) return { ok: false, reason: 'undecryptable' };
  return { ok: true, plaintext: decrypted.plaintext, kid: key.kid };
}

/** The repositories holding a bank, with one more; the same array when it adds nothing. */
function withRepository(
  held: string[] | undefined,
  repositoryKid: string | undefined,
): string[] | undefined {
  if (repositoryKid === undefined || held?.includes(repositoryKid)) return held;
  return [...(held ?? []), repositoryKid];
}

export async function addBankFromText(
  text: string,
  source: BankSource,
  { replace = false, key: givenKey, repositoryKid }: AddBankOptions = {},
): Promise<AddBankResult> {
  const opened = await openText(text, givenKey);
  if (!opened.ok) return opened;
  const { plaintext, kid } = opened;

  const parsed = parseBank(plaintext);
  if (!parsed.ok) {
    return { ok: false, reason: 'invalid', issues: parsed.issues, private: kid !== undefined };
  }

  const { bank } = parsed;
  const key = bankKey(bank.id, bank.version);
  // Over the plaintext: the ciphertext of a private bank differs every time it is encrypted.
  const digest = await fingerprint(plaintext);
  const existing = await getBank(key);

  if (existing?.fingerprint === digest) {
    // The same bank, now opened with a key or delivered by a private
    // repository: record it, so the bank is badged and each key is let go
    // with it. A plaintext copy never strips a key.
    const repositoryKids = withRepository(existing.repositoryKids, repositoryKid);
    const keyed = { ...existing, kid: kid ?? existing.kid, repositoryKids };
    if (keyed.kid === existing.kid && repositoryKids === existing.repositoryKids) {
      return { ok: true, bank: existing, status: 'unchanged' };
    }
    await putBank(keyed);
    return { ok: true, bank: keyed, status: 'unchanged' };
  }

  const stored: StoredBank = {
    key,
    id: bank.id,
    version: bank.version,
    title: bank.title,
    author: bank.author,
    questionCount: bank.questions.length,
    fingerprint: digest,
    source,
    addedAt: new Date().toISOString(),
    raw: plaintext,
    kid,
    // A replaced bank stays held by every repository that delivered it.
    repositoryKids: withRepository(existing?.repositoryKids, repositoryKid),
  };

  if (existing && !replace) return { ok: true, bank: stored, status: 'conflict', existing };

  await putBank(stored);
  return { ok: true, bank: stored, status: existing ? 'replaced' : 'added' };
}
