import { CONFIDENCE_LEVELS, type Attempt, type AttemptAnswer } from '../domain/attempt';
import { calibration, confidenceRecorded, confidentErrors } from '../domain/confidence';
import type { AttemptReview, ReviewedQuestion } from '../domain/review';
import { outcome, percentage, type Outcome } from '../domain/scoring';
import type { ReviewBack } from '../app/state';
import { BankText } from './BankText';
import { UnverifiedBadge } from './UnverifiedBadge';
import { confidenceLabel } from './confidence';

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
 *
 * Where confidence was recorded, the review opens with the confident errors,
 * the wrong answers the participant was sure of, because correcting those
 * matters most, and the score line says how well-calibrated they were. Attempts
 * saved before confidence was asked for say it was not recorded.
 */

type Props = {
  attempt: Attempt;
  review: AttemptReview;
  /** Where Done goes, to name the button. */
  backTo: ReviewBack['screen'];
  onDone: () => void;
};

const outcomeLabel: Record<Outcome, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  unanswered: 'Not answered',
};

/** "Sure: 6/7 (86%) · Unsure: 1/2 (50%)", leaving out levels never given. */
function calibrationLine(answers: readonly AttemptAnswer[]): string {
  const tallies = calibration(answers);
  return CONFIDENCE_LEVELS.filter((level) => tallies[level].total > 0)
    .map((level) => {
      const { correct, total } = tallies[level];
      return `${confidenceLabel[level]}: ${correct}/${total} (${percentage(correct, total)}%)`;
    })
    .join(' · ');
}

/** The anchor of one question in the list, by its 1-based position. */
function questionAnchor(position: number): string {
  return `review-question-${position}`;
}

export function Review({ attempt, review, backTo, onDone }: Props) {
  const withConfidence = confidenceRecorded(attempt.answers);
  // The review lists questions in attempt order, whichever edition it is shown against.
  const positionById = new Map(
    attempt.answers.map(({ questionId }, index) => [questionId, index + 1]),
  );
  const errorPositions = confidentErrors(attempt.answers).flatMap(({ questionId }) => {
    const position = positionById.get(questionId);
    return position === undefined ? [] : [position];
  });
  // Without the bank there are no question cards to link to.
  const linkable = review.edition !== 'none';

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
        <span className="review__calibration">
          {withConfidence ? calibrationLine(attempt.answers) : 'Confidence not recorded'}
        </span>
      </p>

      {withConfidence && (
        <section className="card confident-errors" aria-labelledby="confident-errors-heading">
          <h3 id="confident-errors-heading">Confident errors</h3>
          {errorPositions.length === 0 ? (
            <p>None: every answer you were sure of was right.</p>
          ) : (
            <>
              <p>
                You were sure of these, and they were wrong. They are the ones most worth reading
                again.
              </p>
              <ul>
                {errorPositions.map((position) => (
                  <li key={position}>
                    {linkable ? (
                      <a href={`#${questionAnchor(position)}`}>Question {position}</a>
                    ) : (
                      <>Question {position}</>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {review.edition === 'none' ? (
        <p className="panel panel--notice">
          {attempt.bankTitle} is no longer in your library. Import the bank to see the questions.
        </p>
      ) : (
        <>
          {review.edition === 'other' && (
            <p className="panel panel--notice">
              <OtherEditionNotice
                attempt={attempt}
                version={review.version}
                mismatch={review.mismatch}
              />
              {review.questions.some((reviewed) => reviewed.kind === 'archived') &&
                ' Questions it cannot show as they were answered are shown as archived.'}
            </p>
          )}
          <ol className="review__list">
            {review.questions.map((reviewed, index) => (
              <li key={reviewed.answer.questionId}>
                <ReviewedCard
                  reviewed={reviewed}
                  index={index}
                  language={review.language}
                  withConfidence={withConfidence}
                />
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

/** Says which edition the review is shown against, and why it is not the one the attempt was taken on. */
function OtherEditionNotice({
  attempt,
  version,
  mismatch,
}: {
  attempt: Attempt;
  version: string;
  mismatch: boolean;
}) {
  if (mismatch) {
    return (
      <>
        This attempt’s answers do not match the version {version} of {attempt.bankTitle} in your
        library, though it names that edition. Its questions are shown by id.
      </>
    );
  }
  const shown =
    version === attempt.bankVersion ? `a changed copy of version ${version}` : `version ${version}`;
  return (
    <>
      The edition of {attempt.bankTitle} this attempt was taken on, version {attempt.bankVersion},
      is no longer in your library. It is shown against {shown}.
    </>
  );
}

/** The outcome line of a card, with the confidence given or, for an attempt that asked for none, a note saying so. */
function OutcomeLine({
  answer,
  withConfidence,
}: {
  answer: AttemptAnswer;
  withConfidence: boolean;
}) {
  const result = outcome(answer);
  return (
    <p className={`outcome outcome--${result}`}>
      {outcomeLabel[result]}
      {answer.confidence ? (
        <span className="mark mark--confidence">
          {' · '}Confidence: {confidenceLabel[answer.confidence]}
        </span>
      ) : (
        !withConfidence &&
        result !== 'unanswered' && (
          <span className="mark mark--confidence">{' · '}Confidence not recorded</span>
        )
      )}
    </p>
  );
}

function ReviewedCard({
  reviewed,
  index,
  language,
  withConfidence,
}: {
  reviewed: ReviewedQuestion;
  index: number;
  language: string;
  withConfidence: boolean;
}) {
  if (reviewed.kind === 'archived')
    return <ArchivedCard answer={reviewed.answer} index={index} withConfidence={withConfidence} />;

  const { question, options, answer } = reviewed;
  const result = outcome(answer);
  const promptId = `review-prompt-${index}`;
  const chosenId = answer.chosenOptionId;
  const chosenWrong =
    result === 'wrong' ? options.find((option) => option.id === chosenId) : undefined;

  return (
    <article
      id={questionAnchor(index + 1)}
      className={`card reviewed reviewed--${result}`}
      aria-labelledby={promptId}
    >
      <OutcomeLine answer={answer} withConfidence={withConfidence} />
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
function ArchivedCard({
  answer,
  index,
  withConfidence,
}: {
  answer: AttemptAnswer;
  index: number;
  withConfidence: boolean;
}) {
  const result = outcome(answer);
  const labelId = `review-archived-${index}`;
  return (
    <article
      id={questionAnchor(index + 1)}
      className={`card reviewed reviewed--${result}`}
      aria-labelledby={labelId}
    >
      <OutcomeLine answer={answer} withConfidence={withConfidence} />
      <h3 className="reviewed__number">Question {index + 1}</h3>
      <p id={labelId} className="reviewed__prompt reviewed__archived">
        Archived question: this edition of the bank no longer has it as it was answered.
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
