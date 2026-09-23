import { fetchBankText, type FetchBankOptions, type FetchFailure } from './bank-url';
import { parseBankLink, type ParsedBankLink } from './domain/private-bank';
import { addBankFromText, storeBankKey, type AddBankOptions, type AddBankResult } from './library';
import { releaseBankKey, type BankSource } from './storage/db';

/**
 * Opening a bank link: the `#bank=…&key=…` fragment that carries a private
 * bank's address and its key. See SPEC section 3.4.4.
 */

type AddressBar = {
  location: Pick<Location, 'hash' | 'pathname' | 'search'>;
  history: Pick<History, 'replaceState'>;
};

/**
 * Reads a bank link from the address bar and clears it there, synchronously,
 * so the key is gone before anything can fail halfway, and a reload or a
 * copied address does not carry it. Any other fragment is left alone.
 */
export function takeBankLink(
  location: AddressBar['location'] = window.location,
  history: AddressBar['history'] = window.history,
): ParsedBankLink {
  const link = parseBankLink(location.hash);
  if (link.kind !== 'none') {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  return link;
}

export type OpenBankLinkResult =
  /** The link was cut short or mangled, so there is nothing to open. */
  | { kind: 'broken' }
  /** The file could not be read. The key is stored regardless. */
  | { kind: 'unreachable'; failure: FetchFailure }
  /**
   * The file was read and offered to the library. `text`, `source` and
   * `options` are what to offer again, should a conflict need replacing.
   */
  | {
      kind: 'fetched';
      result: AddBankResult;
      text: string;
      source: BankSource;
      options: AddBankOptions;
    };

/**
 * Stores the link's key, then fetches and adds the bank it points to. The key
 * is stored first so that if the fetch fails, downloading the file and
 * uploading it opens the bank without the link.
 */
export async function openBankLink(
  link: Exclude<ParsedBankLink, { kind: 'none' }>,
  fetchOptions?: FetchBankOptions,
): Promise<OpenBankLinkResult> {
  if (link.kind === 'broken') return link;
  const key = await storeBankKey(link.key);

  const fetched = await fetchBankText(link.url, fetchOptions);
  if (!fetched.ok) return { kind: 'unreachable', failure: fetched.failure };

  const source: BankSource = { kind: 'url', url: fetched.url };
  const options: AddBankOptions = { key };
  const result = await addBankFromText(fetched.text, source, options);
  // The file is there and the key does not open it, so the key belongs to
  // nothing this link can reach.
  if (!result.ok && result.reason === 'undecryptable') await releaseBankKey(key.kid);
  return { kind: 'fetched', result, text: fetched.text, source, options };
}
