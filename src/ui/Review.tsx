import { CONFIDENCE_LEVELS, type Attempt, type AttemptAnswer } from '../domain/attempt';
import { calibration, confidenceRecorded, confidentErrors } from '../domain/confidence';
import { outcome, percentage, type Outcome } from '../domain/scoring';
import type { Selection } from '../domain/selection';
import { BankText } from './BankText';
import { confidenceLabel } from './confidence';

/**
 * The review: where all the teaching happens.
 *
 * Every question in attempt order, with the correct option, the participant's
 * choice, the author's explanation and, when they chose a distractor its author
 * explained, that option's own note. Unanswered questions are shown as their
 * own thing, not as wrong answers, though they score the same.
 *
 * Where confidence was recorded, the review opens with the confident errors,
 * the wrong answers the participant was sure of, because correcting those
 * matters most, and the score line says how well-calibrated they were. Attempts
 * saved before confidence was asked for say it was not recorded.
 */

type Props = {
  attempt: Attempt;
  selection: Selection;
  /** The bank's language, for its text. */
  language: string;
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

export function Review({ attempt, selection, language, onDone }: Props) {
  const answerById = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
  const withConfidence = confidenceRecorded(attempt.answers);
  const positionById = new Map(selection.map(({ question }, index) => [question.id, index + 1]));
  const errorPositions = confidentErrors(attempt.answers).flatMap(({ questionId }) => {
    const position = positionById.get(questionId);
    return position === undefined ? [] : [position];
  });

  return (
    <section className="review">
      <h2>Review</h2>

      <p className="card review__score">
        <span className="review__name">{attempt.name}</span>
        <span className="review__tally">
          {attempt.correctCount} of {attempt.questionCount} correct (
          {percentage(attempt.correctCount, attempt.questionCount)}%)
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
                    <a href={`#${questionAnchor(position)}`}>Question {position}</a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <ol className="review__list">
        {selection.map(({ question, options }, index) => {
          const answer = answerById.get(question.id) ?? {
            questionId: question.id,
            chosenOptionId: null,
            correctOptionId: question.answer,
          };
          const chosenId = answer.chosenOptionId;
          const result = outcome(answer);
          const chosenWrong =
            result === 'wrong' ? options.find((option) => option.id === chosenId) : undefined;
          const promptId = `review-prompt-${index}`;

          return (
            <li key={question.id}>
              <article
                id={questionAnchor(index + 1)}
                className={`card reviewed reviewed--${result}`}
                aria-labelledby={promptId}
              >
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
                <h3 className="reviewed__number">Question {index + 1}</h3>
                <BankText
                  id={promptId}
                  className="reviewed__prompt"
                  text={question.prompt}
                  lang={language}
                />

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
            </li>
          );
        })}
      </ol>

      <div className="actions">
        <button type="button" className="button" onClick={onDone}>
          Back to library
        </button>
      </div>
    </section>
  );
}
