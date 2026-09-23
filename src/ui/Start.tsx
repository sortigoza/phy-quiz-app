import { useEffect, useState, type FormEvent } from 'react';
import { normaliseName } from '../domain/attempt';
import { bankLanguage, type Bank } from '../domain/bank';
import { defaultQuestionCount } from '../domain/selection';
import { beginAttempt, type InProgressAttempt } from '../quiz';
import { getLastParticipantName, type StoredBank } from '../storage/db';
import { storageProblem } from '../storage/problems';
import { BankText } from './BankText';

/**
 * The start screen: who is taking the quiz, and how many questions.
 *
 * The name is the participant's whole identity, so it is offered back from the
 * last attempt in this browser rather than asked for from scratch each time.
 */

/** The fixed counts offered, before the bank's own default and "All" are added. */
const STANDARD_COUNTS = [5, 10, 20];

type Props = {
  stored: StoredBank;
  /** Already parsed from `stored`, by whoever checked that it still opens. */
  bank: Bank;
  onBegin: (inProgress: InProgressAttempt) => void;
  onCancel: () => void;
};

export function Start({ stored, bank, onBegin, onCancel }: Props) {
  const size = bank.questions.length;
  const lang = bankLanguage(bank);
  const suggested = defaultQuestionCount(bank);

  // Every count smaller than the bank, plus the bank's own default; "All"
  // stands in for any count that would take the whole bank.
  const counts = [...new Set([...STANDARD_COUNTS, suggested.count])]
    .filter((count) => count < size)
    .sort((a, b) => a - b);

  const [name, setName] = useState('');
  const [count, setCount] = useState(suggested.count);
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
      onBegin(await beginAttempt(stored, bank, name, count));
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
          {suggested.clamped && (
            <p className="field__note">
              This bank only has {size} question{size === 1 ? '' : 's'}.
            </p>
          )}
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
