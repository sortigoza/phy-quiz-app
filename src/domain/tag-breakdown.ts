import type { Attempt, AttemptAnswer } from './attempt';
import type { Bank } from './bank';
import { confidentErrors } from './confidence';
import { isCounted } from './counted';
import { showsRecorded } from './review';
import { questionTags, type TagFilter } from './tags';
import { outcome } from './scoring';

/**
 * The tag breakdown: accuracy on one bank, per tag, over counted attempts,
 * weakest tag first, so a participant can see where to aim their next quiz.
 *
 * Attempts reference questions by id and never snapshot their tags, so tags
 * come from one held edition of the bank, normally the newest. An answer to a
 * question that edition cannot show belongs to no tag: it is an archived
 * question. Computed on demand from history; nothing is cached.
 */

/** Rows built from fewer answers than this are marked as low data. */
export const LOW_DATA_ANSWERS = 5;

type RowKind =
  | { kind: 'tag'; tag: string }
  /** Questions carrying no tag, which a tag filter can still choose. */
  | { kind: 'untagged' }
  /** Answers to questions the edition no longer shows. Always last, never weakest. */
  | { kind: 'archived' };

export type TagRow = RowKind & {
  correct: number;
  /** Answers, unanswered questions included: they score as wrong. */
  total: number;
  /** Wrong answers given with Confidence "Sure". */
  confidentErrors: number;
  lowData: boolean;
};

type Tally = { correct: number; total: number; confidentErrors: number };

/**
 * The breakdown of the counted attempts on `bank`'s bank among `attempts`,
 * with tags taken from `bank`. Attempts on other banks are ignored; narrowing
 * by participant is the caller's.
 */
export function tagBreakdown(attempts: readonly Attempt[], bank: Bank): TagRow[] {
  const byId = new Map(bank.questions.map((question) => [question.id, question]));
  const tags = new Map<string, Tally>();
  const untagged = emptyTally();
  const archived = emptyTally();

  for (const attempt of attempts) {
    if (attempt.bankId !== bank.id || !isCounted(attempt)) continue;
    for (const answer of attempt.answers) {
      const question = byId.get(answer.questionId);
      if (!showsRecorded(question, answer)) {
        add(archived, answer);
        continue;
      }
      const own = questionTags(question);
      if (own.size === 0) add(untagged, answer);
      for (const tag of own) {
        const tally = tags.get(tag) ?? emptyTally();
        tags.set(tag, tally);
        add(tally, answer);
      }
    }
  }

  const ranked: TagRow[] = [
    ...[...tags].map(([tag, tally]) => row({ kind: 'tag', tag }, tally)),
    ...(untagged.total > 0 ? [row({ kind: 'untagged' }, untagged)] : []),
  ].sort(weakestFirst);
  return archived.total > 0 ? [...ranked, row({ kind: 'archived' }, archived)] : ranked;
}

function emptyTally(): Tally {
  return { correct: 0, total: 0, confidentErrors: 0 };
}

function add(tally: Tally, answer: AttemptAnswer): void {
  tally.total += 1;
  if (outcome(answer) === 'correct') tally.correct += 1;
  tally.confidentErrors += confidentErrors([answer]).length;
}

function row(kind: RowKind, tally: Tally): TagRow {
  return { ...kind, ...tally, lowData: tally.total < LOW_DATA_ANSWERS };
}

/** Lowest share correct first; between equals, the one with more answers, then by name. */
function weakestFirst(a: TagRow, b: TagRow): number {
  return (
    a.correct * b.total - b.correct * a.total ||
    b.total - a.total ||
    rowLabel(a).localeCompare(rowLabel(b))
  );
}

/** What a row is called: the tag itself, "untagged", or "Archived question". */
export function rowLabel(row: TagRow): string {
  switch (row.kind) {
    case 'tag':
      return row.tag;
    case 'untagged':
      return 'untagged';
    case 'archived':
      return 'Archived question';
  }
}

/**
 * The filter that practises a row: its tag, or the untagged questions.
 * Archived questions cannot be practised, being in no edition held.
 */
export function practiseFilter(row: TagRow): TagFilter | undefined {
  switch (row.kind) {
    case 'tag':
      return { tags: [row.tag], untagged: false };
    case 'untagged':
      return { tags: [], untagged: true };
    case 'archived':
      return undefined;
  }
}
