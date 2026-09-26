import type { Bank, BankQuestion } from './bank';

/**
 * Tags and the tag filter: restricting an attempt's selection to what a
 * question is about. Tags belong to a bank, so nothing here spans banks.
 */

/**
 * The tags an attempt's selection was restricted to. A question qualifies when
 * it carries any chosen tag, or carries none and `untagged` is set. Stored on
 * the attempt, so its shape is part of the attempt record's format.
 */
export type TagFilter = { tags: string[]; untagged: boolean };

/** Whether a filter leaves the whole bank in play: missing, or nothing chosen. */
export function isWholeBank(filter: TagFilter | undefined): boolean {
  return filter === undefined || (filter.tags.length === 0 && !filter.untagged);
}

function qualifies(question: BankQuestion, filter: TagFilter): boolean {
  const tags = question.tags ?? [];
  if (tags.length === 0) return filter.untagged;
  return tags.some((tag) => filter.tags.includes(tag));
}

/**
 * The questions a filter lets through, in bank order. Applied before the
 * seeded shuffle, so a whole-bank filter hands the shuffle exactly the bank.
 */
export function qualifyingQuestions(
  bank: Bank,
  filter: TagFilter | undefined,
): readonly BankQuestion[] {
  if (filter === undefined || isWholeBank(filter)) return bank.questions;
  return bank.questions.filter((question) => qualifies(question, filter));
}

/** A bank's tags, alphabetically, each with how many questions carry it, and how many carry none. */
export function bankTags(bank: Bank): {
  tags: Array<{ tag: string; count: number }>;
  untagged: number;
} {
  const counts = new Map<string, number>();
  let untagged = 0;
  for (const question of bank.questions) {
    const tags = new Set(question.tags ?? []);
    if (tags.size === 0) untagged += 1;
    for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return {
    tags: [...counts]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => a.tag.localeCompare(b.tag)),
    untagged,
  };
}
