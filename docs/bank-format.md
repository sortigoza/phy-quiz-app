# Writing a question bank

This guide is for teachers. It covers everything needed to write a question bank for Physics Quiz without reading the app's source: the fields, the rules, how maths is written, how to check a bank, how to publish it, and what each error message means.

The live app is at <https://sortigoza.github.io/phy-quiz-app/>. Its **Help** screen carries a shorter version of this reference, and [authoring-with-ai.md](./authoring-with-ai.md) shows how to have an AI assistant write a bank for you.

## Contents

- [What a bank is](#what-a-bank-is)
- [Minimal example](#minimal-example)
- [Full example](#full-example)
- [Field reference](#field-reference)
- [Maths and Markdown](#maths-and-markdown)
- [The backslash trap](#the-backslash-trap)
- [Writing YAML instead](#writing-yaml-instead)
- [Checking a bank as you write it](#checking-a-bank-as-you-write-it)
- [Publishing a bank](#publishing-a-bank)
- [Error messages, and what to do about them](#error-messages-and-what-to-do-about-them)

## What a bank is

A **question bank** is one file holding some facts about the bank (its id, version and title) and a list of questions. Each question has a prompt, two to eight options, the id of the correct option, and an explanation. A participant loads the bank into the app, answers a random selection of its questions, and then sees a review with the correct options and your explanations.

- The file is **JSON**, the canonical format, or **YAML**, which the app reads as exactly the same thing. Save it as UTF-8, with the extension `.json`, `.yaml` or `.yml`.
- One bank, one topic. Several banks are grouped into a course with a [bank repository](#many-banks-behind-one-link).
- The app is **strict**. A bank that breaks any rule is rejected whole, with every problem listed by the field it is in. Nothing is ever half loaded, and a misspelled field is an error rather than something quietly ignored.

Real banks to copy from are in [`examples/`](../examples): [kinematics](../examples/kinematics.json) and [DC circuits](../examples/dc-circuits.json) in JSON, [energy and momentum](../examples/energy-and-momentum.yaml) in YAML, and a longer [advanced quantum mechanics](../examples/advanced-quantum-mechanics.json) bank. Every one of them is checked by CI on every change.

## Minimal example

The smallest bank the app accepts: every required field, and one optional note on the wrong option.

```json
{
  "formatVersion": 1,
  "id": "example.minimal",
  "version": "1.0.0",
  "title": "A minimal bank",
  "questions": [
    {
      "id": "unit-of-force",
      "prompt": "What is the SI unit of force?",
      "options": [
        { "id": "a", "text": "Newton" },
        {
          "id": "b",
          "text": "Joule",
          "why": "The joule is the unit of energy, force times distance."
        }
      ],
      "answer": "a",
      "explanation": "One newton accelerates one kilogram at one metre per second squared."
    }
  ]
}
```

## Full example

Every field the format has, with maths written the way JSON needs it: every backslash doubled.

```json
{
  "$schema": "https://sortigoza.github.io/phy-quiz-app/schema/bank-v1.schema.json",
  "formatVersion": 1,
  "id": "example.mechanics.free-fall",
  "version": "1.0.0",
  "title": "Free fall",
  "description": "Objects released from rest near the Earth, ignoring air resistance.",
  "author": "A. Teacher",
  "license": "CC-BY-4.0",
  "language": "en",
  "tags": ["mechanics", "kinematics"],
  "defaultQuestionCount": 2,
  "questions": [
    {
      "id": "free-fall-speed",
      "type": "single-choice",
      "prompt": "A ball is released from rest and falls freely for $1.00\\,\\mathrm{s}$. Taking $g = 9.81\\,\\mathrm{m/s^2}$, what is its speed?",
      "options": [
        {
          "id": "a",
          "text": "$4.91\\,\\mathrm{m/s}$",
          "why": "This is $\\tfrac{1}{2}gt$, the average speed over the fall, not the speed at the end of it."
        },
        { "id": "b", "text": "$9.81\\,\\mathrm{m/s}$" },
        {
          "id": "c",
          "text": "$19.6\\,\\mathrm{m/s}$",
          "why": "This is $2gt$. Check which factor the equation $v = u + at$ actually carries."
        },
        {
          "id": "d",
          "text": "$4.91\\,\\mathrm{m}$",
          "why": "That is a distance, not a speed. Checking units catches this one."
        }
      ],
      "answer": "b",
      "explanation": "From rest, $v = gt = 9.81 \\times 1.00 = 9.81\\,\\mathrm{m/s}$. The distance fallen in that second is $\\tfrac{1}{2}gt^2 = 4.91\\,\\mathrm{m}$, which is why the other numbers look tempting.",
      "tags": ["free-fall"],
      "difficulty": "easy"
    },
    {
      "id": "heavier-falls-faster",
      "prompt": "Two steel balls, one of $1\\,\\mathrm{kg}$ and one of $2\\,\\mathrm{kg}$, are dropped together from the same height in a vacuum. Which lands first?",
      "options": [
        {
          "id": "a",
          "text": "The $2\\,\\mathrm{kg}$ ball",
          "why": "The heavier ball feels twice the force, but has twice the mass to accelerate, so its acceleration is the same."
        },
        {
          "id": "b",
          "text": "The $1\\,\\mathrm{kg}$ ball",
          "why": "Nothing in a vacuum favours the lighter ball: there is no air resistance to act on it differently."
        },
        { "id": "c", "text": "They land together" }
      ],
      "answer": "c",
      "explanation": "Both accelerate at $g$, because $a = F/m = mg/m = g$ whatever the mass. Same start, same acceleration, same landing time.",
      "difficulty": "easy"
    }
  ]
}
```

## Field reference

Every field there is. Any other key, anywhere in the file, is an error. Text limits count characters.

### The bank

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `$schema` | text | no | Up to 500 characters. The address of the bank JSON Schema, so an editor checks the bank as you type: see [Checking a bank as you write it](#checking-a-bank-as-you-write-it). The app ignores it. |
| `formatVersion` | whole number | **yes** | Must be `1`. It is the version of this file format, not of your bank. |
| `id` | text | **yes** | 3 to 128 characters: lowercase letters, digits, dots, dashes and underscores, starting with a letter or digit. Reverse-DNS style is recommended, such as `se.school.mechanics.kinematics`. Keep it the same in every edition of the bank: the app uses it to know two files are editions of one bank. |
| `version` | text | **yes** | The edition of your bank, in semver: `1.0.0`, then `1.0.1` for a typo fix, `1.1.0` for added questions. Bump it whenever the file changes. |
| `title` | text | **yes** | 1 to 200 characters. Shown wherever the bank appears. |
| `description` | text | no | Up to 2000 characters, with maths and Markdown. Shown on the start screen. |
| `author` | text | no | Up to 200 characters. |
| `license` | text | no | Up to 100 characters. An SPDX identifier such as `CC-BY-4.0` is recommended, so others know whether they may reuse the bank. |
| `language` | text | no | A BCP 47 tag such as `en` or `sv`; `en` when absent. Screen readers use it to pronounce the bank's text in the right language. |
| `tags` | list of text | no | Up to 20 tags of up to 40 characters, about the bank as a whole. Recorded, not used yet. |
| `defaultQuestionCount` | whole number | no | 1 to 500. How many questions the start screen suggests for one sitting; 10 when absent. Reduced to the number of questions when the bank has fewer. |
| `questions` | list of questions | **yes** | 1 to 500 questions, each with an `id` no other question in the bank has. |

### Each question

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | text | **yes** | 1 to 128 characters, unique within the bank. Short kebab-case such as `free-fall-speed` reads best. Keep it stable across editions: history refers to questions by id. |
| `type` | text | no | `"single-choice"`, the default and the only type there is. Leave it out. |
| `prompt` | text | **yes** | 1 to 4000 characters, with maths and Markdown. The question itself. |
| `options` | list of options | **yes** | 2 to 8 options, each with an `id` unique within the question. The app shuffles them for every attempt. |
| `answer` | text | **yes** | The `id` of the correct option. Exactly one option is correct. |
| `explanation` | text | **yes** | 1 to 4000 characters, with maths and Markdown. Why the correct option is correct. Shown in the review after submission. Required on purpose: it is where the teaching happens. |
| `tags` | list of text | no | Up to 20 tags of up to 40 characters, saying what the question is about. A participant can restrict a quiz to chosen tags, and history shows their accuracy per tag. Use a small, consistent set across the bank. |
| `difficulty` | text | no | `easy`, `medium` or `hard`. Recorded, not used yet. |

### Each option

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | text | **yes** | 1 to 16 characters, unique within the question. `a`, `b`, `c`, `d` is conventional. |
| `text` | text | **yes** | 1 to 1000 characters, with maths and inline Markdown. Kept to one line: lists and tables do not render in an option. |
| `why` | text | no | Up to 2000 characters, with maths and Markdown. Why this option is wrong. Shown in the review only to a participant who chose it. The most valuable optional field in the format: write one for every wrong option. |

### Rules beyond single fields

- Question ids are unique within the bank, and option ids within their question.
- Every `answer` is the id of one of that question's options.
- No text may contain a control character such as a tab. In practice that is always a LaTeX command that lost its backslash: see [the backslash trap](#the-backslash-trap).
- A bank breaking any rule is rejected whole.

## Maths and Markdown

- Write inline maths as `$...$` and display maths as `$$...$$`, in LaTeX that [KaTeX](https://katex.org/docs/supported.html) understands. A formula KaTeX cannot read is shown as its source, marked as an error, rather than breaking the page.
- KaTeX has no `siunitx`. Write units as `9.81\,\mathrm{m/s^2}`, not `\SI{9.81}{m/s^2}`. Chemistry with `\ce{...}` (mhchem) works.
- A dollar sign followed by a space, or a closing one followed by a digit, is not maths, so "between $5 and $10" stays text. Write `\$` for a literal dollar sign anywhere else.
- Prompts, explanations, descriptions and a `why` may use Markdown emphasis, `code`, lists, links and tables. Option text takes emphasis, code and links on one line.
- Raw HTML is shown as text, never run. Images, headings and other Markdown are reduced to their text. Banks come from anywhere, so the app treats their text as untrusted.

## The backslash trap

JSON uses the backslash as an escape character, and this quietly destroys LaTeX. In a JSON string:

| You write | JSON reads it as |
| --- | --- |
| `"\times"` | a tab, then `imes` |
| `"\frac"` | a form feed, then `rac` |
| `"\nu"` | a line break, then `u` |
| `"\alpha"` | an error: `\a` is not an escape JSON knows |

The first three do not fail on their own: they silently produce a different string. So, **in a JSON bank, double every backslash**:

| You want | Write in JSON |
| --- | --- |
| `\times` | `"$5 \\times 10^{3}$"` |
| `\frac` | `"$\\frac{1}{2}mv^2$"` |
| `\,` (a thin space) | `"$9.81\\,\\mathrm{m/s^2}$"` |
| a line break in Markdown | `"First line.\nSecond line."` (the one escape you do want) |

The app watches for the wreckage. A tab, form feed or other control character inside any text rejects the bank, with the field named and the command it probably was: `contains a tab where "\times" was probably meant`. A line break is fine on its own, since Markdown uses them, and is only reported when the rest of a LaTeX command follows it, as in `\nu_0`.

If doubling backslashes is a chore, write the bank in YAML instead.

## Writing YAML instead

A YAML bank has exactly the same fields and rules, and is checked against the same schema. Its advantage is that text in **single quotes** needs no escaping at all, so LaTeX is written just as in a LaTeX document:

```yaml
# yaml-language-server: $schema=https://sortigoza.github.io/phy-quiz-app/schema/bank-v1.schema.json
formatVersion: 1
id: example.mechanics.free-fall
version: 1.0.0
title: Free fall
questions:
  - id: free-fall-speed
    prompt: 'A ball falls from rest for $1.00\,\mathrm{s}$. Taking $g = 9.81\,\mathrm{m/s^2}$, what is its speed?'
    options:
      - id: a
        text: '$4.91\,\mathrm{m/s}$'
        why: 'This is $\tfrac{1}{2}gt$, the average speed over the fall.'
      - id: b
        text: '$9.81\,\mathrm{m/s}$'
    answer: b
    explanation: 'From rest, $v = gt = 9.81 \times 1.00 = 9.81\,\mathrm{m/s}$.'
    tags: [free-fall]
```

Three things to know:

- **Use single quotes** around any text with a backslash. In double quotes YAML has escapes of its own, and `"\sigma"` is an error while `"\times"` quietly becomes a tab, just as in JSON.
- **A single quote inside single-quoted text is written twice**: `'the ball''s speed'`.
- **Longer text** can use a block: `|-` keeps line breaks, which Markdown lists and display maths need, and `>-` folds lines into one paragraph. Block text needs no escaping either.

```yaml
explanation: |-
  Energy is conserved, so

  $$v = \sqrt{2gh}$$

  and the mass cancels.
```

See [`examples/energy-and-momentum.yaml`](../examples/energy-and-momentum.yaml) for a complete YAML bank. JSON remains the format the app is specified in; YAML is an accepted way of writing it.

## Checking a bank as you write it

Three ways, from least to most set-up.

### In the app: Validate a bank

On the library screen, **Validate a bank** takes a file and lists every problem by the field it is in, or confirms it is valid. It adds nothing to your library, and nothing leaves your browser.

### In your editor: the JSON Schema

The app publishes a JSON Schema of the bank format at `schema/bank-v1.schema.json`, generated from the same rules the app validates with. Point your bank at it and an editor such as VS Code, or any JetBrains IDE, completes field names, shows each field's rules on hover, and underlines mistakes as you type.

In a JSON bank, make `$schema` the first field:

```json
{
  "$schema": "https://sortigoza.github.io/phy-quiz-app/schema/bank-v1.schema.json",
  "formatVersion": 1,
  "id": "example.schema",
  "version": "1.0.0",
  "title": "A bank my editor checks",
  "questions": [
    {
      "id": "q1",
      "prompt": "Which of these is a vector?",
      "options": [
        { "id": "a", "text": "Velocity" },
        { "id": "b", "text": "Speed", "why": "Speed has a size but no direction." }
      ],
      "answer": "a",
      "explanation": "Velocity has both a size and a direction; speed is only its size."
    }
  ]
}
```

In a YAML bank, make this comment the first line. VS Code needs the free YAML extension by Red Hat for it; JetBrains IDEs understand it as they are.

```text
# yaml-language-server: $schema=https://sortigoza.github.io/phy-quiz-app/schema/bank-v1.schema.json
```

If you use a copy of the app hosted elsewhere, use that copy's address instead: the schema is always at `schema/bank-v1.schema.json` beside the app.

A JSON Schema cannot express every rule. The editor will not notice an `answer` that names no option, a question id used twice, or a lost backslash; the app, and the two checks below, do.

### On the command line: validate-banks

With a copy of this repository and [pnpm](https://pnpm.io) installed (`pnpm install` once), check any files or folders of banks, from anywhere:

```bash
pnpm --dir path/to/phy-quiz-app validate-banks my-bank.json course/
```

It applies exactly the app's checks to every `.json`, `.yaml` and `.yml` file given, or found in a folder, and exits with an error if any fails, so it can guard a repository of banks in CI. It also checks that every bank a repository lists by a relative path is really there. This repository's own CI runs it on `examples/`.

## Publishing a bank

### By file

Send the file. The participant presses **Upload a bank file** on the library screen.

### By link

Put the file anywhere that serves it to browsers from other sites, then send its address; the participant pastes it into **Load from URL**.

- **GitHub** is the easiest: commit the bank to a public repository and copy the file's page address, such as `https://github.com/a-teacher/banks/blob/main/kinematics.json`. The app turns it into the raw file address itself.
- **GitHub Pages**, jsDelivr and most CDNs work too.
- Many university web servers and Google Drive **do not**: they do not allow other sites to fetch their files. The app says so when that happens. Download the file and upload it instead.

When you change a bank, **bump its `version`**. A participant who loads the new file gets the new edition beside the old one. If the version stays the same but the content changed, the app notices, warns that the bank changed without a version bump, and asks before replacing it.

### Many banks behind one link

A **bank repository** is a small file listing the addresses of several banks, so one link loads a whole course. It is a different file from a bank: it never holds questions.

```json
{
  "formatVersion": 1,
  "title": "Mechanics, autumn term",
  "description": "Every bank for the first-year mechanics course.",
  "author": "A. Teacher",
  "banks": [
    { "url": "kinematics.json" },
    { "url": "https://raw.githubusercontent.com/a-teacher/banks/main/forces.json" }
  ]
}
```

- `formatVersion` (1) and `title` are required; `description` and `author` are optional; `banks` lists 1 to 100 entries, each `{ "url": ... }`, each bank once.
- A relative `url` such as `"kinematics.json"` is read from beside the repository file. That needs the repository loaded by its link: uploaded, only full `https://` entries load.
- Each bank loads as if its own link had been pasted, and one failing does not stop the rest. A repository cannot list another repository.
- See [`examples/physics-course.json`](../examples/physics-course.json), which lists every example bank.

### Private banks

A **private bank** is published encrypted, so the file can sit in a public repository while only people holding its **bank link** can open it. The file shows nothing, not even its title. A participant opens the link, or pastes it into **Load from URL**; the bank joins their library marked 🔒, and their browser keeps its key, so later editions open without the link.

To publish one:

1. Keep the plaintext bank in a **private** repository. Never commit it, or its key, to a public one.
2. With a copy of this repository and pnpm, encrypt it from your private repository's folder, giving the public address the encrypted file will have:

   ```bash
   pnpm --dir path/to/phy-quiz-app bank-crypto encrypt kinematics.json \
     --out ../public-banks/kinematics.bank.jwe.json \
     --url https://raw.githubusercontent.com/a-teacher/public-banks/main/kinematics.bank.jwe.json
   ```

   It refuses an invalid bank, with the same errors as the app. The first time, it creates the bank's key as `keys/<bank-id>.key.json` in your private repository; commit that key there, beside the bank. It prints the **bank link**.
3. Publish the `.bank.jwe.json` file at that address, and send the bank link to your class.
4. For a new edition, bump `version` and encrypt again. The key stays the same, so the link you sent keeps working.

To check your own output, `pnpm --dir path/to/phy-quiz-app bank-crypto decrypt kinematics.bank.jwe.json --key keys/<bank-id>.key.json` prints the plaintext back.

**A private course.** Write a bank repository with an `id`, and mark each private bank's entry with that bank's id, as `{ "url": "quantum.bank.jwe.json", "bank": "physics.qm" }`. Encrypt the private banks first, then encrypt the repository the same way. The tool puts each bank's key into the encrypted repository, so one bank link opens the whole course. Public banks can be listed alongside, without `bank`.

What privacy here does and does not mean:

- A bank link opens the bank for anyone who has it, including whoever it is forwarded to. Send it to the class, not to the world.
- Anyone who can take the quiz can copy its questions and explanations. Encryption protects the file on the public host, not the bank from its readers.
- `--rotate` makes a new key, so links sent before stop opening **new** editions. Files already published stay readable with the old key, including in git history. After rotating a bank, encrypt again every private course that lists it.
- Never write a key into a repository by hand. A plaintext repository holding a key is refused, because that key is now public.

## Error messages, and what to do about them

The app, the Validate screen and `validate-banks` report the same messages, each after the path of the field it is about: `questions[3].answer` is the `answer` of the fourth question, since counting starts at 0. When a file has many problems, fix the first few and check again: the rest often go with them.

### The file cannot be read

```text
this file is not valid JSON: Expected double-quoted property name in JSON at position 56 (line 1 column 57).
```

The file is not JSON at all: often a missing comma, a comma after the last item of a list, a key without double quotes, or a comment (JSON has none). The position counts characters from the start of the file, and the details after the colon come from your browser, so they vary. Pasting the file into any online JSON checker shows the line.

```text
this file is not valid JSON: Bad escaped character in JSON at position 106 (line 1 column 107). The text contains "\alpha": this looks like an unescaped LaTeX command.
```

A LaTeX command such as `\alpha` or `\sigma`, whose letter JSON has no escape for. Double its backslash: `"$\\alpha$"`. See [the backslash trap](#the-backslash-trap).

```text
this file is not valid YAML: Invalid escape sequence \s at line 7, column 15. The text contains "\sigma": this looks like an unescaped LaTeX command.
```

LaTeX in double quotes in a YAML bank. Use single quotes: `prompt: '$\sigma$'`.

```text
this is JSON, but not a question bank: a bank is an object with formatVersion, id, version, title and questions
```

The file is valid JSON (or YAML) but something else entirely, such as a history export or another program's settings. Check you picked the right file.

### A LaTeX command lost its backslash

```text
contains a tab where "\times" was probably meant: this looks like an unescaped LaTeX command.
```

```text
contains a form feed where "\frac" was probably meant
```

In a JSON bank, `"\times"` and `"\frac"` are read as a tab and a form feed. Double the backslash, `"\\times"`, or move the text into single quotes in a YAML bank. The same message names a backspace (`\b`, as in `\beta`), a carriage return (`\r`, as in `\rho`) or a line break before a LaTeX command (`\n`, as in `\nu` or `\nabla`).

### A field is wrong or missing

```text
unknown field "explaination": did you mean "explanation"? Misspelled fields are refused, so that nothing is silently lost.
```

A key the format does not have, usually a typo. The message suggests the field you probably meant, or lists those allowed there. It usually comes with the next one, for the field that is now missing.

```text
this field is required and is missing
```

Add the field named in the path. Every bank needs `formatVersion`, `id`, `version`, `title` and `questions`; every question needs `id`, `prompt`, `options`, `answer` and `explanation`; every option needs `id` and `text`.

```text
should be text, but is a whole number; put it in quotes
```

A number where text belongs, such as `"text": 42` for an option. Write `"text": "42"`. The same message says what it expected and found for other types: a list, true or false, or an object.

```text
is empty: it needs some text
```

A text field with nothing in it, such as `"explanation": ""`. Write the text, or remove the field if it is optional.

```text
needs at least 2 items, but has 1 item
```

A list that is too short: here a question with one option. A question needs 2 to 8 options, and a bank at least one question. A list that is too long says `has too many items`.

```text
is too long: it may have at most 1000 characters, but has 1001
```

Over the limit in the [field reference](#field-reference): here an option's text. Move the detail into the prompt or the explanation.

```text
must be easy, medium or hard, but is "tricky"
```

A field with a fixed set of values, here `difficulty`. Use one of the values listed.

### Questions and options do not fit together

```text
answer "e" does not match any option id; options are a, b
```

The `answer` must be the `id` of one of that question's options, exactly, including case. Often an option was removed, or the answer is written as text rather than as the option's id.

```text
duplicate question id "q1"; question ids must be unique within a bank
```

Two questions share an id, often from copying one to start the next. Give each its own.

```text
duplicate option id "a" at position 2; option ids must be unique within a question
```

Two options in one question share an id. Letter them `a`, `b`, `c`, `d`.

### The bank's identity

```text
bank version must be semver, for example 1.0.0
```

`version` needs all three numbers, as text: `"1.0.0"`, not `"1.0"` or `1`.

```text
bank id may contain only lowercase letters, digits, dots, dashes and underscores, and must start with a letter or digit
```

Rewrite the `id` in lowercase without spaces, such as `se.school.mechanics.kinematics`. Choose it once and keep it: changing it makes the next edition a different bank.

```text
formatVersion must be 1; this app cannot read other versions of the bank format
```

`formatVersion` is the version of the file format, and is always `1` today. Your bank's own edition goes in `version`.

### Loading from a link

These are not problems with the bank itself.

- **"Could not load that URL. The server may not allow cross-origin requests."** The server does not let other sites fetch its files. Use a GitHub or GitHub Pages link, or download the file and upload it.
- **"This is a private bank. Open the link your teacher sent to unlock it."** The file is encrypted and this browser has no key for it. Open the bank link rather than the file's own address.
- **The bank changed without a version bump.** The app already holds a bank with this `id` and `version` but different content. The participant chooses whether to replace it; as the author, bump `version` whenever the file changes.
