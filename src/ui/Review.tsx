import type { Attempt, AttemptAnswer } from '../domain/attempt';
import type { AttemptReview, ReviewedQuestion } from '../domain/review';
import { outcome, percentage, type Outcome } from '../domain/scoring';
import { BankText } from './BankText';
import { UnverifiedBadge } from './UnverifiedBadge';

/**
 * The review: where all the teaching happens.
 *
 * Every question in attempt order, with the correct option, the participant's
 * choice, the author's explanation and, when they chose a distractor its author
 * explained, that option's own note. Unanswered questions are shown as their
 * own thing, not as wrong answers, though they score the same.
 *
 * Opened from history, the review may be against another edition of the bank,
 * which it says, or against none, when only the score is left.
 */

type Props = {
  attempt: Attempt;
  review: AttemptReview;
  /** Where Done goes, to name the button. */
  backTo: 'library' | 'history';
  onDone: () => void;
};

const outcomeLabel: Record<Outcome, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  unanswered: 'Not answered',
};

export function Review({ attempt, review, backTo, onDone }: Props) {
  return (
    <section className="review">
      <h2>Review</h2>

      <p className="card review__score">
        <span className="review__name">{attempt.name}</span>
        <span className="review__tally">
          {attempt.correctCount} of {attempt.questionCount} correct (
          {percentage(attempt.correctCount, attempt.questionCount)}%)
          {attempt.origin === 'imported' && (
            <>
              {' '}
              <UnverifiedBadge />
            </>
          )}
        </span>
        <span className="review__code" title="Attempt code">
          {attempt.code}
        </span>
      </p>

      {review.edition === 'none' ? (
        <p className="panel panel--notice">
          {attempt.bankTitle} is no longer in your library. Import the bank to see the questions.
        </p>
      ) : (
        <>
          {review.edition === 'other' && (
            <p className="panel panel--notice">
              This attempt was taken on version {attempt.bankVersion} of {attempt.bankTitle}, which
              is no longer in your library. It is shown against version {review.version}.
              {review.questions.some((reviewed) => reviewed.kind === 'archived') &&
                ' Questions that version no longer has are shown as archived.'}
            </p>
          )}
          <ol className="review__list">
            {review.questions.map((reviewed, index) => (
              <li key={reviewed.answer.questionId}>
                <ReviewedCard reviewed={reviewed} index={index} language={review.language} />
              </li>
            ))}
          </ol>
        </>
      )}

      <div className="actions">
        <button type="button" className="button" onClick={onDone}>
          {backTo === 'history' ? 'Back to history' : 'Back to library'}
        </button>
      </div>
    </section>
  );
}

function ReviewedCard({
  reviewed,
  index,
  language,
}: {
  reviewed: ReviewedQuestion;
  index: number;
  language: string;
}) {
  if (reviewed.kind === 'archived') return <ArchivedCard answer={reviewed.answer} index={index} />;

  const { question, options, answer } = reviewed;
  const result = outcome(answer);
  const promptId = `review-prompt-${index}`;
  const chosenId = answer.chosenOptionId;
  const chosenWrong =
    result === 'wrong' ? options.find((option) => option.id === chosenId) : undefined;

  return (
    <article className={`card reviewed reviewed--${result}`} aria-labelledby={promptId}>
      <p className={`outcome outcome--${result}`}>{outcomeLabel[result]}</p>
      <h3 className="reviewed__number">Question {index + 1}</h3>
      <BankText id={promptId} className="reviewed__prompt" text={question.prompt} lang={language} />

      <ul className="reviewed__options">
        {options.map((option) => {
          const isCorrect = option.id === answer.correctOptionId;
          const isChosen = option.id === chosenId;
          return (
            <li
              key={option.id}
              className={[
                'reviewed__option',
                isCorrect && 'reviewed__option--correct',
                isChosen && 'reviewed__option--chosen',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <BankText inline text={option.text} lang={language} />
              {isCorrect && <span className="mark mark--correct">Correct answer</span>}
              {isChosen && <span className="mark mark--chosen">You chose</span>}
            </li>
          );
        })}
      </ul>

      {chosenWrong?.why && (
        <div className="reviewed__why">
          <h4>About the option you chose</h4>
          <BankText text={chosenWrong.why} lang={language} />
        </div>
      )}
      <div className="reviewed__explanation">
        <h4>Explanation</h4>
        <BankText text={question.explanation} lang={language} />
      </div>
    </article>
  );
}

/** A question the edition shown no longer has: only what the attempt recorded. */
function ArchivedCard({ answer, index }: { answer: AttemptAnswer; index: number }) {
  const result = outcome(answer);
  const labelId = `review-archived-${index}`;
  return (
    <article className={`card reviewed reviewed--${result}`} aria-labelledby={labelId}>
      <p className={`outcome outcome--${result}`}>{outcomeLabel[result]}</p>
      <h3 className="reviewed__number">Question {index + 1}</h3>
      <p id={labelId} className="reviewed__prompt reviewed__archived">
        Archived question: it is no longer in this bank.
      </p>
      <p>
        {answer.chosenOptionId === null ? (
          <>You did not answer it. </>
        ) : (
          <>
            You chose option <code>{answer.chosenOptionId}</code>.{' '}
          </>
        )}
        The correct option was <code>{answer.correctOptionId}</code>.
      </p>
    </article>
  );
}
