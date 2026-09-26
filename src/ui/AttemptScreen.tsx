import { useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  canReveal,
  CONFIDENCE_LEVELS,
  MIN_RESPONSE_LENGTH,
  type Attempt,
  type Confidence,
  type Reveal,
} from '../domain/attempt';
import { bankLanguage } from '../domain/bank';
import { confidenceLabel } from '../domain/confidence';
import { missingConfidence, optionsShown, submitAttempt, type InProgressAttempt } from '../quiz';
import { storageProblem } from '../storage/problems';
import { BankText } from './BankText';
import { ResponseText } from './ResponseText';

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
 *
 * In answer-first mode the options and the confidence stay hidden until the
 * participant writes a response and reveals them, or skips it. The response
 * then stays on screen, read-only, above the options.
 *
 * Number keys 1 to 9 choose an option while the options are on screen, except
 * while the focus is in a text field, where they are typed.
 */

type Props = {
  inProgress: InProgressAttempt;
  index: number;
  /** Why answers are not being saved as they are given, or null when they are. */
  unsaved: string | null;
  onChoose: (questionId: string, optionId: string) => void;
  onSetConfidence: (questionId: string, confidence: Confidence) => void;
  onWriteResponse: (questionId: string, text: string) => void;
  onReveal: (questionId: string, reveal: Reveal) => void;
  onGoTo: (index: number) => void;
  onSubmitted: (attempt: Attempt) => void;
};

export function AttemptScreen({
  inProgress,
  index,
  unsaved,
  onChoose,
  onSetConfidence,
  onWriteResponse,
  onReveal,
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
  const withoutConfidence = missingConfidence(inProgress);
  const answered = question.id in inProgress.chosen;
  const confidenceHintId = `confidence-hint-${index}`;
  const shown = optionsShown(inProgress, question.id);

  function choose(optionId: string) {
    setConfirming(false);
    onChoose(question.id, optionId);
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!shown || submitting || !/^[1-9]$/.test(event.key)) return;
    if (event.ctrlKey || event.metaKey || event.altKey || isTextField(event.target)) return;
    const option = options[Number(event.key) - 1];
    if (!option) return;
    event.preventDefault();
    choose(option.id);
  });
  useEffect(() => {
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Revealing removes the button that had the focus; it moves to the first option.
  const firstOption = useRef<HTMLInputElement>(null);
  const justRevealed = useRef(false);
  useEffect(() => {
    if (shown && justRevealed.current) firstOption.current?.focus();
    justRevealed.current = false;
  }, [shown]);

  function reveal(how: Reveal) {
    justRevealed.current = true;
    onReveal(question.id, how);
  }

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
    if (withoutConfidence.length > 0) {
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
        {inProgress.mode === 'answer-first' && (
          <ResponseStep
            questionId={question.id}
            response={inProgress.responses[question.id] ?? ''}
            revealed={inProgress.revealed[question.id]}
            onWrite={(text) => onWriteResponse(question.id, text)}
            onReveal={reveal}
          />
        )}
        {shown &&
          options.map((option, position) => (
            <label key={option.id} className="radio-card option">
              <input
                ref={position === 0 ? firstOption : undefined}
                type="radio"
                name={`question-${question.id}`}
                checked={inProgress.chosen[question.id] === option.id}
                onChange={() => choose(option.id)}
              />
              <BankText inline text={option.text} lang={lang} />
            </label>
          ))}
      </fieldset>

      {/* A native fieldset again: keyboard use and the group's name come from the platform. */}
      {shown && (
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
      )}

      {askedForConfidence && withoutConfidence.length > 0 && (
        <div className="panel panel--error" role="alert">
          <p>Say how sure you are of every answer before submitting. Still to do:</p>
          <div className="actions actions--start">
            {withoutConfidence.map((position) => (
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

/** Whether typing a digit here should type it, rather than choose an option. */
function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !['radio', 'checkbox', 'button', 'submit', 'reset'].includes(target.type);
  }
  return target instanceof HTMLElement && target.isContentEditable;
}

/**
 * Answer-first mode: the response field, with its live preview, and the two
 * ways to reveal the options. Once they are revealed, what was written stays,
 * read-only.
 */
function ResponseStep({
  questionId,
  response,
  revealed,
  onWrite,
  onReveal,
}: {
  questionId: string;
  response: string;
  revealed: Reveal | undefined;
  onWrite: (text: string) => void;
  onReveal: (how: Reveal) => void;
}) {
  const fieldId = `response-${questionId}`;
  const hintId = `response-hint-${questionId}`;

  if (revealed === 'skipped') {
    return <p className="response__skipped">You skipped writing a response to this question.</p>;
  }

  return (
    <div className="response">
      <label htmlFor={fieldId} className="response__label">
        Your answer or reasoning
      </label>
      <textarea
        id={fieldId}
        className="response__field"
        rows={4}
        value={response}
        readOnly={revealed === 'written'}
        aria-describedby={revealed ? undefined : hintId}
        onChange={(event) => onWrite(event.target.value)}
      />
      {response.trim() !== '' && (
        <div role="group" aria-label="Preview" className="response__preview">
          <ResponseText text={response} />
        </div>
      )}
      {!revealed && (
        <>
          <p id={hintId} className="response__hint">
            Write at least {MIN_RESPONSE_LENGTH} characters to reveal the options, or skip if the
            question needs them.
          </p>
          <div className="actions actions--start">
            <button
              type="button"
              className="button"
              disabled={!canReveal(response)}
              onClick={() => onReveal('written')}
            >
              Reveal options
            </button>
            <button
              type="button"
              className="button button--link"
              onClick={() => onReveal('skipped')}
            >
              Skip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
