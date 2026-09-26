import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Attempt } from '../domain/attempt';
import { historyFileName, writeHistoryFile, type RejectedAttempt } from '../domain/history-file';
import type { AttemptReview } from '../domain/review';
import { percentage } from '../domain/scoring';
import {
  filterHistory,
  historyFilterValues,
  importHistory,
  reviewFromHistory,
  type HistoryFilter,
} from '../history';
import { listAttempts } from '../storage/db';
import { storageProblem } from '../storage/problems';
import { APP_VERSION } from '../version';
import { saveFile } from './download';
import { UnverifiedBadge } from './UnverifiedBadge';

/**
 * History: every attempt held in this browser, newest first, and where export
 * and import live. A teacher imports a class's files here to see them together.
 *
 * Attempts that arrived by import are badged unverified: the app cannot prove
 * they are genuine, and says so rather than implying otherwise.
 *
 * Each row opens its attempt's review. The filter is held by the app, so it is
 * still set on the way back.
 */

type Props = {
  filter: HistoryFilter;
  onFilter: (filter: HistoryFilter) => void;
  onReview: (attempt: Attempt, review: AttemptReview) => void;
  onDone: () => void;
};

/** What importing a batch of files did, added up, with every reason kept. */
type ImportOutcome = {
  /** Whether any file was read at all, so there are totals worth showing. */
  read: boolean;
  added: number;
  duplicates: number;
  rejected: Array<RejectedAttempt & { file: string }>;
  /** Files refused whole, and why. */
  refused: Array<{ file: string; message: string }>;
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** "45 s", "3 min 20 s", "1 h 5 min". */
function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return seconds % 60 === 0 ? `${minutes} min` : `${minutes} min ${seconds % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

export function History({ filter, onFilter, onReview, onDone }: Props) {
  // Live, so an import shows up in the table without anything refreshing it.
  const held = useLiveQuery(() =>
    listAttempts().then(
      (attempts) => ({ attempts, problem: null }),
      (error: unknown) => ({ attempts: [] as Attempt[], problem: storageProblem(error) }),
    ),
  );
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [importing, setImporting] = useState(false);
  const [reviewProblem, setReviewProblem] = useState<string | null>(null);

  const all = held?.attempts ?? [];
  const shown = filterHistory(all, filter);
  const filterValues = historyFilterValues(all);
  const filtered = filter.name !== undefined || filter.bankId !== undefined;

  function exportAttempts(attempts: Attempt[]) {
    const now = new Date();
    saveFile(historyFileName(now), writeHistoryFile(attempts, now, APP_VERSION));
  }

  async function openReview(attempt: Attempt) {
    try {
      onReview(attempt, await reviewFromHistory(attempt));
    } catch (error) {
      setReviewProblem(storageProblem(error));
    }
  }

  async function importFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setImporting(true);
    const next: ImportOutcome = { read: false, added: 0, duplicates: 0, rejected: [], refused: [] };
    // One at a time, so a record repeated across two files counts once as added.
    for (const file of files) {
      try {
        const report = await importHistory(await file.text());
        if (!report.ok) {
          next.refused.push({ file: file.name, message: report.message });
          continue;
        }
        next.read = true;
        next.added += report.added;
        next.duplicates += report.duplicates;
        next.rejected.push(
          ...report.rejected.map((rejected) => ({ ...rejected, file: file.name })),
        );
      } catch (error) {
        next.refused.push({ file: file.name, message: storageProblem(error) });
      }
    }
    setOutcome(next);
    setImporting(false);
  }

  return (
    <section className="history">
      <h2>History</h2>

      <p className="history__intro">
        Every attempt taken or imported in this browser. Export them to a file to move them to
        another device or hand them to a teacher; import files to see a class together.
      </p>

      <div className="history__tools">
        <label className="button" htmlFor="history-files" aria-disabled={importing}>
          {importing ? 'Importing…' : 'Import history files'}
        </label>
        <input
          id="history-files"
          className="visually-hidden"
          type="file"
          accept=".json,application/json"
          multiple
          disabled={importing}
          onChange={(event) => {
            void importFiles(event.target.files);
            // Allow the same file to be chosen twice in a row.
            event.target.value = '';
          }}
        />
        {all.length > 0 && (
          <button
            type="button"
            className="button button--quiet"
            onClick={() => exportAttempts(all)}
          >
            Export all {plural(all.length, 'attempt')}
          </button>
        )}
        {filtered && shown.length > 0 && (
          <button
            type="button"
            className="button button--quiet"
            onClick={() => exportAttempts(shown)}
          >
            Export these {plural(shown.length, 'attempt')}
          </button>
        )}
      </div>

      {outcome && outcome.refused.length > 0 && (
        <div className="panel panel--error" role="alert">
          <h3>Not imported</h3>
          <ul className="issues">
            {outcome.refused.map(({ file, message }, index) => (
              <li key={`${file}-${index}`}>
                <code>{file}</code> {message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {outcome?.read && (
        <div className="panel panel--notice" role="status">
          <p className="history__report">
            Imported {outcome.added}, skipped {plural(outcome.duplicates, 'duplicate')}, rejected{' '}
            {outcome.rejected.length} invalid.
          </p>
          {outcome.rejected.length > 0 && (
            <details>
              <summary>
                Why {outcome.rejected.length === 1 ? 'it was' : 'they were'} rejected
              </summary>
              <ul className="issues">
                {outcome.rejected.map(({ file, position, reason }) => (
                  <li key={`${file}-${position}`}>
                    <code>{file}</code>, attempt {position}: {reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {reviewProblem && (
        <p className="panel panel--error" role="alert">
          {reviewProblem}
        </p>
      )}

      {held?.problem && (
        <p className="panel panel--error" role="alert">
          {held.problem}
        </p>
      )}

      {held === undefined ? null : all.length === 0 ? (
        <p className="history__empty">No attempts yet. Take a quiz, or import a history file.</p>
      ) : (
        <>
          <div className="history__filters">
            <label>
              Participant
              <select
                value={filter.name ?? ''}
                onChange={(event) => onFilter({ ...filter, name: event.target.value || undefined })}
              >
                <option value="">Everyone</option>
                {filterValues.names.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bank
              <select
                value={filter.bankId ?? ''}
                onChange={(event) =>
                  onFilter({ ...filter, bankId: event.target.value || undefined })
                }
              >
                <option value="">All banks</option>
                {filterValues.banks.map((bank) => (
                  <option key={bank.bankId} value={bank.bankId}>
                    {bank.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-scroll">
            <table className="fields history__table">
              <caption className="visually-hidden">Attempts, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Participant</th>
                  <th scope="col">Bank</th>
                  <th scope="col">Score</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Code</th>
                  <th scope="col">
                    <span className="visually-hidden">Review</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((attempt) => (
                  <tr key={attempt.id}>
                    <td>
                      <time dateTime={attempt.submittedAt}>
                        {dateFormat.format(new Date(attempt.submittedAt))}
                      </time>
                    </td>
                    <td>{attempt.name}</td>
                    <td>{attempt.bankTitle}</td>
                    <td>
                      {attempt.correctCount} of {attempt.questionCount} (
                      {percentage(attempt.correctCount, attempt.questionCount)}%)
                      {attempt.origin === 'imported' && (
                        <>
                          {' '}
                          <UnverifiedBadge />
                        </>
                      )}
                    </td>
                    <td>{formatDuration(attempt.durationMs)}</td>
                    <td className="history__code">{attempt.code}</td>
                    <td>
                      <button
                        type="button"
                        className="button button--quiet"
                        aria-label={`Review attempt ${attempt.code}`}
                        onClick={() => void openReview(attempt)}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="actions">
        <button type="button" className="button" onClick={onDone}>
          Back to library
        </button>
      </div>
    </section>
  );
}
