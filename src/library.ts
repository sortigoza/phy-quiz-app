import { fingerprint, parseBank, type BankIssue } from './domain/bank';
import { bankKey, getBank, putBank, type BankSource, type StoredBank } from './storage/db';

/**
 * Adding a bank to the library: parse, fingerprint, store.
 *
 * This is the only entry point the UI needs. Keeping the three steps together
 * is what guarantees a stored bank is always one that validated, and that its
 * fingerprint always describes the bytes actually held.
 */

/** What adding a bank did to the library, so the UI can say something true. */
export type AddBankStatus =
  /** Not previously held. */
  | 'added'
  /** Same id and version, different bytes: the stored copy was overwritten. */
  | 'replaced'
  /** Byte-identical to the copy already held. Nothing changed. */
  | 'unchanged';

export type AddBankResult =
  { ok: true; bank: StoredBank; status: AddBankStatus } | { ok: false; issues: BankIssue[] };

export async function addBankFromText(text: string, source: BankSource): Promise<AddBankResult> {
  const parsed = parseBank(text);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };

  const { bank } = parsed;
  const key = bankKey(bank.id, bank.version);
  const digest = await fingerprint(text);
  const existing = await getBank(key);

  if (existing?.fingerprint === digest) {
    return { ok: true, bank: existing, status: 'unchanged' };
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
    raw: text,
  };

  await putBank(stored);
  return { ok: true, bank: stored, status: existing ? 'replaced' : 'added' };
}
