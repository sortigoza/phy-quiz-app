import { useLiveQuery } from 'dexie-react-hooks';
import type { Attempt } from '../domain/attempt';
import type { Bank } from '../domain/bank';
import { percentage } from '../domain/scoring';
import { LOW_DATA_ANSWERS, practiseFilter, rowLabel, tagBreakdown } from '../domain/tag-breakdown';
import type { TagFilter } from '../domain/tags';
import { newestEdition } from '../history';
import type { StoredBank } from '../storage/db';
import { storageProblem } from '../storage/problems';

/**
 * The tag breakdown panel in history: accuracy per tag on one bank, weakest
 * first, over the counted attempts history is showing. Each tag opens the
 * start screen aimed at it, which is the point: see a weak tag, practise it.
 *
 * Tags come from the newest edition of the bank held, read live, so loading
 * the bank while history is open fills the panel in.
 */

type Props = {
  bankId: string;
  /** History's attempts under its current filters, all on this bank. */
  attempts: readonly Attempt[];
  onPractise: (stored: StoredBank, bank: Bank, tagFilter: TagFilter) => void;
};

export function TagBreakdown({ bankId, attempts, onPractise }: Props) {
  const held = useLiveQuery(
    () =>
      newestEdition(bankId).then(
        (edition) => ({ edition, problem: null }),
        (error: unknown) => ({ edition: undefined, problem: storageProblem(error) }),
      ),
    [bankId],
  );

  if (held === undefined) return null;
  const { edition, problem } = held;
  const rows = edition ? tagBreakdown(attempts, edition.bank) : [];

  return (
    <section className="card tag-breakdown" aria-labelledby="tag-breakdown-heading">
      <h3 id="tag-breakdown-heading">Tag breakdown</h3>
      {problem ? (
        <p className="panel panel--error" role="alert">
          {problem}
        </p>
      ) : !edition ? (
        <p className="history__empty">Load the bank to see the tag breakdown.</p>
      ) : rows.length === 0 ? (
        <p className="history__empty">No counted attempts on this bank yet.</p>
      ) : (
        <>
          <p className="history__intro">
            Correct answers per tag over the counted attempts shown, weakest first. Unanswered
            questions count as wrong. Choose a tag to practise it.
          </p>
          <div className="table-scroll">
            <table className="fields">
              <caption className="visually-hidden">Tag breakdown, weakest first</caption>
              <thead>
                <tr>
                  <th scope="col">Tag</th>
                  <th scope="col">Correct</th>
                  <th scope="col">Confident errors</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const label = rowLabel(row);
                  const filter = practiseFilter(row);
                  return (
                    <tr key={`${row.kind}:${label}`}>
                      <td>
                        {filter ? (
                          <button
                            type="button"
                            className="button button--quiet"
                            aria-label={`Practise ${label}`}
                            onClick={() => onPractise(edition.stored, edition.bank, filter)}
                          >
                            {label}
                          </button>
                        ) : (
                          label
                        )}
                      </td>
                      <td>
                        {row.correct}/{row.total} ({percentage(row.correct, row.total)}%)
                        {row.lowData && (
                          <>
                            {' '}
                            <span
                              className="badge badge--low-data"
                              title={`Fewer than ${LOW_DATA_ANSWERS} answers: too few to say much`}
                            >
                              Low data
                            </span>
                          </>
                        )}
                      </td>
                      <td>{row.confidentErrors}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
