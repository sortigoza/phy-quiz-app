import type { Attempt } from './domain/attempt';
import { readHistoryFile, type RejectedAttempt } from './domain/history-file';
import { addAttempts } from './storage/db';

/**
 * History: narrowing it for display and export, and importing into it. See
 * SPEC.md section 6.
 *
 * Import is additive and idempotent. Nothing held is ever replaced, so
 * importing the same file twice changes nothing the second time, and a teacher
 * can import thirty participants' files in any order.
 */

/**
 * Narrows history to one participant, one bank, or both. A name matches only
 * exactly, since a name is all that identifies a participant. A bank matches
 * by id, so every version of it is kept.
 */
export type HistoryFilter = { name?: string | undefined; bankId?: string | undefined };

export function filterHistory(attempts: readonly Attempt[], filter: HistoryFilter): Attempt[] {
  return attempts.filter(
    (attempt) =>
      (filter.name === undefined || attempt.name === filter.name) &&
      (filter.bankId === undefined || attempt.bankId === filter.bankId),
  );
}

/** What the filters can be set to: every name and bank in history, each once. */
export type HistoryFilterValues = {
  /** Alphabetical. */
  names: string[];
  /** Alphabetical by title, each under the title of its most recent attempt. */
  banks: Array<{ bankId: string; title: string }>;
};

export function historyFilterValues(attempts: readonly Attempt[]): HistoryFilterValues {
  const alphabetical = (a: string, b: string) => a.localeCompare(b);
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    const held = latest.get(attempt.bankId);
    if (!held || attempt.submittedAt > held.submittedAt) latest.set(attempt.bankId, attempt);
  }
  return {
    names: [...new Set(attempts.map((attempt) => attempt.name))].sort(alphabetical),
    banks: [...latest.values()]
      .map((attempt) => ({ bankId: attempt.bankId, title: attempt.bankTitle }))
      .sort((a, b) => alphabetical(a.title, b.title)),
  };
}

/** What importing one file did, so the UI can say "Imported 27, skipped 3 duplicates, rejected 1 invalid". */
export type ImportReport =
  | { ok: true; added: number; duplicates: number; rejected: RejectedAttempt[] }
  /** The file as a whole was refused, and nothing in it was imported. */
  | { ok: false; message: string };

export async function importHistory(text: string): Promise<ImportReport> {
  const read = readHistoryFile(text);
  if (!read.ok) return read;
  const { added, duplicates } = await addAttempts(read.attempts);
  return { ok: true, added, duplicates, rejected: read.rejected };
}
