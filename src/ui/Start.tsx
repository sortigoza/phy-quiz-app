import { useEffect, useState, type FormEvent } from 'react';
import { normaliseName, type AttemptMode } from '../domain/attempt';
import { bankLanguage, type Bank } from '../domain/bank';
import { defaultQuestionCount } from '../domain/selection';
import { bankTags, isWholeBank, qualifyingQuestions, type TagFilter } from '../domain/tags';
import { beginAttempt, type InProgressAttempt } from '../quiz';
import { getAttemptMode, getLastParticipantName, type StoredBank } from '../storage/db';
import { storageProblem } from '../storage/problems';
import { BankText } from './BankText';

/**
 * The start screen: who is taking the quiz, how many questions, in which mode
 * and, when the bank has tags, which of them to draw from.
 *
 * The name is the participant's whole identity, so it is offered back from the
 * last attempt in this browser rather than asked for from scratch each time.
 * The mode is offered back the same way. The tag filter is not remembered: it
 * starts empty, unless the tag breakdown opened this screen to practise one tag.
 */

/** The fixed counts offered, before the bank's own default and "All" are added. */
const STANDARD_COUNTS = [5, 10, 20];

type Props = {
  stored: StoredBank;
  /** Already parsed from `stored`, by whoever checked that it still opens. */
  bank: Bank;
  /** A filter to start with, set when opened from the tag breakdown. */
  tagFilter?: TagFilter | undefined;
  onBegin: (inProgress: InProgressAttempt) => void;
  onCancel: () => void;
};

const noTags: TagFilter = { tags: [], untagged: false };

/** "4 questions carry the chosen tags", and when the count asked for is more, that the quiz asks them all. */
function qualifyingNote(size: number, clamped: boolean): string {
  const carry = size === 1 ? '1 question carries' : `${size} questions carry`;
  if (!clamped) return `${carry} the chosen tags.`;
  return `${carry} the chosen tags, so the quiz asks ${size === 1 ? 'it' : `all ${size}`}.`;
}

export function Start({ stored, bank, tagFilter: preset = noTags, onBegin, onCancel }: Props) {
  const [tagFilter, setTagFilter] = useState(preset);
  const offered = bankTags(bank);
  const filtered = !isWholeBank(tagFilter);
  const size = qualifyingQuestions(bank, tagFilter).length;
  const lang = bankLanguage(bank);
  const suggested = defaultQuestionCount(bank);

  // Every count smaller than the bank, plus the bank's own default; "All"
  // stands in for any count that would take the whole bank.
  const counts = [...new Set([...STANDARD_COUNTS, suggested.count])]
    .filter((count) => count < size)
    .sort((a, b) => a - b);

  const [name, setName] = useState('');
  const [count, setCount] = useState(suggested.count);
  // Undefined until the participant picks one, so the remembered mode never overrides their pick.
  const [pickedMode, setPickedMode] = useState<AttemptMode>();
  const [rememberedMode, setRememberedMode] = useState<AttemptMode>('standard');
  const mode = pickedMode ?? rememberedMode;
  const [starting, setStarting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Offering the last name is a convenience; if storage fails, the field just starts empty.
    getLastParticipantName().then(
      (lastParticipantName) => {
        // Never overwrite something the participant has already started typing.
        if (!cancelled && lastParticipantName) {
          setName((current) => current || lastParticipantName);
        }
      },
      () => {},
    );
    // Likewise the mode: without storage, it stays standard.
    getAttemptMode().then(
      (remembered) => !cancelled && setRememberedMode(remembered),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const canBegin = normaliseName(name) !== '' && !starting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canBegin) return;
    setStarting(true);
    setProblem(null);
    try {
      onBegin(await beginAttempt(stored, bank, name, Math.min(count, size), mode, tagFilter));
    } catch (error) {
      setStarting(false);
      setProblem(storageProblem(error));
    }
  }

  return (
    <section className="start">
      <h2 lang={lang}>{bank.title}</h2>
      {bank.author && <p className="start__author">{bank.author}</p>}
      {bank.description && (
        <BankText className="start__description" text={bank.description} lang={lang} />
      )}

      <form className="card start__form" onSubmit={(event) => void handleSubmit(event)}>
        <div className="field">
          <label htmlFor="participant-name">Your name</label>
          <input
            id="participant-name"
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        {offered.tags.length > 0 && (
          <fieldset className="field counts">
            <legend>Tags</legend>
            {offered.tags.map(({ tag, count: questions }) => (
              <label key={tag} className="radio-card">
                <input
                  type="checkbox"
                  checked={tagFilter.tags.includes(tag)}
                  onChange={(event) =>
                    setTagFilter({
                      ...tagFilter,
                      tags: event.target.checked
                        ? [...tagFilter.tags, tag]
                        : tagFilter.tags.filter((chosen) => chosen !== tag),
                    })
                  }
                />
                {tag} ({questions})
              </label>
            ))}
            {offered.untagged > 0 && (
              <label className="radio-card">
                <input
                  type="checkbox"
                  checked={tagFilter.untagged}
                  onChange={(event) =>
                    setTagFilter({ ...tagFilter, untagged: event.target.checked })
                  }
                />
                untagged ({offered.untagged})
              </label>
            )}
            <p className="field__note">
              {filtered
                ? qualifyingNote(size, count > size)
                : 'None chosen draws from the whole bank.'}
            </p>
          </fieldset>
        )}

        <fieldset className="field counts">
          <legend>How many questions?</legend>
          {counts.map((option) => (
            <label key={option} className="radio-card">
              <input
                type="radio"
                name="question-count"
                checked={count === option}
                onChange={() => setCount(option)}
              />
              {option}
            </label>
          ))}
          <label className="radio-card">
            <input
              type="radio"
              name="question-count"
              checked={count >= size}
              onChange={() => setCount(size)}
            />
            All ({size})
          </label>
          {!filtered && suggested.clamped && (
            <p className="field__note">
              This bank only has {size} question{size === 1 ? '' : 's'}.
            </p>
          )}
        </fieldset>

        <fieldset className="field modes">
          <legend>How do you want to answer?</legend>
          <label className="radio-card">
            <input
              type="radio"
              name="attempt-mode"
              checked={mode === 'standard'}
              onChange={() => setPickedMode('standard')}
            />
            Standard
          </label>
          <label className="radio-card">
            <input
              type="radio"
              name="attempt-mode"
              aria-describedby="answer-first-note"
              checked={mode === 'answer-first'}
              onChange={() => setPickedMode('answer-first')}
            />
            Answer first
          </label>
          <p id="answer-first-note" className="field__note">
            Answer first: write your own answer to each question before its options appear, then
            compare it with the explanation in the review.
          </p>
        </fieldset>

        {problem && (
          <p className="panel panel--error" role="alert">
            Could not start the quiz. {problem}
          </p>
        )}

        <div className="actions">
          <button type="button" className="button button--quiet" onClick={onCancel}>
            Back
          </button>
          <button type="submit" className="button" disabled={!canBegin}>
            Begin
          </button>
        </div>
      </form>
    </section>
  );
}
