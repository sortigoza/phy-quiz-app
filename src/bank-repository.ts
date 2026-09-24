import { fetchBankText, fetchFailureMessage, type FetchBankOptions } from './bank-url';
import {
  isBankRepository,
  type BankRepository,
  type RepositoryEntry,
} from './domain/bank-repository';
import { addBankFromText, privateBankMessage, type AddBankResult } from './library';
import type { BankSource, StoredBank } from './storage/db';

/**
 * Loading every bank a bank repository lists. SPEC section 3.5.
 *
 * Each entry goes through `fetchBankText` and `addBankFromText` exactly as if
 * its URL had been pasted alone, so it gets the same messages and the same
 * add-replace-unchanged rules. What this adds is the fan-out: a few fetches at
 * a time, and one failing entry never stopping the others.
 */

/** What happened to one entry of a repository, in words the library can show. */
export type RepositoryOutcome = { entry: RepositoryEntry } & (
  | { kind: 'added' | 'replaced' | 'unchanged'; bank: StoredBank }
  /** Changed without a version bump. Nothing was stored; replacing takes `text` again. */
  | { kind: 'conflict'; bank: StoredBank; existing: StoredBank; text: string; source: BankSource }
  | { kind: 'failed'; message: string }
);

export type LoadRepositoryOptions = FetchBankOptions & {
  /** Called with the number of entries settled so far, each time one settles. */
  onProgress?: (settled: number) => void;
};

/** How many banks are fetched at once: enough to be quick, few enough to be polite to one host. */
const CONCURRENCY = 4;

const RELATIVE_MESSAGE =
  'This address is relative to the repository, and an uploaded repository has no address. Load the repository by its URL instead.';
const NESTED_MESSAGE =
  'This is another bank repository. Repositories are not followed from inside one another; load it by its own URL.';

function describeResult(
  entry: RepositoryEntry,
  result: AddBankResult,
  text: string,
  source: BankSource,
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
    return { entry, kind: 'conflict', bank: result.bank, existing: result.existing, text, source };
  }
  return { entry, kind: result.status, bank: result.bank };
}

async function loadEntry(
  entry: RepositoryEntry,
  options: FetchBankOptions,
): Promise<RepositoryOutcome> {
  if (entry.url === null) return { entry, kind: 'failed', message: RELATIVE_MESSAGE };

  const fetched = await fetchBankText(entry.url, options);
  if (!fetched.ok) return { entry, kind: 'failed', message: fetchFailureMessage(fetched.failure) };
  if (isBankRepository(fetched.text)) return { entry, kind: 'failed', message: NESTED_MESSAGE };

  const source: BankSource = { kind: 'url', url: fetched.url };
  const result = await addBankFromText(fetched.text, source);
  return describeResult(entry, result, fetched.text, source);
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
      onProgress?.(settled);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  return outcomes;
}

/** Replaces the held copy of a bank that changed without a version bump, as the person asked. */
export async function replaceRepositoryEntry(
  outcome: Extract<RepositoryOutcome, { kind: 'conflict' }>,
): Promise<RepositoryOutcome> {
  const result = await addBankFromText(outcome.text, outcome.source, { replace: true });
  return describeResult(outcome.entry, result, outcome.text, outcome.source);
}
