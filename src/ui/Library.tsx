import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { openBankLink, type OpenBankLinkResult } from '../bank-link';
import {
  loadBankRepository,
  replaceRepositoryEntry,
  type RepositoryOutcome,
} from '../bank-repository';
import { fetchBankText, fetchFailureMessage } from '../bank-url';
import {
  addBankFromText,
  privateBankMessage,
  type AddBankOptions,
  type AddBankResult,
  type AddBankStatus,
} from '../library';
import { findInProgress, openStoredBank, type InProgressAttempt } from '../quiz';
import {
  deleteBank,
  deleteInProgress,
  listBanks,
  type BankSource,
  type StoredBank,
} from '../storage/db';
import type { Bank, BankIssue } from '../domain/bank';
import { isBankRepository, parseBankRepository } from '../domain/bank-repository';
import type { ParsedBankLink } from '../domain/private-bank';
import { storageProblem } from '../storage/problems';
import { InProgressOffer } from './InProgressOffer';

/**
 * The library: every question bank held in this browser, and the way to add one.
 *
 * A bank arrives by upload, by URL or by bank link, and from then on they are
 * all the same: each goes through `addBankFromText`. A bank repository, by
 * upload or URL, delivers several banks that way at once. The dedicated validation
 * screen with its richer error reporting is ticket 06.
 */

/**
 * Why the last thing asked of the library did not happen: a file with problems
 * (`intro` says whether it was a bank, a private bank or a repository), a link that
 * failed, a private bank that would not open, or a bank already held that no
 * longer opens.
 */
type Rejection =
  | { kind: 'invalid'; name: string; issues: BankIssue[]; intro: string }
  | { kind: 'unreachable'; message: string }
  | { kind: 'private-bank'; message: string }
  | { kind: 'storage'; message: string }
  | { kind: 'unopenable'; bank: StoredBank; issues: BankIssue[] };

/** A bank from the library, parsed and ready to start. */
type OpenedBank = { stored: StoredBank; bank: Bank };

/** A bank that changed without a version bump, waiting for a decision. */
type Conflict = {
  text: string;
  source: BankSource;
  options: AddBankOptions;
  existing: StoredBank;
  incoming: StoredBank;
};

/** What loading a bank repository did, entry by entry. */
type RepositoryReport = { title: string; outcomes: RepositoryOutcome[] };

const INVALID_BANK_INTRO = 'Nothing was added. Fix these and try again:';

const BROKEN_LINK_MESSAGE =
  'This bank link is incomplete, perhaps cut short by the app that carried it. Ask for the link again, and open all of it.';

function sourceName(source: BankSource): string {
  return source.kind === 'upload' ? source.filename : source.url;
}

const statusMessage: Record<AddBankStatus, (bank: StoredBank) => string> = {
  added: (bank) => `Added ${bank.title}.`,
  replaced: (bank) => `Replaced ${bank.title}: same version, different content.`,
  unchanged: (bank) => `${bank.title} is already in your library.`,
};

type Props = {
  onStart: (stored: StoredBank, bank: Bank) => void;
  onResume: (inProgress: InProgressAttempt, index: number) => void;
  /** A bank link the app was opened with, already cleared from the address bar. */
  bankLink?: ParsedBankLink;
  /** Called once the bank link's outcome is on screen, so it is not opened again. */
  onBankLinkHandled?: () => void;
};

const noBankLink: ParsedBankLink = { kind: 'none' };

export function Library({ onStart, onResume, bankLink = noBankLink, onBankLinkHandled }: Props) {
  // Dexie pushes a new value whenever the table changes, so adding or removing
  // a bank updates this list without anything having to remember to refresh it.
  // Undefined means the first read has not resolved yet.
  const held = useLiveQuery(() =>
    listBanks().then(
      (banks) => ({ banks, problem: null }),
      (error: unknown) => ({ banks: [], problem: storageProblem(error) }),
    ),
  );
  const banks = held?.banks;
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [report, setReport] = useState<RepositoryReport | null>(null);
  const [progress, setProgress] = useState<{ settled: number; total: number } | null>(null);
  // Live, so removing the bank of an attempt in progress is reflected at once.
  // Null when there is none; undefined until the first read, and the bank list
  // waits for it so that Start cannot skip the question about discarding. A
  // failure here is the one the bank list reports, so it is not repeated.
  const pending = useLiveQuery(() =>
    findInProgress().then(
      (found) => found ?? null,
      () => null,
    ),
  );
  const [startingOver, setStartingOver] = useState<OpenedBank | null>(null);

  /** Clears whatever the last action left on screen, before the next one says anything. */
  const clearPanels = useCallback(() => {
    setRejection(null);
    setNotice(null);
    setConflict(null);
    setReport(null);
  }, []);

  /**
   * Runs one load at a time. A second load started mid-repository would share
   * its progress line and overwrite its report, so it is refused until then.
   */
  const exclusive = useCallback(async (load: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

  function requestStart(stored: StoredBank) {
    clearPanels();
    const opened = openStoredBank(stored);
    if (!opened.ok) {
      setRejection({ kind: 'unopenable', bank: stored, issues: opened.issues });
      return;
    }
    if (pending) setStartingOver({ stored, bank: opened.bank });
    else onStart(stored, opened.bank);
  }

  /** Runs something that touches storage, explaining a failure rather than dropping it. */
  const guard = useCallback(
    async (operation: () => Promise<void>) => {
      try {
        await operation();
      } catch (error) {
        clearPanels();
        setRejection({ kind: 'storage', message: storageProblem(error) });
      }
    },
    [clearPanels],
  );

  async function discardInProgress() {
    setStartingOver(null);
    await guard(async () => {
      await deleteInProgress();
      if (startingOver) onStart(startingOver.stored, startingOver.bank);
    });
  }

  const showResult = useCallback(
    (result: AddBankResult, text: string, source: BankSource, options: AddBankOptions) => {
      clearPanels();

      if (!result.ok) {
        if (result.reason === 'invalid') {
          setRejection({
            kind: 'invalid',
            name: sourceName(source),
            issues: result.issues,
            intro: result.private
              ? 'This private bank opened, but it is not a valid bank:'
              : INVALID_BANK_INTRO,
          });
        } else {
          setRejection({ kind: 'private-bank', message: privateBankMessage[result.reason] });
        }
      } else if (result.status === 'conflict') {
        setConflict({ text, source, options, existing: result.existing, incoming: result.bank });
      } else {
        setNotice(statusMessage[result.status](result.bank));
      }
    },
    [clearPanels],
  );

  const addText = useCallback(
    (text: string, source: BankSource, options: AddBankOptions = {}) =>
      guard(async () => {
        showResult(await addBankFromText(text, source, options), text, source, options);
      }),
    [guard, showResult],
  );

  // Opened once per link, even though React may run this effect twice: the
  // promise is kept, and only a live effect shows what it settles to.
  const opening = useRef<{ link: ParsedBankLink; result: Promise<OpenBankLinkResult> }>(null);
  const [shownLink, setShownLink] = useState<ParsedBankLink | null>(null);
  useEffect(() => {
    if (bankLink.kind === 'none') return;
    if (opening.current?.link !== bankLink) {
      opening.current = { link: bankLink, result: openBankLink(bankLink) };
    }

    let live = true;
    const settle = (next: () => void) => {
      if (!live) return;
      next();
      setShownLink(bankLink);
      onBankLinkHandled?.();
    };
    opening.current.result.then(
      (opened) =>
        settle(() => {
          if (opened.kind === 'fetched') {
            showResult(opened.result, opened.text, opened.source, opened.options);
            return;
          }
          clearPanels();
          setRejection({
            kind: 'unreachable',
            message:
              opened.kind === 'broken' ? BROKEN_LINK_MESSAGE : fetchFailureMessage(opened.failure),
          });
        }),
      (error: unknown) =>
        settle(() => {
          clearPanels();
          setRejection({ kind: 'storage', message: storageProblem(error) });
        }),
    );
    return () => {
      live = false;
    };
  }, [bankLink, onBankLinkHandled, showResult, clearPanels]);

  /**
   * Loads every bank a repository lists and reports each. `base` is the address
   * it was read from; an uploaded repository has none, so its relative entries fail.
   */
  const loadRepository = useCallback(
    async (text: string, name: string, base?: string) => {
      clearPanels();

      const parsed = parseBankRepository(text, base);
      if (!parsed.ok) {
        setRejection({
          kind: 'invalid',
          name,
          issues: parsed.issues,
          intro:
            'This is not a valid bank repository, so none of its banks were loaded. Fix these:',
        });
        return;
      }

      const { title, entries } = parsed.repository;
      setProgress({ settled: 0, total: entries.length });
      try {
        const outcomes = await loadBankRepository(parsed.repository, {
          onProgress: (settled) => setProgress({ settled, total: entries.length }),
        });
        setReport({ title, outcomes });
      } finally {
        setProgress(null);
      }
    },
    [clearPanels],
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      await exclusive(async () => {
        const text = await file.text();
        if (isBankRepository(text)) await loadRepository(text, file.name);
        else await addText(text, { kind: 'upload', filename: file.name });
      });
    },
    [addText, exclusive, loadRepository],
  );

  async function replaceInReport(index: number) {
    const outcome = report?.outcomes[index];
    if (outcome?.kind !== 'conflict') return;
    await exclusive(() =>
      guard(async () => {
        const replaced = await replaceRepositoryEntry(outcome);
        setReport(
          (current) =>
            current && {
              ...current,
              outcomes: current.outcomes.map((each, at) => (at === index ? replaced : each)),
            },
        );
      }),
    );
  }

  async function handleUrl(event: FormEvent) {
    event.preventDefault();
    await exclusive(async () => {
      const fetched = await fetchBankText(url);
      if (fetched.ok && isBankRepository(fetched.text)) {
        await loadRepository(fetched.text, fetched.url, fetched.url);
      } else if (fetched.ok) {
        await addText(fetched.text, { kind: 'url', url: fetched.url });
      } else {
        clearPanels();
        setRejection({ kind: 'unreachable', message: fetchFailureMessage(fetched.failure) });
      }
    });
  }

  const handleRemove = useCallback(
    (bank: StoredBank) =>
      guard(async () => {
        await deleteBank(bank.key);
        clearPanels();
        setNotice(`Removed ${bank.title}.`);
      }),
    [clearPanels, guard],
  );

  return (
    <section className="library">
      <h2>Your question banks</h2>

      {pending && (
        <InProgressOffer
          pending={pending}
          startingOver={startingOver?.stored ?? null}
          onResume={() => {
            if (pending.blocked === null) onResume(pending.inProgress, pending.index);
          }}
          onDiscard={() => void discardInProgress()}
          onKeep={() => setStartingOver(null)}
        />
      )}

      <p className="library__intro">
        A question bank is a single file holding a set of questions. Load one to take a quiz from
        it.
      </p>

      <form className="library__url" onSubmit={(event) => void handleUrl(event)}>
        <label htmlFor="bank-url">Load a bank or bank repository URL</label>
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
          <button type="submit" className="button" disabled={busy}>
            {busy ? 'Loading…' : 'Load from URL'}
          </button>
          <span className="library__upload">
            <label className="button button--quiet" htmlFor="bank-file">
              Upload a bank file
            </label>
            <input
              id="bank-file"
              className="visually-hidden"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(event) => {
                void handleFiles(event.target.files);
                // Allow the same file to be chosen twice in a row.
                event.target.value = '';
              }}
            />
          </span>
        </div>
        <span className="library__hint">
          JSON only for now. A bank repository loads every bank it lists. A GitHub file link works
          from a public repository; other hosts must allow cross-origin requests.
        </span>
      </form>

      {rejection?.kind === 'invalid' && (
        <div className="panel panel--error" role="alert">
          <h3>
            Could not load <code>{rejection.name}</code>
          </h3>
          <p>{rejection.intro}</p>
          <IssueList issues={rejection.issues} />
        </div>
      )}

      {rejection?.kind === 'unopenable' && (
        <div className="panel panel--error" role="alert">
          <h3>{rejection.bank.title} can no longer be opened</h3>
          <p>
            It was added to your library, but it does not pass this version's checks, so no quiz can
            be taken from it. Load a corrected copy of the file, or remove it:
          </p>
          <IssueList issues={rejection.issues} />
          <div className="actions">
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setRejection(null)}
            >
              Keep it
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void handleRemove(rejection.bank)}
            >
              Remove it
            </button>
          </div>
        </div>
      )}

      {held?.problem && (
        <p className="panel panel--error" role="alert">
          {held.problem}
        </p>
      )}

      {(rejection?.kind === 'unreachable' ||
        rejection?.kind === 'private-bank' ||
        rejection?.kind === 'storage') && (
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
              onClick={() =>
                void addText(conflict.text, conflict.source, { ...conflict.options, replace: true })
              }
            >
              Replace
            </button>
          </div>
        </div>
      )}

      {bankLink.kind === 'bank-link' && shownLink !== bankLink && (
        <p className="panel panel--notice" role="status">
          Opening the bank from your link…
        </p>
      )}

      {progress && (
        <p className="panel panel--notice" role="status">
          Loading {progress.settled} of {progress.total}…
        </p>
      )}

      {report && (
        <RepositoryReportPanel report={report} onReplace={(index) => void replaceInReport(index)} />
      )}

      {notice && (
        <p className="panel panel--notice" role="status">
          {notice}
        </p>
      )}

      {banks === undefined || pending === undefined ? null : banks.length === 0 ? (
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
                  {bank.kid !== undefined && (
                    <span className="bank__private" title="Opened with a bank link">
                      🔒 Private
                    </span>
                  )}
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
                  onClick={() => requestStart(bank)}
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

function IssueList({ issues }: { issues: BankIssue[] }) {
  return (
    <ul className="issues">
      {issues.map((issue, index) => (
        <li key={`${issue.path}-${index}`}>
          {issue.path && <code>{issue.path}</code>} {issue.message}
        </li>
      ))}
    </ul>
  );
}

const outcomeLabel: Record<RepositoryOutcome['kind'], string> = {
  added: 'added',
  replaced: 'replaced',
  unchanged: 'already held',
  conflict: 'changed without a version bump',
  failed: 'failed',
};

/** Counts per kind, in a fixed order, leaving out the kinds that did not happen. */
function reportSummary(outcomes: RepositoryOutcome[]): string {
  const kinds = Object.keys(outcomeLabel) as RepositoryOutcome['kind'][];
  return kinds
    .map((kind) => [kind, outcomes.filter((outcome) => outcome.kind === kind).length] as const)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${count} ${outcomeLabel[kind]}`)
    .join(', ');
}

function outcomeText(outcome: RepositoryOutcome): string {
  switch (outcome.kind) {
    case 'added':
    case 'replaced':
    case 'unchanged':
      return statusMessage[outcome.kind](outcome.bank);
    case 'conflict':
      return `${outcome.existing.title} v${outcome.existing.version} changed without a version bump (fingerprint ${outcome.existing.fingerprint} held, ${outcome.bank.fingerprint} new). Attempts already taken keep the old fingerprint.`;
    case 'failed':
      return outcome.message;
  }
}

function RepositoryReportPanel({
  report,
  onReplace,
}: {
  report: RepositoryReport;
  onReplace: (index: number) => void;
}) {
  return (
    <section className="panel repository-report" aria-labelledby="repository-report-title">
      <h3 id="repository-report-title">{report.title}</h3>
      <p>{reportSummary(report.outcomes)}.</p>
      <ul className="repository-report__list">
        {report.outcomes.map((outcome, index) => (
          <li
            key={`${index}:${outcome.entry.given}`}
            className={`repository-report__line repository-report__line--${outcome.kind}`}
          >
            <code>{outcome.entry.given}</code> {outcomeText(outcome)}
            {outcome.kind === 'conflict' && (
              <button type="button" className="button" onClick={() => onReplace(index)}>
                Replace
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
