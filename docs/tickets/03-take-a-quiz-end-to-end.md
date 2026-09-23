# 03: Take a quiz end to end

**What to build:** From a bank in the library, a participant types their name, chooses how many questions to answer, works through them one screen at a time, submits, and lands on a review showing what they got right, what they got wrong, and why. The attempt is recorded.

This is the spine of the product. Question text renders as plain text for now; ticket 04 upgrades it.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] The start screen offers a name field pre-filled with the last name used in this browser, and a question count that defaults to the bank's own default and is clamped to the bank size
- [x] Question order and option order are shuffled from a recorded seed, and the same seed reproduces the same selection exactly
- [x] Options are native radio inputs inside a fieldset legended by the question, so keyboard and screen reader support come from the platform
- [x] A participant can move back and forth between questions before submitting
- [x] Submitting warns about unanswered questions, then scores the attempt
- [x] Review lists every question with the correct option, the chosen option, the author's explanation, and the chosen wrong option's own note where the author wrote one
- [x] Unanswered questions are shown distinctly from wrong answers and scored as wrong
- [x] The attempt record is written with every field the spec lists, including seed, fingerprint and duration
- [x] Unit tests cover seeded selection and scoring

## Notes

86 tests pass. The domain (seeded selection, scoring, the attempt record) is
unit tested; the screens are covered by one flow test driven through `App`,
from the library card to the stored record.

Decided while building it:

- The shuffle is part of the stored data format. Review, history and share
  links replay the selection from `seed` rather than storing it, so a golden
  test pins the output for one seed. If it ever fails, stored attempts would
  replay with different questions.
- The start screen offers 5, 10, 20 and All, plus the bank's own
  `defaultQuestionCount` when it is none of those, so that default can be
  preselected.
- An unfinished sitting is an `InProgressAttempt`, not a "run", following the
  glossary. SPEC section 4.2 is still headed "The run".
- UI text says "You chose" and never "your answer", because the glossary
  keeps "answer" for the correct option.
- The in-progress attempt lives only in memory for now. Ticket 07 persists it.

One thing to revisit: the Attempt Code is the first 35 bits of a UUIDv7, as the
spec says, but those bits are all timestamp. Any two attempts submitted within
the same ~8 seconds get the same code, and codes from one day share their
first few characters. Deduplication uses the full `id`, so nothing breaks, but
two students submitting together will read out the same code.
