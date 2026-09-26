import { useState } from 'react';
import { CONFIDENCE_LEVELS, type Attempt, type Confidence } from '../domain/attempt';
import { bankLanguage } from '../domain/bank';
import { missingConfidence, submitAttempt, type InProgressAttempt } from '../quiz';
import { storageProblem } from '../storage/problems';
import { BankText } from './BankText';
import { confidenceLabel } from './confidence';

/**
 * One question per screen, in exam mode: nothing on this screen says whether
 * an answer is right. All of that waits for the review.
 *
 * Options are native radios in a fieldset named by the prompt, so keyboard use
 * and screen reader semantics come from the platform rather than from us. The
 * prompt names the fieldset through `aria-labelledby` rather than a `<legend>`,
 * because a prompt may hold a table or a list and a legend may not.
 *
 * Below the options, a second radio group asks how sure the participant is of
 * the option they chose. It stays disabled until an option is chosen, and
 * submission waits until every answered question has one.
 */

type Props = {
  inProgress: InProgressAttempt;
  index: number;
  /** Why answers are not being saved as they are given, or null when they are. */
  unsaved: string | null;
  onChoose: (questionId: string, optionId: string) => void;
  onSetConfidence: (questionId: string, confidence: Confidence) => void;
  onGoTo: (index: number) => void;
  onSubmitted: (attempt: Attempt) => void;
};

export function AttemptScreen({
  inProgress,
  index,
  unsaved,
  onChoose,
  onSetConfidence,
  onGoTo,
  onSubmitted,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  // Whether submitting was refused for want of confidence. The list itself is live.
  const [askedForConfidence, setAskedForConfidence] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const current = inProgress.selection[index];
  if (!current) throw new Error(`No question at position ${index}`);
  const { question, options } = current;
  const lang = bankLanguage(inProgress.bank);
  const promptId = `prompt-${index}`;

  const total = inProgress.selection.length;
  const isLast = index === total - 1;
  const unanswered = inProgress.selection.filter(
    ({ question: q }) => !(q.id in inProgress.chosen),
  ).length;
  const lacking = missingConfidence(inProgress);
  const answered = question.id in inProgress.chosen;
  const confidenceHintId = `confidence-hint-${index}`;

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      onSubmitted(await submitAttempt(inProgress));
    } catch (cause) {
      // Stay on the question with every answer intact, so trying again is possible.
      setSubmitting(false);
      setSaveError(storageProblem(cause));
    }
  }

  function requestSubmit() {
    if (lacking.length > 0) {
      setAskedForConfidence(true);
      setConfirming(false);
    } else if (unanswered > 0) setConfirming(true);
    else void submit();
  }

  return (
    <section className="attempt">
      <p className="attempt__progress">
        Question {index + 1} of {total}
      </p>

      {/* Keyed by question so each question starts with fresh, unshared radio state. */}
      {/* Locked while submitting, so no answer can be saved as in progress after the submission. */}
      <fieldset
        key={question.id}
        className="card question"
        aria-labelledby={promptId}
        disabled={submitting}
      >
        <BankText id={promptId} className="question__prompt" text={question.prompt} lang={lang} />
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
            <BankText inline text={option.text} lang={lang} />
          </label>
        ))}
      </fieldset>

      {/* A native fieldset again: keyboard use and the group's name come from the platform. */}
      <fieldset
        key={`confidence-${question.id}`}
        className="confidence"
        disabled={submitting || !answered}
        aria-describedby={answered ? undefined : confidenceHintId}
      >
        <legend className="confidence__legend">How sure are you?</legend>
        <div className="confidence__levels">
          {CONFIDENCE_LEVELS.map((level) => (
            <label key={level} className="radio-card confidence__level">
              <input
                type="radio"
                name={`confidence-${question.id}`}
                checked={inProgress.confidence[question.id] === level}
                onChange={() => onSetConfidence(question.id, level)}
              />
              {confidenceLabel[level]}
            </label>
          ))}
        </div>
        {!answered && (
          <p id={confidenceHintId} className="confidence__hint">
            Choose an option first.
          </p>
        )}
      </fieldset>

      {askedForConfidence && lacking.length > 0 && (
        <div className="panel panel--error" role="alert">
          <p>Say how sure you are of every answer before submitting. Still to do:</p>
          <div className="actions actions--start">
            {lacking.map((position) => (
              <button
                key={position}
                type="button"
                className="button button--quiet"
                onClick={() => onGoTo(position - 1)}
              >
                Question {position}
              </button>
            ))}
          </div>
        </div>
      )}

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

      {unsaved && !saveError && (
        <p className="panel panel--error" role="alert">
          Your answers are not being saved, so closing this page would lose them. {unsaved} Your
          answers are still here while the page stays open.
        </p>
      )}

      {saveError && (
        <p className="panel panel--error" role="alert">
          Could not save this attempt. {saveError} Your answers are still here; try submitting
          again.
        </p>
      )}

      <div className="actions">
        <button
          type="button"
          className="button button--quiet"
          disabled={index === 0 || submitting}
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
