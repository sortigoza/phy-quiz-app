# Writing a bank with an AI assistant

An AI assistant such as Claude can draft a whole question bank in a minute. This guide gives you a prompt that makes it produce a file the app accepts, and explains what separates a bank that teaches from one that only keeps score, so you can judge and improve the draft.

The format itself is documented in [bank-format.md](./bank-format.md).

## The short way: point it at llms.txt

If your assistant can read web pages, give it the app's `llms.txt`, a description of the bank format written for AI agents:

```text
Read https://sortigoza.github.io/phy-quiz-app/llms.txt and write a question bank of ten questions on projectile motion for first-year university students.
```

## The prompt to copy

If it cannot read web pages, or you want more control, paste this prompt, replacing the four lines in square brackets. It carries everything the assistant needs.

```text
You are writing a question bank for Physics Quiz, a web app for multiple-choice physics quizzes. Output one JSON document and nothing else: no Markdown fences, no comments, no trailing commas, no text before or after it. The app is strict: any unknown key, or any rule below broken, rejects the whole file.

Topic: [the topic, e.g. "circular motion"]
Audience: [who answers it, e.g. "final-year secondary school students"]
Number of questions: [e.g. 10]
Bank id: [lowercase, reverse-DNS style, e.g. "se.myschool.mechanics.circular-motion"]

The document is an object with these keys, and no others:
- "$schema": optional; if present, exactly "https://sortigoza.github.io/phy-quiz-app/schema/bank-v1.schema.json"
- "formatVersion": required, the number 1
- "id": required, the bank id above: 3 to 128 characters, only lowercase letters, digits, dots, dashes and underscores, starting with a letter or digit
- "version": required, "1.0.0"
- "title": required, 1 to 200 characters
- "description": optional, up to 2000 characters, one or two sentences on what the bank covers
- "author": optional, up to 200 characters
- "license": optional, an SPDX identifier such as "CC-BY-4.0"
- "language": optional, a BCP 47 tag such as "en"
- "tags": optional, up to 20 short strings about the whole bank
- "defaultQuestionCount": optional, a whole number from 1 to 500: how many questions one sitting draws
- "questions": required, a list of question objects

Each question is an object with these keys, and no others:
- "id": required, a short kebab-case string unique within the bank, e.g. "banked-curve-speed"
- "type": optional; leave it out ("single-choice" is the default and only type)
- "prompt": required, up to 8000 characters
- "options": required, a list of 2 to 8 option objects; use 4 unless the question calls for fewer
- "answer": required, the "id" of the one correct option
- "explanation": required, up to 8000 characters, shown after the quiz
- "tags": optional, a list of 1 to 3 short kebab-case subtopics, from a small set reused across the bank
- "difficulty": optional, exactly "easy", "medium" or "hard"

Each option is an object with these keys, and no others:
- "id": required, "a", "b", "c", "d" and so on, unique within the question
- "text": required, up to 1000 characters, on one line
- "why": required on every wrong option, and absent on the correct one: why a student would pick it, and what mistake it reveals

Maths: write LaTeX between $...$ (inline) or $$...$$ (display), in commands KaTeX supports. Write units as 9.81\,\mathrm{m/s^2}; there is no \SI command. Text may use Markdown emphasis, lists and tables, except option text, which stays on one line.

Escaping: this is JSON, so double every backslash in every LaTeX command. Write "$5 \\times 10^{3}$", "$\\frac{1}{2}mv^2$", "$9.81\\,\\mathrm{m/s^2}$". A single backslash silently corrupts the text ("\times" becomes a tab followed by "imes") and the app rejects the bank.

Writing the questions:
- Each question tests one idea, and exactly one option is defensibly correct. If an expert could argue for two, rewrite it.
- Build every wrong option from a real misconception or a real slip: a missing factor of one half, a confused quantity, a sign error, the wrong units, a ratio upside down. Never pad with options that are wrong for no reason.
- Every "why" names the mistake that leads to that option, in one or two sentences addressed to the student who chose it.
- Every explanation teaches: it shows the working with numbers and units, and says why the tempting wrong answers are tempting.
- Compute every number yourself, to consistent significant figures, and check the correct option really is correct.
- The app shuffles options, so never write "all of the above", "none of the above" or "both a and b".
- Vary which option id is correct across the bank.

Before answering, check: every key is one listed above; every "answer" names an option of its question; question ids are unique; every LaTeX backslash is doubled; every wrong option has a "why" and the correct one has none; every number is right. Then output the JSON.
```

Save the reply as a file named after the bank, such as `circular-motion.json`, and load it on the **Validate a bank** screen before anything else.

If the assistant writes YAML more reliably, or you would rather edit YAML by hand, ask for "a YAML document, with every text value in single quotes" instead of JSON, and drop the escaping paragraph: in single-quoted YAML a backslash needs no escaping.

## When the app rejects the draft

Paste the errors back to the assistant as they are: each names the field it is in and says what is wrong, which is exactly what the assistant needs. For example:

```text
The app rejected the bank with these errors. Fix them and output the whole corrected JSON document:

questions[3].answer: answer "e" does not match any option id; options are a, b, c, d
questions[6].prompt: contains a tab where "\times" was probably meant: this looks like an unescaped LaTeX command.
```

[bank-format.md](./bank-format.md#error-messages-and-what-to-do-about-them) explains every message, if you would rather fix them yourself.

## Checking the draft yourself

A bank the app accepts can still be wrong. An assistant can get physics wrong with complete confidence, and a quiz that marks a wrong answer right does real harm. Before sharing a bank:

- **Work every numerical question yourself.** Check the correct option, and check that each distractor really follows from the mistake its `why` names.
- **Read each question as a student would.** Is it unambiguous? Could a strong student argue for a second option?
- **Take the quiz.** Load the bank in the app and answer every question, getting some wrong on purpose, then read the review. Maths that does not render is shown as red source text.
- **Look at the answer spread.** If the correct option is nearly always the longest, or the most precise-sounding, students will learn that instead of the physics.

## Writing good distractors

A **distractor** is a wrong option. Good distractors are what make a multiple-choice question diagnostic: when a student picks one, it should tell both of you which idea went wrong.

- **Start from mistakes students really make.** The best source is your own marking. For a numerical question, work the problem wrongly in each common way: forget the factor of one half, square when you should not, use diameter for radius, mix up mass and weight, drop a sign, invert a ratio. Each wrong result is a distractor.
- **Make units a distractor.** An option with the right number and the wrong unit, such as a distance offered as a speed, rewards the habit of checking units.
- **Keep options parallel.** Same form, similar length, same precision. A correct answer that is the only one given to three significant figures, or the only full sentence, gives itself away.
- **Avoid options that are wrong for no reason.** A random number nobody would compute teaches nothing and just makes the question easier.
- **Never rely on order.** The app shuffles options, so "all of the above" and "both (a) and (b)" do not work.
- **Write a `why` for every distractor.** It is shown only to the student who chose that option, at the moment they want to know what went wrong. Name the mistake, not just the right answer: "This is $mv^2$, missing the factor of one half" teaches; "Incorrect, the answer is (b)" does not.

From the [kinematics example](../examples/kinematics.json), a ball falling from rest for one second:

| Option | Why a student picks it | Its `why` |
| --- | --- | --- |
| $4.91\,\mathrm{m/s}$ | uses $\tfrac{1}{2}gt$ | This is the **average** speed over the fall, not the speed at the end of it. |
| $9.81\,\mathrm{m/s}$ | correct: $v = gt$ | (none: it is the answer) |
| $19.6\,\mathrm{m/s}$ | uses $2gt$ | Check which factor the kinematic equation actually carries. |
| $4.91\,\mathrm{m}$ | computes the distance | That is a distance, not a speed. Checking units is the fastest way to catch this one. |

## Writing good explanations

The explanation is shown to every participant in the review, after the quiz. It is the main thing that makes the app teach rather than merely score, which is why the format requires it.

- **Show the working.** Write the equation, substitute the numbers with units, and give the result: "$v = gt = 9.81 \times 1.00 = 9.81\,\mathrm{m/s}$". Not "the answer is (b)".
- **Say why the wrong answers are tempting.** One sentence connecting the correct answer to the most common mistake helps the students who got it right by luck.
- **Give a check.** A units check, a limiting case, or a second route to the same answer ("the average speed is $5.0\,\mathrm{m/s}$, and $5.0 \times 5.0 = 25\,\mathrm{m}$") builds the habit of checking.
- **Keep to the point.** A few sentences. The review shows every question at once, and a wall of text per question goes unread.
- **For conceptual questions**, state the principle, then apply it: "Once released, the only force on the ball is gravity, so its acceleration is $g$ downwards the whole time, including at the top."
- **Never refer to option letters.** The options were shuffled, so "option (a)" means nothing to the participant. Refer to the value or the idea.

## Tags

Tags let a participant restrict a quiz to part of a bank, and show them their accuracy per tag in history, weakest first. They are only useful if they are consistent: agree on a small set of subtopics for the bank (for kinematics: `free-fall`, `constant-acceleration`, `graphs`, `projectiles`), and put one to three on each question. Ask the assistant for the same, and fix any near-duplicates such as `free-fall` and `freefall` by hand.
