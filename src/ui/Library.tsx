import { useCallback, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addBankFromText, type AddBankStatus } from '../library';
import { deleteBank, listBanks, type StoredBank } from '../storage/db';
import type { BankIssue } from '../domain/bank';

/**
 * The library: every question bank held in this browser, and the way to add one.
 *
 * Ticket 02 loads banks by upload only. Loading by URL is ticket 05, and the
 * dedicated validation screen with its richer error reporting is ticket 06.
 */

type Rejection = { filename: string; issues: BankIssue[] };

const statusMessage: Record<AddBankStatus, (bank: StoredBank) => string> = {
  added: (bank) => `Added ${bank.title}.`,
  replaced: (bank) => `Replaced ${bank.title}: same version, different content.`,
  unchanged: (bank) => `${bank.title} is already in your library.`,
};

type Props = {
  onStart: (bank: StoredBank) => void;
};

export function Library({ onStart }: Props) {
  // Dexie pushes a new value whenever the table changes, so adding or removing
  // a bank updates this list without anything having to remember to refresh it.
  // Undefined means the first read has not resolved yet.
  const banks = useLiveQuery(() => listBanks());
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handleFiles = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;

    const result = await addBankFromText(await file.text(), {
      kind: 'upload',
      filename: file.name,
    });

    if (!result.ok) {
      setNotice(null);
      setRejection({ filename: file.name, issues: result.issues });
      return;
    }

    setRejection(null);
    setNotice(statusMessage[result.status](result.bank));
  }, []);

  const handleRemove = useCallback(async (bank: StoredBank) => {
    await deleteBank(bank.key);
    setNotice(`Removed ${bank.title}.`);
  }, []);

  return (
    <section className="library">
      <h2>Your question banks</h2>

      <p className="library__intro">
        A question bank is a single file holding a set of questions. Load one to take a quiz from
        it.
      </p>

      <div className="library__add">
        <label className="button" htmlFor="bank-file">
          Load a bank file
        </label>
        <input
          id="bank-file"
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          onChange={(event) => {
            void handleFiles(event.target.files);
            // Allow the same file to be chosen twice in a row.
            event.target.value = '';
          }}
        />
        <span className="library__hint">JSON only for now.</span>
      </div>

      {rejection && (
        <div className="panel panel--error" role="alert">
          <h3>
            Could not load <code>{rejection.filename}</code>
          </h3>
          <p>Nothing was added. Fix these and try again:</p>
          <ul className="issues">
            {rejection.issues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                {issue.path && <code>{issue.path}</code>} {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notice && (
        <p className="panel panel--notice" role="status">
          {notice}
        </p>
      )}

      {banks === undefined ? null : banks.length === 0 ? (
        <p className="library__empty">No question banks yet.</p>
      ) : (
        <ul className="library__list" aria-label="Question banks">
          {banks.map((bank) => (
            <li key={bank.key} className="card bank">
              <div className="bank__body">
                <h3 className="bank__title">{bank.title}</h3>
                <p className="bank__meta">
                  {bank.author && <span>{bank.author}</span>}
                  <span>
                    {bank.questionCount} question{bank.questionCount === 1 ? '' : 's'}
                  </span>
                  <span>v{bank.version}</span>
                  <span className="bank__fingerprint" title="Fingerprint of the exact file loaded">
                    {bank.fingerprint}
                  </span>
                </p>
              </div>
              <div className="bank__actions">
                <button
                  type="button"
                  className="button"
                  aria-label={`Start ${bank.title}`}
                  onClick={() => onStart(bank)}
                >
                  Start
                </button>
                <button
                  type="button"
                  className="button button--quiet"
                  aria-label={`Remove ${bank.title}`}
                  onClick={() => void handleRemove(bank)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
