# 20: Copy review as Markdown

**What to build:** A **Copy as Markdown** button on the review puts the whole review on the clipboard as self-contained Markdown. The participant can then paste it into a note or hand it to an AI assistant for analysis, without the assistant needing the bank.

The history file stays lean by design (SPEC §5): it references questions by id and never snapshots their text. A pasteable review gives an assistant full precision without making every class export carry every prompt.

**Blocked by:** 16. Includes the fields of 17 and 19 when they are done.

**Status:** done

- [x] The review has a **Copy as Markdown** button. It confirms the copy, and falls back to a selectable text area where the clipboard API is unavailable
- [x] The Markdown opens with the bank title, bank version, participant name, date, score, duration, attempt code and, when set, the mode and tag filter
- [x] Each question follows in attempt order with its tags, the prompt, every option in presentation order (the correct one and the chosen one marked), the explanation, and the chosen distractor's `why` when there is one
- [x] Where recorded, each question also shows its confidence, response or skipped response, and self-grade
- [x] The calibration summary (17) and self-grade counts (19) appear after the questions when recorded
- [x] Maths stays as its `$...$` source, so it survives the paste
- [x] Unanswered questions and archived questions are labelled as such
- [x] A test pins the output for a fixture attempt

## Notes for the implementer

- The history file format does not change in this ticket.
- The Markdown is built by a pure function from the attempt, the replayed selection and the bank, with no DOM involved, so it can be tested directly.
