/**
 * Storage failures, in words a participant can act on.
 *
 * IndexedDB reports its failures as error names, often wrapped by Dexie inside
 * another error. What matters to a participant is only which of three things
 * happened: the browser refuses to store anything (typically a private
 * window), the device is full, or something else.
 */

/** The browser will not open storage for this page at all. */
const REFUSED = new Set(['MissingAPIError', 'SecurityError', 'InvalidStateError']);

const QUOTA = 'QuotaExceededError';

/** The error and everything it wraps, outermost first. */
function causes(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current = error;
  while (current !== null && current !== undefined && !chain.includes(current)) {
    chain.push(current);
    current = (current as { inner?: unknown }).inner;
  }
  return chain;
}

function errorName(error: unknown): string | undefined {
  return error instanceof Error || error instanceof DOMException ? error.name : undefined;
}

/** One or two sentences saying what went wrong with storage and what to do about it. */
export function storageProblem(error: unknown): string {
  const names = causes(error).map(errorName);

  if (names.includes(QUOTA)) {
    return 'This device is out of storage space, so nothing more can be saved. Free up some space, or remove banks you no longer need, then try again.';
  }
  if (names.some((name) => name !== undefined && REFUSED.has(name))) {
    return 'This browser is not letting the app save anything, so banks and answers cannot be kept. Private or incognito windows often block this: open the app in a normal window, or allow this site to store data in your browser settings.';
  }
  const detail = error instanceof Error ? error.message : String(error);
  return `The app could not use this browser's storage (${detail}).`;
}
