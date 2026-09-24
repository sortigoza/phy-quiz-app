import { loadBankRepository, type RepositoryOutcome } from './bank-repository';
import type { FetchBankOptions } from './bank-url';
import type { BankIssue } from './domain/bank';
import { isBankRepository, parseBankRepository } from './domain/bank-repository';
import { addBankFromText, openText, type AddBankOptions, type AddBankResult } from './library';
import type { BankSource, StoredBankKey } from './storage/db';

/**
 * Loading the text of a file handed to the library, whichever way it came:
 * upload, pasted URL or bank link.
 *
 * The file may be a bank or a bank repository, and either may be encrypted,
 * so it is opened first and recognised by its plaintext. A bank then goes to
 * `addBankFromText`, and a repository to `loadBankRepository`, which loads
 * every bank it lists. SPEC sections 3.4, 3.5 and 3.5.1.
 */

export type LoadTextOptions = FetchBankOptions & {
  /** The key to open an encrypted file with, rather than the stored key its `kid` names. */
  key?: StoredBankKey | undefined;
  /** The address the file was read from, which a repository's relative entries resolve against. */
  base?: string | undefined;
  /** For a repository: called with the number of entries settled so far, and the total. */
  onProgress?: ((settled: number, total: number) => void) | undefined;
};

export type LoadTextResult =
  /**
   * A bank, or a file that could not be opened at all. `text`, `source` and
   * `options` are what to offer again, should a conflict need replacing.
   */
  | {
      kind: 'bank';
      result: AddBankResult;
      text: string;
      source: BankSource;
      options: AddBankOptions;
    }
  /** A repository, with what happened to each bank it lists. */
  | { kind: 'repository'; title: string; private: boolean; outcomes: RepositoryOutcome[] }
  /** A repository that failed validation. None of its banks was fetched. */
  | { kind: 'invalid-repository'; issues: BankIssue[]; private: boolean };

export async function loadText(
  text: string,
  source: BankSource,
  { key, base, onProgress, ...fetchOptions }: LoadTextOptions = {},
): Promise<LoadTextResult> {
  const options: AddBankOptions = { key };
  const opened = await openText(text, key);
  if (!opened.ok || !isBankRepository(opened.plaintext)) {
    return {
      kind: 'bank',
      result: await addBankFromText(text, source, options),
      text,
      source,
      options,
    };
  }

  const encrypted = opened.kid !== undefined;
  const parsed = parseBankRepository(opened.plaintext, base, { encrypted });
  if (!parsed.ok) return { kind: 'invalid-repository', issues: parsed.issues, private: encrypted };

  const outcomes = await loadBankRepository(parsed.repository, {
    ...fetchOptions,
    repositoryKid: opened.kid,
    onProgress,
  });
  return { kind: 'repository', title: parsed.repository.title, private: encrypted, outcomes };
}
