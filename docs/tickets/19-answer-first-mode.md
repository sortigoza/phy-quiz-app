# 19: Answer-first mode

**What to build:** A participant can choose to write their own answer or reasoning to each question before its options appear. In review, they compare their own words with the author's explanation and grade themselves.

Multiple choice trains recognising answers, but exams and research need producing them. Producing an answer before seeing the options is a well-established learning booster (the *generation effect*), and it leaves a record of reasoning to look back on.

**Blocked by:** 16. Asks for confidence after reveal if 17 is done.

**Status:** done

- [x] The Start screen has a *Standard / Answer first* toggle, stored as `attempt.mode: "standard" | "answer-first"`. That field is optional, and missing means standard. The last choice is remembered in the settings table
- [x] In answer-first mode, each question first shows its prompt, a text field labelled "Your answer or reasoning", and a **Reveal options** button. The options are hidden
- [x] Reveal is disabled until the response is at least 10 characters. A **Skip** link reveals the options with no response, which records a **skipped response**, not a skipped question
- [x] After reveal, the response is read-only, and the participant picks an option (and a confidence, if 17 is done) as in standard mode
- [x] The response field previews `$...$` maths live with the existing KaTeX renderer
- [x] Number keys select options only once they are revealed and the focus is not in a text field
- [x] Stored per answer are `answers[].response` (text) and `answers[].responseSkipped: true`. Both are optional, and the in-progress record keeps them so a resume lands in the right state
- [x] The review shows the response beside the explanation and asks "Did your own answer match?" with *Yes / Partly / No*, stored as `answers[].selfGrade`. It is writable on local attempts from any review, including one opened from History (16). See [ADR 0004](../adr/0004-participant-annotations-on-submitted-attempts.md)
- [x] Questions with a skipped response ask for no self-grade
- [x] The review summary shows the self-grade counts next to the option score
- [x] Standard mode behaves exactly as before
- [x] The new fields are optional in `attemptSchema`. Old exports still import, and `formatVersion` stays 1

## Notes for the implementer

- No bank schema change. Some questions are inherently "which of the following", and Skip covers those. A later optional bank field such as `"openResponse": false` could hide the text field for them, but that is a bank format change and out of scope here.
- Share links (09) will carry `responseSkipped` and `selfGrade` but not `response`, whose free text would make links too long for chat apps.
- Automatic grading of responses is out of scope.
