# Submitted attempts are immutable, except for the participant's own annotations

Until now an attempt record never changed after submission, and import relied on that: on an id collision it keeps the record already held. Two features need to write to an attempt afterwards: the participant's Self-Grade of their own response in the review, and their override of the judgement that an attempt is not counted. We allow exactly these annotation fields to be written, and only on local attempts (`origin: "local"`). Imported attempts stay read-only, and everything that determines the score (`answers[].chosenOptionId`, `correctCount`, the seed, the times) stays frozen for every attempt.

Import is unchanged. It keeps the existing record on a collision, so annotations made on the same attempt in another browser are not merged in. The browser the attempt was taken in holds the authoritative annotations, and an imported attempt is already unverified.

## Considered options

- **A separate annotations table keyed by attempt and question id.** It keeps the attempt immutable, but every reader, including export, share links and the aggregates, would then have to join it back in, and an annotation could outlive or miss its attempt.
- **Self-grading before submission, inside the attempt.** No mutation is needed, but the participant would have to see the explanation before submitting, which breaks exam mode (SPEC §4.2).
- **Merging annotations on import.** Import would stop being a simple keep-the-existing-record rule, and one browser's annotations would silently overwrite another's.
