import { z } from 'zod';
import { rawUrlFor } from '../bank-url';
import { bankIdSchema, formatPath, type BankIssue } from './bank';
import { decodeBankKey } from './private-bank';

/**
 * The bank repository format, version 1: one file listing the URLs of several
 * banks, so that one link can load a whole course. SPEC section 3.5.
 *
 * Strict like the bank format, for the same reason: a misspelled key must fail
 * loudly rather than quietly load fewer banks than the author listed.
 */

export const repositorySchema = z.strictObject({
  $schema: z.string().max(500).optional(),
  id: bankIdSchema.optional(),
  formatVersion: z.literal(1, {
    error:
      'formatVersion must be 1; this app cannot read other versions of the bank repository format',
  }),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000).optional(),
  author: z.string().min(1).max(200).optional(),
  banks: z
    .array(
      z.strictObject({
        url: z.string().min(1).max(2000),
        /** The bank this entry points at, for the author CLI to find its key. The app ignores it. */
        bank: bankIdSchema.optional(),
        /** The bank's key, only ever inside an encrypted repository. SPEC section 3.5.1. */
        key: z
          .string()
          .refine((key) => decodeBankKey(key) !== null, 'a bank key is 32 bytes of base64url')
          .optional(),
      }),
    )
    .min(1)
    .max(100),
});

/** One bank a repository lists. */
export type RepositoryEntry = {
  /** The `url` exactly as the repository wrote it. */
  given: string;
  /** Where to fetch it, or null when it is relative and there is nothing to resolve it against. */
  url: string | null;
  /** The bank's key, carried by a private repository. */
  key?: Uint8Array | undefined;
};

export type BankRepository = {
  id?: string | undefined;
  title: string;
  entries: RepositoryEntry[];
};

export type ParseRepositoryResult =
  { ok: true; repository: BankRepository } | { ok: false; issues: BankIssue[] };

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const document: unknown = JSON.parse(text);
    return typeof document === 'object' && document !== null && !Array.isArray(document)
      ? (document as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Whether a file is a bank repository rather than a bank, judged by its content alone. */
export function isBankRepository(text: string): boolean {
  const document = parseJsonObject(text);
  return document !== null && Array.isArray(document.banks) && !('questions' in document);
}

function resolve(given: string, base: string | undefined): string | null {
  try {
    return new URL(given, base).href;
  } catch {
    return null;
  }
}

/** A key in a plaintext repository has been published with it, so it is refused, not used. */
const PUBLIC_KEY_MESSAGE =
  'this repository holds a bank key in plain text, so the key is now public. Rotate it, and publish the repository encrypted with the author tool';

/**
 * Parses and validates a repository, resolving each entry against `base`, the
 * address the repository was read from. Either the whole repository is valid
 * or none of it is returned. `encrypted` says it arrived as a private
 * repository, the only place a bank key may appear.
 */
export function parseBankRepository(
  text: string,
  base?: string,
  { encrypted = false }: { encrypted?: boolean } = {},
): ParseRepositoryResult {
  const result = repositorySchema.safeParse(parseJsonObject(text));
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) => ({
        path: formatPath(issue.path),
        message: issue.message,
      })),
    };
  }

  const { id, title, banks } = result.data;
  const entries = banks.map(({ url, key }) => ({
    given: url,
    url: resolve(url, base),
    key: key === undefined ? undefined : (decodeBankKey(key) ?? undefined),
  }));

  const issues: BankIssue[] = [];
  if (!encrypted) {
    for (const [index, { key }] of banks.entries()) {
      if (key !== undefined)
        issues.push({ path: `banks[${index}].key`, message: PUBLIC_KEY_MESSAGE });
    }
  }
  const firstSeen = new Map<string, number>();
  for (const [index, { given, url }] of entries.entries()) {
    // Compared as fetched, so a GitHub file page and its raw file are one bank.
    const address = url === null ? given : rawUrlFor(url);
    const earlier = firstSeen.get(address);
    if (earlier === undefined) firstSeen.set(address, index);
    else {
      issues.push({
        path: `banks[${index}].url`,
        message: `this is the same bank as banks[${earlier}]; list each bank once`,
      });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  return { ok: true, repository: { id, title, entries } };
}
