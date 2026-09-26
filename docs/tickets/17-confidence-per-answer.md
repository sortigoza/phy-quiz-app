# 17: Confidence per answer

**What to build:** For each option chosen, the participant also says how sure they are: *Sure*, *Unsure* or *Guess*. The review then shows their **confident errors** first and tells them how well-calibrated they were.

A score cannot tell knowledge from a lucky guess. Confident errors are the mistakes most worth correcting, because feedback on them sticks best (the *hypercorrection effect*). Confidence data also lets a participant check their calibration, and a later spaced-review scheduler will need it.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Each question shows a three-way *Sure / Unsure / Guess* control below the options, as a labelled radio group reachable by keyboard and announced by screen readers
- [ ] The control is disabled until an option is chosen. Changing the chosen option keeps the confidence already set
- [ ] Submitting is blocked while any answered question has no confidence, and the message names those questions. Unanswered questions need none, and the existing blank-answer warning is unchanged
- [ ] Confidence is stored per answer as `answers[].confidence: "sure" | "unsure" | "guess"`, which is optional, so attempts saved earlier stay valid
- [ ] The in-progress record keeps confidence too, so a resumed attempt has it
- [ ] The review badges each answer with its confidence
- [ ] The review opens with a **Confident errors** section linking to each question answered *Sure* but wrong, visually distinct. The full list below it stays in attempt order
- [ ] The review summary shows accuracy per confidence level, such as "Sure: 6/7 (86%) · Unsure: 1/2 · Guess: 0/1"
- [ ] Attempts without confidence show "confidence not recorded" in place of the badges and the calibration line
- [ ] Export includes `confidence`. The history reader accepts it as an optional field, so old exports still import and `formatVersion` stays 1
- [ ] A test imports an export written before this ticket, and another round-trips an attempt with confidence through export and import

## Notes for the implementer

- The history reader drops unknown keys (ticket 08). `confidence` must be added to `attemptSchema` in `src/domain/history-file.ts`, or import will silently throw it away.
- Using confidence to choose questions is out of scope. That belongs to the spaced-review scheduler.
