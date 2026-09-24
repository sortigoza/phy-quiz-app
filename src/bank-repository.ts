import { fetchBankText, fetchFailureMessage, type FetchBankOptions } from './bank-url';
import {
  isBankRepository,
  type BankRepository,
  type RepositoryEntry,
} from './domain/bank-repository';
import {
  addBankFromText,
  openText,
  privateBankMessage,
  storeBankKey,
  type AddBankOptions,
  type AddBankResult,
} from './library';
import { bankKeyId } from './domain/private-bank';
import {
  getBankKey,
  releaseBankKey,
  type BankSource,
  type StoredBank,
  type StoredBankKey,
} from './storage/db';

/**
 * Loading every bank a bank repository lists. SPEC section 3.5.
 *
 * Each entry goes through `fetchBankText` and `addBankFromText` exactly as if
 * its URL had been pasted alone, so it gets the same messages and the same
 * add-replace-unchanged rules. What this adds is the fan-out: a few fetches at
 * a time, and one failing entry never stopping the others. An entry of a
 * private repository also carries its bank's key (SPEC section 3.5.1).
 */

/** What happened to one entry of a repository, in words the library can show. */
export type RepositoryOutcome = { entry: RepositoryEntry } & (
  | { kind: 'added' | 'replaced' | 'unchanged'; bank: StoredBank }
  /** Changed without a version bump. Nothing was stored; replacing takes `text` again. */
  | {
      kind: 'conflict';
      bank: StoredBank;
      existing: StoredBank;
      text: string;
      source: BankSource;
      options: AddBankOptions;
    }
  | { kind: 'failed'; message: string }
);

type LoadEntryOptions = FetchBankOptions & {
  /** The key id of the private repository being loaded, recorded on every bank it delivers. */
  repositoryKid?: string | undefined;
};

export type LoadRepositoryOptions = LoadEntryOptions & {
  /** Called with the number of entries settled so far and the total: once at the start, then as each settles. */
  onProgress?: ((settled: number, total: number) => void) | undefined;
};

/** How many banks are fetched at once: enough to be quick, few enough to be polite to one host. */
const CONCURRENCY = 4;

const RELATIVE_MESSAGE =
  'This address is relative to the repository, and an uploaded repository has no address. Load the repository by its URL instead.';
const NESTED_MESSAGE =
  'This is another bank repository. Repositories are not followed from inside one another; load it by its own URL.';
const NO_KEY_MESSAGE =
  'This bank is private. Open the private course link or bank link your teacher sent.';
const OUT_OF_DATE_MESSAGE =
  'This bank’s key in the course list is out of date. Ask your teacher to publish the course again.';

function describeResult(
  entry: RepositoryEntry,
  result: AddBankResult,
  text: string,
  source: BankSource,
  options: AddBankOptions,
): RepositoryOutcome {
  if (!result.ok) {
    if (result.reason !== 'invalid') {
      return { entry, kind: 'failed', message: privateBankMessage[result.reason] };
    }
    const issues = result.issues
      .map((issue) => (issue.path ? `${issue.path}: ${issue.message}` : issue.message))
      .join('; ');
    return {
      entry,
      kind: 'failed',
      message: `${result.private ? 'This private bank opened, but it is' : 'This is'} not a valid bank: ${issues}`,
    };
  }
  if (result.status === 'conflict') {
    return {
      entry,
      kind: 'conflict',
      bank: result.bank,
      existing: result.existing,
      text,
      source,
      options,
    };
  }
  return { entry, kind: result.status, bank: result.bank };
}

async function loadEntry(
  entry: RepositoryEntry,
  { repositoryKid, ...fetchOptions }: LoadEntryOptions,
): Promise<RepositoryOutcome> {
  if (entry.url === null) return { entry, kind: 'failed', message: RELATIVE_MESSAGE };

  // Stored before the fetch, as a bank link's key is, so a bank whose fetch
  // fails opens later from a downloaded copy.
  const entryKey = entry.key === undefined ? undefined : await storeEntryKey(entry.key);

  const fetched = await fetchBankText(entry.url, fetchOptions);
  if (!fetched.ok) return { entry, kind: 'failed', message: fetchFailureMessage(fetched.failure) };

  try {
    return await addFetched(entry, fetched.text, fetched.url, entryKey?.key, repositoryKid);
  } finally {
    // The file was read, so a key this entry brought and no bank now holds
    // opens nothing here: let it go. A key held before is never touched.
    if (entryKey?.isNew) await releaseBankKey(entryKey.key.kid);
  }
}

/** Stores a key a repository entry carries, saying whether this browser held it already. */
async function storeEntryKey(raw: Uint8Array): Promise<{ key: StoredBankKey; isNew: boolean }> {
  const isNew = (await getBankKey(await bankKeyId(raw))) === undefined;
  return { key: await storeBankKey(raw), isNew };
}

async function addFetched(
  entry: RepositoryEntry,
  text: string,
  url: string,
  entryKey: StoredBankKey | undefined,
  repositoryKid: string | undefined,
): Promise<RepositoryOutcome> {
  // Opened before it is added, so an encrypted repository is recognised as one too.
  let key = entryKey;
  let opened = await openText(text, key);
  if (!opened.ok && opened.reason === 'undecryptable' && key !== undefined) {
    // The entry's key is out of date; a key already held here may still open the bank.
    key = undefined;
    opened = await openText(text, undefined);
    if (!opened.ok) return { entry, kind: 'failed', message: OUT_OF_DATE_MESSAGE };
  }
  if (!opened.ok && opened.reason === 'no-key') {
    return { entry, kind: 'failed', message: NO_KEY_MESSAGE };
  }
  if (opened.ok && isBankRepository(opened.plaintext)) {
    return { entry, kind: 'failed', message: NESTED_MESSAGE };
  }

  const source: BankSource = { kind: 'url', url };
  const options: AddBankOptions = { key, repositoryKid };
  const result = await addBankFromText(text, source, options);
  return describeResult(entry, result, text, source, options);
}

/** Loads every entry, a few at a time, and reports each in the repository's order. */
export async function loadBankRepository(
  repository: BankRepository,
  { onProgress, ...options }: LoadRepositoryOptions = {},
): Promise<RepositoryOutcome[]> {
  const { entries } = repository;
  const outcomes: RepositoryOutcome[] = new Array<RepositoryOutcome>(entries.length);
  let next = 0;
  let settled = 0;
  onProgress?.(0, entries.length);

  async function worker() {
    while (next < entries.length) {
      const index = next++;
      const entry = entries[index]!;
      try {
        outcomes[index] = await loadEntry(entry, options);
      } catch (error) {
        // Storage failing for one bank is reported on that bank, not thrown past the rest.
        outcomes[index] = {
          entry,
          kind: 'failed',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      settled += 1;
      onProgress?.(settled, entries.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  return outcomes;
}

/** Replaces the held copy of a bank that changed without a version bump, as the person asked. */
export async function replaceRepositoryEntry(
  outcome: Extract<RepositoryOutcome, { kind: 'conflict' }>,
): Promise<RepositoryOutcome> {
  const options = { ...outcome.options, replace: true };
  const result = await addBankFromText(outcome.text, outcome.source, options);
  return describeResult(outcome.entry, result, outcome.text, outcome.source, outcome.options);
}
