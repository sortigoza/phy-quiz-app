import type { Attempt } from '../domain/attempt';
import { outcome, percentage, type Outcome } from '../domain/scoring';
import type { Selection } from '../domain/selection';

/**
 * The review: where all the teaching happens.
 *
 * Every question in attempt order, with the correct option, the participant's
 * choice, the author's explanation and, when they chose a distractor its author
 * explained, that option's own note. Unanswered questions are shown as their
 * own thing, not as wrong answers, though they score the same.
 */

type Props = {
  attempt: Attempt;
  selection: Selection;
  onDone: () => void;
};

const outcomeLabel: Record<Outcome, string> = {
  correct: 'Correct',
  wrong: 'Wrong',
  unanswered: 'Not answered',
};

export function Review({ attempt, selection, onDone }: Props) {
  const answerById = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));

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
      </p>

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
              <article className={`card reviewed reviewed--${result}`} aria-labelledby={promptId}>
                <p className={`outcome outcome--${result}`}>{outcomeLabel[result]}</p>
                <h3 id={promptId} className="reviewed__prompt">
                  {question.prompt}
                </h3>

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
                        <span>{option.text}</span>
                        {isCorrect && <span className="mark mark--correct">Correct answer</span>}
                        {isChosen && <span className="mark mark--chosen">You chose</span>}
                      </li>
                    );
                  })}
                </ul>

                {chosenWrong?.why && (
                  <p className="reviewed__why">
                    <strong>About the option you chose:</strong> {chosenWrong.why}
                  </p>
                )}
                <p className="reviewed__explanation">
                  <strong>Explanation:</strong> {question.explanation}
                </p>
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
