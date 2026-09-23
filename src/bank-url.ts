/**
 * Fetching a bank file from a URL someone pasted.
 *
 * A static app can only read another site's file when that site allows
 * cross-origin requests, and when it does not, the browser reports nothing
 * but a generic network error. So most of this module is about failure: each
 * way a link can go wrong comes back as its own kind, with a message the
 * person can act on. See SPEC section 3.1.
 *
 * What comes back on success is only text. Whether it is a valid bank is for
 * `addBankFromText` to decide, exactly as for an uploaded file.
 */

export type FetchFailure =
  /** Not an http or https address. */
  | { kind: 'not-a-url' }
  /** Plain http from an https page, which browsers block as mixed content. */
  | { kind: 'insecure' }
  /** The request failed without a response while online: most likely CORS. */
  | { kind: 'blocked' }
  | { kind: 'offline' }
  | { kind: 'timeout' }
  | { kind: 'not-found' }
  | { kind: 'http'; status: number }
  /** An HTML page came back, typically a file's page on a code host rather than the file. */
  | { kind: 'web-page' }
  | { kind: 'too-large' };

export type FetchBankResult =
  | { ok: true; text: string; /** The address actually read, after any rewriting. */ url: string }
  | { ok: false; failure: FetchFailure };

export type FetchBankOptions = {
  fetch?: typeof fetch;
  /** Whether the browser believes it is online. */
  online?: () => boolean;
  /** The protocol of the page the app runs on. */
  pageProtocol?: string;
};

/** Far larger than the biggest bank the format allows in practice. */
const MAX_CHARACTERS = 20_000_000;
const TIMEOUT_MS = 20_000;

const githubFile = /^https:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/;
const gistPage = /^https:\/\/gist\.github\.com\/([^/]+)\/([0-9a-f]+)\/?$/;

/**
 * The address to fetch for a pasted link. A GitHub file or gist page is HTML
 * without cross-origin headers, but the same file on GitHub's raw hosts is
 * readable from anywhere, so the one is quietly swapped for the other.
 */
export function rawUrlFor(url: string): string {
  const file = githubFile.exec(url);
  if (file) {
    const [, owner, repo, refAndPath] = file;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${refAndPath}`;
  }
  const gist = gistPage.exec(url);
  if (gist) {
    const [, owner, id] = gist;
    return `https://gist.githubusercontent.com/${owner}/${id}/raw`;
  }
  return url;
}

function parseWebAddress(input: string): URL | null {
  try {
    const url = new URL(input);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/**
 * Judged by the body, not the Content-Type, which some hosts get wrong for
 * JSON. A body starting with `<` can never be a JSON bank.
 */
function looksLikeWebPage(text: string): boolean {
  return /^\s*</.test(text);
}

/**
 * Reads the text at a pasted address, or says in one of a fixed set of ways
 * why it could not. Sends no cookies and no referrer to the bank's host.
 */
export async function fetchBankText(
  input: string,
  {
    fetch: fetchImpl = globalThis.fetch.bind(globalThis),
    online = () => navigator.onLine,
    pageProtocol = location.protocol,
  }: FetchBankOptions = {},
): Promise<FetchBankResult> {
  const address = parseWebAddress(input.trim());
  if (!address) return { ok: false, failure: { kind: 'not-a-url' } };
  if (address.protocol === 'http:' && pageProtocol === 'https:') {
    return { ok: false, failure: { kind: 'insecure' } };
  }

  const url = rawUrlFor(address.href);
  let text: string;
  try {
    const response = await fetchImpl(url, {
      // Nothing about the person goes to the bank's host.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404 || response.status === 410) {
      return { ok: false, failure: { kind: 'not-found' } };
    }
    if (!response.ok) return { ok: false, failure: { kind: 'http', status: response.status } };
    // Only a hint: it may be the compressed size. The text itself is checked below.
    if (Number(response.headers.get('Content-Length') ?? 0) > MAX_CHARACTERS) {
      return { ok: false, failure: { kind: 'too-large' } };
    }
    text = await response.text();
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
      return { ok: false, failure: { kind: 'timeout' } };
    }
    return { ok: false, failure: { kind: online() ? 'blocked' : 'offline' } };
  }

  if (text.length > MAX_CHARACTERS) return { ok: false, failure: { kind: 'too-large' } };
  if (looksLikeWebPage(text)) return { ok: false, failure: { kind: 'web-page' } };
  return { ok: true, text, url };
}

/** A sentence for the person who pasted the link: the likely cause, and what to try instead. */
export function fetchFailureMessage(failure: FetchFailure): string {
  switch (failure.kind) {
    case 'not-a-url':
      return 'That is not a web address. Paste a link starting with https://.';
    case 'insecure':
      return 'That link uses plain http, which browsers block from a secure page. Use an https:// link, or download the file and use Upload.';
    case 'blocked':
      return 'Could not load that URL. The server may not allow cross-origin requests. Try a raw GitHub or GitHub Pages link, or download the file and use Upload.';
    case 'offline':
      return 'Could not load that URL because this device seems to be offline. Connect and try again, or use Upload.';
    case 'timeout':
      return 'That server took too long to answer. Try again later, or download the file and use Upload.';
    case 'not-found':
      return 'Nothing was found at that address (404). Check the link. A file on GitHub must be in a public repository.';
    case 'http':
      return `The server refused that request (HTTP ${failure.status}). Check the link, or download the file and use Upload.`;
    case 'web-page':
      return 'That link leads to a web page, not a bank file. On GitHub, open the file and use the link to its Raw view.';
    case 'too-large':
      return 'That file is far too large to be a question bank.';
  }
}
