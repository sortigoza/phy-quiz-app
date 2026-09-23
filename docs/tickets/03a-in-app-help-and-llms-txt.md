# 03a: In-app help and llms.txt for what exists today

**What to build:** Someone who opens <https://sortigoza.github.io/phy-quiz-app/> with no other context can find out, inside the app, what it is for, how to take a quiz, and how to write a question bank that loads. An AI agent pointed at the deployed `llms.txt` can produce a valid bank in one go, without reading the source.

This is interim documentation that describes the app as it is after ticket 03, not as it will be at v1.0.0. Ticket 13 still owns the full teacher guides, the generated JSON Schema, the deployment and development guides, and the example set. Until then, this is the only documentation a visitor to the live site can reach.

Keep it honest about the current limits. Today banks are JSON only and load by upload only. Maths and Markdown show as raw text, not rendered. There is no history screen yet. Help that describes features the build lacks is worse than no help.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] A Help screen, reachable from the library and from every screen's header or footer, explains what the app is and walks through loading a bank, starting an attempt, answering, submitting and reading the review
- [x] The Help screen documents the bank format as implemented today: every field with its type, whether it is required, and its limits; the rules that reject a bank (unknown keys, duplicate ids, an `answer` that names no option); and a minimal valid example
- [x] The Help screen explains the backslash trap (every LaTeX backslash in a JSON string must be doubled) and says plainly that maths is not rendered yet
- [x] The Help screen offers the example bank from `examples/` as a download, so a visitor can try a quiz straight away and has a worked file to copy from
- [x] `llms.txt` is served from the deployed app root (`https://sortigoza.github.io/phy-quiz-app/llms.txt`) and follows the llmstxt.org shape: an H1, a one-paragraph blockquote summary, then Markdown sections
- [x] `llms.txt` is self-contained for bank authoring: the complete field reference, the validation rules, the escaping rule, a full valid example, guidance on distractors with a `why` and explanations that teach, and a short checklist an agent can run through before handing a bank back
- [x] A test fails if the schema gains, loses or renames a field that the Help screen or `llms.txt` does not mention, so the docs cannot silently drift from the validator
- [x] A test parses every example bank embedded in the Help screen and in `llms.txt` with the real `parseBank` and requires it to be valid
- [x] The README status note is corrected, since it still says only ticket 01 is done, and it links to the Help screen and `llms.txt`

## Notes for whoever picks this up

- There is no router. Help is one more screen in `app/state.ts`, reached by an action, like the others.
- The llmstxt.org convention puts `llms.txt` at a site root. On a GitHub Pages project site the app's root is the `/phy-quiz-app/` subpath, which is where it belongs here. Serve it from `public/` so Vite copies it through with the relative base unchanged.
- Write the field reference once and have both the Help screen and `llms.txt` use it, or have the drift test above hold them together. Two hand-maintained copies of the same table will diverge.
- Use the terms in [CONTEXT.md](../../CONTEXT.md): bank, question, option, distractor, explanation, participant, attempt, review. An agent reading `llms.txt` benefits from the same precise vocabulary.
- Every later ticket that changes the bank format or the quiz flow must update Help and `llms.txt` in the same change: 04 (maths renders), 05 (load by URL), 06 (YAML, validate screen), 08 (history). Ticket 13 replaces the interim format section with its full guide and generated schema, and links `llms.txt` to it.

## Done

- `src/docs/bank-reference.ts` holds the field reference, rejection rules, quiz
  steps, current limits and both example banks. The Help screen and
  `llms.txt` both render from it.
- The drift test compares field names and required flags against the Zod
  schemas themselves, which `domain/bank.ts` now exports for that purpose.
  Limits in the rules column are still hand-written; ticket 13's generated
  JSON Schema is the place to derive those.
- A small Vite plugin publishes `llms.txt` and `examples/kinematics.json` at
  stable relative paths, both in `pnpm dev` and in the build.
- Help opens over the current screen and closing it returns there, so it is
  safe to open mid-attempt.
