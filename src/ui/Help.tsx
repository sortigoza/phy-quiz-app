import {
  bankRepositories,
  currentLimits,
  fieldReference,
  minimalExample,
  privateBanks,
  quizSteps,
  repositoryExample,
  rejectionRules,
  textFormatting,
  type FieldDoc,
} from '../docs/bank-reference';

/**
 * Help: what the app is, how to take a quiz, and how to write a bank.
 *
 * The bank format comes from `docs/bank-reference.ts`, the same source as
 * `llms.txt`, so the two cannot disagree. It describes the app as it is today,
 * limits included.
 */

/** Paths published beside the app by `vite.config.ts`. Relative, like every other asset. */
const EXAMPLE_BANK_PATH = 'examples/kinematics.json';
const EXAMPLE_REPOSITORY_PATH = 'examples/physics-course.json';
const LLMS_TXT_PATH = 'llms.txt';

function FieldTable({ caption, fields }: { caption: string; fields: FieldDoc[] }) {
  return (
    <div className="table-scroll">
      <table className="fields">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Field</th>
            <th scope="col">Type</th>
            <th scope="col">Required</th>
            <th scope="col">Rules</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.name}>
              <th scope="row">
                <code>{field.name}</code>
              </th>
              <td>{field.type}</td>
              <td>{field.required ? 'yes' : 'no'}</td>
              <td>{field.rules}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Help() {
  // Shown in full so it can be pasted into a chat with an assistant.
  const llmsUrl = new URL(LLMS_TXT_PATH, document.baseURI).href;

  return (
    <section className="help" aria-labelledby="help-heading">
      <h2 id="help-heading">Help</h2>

      <p>
        Physics Quiz runs multiple-choice physics quizzes from question bank files. A teacher, or an
        AI assistant, writes a bank as one JSON file. Anyone can load it here, answer a random
        selection of its questions, and get a review with the correct options and the author&apos;s
        explanations. Everything stays in this browser: there is no account and no server.
      </p>

      <h3>Take a quiz</h3>
      <ol>
        {quizSteps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p>
        No bank yet?{' '}
        <a href={EXAMPLE_BANK_PATH} download="kinematics.json">
          Download the example bank
        </a>
        , five questions on kinematics, then load it from the library.
      </p>

      <h4>Private banks</h4>
      <ul>
        {privateBanks.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h4>Many banks at once</h4>
      <ul>
        {bankRepositories.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <pre className="example">
        <code>{repositoryExample}</code>
      </pre>
      <p>
        <a href={EXAMPLE_REPOSITORY_PATH} download="physics-course.json">
          Download the example repository
        </a>
        , which lists every example bank, or load its link in the library.
      </p>

      <h3>Write a question bank</h3>
      <p>
        A bank is a JSON file holding some metadata and a list of questions. Each question has a
        prompt, two to eight options, the id of the correct option, and an explanation. This is the
        smallest bank the app accepts:
      </p>
      <pre className="example" data-example>
        <code>{minimalExample}</code>
      </pre>
      <p>The example bank above is a fuller model to copy from. Every field the app understands:</p>

      <FieldTable caption="The bank" fields={fieldReference.bank} />
      <FieldTable caption="Each question" fields={fieldReference.question} />
      <FieldTable caption="Each option" fields={fieldReference.option} />

      <h4>What gets a bank rejected</h4>
      <ul>
        {rejectionRules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      <h4>Backslashes in maths</h4>
      <p>
        JSON uses the backslash as an escape character, which quietly breaks LaTeX: in a JSON
        string, <code>&quot;\times&quot;</code> becomes a tab followed by <code>imes</code>. Double
        every backslash inside a JSON string, so write{' '}
        <code>&quot;$5 \\times 10^&#123;3&#125;$&quot;</code> and{' '}
        <code>&quot;$9.81\\,\\mathrm&#123;m/s^2&#125;$&quot;</code>.
      </p>

      <h4>Maths and Markdown</h4>
      <ul>
        {textFormatting.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>

      <h4>What works today</h4>
      <ul>
        {currentLimits.map((limit) => (
          <li key={limit}>{limit}</li>
        ))}
      </ul>

      <h3>Write a bank with an AI assistant</h3>
      <p>
        <a href={LLMS_TXT_PATH}>llms.txt</a> describes the bank format for AI agents: every field,
        the rules, worked examples, and advice on writing distractors and explanations that teach.
        Ask your assistant something like:
      </p>
      <blockquote className="prompt">
        Read {llmsUrl} and write a question bank of ten questions on projectile motion for
        first-year university students.
      </blockquote>
      <p>
        Then load the file it gives you. If the app rejects it, paste the errors back to the
        assistant: each one names the field that caused it.
      </p>
    </section>
  );
}
