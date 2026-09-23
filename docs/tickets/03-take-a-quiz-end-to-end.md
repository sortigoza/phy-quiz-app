# 03: Take a quiz end to end

**What to build:** From a bank in the library, a participant types their name, chooses how many questions to answer, works through them one screen at a time, submits, and lands on a review showing what they got right, what they got wrong, and why. The attempt is recorded.

This is the spine of the product. Question text renders as plain text for now; ticket 04 upgrades it.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] The start screen offers a name field pre-filled with the last name used in this browser, and a question count that defaults to the bank's own default and is clamped to the bank size
- [ ] Question order and option order are shuffled from a recorded seed, and the same seed reproduces the same selection exactly
- [ ] Options are native radio inputs inside a fieldset legended by the question, so keyboard and screen reader support come from the platform
- [ ] A participant can move back and forth between questions before submitting
- [ ] Submitting warns about unanswered questions, then scores the attempt
- [ ] Review lists every question with the correct option, the chosen option, the author's explanation, and the chosen wrong option's own note where the author wrote one
- [ ] Unanswered questions are shown distinctly from wrong answers and scored as wrong
- [ ] The attempt record is written with every field the spec lists, including seed, fingerprint and duration
- [ ] Unit tests cover seeded selection and scoring
