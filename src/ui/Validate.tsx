import { useState, type DragEvent } from 'react';
import { BANK_FILE_TYPES } from '../domain/bank';
import { validateText, type Validation } from '../validate';
import { IssueList } from './IssueList';

/**
 * The Validate a bank screen: a teacher checks a file without adding it to
 * the library, and without installing anything. SPEC section 3.3.
 */

type Checked = { name: string; validation: Validation };

export function Validate({ onDone }: { onDone: () => void }) {
  const [checked, setChecked] = useState<Checked | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function check(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      setChecked({ name: file.name, validation: await validateText(await file.text()) });
    } catch {
      // An unreadable file, or storage refusing the lookup of a private bank's key.
      setChecked({
        name: file.name,
        validation: {
          ok: false,
          kind: 'unopened',
          message: 'The file could not be read. Try again, or choose it again.',
        },
      });
    } finally {
      setBusy(false);
    }
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void check(event.dataTransfer.files);
  }

  return (
    <section className="validate" aria-labelledby="validate-heading">
      <h2 id="validate-heading">Validate a bank</h2>

      <p className="validate__intro">
        Check a bank file before sharing it. Nothing is added to your library. JSON and YAML banks
        are both checked, and so are bank repositories.
      </p>

      <div
        className={`validate__drop${dragging ? ' validate__drop--over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <p>Drop a bank file here, or</p>
        <span className="library__upload">
          <label className="button" htmlFor="validate-file">
            {busy ? 'Checking…' : 'Choose a file'}
          </label>
          <input
            id="validate-file"
            className="visually-hidden"
            type="file"
            accept={BANK_FILE_TYPES}
            disabled={busy}
            onChange={(event) => {
              void check(event.target.files);
              // Allow the same file, fixed, to be checked again.
              event.target.value = '';
            }}
          />
        </span>
      </div>

      {checked && <Report {...checked} />}

      <div className="actions">
        <button type="button" className="button" onClick={onDone}>
          Back to library
        </button>
      </div>
    </section>
  );
}

function Report({ name, validation }: Checked) {
  if (validation.ok) {
    const what =
      validation.kind === 'bank'
        ? `a valid bank: ${validation.bank.title}, version ${validation.bank.version}, ${plural(validation.bank.questions.length, 'question')}.`
        : `a valid bank repository: ${validation.title}, listing ${plural(validation.count, 'bank')}. The banks it lists are not checked here.`;
    return (
      <p className="panel panel--notice validate__ok" role="status">
        <code>{name}</code> is {what}
      </p>
    );
  }

  if (validation.kind === 'unopened') {
    return (
      <div className="panel panel--error" role="alert">
        <h3>
          Could not check <code>{name}</code>
        </h3>
        <p>{validation.message}</p>
      </div>
    );
  }

  const count = validation.issues.length;
  return (
    <div className="panel panel--error" role="alert">
      <h3>
        <code>{name}</code> is not a valid {validation.kind === 'bank' ? 'bank' : 'bank repository'}
      </h3>
      <p>
        {plural(count, 'problem')} found. {count > 1 ? 'Fix them' : 'Fix it'} and check the file
        again:
      </p>
      <IssueList issues={validation.issues} />
    </div>
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
