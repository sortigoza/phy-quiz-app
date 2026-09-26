import { parseBank, type Bank, type BankIssue } from './domain/bank';
import { isBankRepository, parseBankRepository } from './domain/bank-repository';
import { openText, privateBankMessage } from './library';

/**
 * Checking a file without loading it: the Validate a bank screen. SPEC section 3.3.
 *
 * The file goes through the same checks as a file handed to the library, so
 * a file that passes here loads there, but nothing is ever stored. A private
 * bank opens only with a key this browser already holds.
 */

export type Validation =
  | { ok: true; kind: 'bank'; bank: Bank }
  | { ok: true; kind: 'repository'; title: string; count: number }
  | { ok: false; kind: 'bank' | 'repository'; issues: BankIssue[] }
  /** A file that could not be read, or a private one this browser holds no key for or that would not decrypt. */
  | { ok: false; kind: 'unopened'; message: string };

export async function validateText(text: string): Promise<Validation> {
  const opened = await openText(text, undefined);
  if (!opened.ok)
    return { ok: false, kind: 'unopened', message: privateBankMessage[opened.reason] };

  if (isBankRepository(opened.plaintext)) {
    const parsed = parseBankRepository(opened.plaintext, undefined, {
      encrypted: opened.kid !== undefined,
    });
    return parsed.ok
      ? {
          ok: true,
          kind: 'repository',
          title: parsed.repository.title,
          count: parsed.repository.entries.length,
        }
      : { ok: false, kind: 'repository', issues: parsed.issues };
  }

  const parsed = parseBank(opened.plaintext);
  return parsed.ok
    ? { ok: true, kind: 'bank', bank: parsed.bank }
    : { ok: false, kind: 'bank', issues: parsed.issues };
}
