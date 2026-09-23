import { useState } from 'react';
import type { Attempt } from '../domain/attempt';
import { submitAttempt, type InProgressAttempt } from '../quiz';

/**
 * One question per screen, in exam mode: nothing on this screen says whether
 * an answer is right. All of that waits for the review.
 *
 * Options are native radios in a fieldset legended by the prompt, so keyboard
 * use and screen reader semantics come from the platform rather than from us.
 */

type Props = {
  inProgress: InProgressAttempt;
  index: number;
  onChoose: (questionId: string, optionId: string) => void;
  onGoTo: (index: number) => void;
  onSubmitted: (attempt: Attempt) => void;
};

export function AttemptScreen({ inProgress, index, onChoose, onGoTo, onSubmitted }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = inProgress.selection[index];
  if (!current) throw new Error(`No question at position ${index}`);
  const { question, options } = current;

  const total = inProgress.selection.length;
  const isLast = index === total - 1;
  const unanswered = inProgress.selection.filter(
    ({ question: q }) => !(q.id in inProgress.chosen),
  ).length;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      onSubmitted(await submitAttempt(inProgress));
    } catch (cause) {
      // Stay on the question with every answer intact, so trying again is possible.
      setSubmitting(false);
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function requestSubmit() {
    if (unanswered > 0) setConfirming(true);
    else void submit();
  }

  return (
    <section className="attempt">
      <p className="attempt__progress">
        Question {index + 1} of {total}
      </p>

      {/* Keyed by question so each question starts with fresh, unshared radio state. */}
      <fieldset key={question.id} className="card question">
        <legend className="question__prompt">{question.prompt}</legend>
        {options.map((option) => (
          <label key={option.id} className="radio-card option">
            <input
              type="radio"
              name={`question-${question.id}`}
              checked={inProgress.chosen[question.id] === option.id}
              onChange={() => {
                setConfirming(false);
                onChoose(question.id, option.id);
              }}
            />
            <span>{option.text}</span>
          </label>
        ))}
      </fieldset>

      {confirming && (
        <div className="panel panel--error" role="alert">
          <p>
            You have {unanswered} question{unanswered === 1 ? '' : 's'} unanswered. Unanswered
            questions are scored as wrong.
          </p>
          <div className="actions">
            <button
              type="button"
              className="button button--quiet"
              onClick={() => setConfirming(false)}
            >
              Keep answering
            </button>
            <button
              type="button"
              className="button"
              disabled={submitting}
              onClick={() => void submit()}
            >
              Submit anyway
            </button>
          </div>
        </div>
      )}

      {saveError && (
        <p className="panel panel--error" role="alert">
          Could not save this attempt: {saveError}. Your answers are still here; try submitting
          again.
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          className="button button--quiet"
          disabled={index === 0}
          onClick={() => {
            setConfirming(false);
            onGoTo(index - 1);
          }}
        >
          Previous
        </button>
        {isLast ? (
          <button
            type="button"
            className="button"
            disabled={submitting || confirming}
            onClick={requestSubmit}
          >
            Submit
          </button>
        ) : (
          <button type="button" className="button" onClick={() => onGoTo(index + 1)}>
            Next
          </button>
        )}
      </div>
    </section>
  );
}
