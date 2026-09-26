import {
  bankRepositories,
  currentLimits,
  fieldReference,
  fullExample,
  minimalExample,
  privateBanks,
  rejectionRules,
  repositoryExample,
  textFormatting,
  type FieldDoc,
} from './bank-reference';

/**
 * `llms.txt`: the bank format written for an AI agent.
 *
 * It follows the llmstxt.org shape (an H1, a blockquote summary, then Markdown
 * sections) but is deliberately self-contained, because the job it serves is
 * "write me a valid bank" in one fetch. The build emits it at the app root; see
 * `vite.config.ts`.
 *
 * Links are relative so the same file works wherever the app is deployed.
 */

function table(fields: FieldDoc[]): string {
  const rows = fields.map(
    (field) =>
      `| \`${field.name}\` | ${field.type} | ${field.required ? 'yes' : 'no'} | ${field.rules.replaceAll('|', '\\|')} |`,
  );
  return ['| Field | Type | Required | Rules |', '| --- | --- | --- | --- |', ...rows].join('\n');
}

function list(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

export function renderLlmsTxt(appVersion: string): string {
  return `# Physics Quiz

> Physics Quiz is a local-first web app for multiple-choice physics quizzes. A teacher or an AI assistant writes a question bank as a single JSON file; a participant loads it into the app, answers a random selection of its questions, and then sees a review with the correct options and the author's explanations. This file tells an AI agent how to write a question bank that the app accepts. It describes app version ${appVersion}.

When asked to write a question bank, output one JSON document that follows the reference below: no comments, no trailing commas, and no keys that are not listed. The app is strict and rejects the whole file on any error.

## Links

- [The app](./): load a bank with "Upload a bank file" or "Load from URL", then press Start. Publishing a bank in a public GitHub repository and loading its file link is the easiest way to share one.
- [Example bank](./examples/kinematics.json): a complete five-question bank on one-dimensional kinematics
- [Example bank repository](./examples/physics-course.json): one file listing every example bank, loaded with one link

## Vocabulary

- **Question bank** (or bank): the file you are writing. One bank, one topic.
- **Question**: a prompt with between two and eight options, exactly one of which is correct.
- **Option**: one selectable answer. The wrong ones are **distractors**.
- **Explanation**: the author's account of why the correct option is correct, shown after submission. It is where the teaching happens, so it is required.
- **why**: an optional note on a distractor, explaining the mistake that leads to it. Shown only to a participant who chose that option.

## Bank fields

${table(fieldReference.bank)}

## Question fields

${table(fieldReference.question)}

## Option fields

${table(fieldReference.option)}

## Rules that reject a bank

${list(rejectionRules)}

## Escaping LaTeX in JSON

JSON treats a backslash as the start of an escape, which silently corrupts LaTeX. In a JSON string, double every backslash.

| You want | Write in JSON | What a single backslash would produce |
| --- | --- | --- |
| \`\\times\` | \`"$5 \\\\times 10^{3}$"\` | \`\\t\` is a tab, leaving \`imes\` |
| \`\\frac\` | \`"$\\\\frac{1}{2}$"\` | \`\\f\` is a form feed, leaving \`rac\` |
| \`\\nu\` | \`"$\\\\nu$"\` | \`\\n\` is a newline, leaving \`u\` |
| \`\\,\` (thin space) | \`"$9.81\\\\,\\\\mathrm{m/s^2}$"\` | a parse error |

The app rejects a bank with such a control character in any string, naming the field. Or write the bank as YAML (\`.yaml\` or \`.yml\`), which the app validates against the same schema; text in single quotes needs no escaping there: \`prompt: '$5 \\times 10^{3}$'\`. JSON remains the canonical format.

## Maths and Markdown

${list(textFormatting)}

Current limits of the app, which do not change what you should write:

${list(currentLimits)}

## Private banks

A teacher can publish a bank encrypted, so its file can sit on a public host. Encryption is done afterwards by the teacher with the app's author tool, never by you: write the plaintext bank exactly as described here. What participants need to know:

${list(privateBanks)}

## Bank repositories

To hand out several banks with one link, write a bank repository beside them. It is a different file from a bank: never put questions in it.

${list(bankRepositories)}

\`\`\`json
${repositoryExample}
\`\`\`

## Writing good questions

- Each question tests one idea and has exactly one defensible correct option. If an expert could argue for two options, rewrite it.
- Build distractors from real misconceptions: a missing factor of one half, a confused quantity, the wrong units, a sign error. Avoid options that are wrong for no reason.
- Give every distractor a \`why\` that names the mistake behind it. This is the highest-value optional field in the format.
- Make the explanation teach: show the working with numbers and units, not just "the answer is b".
- Compute every numerical option yourself and state values to consistent significant figures. The correct option must actually be correct.
- Do not rely on option order: the app shuffles options, so never write "all of the above" or "both a and b".
- Use short, stable, kebab-case question ids such as \`free-fall-speed\`. Attempt records refer to questions by id.
- Set \`defaultQuestionCount\` to the number of questions a participant should see in one sitting.

## Minimal example

\`\`\`json
${minimalExample}
\`\`\`

## Full example

Every field, with maths escaped for JSON.

\`\`\`json
${fullExample}
\`\`\`

## Checklist

Before handing back a bank, confirm every item:

- [ ] The output is a single JSON object, with no text, comments or Markdown fences inside the file itself
- [ ] \`formatVersion\` is \`1\`, \`id\` is lowercase with only letters, digits, dots, dashes and underscores, and \`version\` is semver
- [ ] Every key appears in the field tables above; nothing is misspelled or invented
- [ ] Question ids are unique in the bank, and option ids are unique in each question
- [ ] Every \`answer\` is the id of one of that question's options
- [ ] Every LaTeX backslash is doubled
- [ ] Every question has an \`explanation\` that shows the working
- [ ] Every distractor has a \`why\`
- [ ] Every numerical answer has been checked, with units
`;
}
