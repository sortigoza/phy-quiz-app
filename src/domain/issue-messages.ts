import type { z } from 'zod';

/**
 * Validation messages in words a teacher can act on, in place of Zod's own
 * (`Too small: expected array to have >=1 items`).
 *
 * `teacherMessages` is passed to `safeParse`, where it words every issue whose
 * schema did not already give one of its own. An unknown key is worded later,
 * by `unknownFieldIssues`, because it is split into one issue per key.
 */

type RawIssue = z.core.$ZodRawIssue;

const typeNames: Record<string, string> = {
  string: 'text',
  number: 'a number',
  int: 'a whole number',
  boolean: 'true or false',
  array: 'a list',
  object: 'an object with named fields',
};

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return Number.isInteger(value) ? 'a whole number' : 'a number';
  if (typeof value === 'boolean') return String(value);
  return 'an object';
}

function plural(count: number | bigint, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "a, b or c", for listing the few values a field allows. */
function orList(values: readonly unknown[]): string {
  const shown = values.map(String);
  return shown.length <= 1
    ? (shown[0] ?? '')
    : `${shown.slice(0, -1).join(', ')} or ${shown[shown.length - 1]}`;
}

export function teacherMessages(issue: RawIssue): string | undefined {
  switch (issue.code) {
    case 'invalid_type': {
      if (issue.input === undefined) return 'this field is required and is missing';
      const expected = typeNames[issue.expected] ?? issue.expected;
      const hint =
        issue.expected === 'string' && typeof issue.input === 'number'
          ? '; put it in quotes'
          : '';
      return `should be ${expected}, but is ${describeValue(issue.input)}${hint}`;
    }
    case 'too_small':
      if (issue.origin === 'string') {
        return issue.minimum === 1
          ? 'is empty: it needs some text'
          : `is too short: it needs at least ${plural(issue.minimum, 'character')}`;
      }
      if (issue.origin === 'array') {
        return `needs at least ${plural(issue.minimum, 'item')}, but has ${plural((issue.input as unknown[]).length, 'item')}`;
      }
      return `must be at least ${issue.minimum}`;
    case 'too_big':
      if (issue.origin === 'string') {
        return `is too long: it may have at most ${plural(issue.maximum, 'character')}, but has ${(issue.input as string).length}`;
      }
      if (issue.origin === 'array') {
        return `has too many items: at most ${issue.maximum} are allowed, but it has ${(issue.input as unknown[]).length}`;
      }
      return `must be at most ${issue.maximum}`;
    case 'invalid_value':
      return `must be ${orList(issue.values)}, but is ${JSON.stringify(issue.input)}`;
    case 'invalid_format':
      return `is not in the expected form`;
    default:
      return undefined;
  }
}

/** A Zod issue as reported, before its path is rendered. */
type ReportedIssue = { path: PropertyKey[]; message: string };

/**
 * One issue per unknown key, addressed at the key itself, suggesting the
 * known field it most resembles when there is one. `known` gives the fields
 * the object at a path accepts.
 */
export function unknownFieldIssues(
  path: PropertyKey[],
  keys: string[],
  known: readonly string[],
): ReportedIssue[] {
  return keys.map((key) => {
    const guess = closest(key, known);
    const suggestion = guess
      ? `did you mean "${guess}"?`
      : `the fields allowed here are ${known.join(', ')}`;
    return {
      path: [...path, key],
      message: `unknown field "${key}": ${suggestion} Misspelled fields are refused, so that nothing is silently lost.`,
    };
  });
}

/** The known name within two edits of `key`, ignoring case, if there is one. */
function closest(key: string, known: readonly string[]): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const name of known) {
    const distance = editDistance(key.toLowerCase(), name.toLowerCase());
    if (distance <= 2 && (!best || distance < best.distance)) best = { name, distance };
  }
  return best?.name;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (const [i, charA] of [...a].entries()) {
    const current = [i + 1];
    for (const [j, charB] of [...b].entries()) {
      current.push(
        Math.min(previous[j + 1]! + 1, current[j]! + 1, previous[j]! + (charA === charB ? 0 : 1)),
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}
