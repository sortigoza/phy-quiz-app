import { useCallback, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { fetchBankText, fetchFailureMessage } from '../bank-url';
import { addBankFromText, type AddBankOptions, type AddBankStatus } from '../library';
import { deleteBank, listBanks, type BankSource, type StoredBank } from '../storage/db';
import type { BankIssue } from '../domain/bank';

/**
 * The library: every question bank held in this browser, and the way to add one.
 *
 * A bank arrives by upload or by URL, and from then on the two are the same:
 * both go through `addBankFromText`. The dedicated validation screen with its
 * richer error reporting is ticket 06.
 */

/** Why the last bank offered was not added: problems in the file, or a link that failed. */
type Rejection =
  { kind: 'invalid'; name: string; issues: BankIssue[] } | { kind: 'unreachable'; message: string };

/** A bank that changed without a version bump, waiting for a decision. */
type Conflict = { text: string; source: BankSource; existing: StoredBank; incoming: StoredBank };

function sourceName(source: BankSource): string {
  return source.kind === 'upload' ? source.filename : source.url;
}

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
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);

  const addText = useCallback(
    async (text: string, source: BankSource, options?: AddBankOptions) => {
      const result = await addBankFromText(text, source, options);
      setRejection(null);
      setNotice(null);
      setConflict(null);

      if (!result.ok) {
        setRejection({ kind: 'invalid', name: sourceName(source), issues: result.issues });
      } else if (result.status === 'conflict') {
        setConflict({ text, source, existing: result.existing, incoming: result.bank });
      } else {
        setNotice(statusMessage[result.status](result.bank));
      }
    },
    [],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      await addText(await file.text(), { kind: 'upload', filename: file.name });
    },
    [addText],
  );

  async function handleUrl(event: FormEvent) {
    event.preventDefault();
    if (fetching) return;
    setFetching(true);
    try {
      const fetched = await fetchBankText(url);
      if (fetched.ok) {
        await addText(fetched.text, { kind: 'url', url: fetched.url });
      } else {
        setNotice(null);
        setConflict(null);
        setRejection({ kind: 'unreachable', message: fetchFailureMessage(fetched.failure) });
      }
    } finally {
      setFetching(false);
    }
  }

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
          Upload a bank file
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

      <form className="library__url" onSubmit={(event) => void handleUrl(event)}>
        <label htmlFor="bank-url">Or load a bank URL</label>
        <div className="library__url-row">
          <input
            id="bank-url"
            type="url"
            inputMode="url"
            placeholder="https://raw.githubusercontent.com/…/bank.json"
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <button type="submit" className="button" disabled={fetching}>
            {fetching ? 'Loading…' : 'Load from URL'}
          </button>
        </div>
        <span className="library__hint">
          A GitHub file link works from a public repository. Other hosts must allow cross-origin
          requests.
        </span>
      </form>

      {rejection?.kind === 'invalid' && (
        <div className="panel panel--error" role="alert">
          <h3>
            Could not load <code>{rejection.name}</code>
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

      {rejection?.kind === 'unreachable' && (
        <p className="panel panel--error" role="alert">
          {rejection.message}
        </p>
      )}

      {conflict && (
        <div className="panel panel--error" role="alert">
          <h3>
            {conflict.existing.title} v{conflict.existing.version} changed without a version bump
          </h3>
          <p>
            Your library already holds this bank at this version, but{' '}
            <code>{sourceName(conflict.source)}</code> is different (fingerprint{' '}
            <code>{conflict.existing.fingerprint}</code> held,{' '}
            <code>{conflict.incoming.fingerprint}</code> new). Replace the copy you have? Attempts
            already taken keep the old fingerprint.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setConflict(null)}
            >
              Keep the one I have
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void addText(conflict.text, conflict.source, { replace: true })}
            >
              Replace
            </button>
          </div>
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
