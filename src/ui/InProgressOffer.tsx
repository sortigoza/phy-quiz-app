import type { PendingAttempt } from '../quiz';
import type { StoredBank } from '../storage/db';

/**
 * The attempt left in progress in this browser, offered back on the library.
 *
 * Only one attempt can be in progress, so starting another bank while this one
 * waits asks first, in the same place, rather than silently throwing it away.
 */

type Props = {
  pending: PendingAttempt;
  /** A bank the participant asked to start while this attempt waits, or null. */
  startingOver: StoredBank | null;
  onResume: () => void;
  onDiscard: () => void;
  onKeep: () => void;
};

export function InProgressOffer({ pending, startingOver, onResume, onDiscard, onKeep }: Props) {
  const { bankTitle, answered, total, blocked } = pending;

  return (
    <section className="panel panel--notice" aria-labelledby="in-progress-heading">
      <h3 id="in-progress-heading">Quiz in progress</h3>
      <p>
        You have a quiz in progress on <strong>{bankTitle}</strong>, {answered} of {total} answered.
      </p>
      {blocked && <p>{blocked} It cannot be resumed.</p>}

      {startingOver ? (
        <div role="alert">
          <p>
            Starting <strong>{startingOver.title}</strong> discards it. Only one quiz can be in
            progress at a time.
          </p>
          <div className="actions">
            <button type="button" className="button button--quiet" onClick={onKeep}>
              Keep it
            </button>
            <button type="button" className="button" onClick={onDiscard}>
              Discard it and start
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button type="button" className="button button--quiet" onClick={onDiscard}>
            Discard
          </button>
          {!blocked && (
            <button type="button" className="button" onClick={onResume}>
              Resume
            </button>
          )}
        </div>
      )}
    </section>
  );
}
