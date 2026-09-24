import { fetchBankText, type FetchFailure } from './bank-url';
import { parseBankLink, type ParsedBankLink } from './domain/private-bank';
import { storeBankKey } from './library';
import { loadText, type LoadTextOptions, type LoadTextResult } from './load-text';
import { releaseBankKey } from './storage/db';

/**
 * Opening a bank link: the `#bank=…&key=…` fragment that carries the address
 * of a private bank or private repository, and its key. See SPEC sections
 * 3.4.4 and 3.5.1.
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

/**
 * A bank link in text someone pasted, such as into the URL field. Anything
 * that is not an address carrying a `#bank=` fragment is not one.
 */
export function bankLinkIn(text: string): ParsedBankLink {
  try {
    return parseBankLink(new URL(text.trim()).hash);
  } catch {
    return { kind: 'none' };
  }
}

export type OpenBankLinkResult =
  /** The link was cut short or mangled, so there is nothing to open. */
  | { kind: 'broken' }
  /** The file could not be read. The key is stored regardless. */
  | { kind: 'unreachable'; failure: FetchFailure }
  /** The file was read and loaded: a bank, or a repository and every bank it lists. */
  | LoadTextResult;

/**
 * Stores the link's key, then fetches and loads the bank or repository it
 * points to. The key is stored first so that if the fetch fails, downloading
 * the file and uploading it opens it without the link.
 */
export async function openBankLink(
  link: Exclude<ParsedBankLink, { kind: 'none' }>,
  options: Omit<LoadTextOptions, 'key' | 'base'> = {},
): Promise<OpenBankLinkResult> {
  if (link.kind === 'broken') return link;
  const key = await storeBankKey(link.key);

  const fetched = await fetchBankText(link.url, options);
  if (!fetched.ok) return { kind: 'unreachable', failure: fetched.failure };

  const loaded = await loadText(
    fetched.text,
    { kind: 'url', url: fetched.url },
    { ...options, key, base: fetched.url },
  );
  // The file is there and the key does not open it, so the key belongs to
  // nothing this link can reach.
  if (loaded.kind === 'bank' && !loaded.result.ok && loaded.result.reason === 'undecryptable') {
    await releaseBankKey(key.kid);
  }
  return loaded;
}
