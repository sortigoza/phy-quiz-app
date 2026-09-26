# 16: Review from history

**What to build:** A participant opens any attempt in History and sees its review again, exactly as it looked after submission, for as long as its bank is in the library. SPEC §4.3 promised this, and ticket 08 left it open.

It comes before tickets 17 to 20, because each of them adds something to the review that is worth coming back to: confident errors, the participant's own responses and self-grades, and a Markdown copy of the whole thing.

**Blocked by:** 08

**Status:** done

- [x] Each History row opens that attempt's review
- [x] The review replays the selection from the attempt's `seed`, `questionCount` and, once ticket 18 lands, its `tagFilter`, against the held edition of the bank whose fingerprint matches
- [x] When that exact edition is gone but another edition of the same bank is held, the review uses it and says so. An answer whose question no longer exists shows as an **archived question** with its recorded choice and correctness
- [x] When no edition of the bank is held, the review degrades to the score summary plus "import the bank to see the questions"
- [x] Imported attempts open in review too, with the unverified badge
- [x] Back from a review opened in History returns to History with its filters intact
- [x] Tests cover the replay against a matching bank, a different edition, and no bank

## Notes for the implementer

- Replaying from the seed is already how the post-submission review works. This ticket is mostly a route from History to that screen, plus the two degraded cases.
- Participant annotations (the Self-Grade from ticket 19) may be written from a review opened here, on local attempts only. See [ADR 0004](../adr/0004-participant-annotations-on-submitted-attempts.md).

## Implementation notes

What was built, where it lives, and what was left open on purpose.

### Where things are

- `src/domain/review.ts`: `reviewAttempt(attempt, editions)` decides which edition to show and builds the reviewed questions; `reviewSelection` does the same for a selection still in memory, which is how the post-submission review is built, so both routes render one model. No DOM, no Dexie. `compareVersions`, which orders bank versions, is in `src/domain/bank.ts`.
- `src/history.ts`: `reviewFromHistory(attempt)` reads the bank's editions (`listEditions` in `src/storage/db.ts`) and hands them to the domain.
- `src/ui/Review.tsx` renders an `AttemptReview`: the replayed questions, the note naming the other edition, archived questions, or the score alone. `src/ui/UnverifiedBadge.tsx` is the badge History already showed, now shared.
- `src/app/state.ts`: History's filter moved from the component into the `history` screen state, and a review carries `back`, the screen it returns to. That is what keeps the filters on the way back.
- Tests are at three seams: `src/domain/review.test.ts`, `src/history.test.ts` against fake-indexeddb, and the whole app in `src/app/history.test.tsx`.

### Decisions made along the way

- **The replay is checked, not trusted.** An imported attempt can name any fingerprint, so when the exact edition is held the replayed question ids must equal the recorded ones in order. If they do not, the review takes the other-edition path rather than pairing answers with the wrong questions, and says the attempt does not match the edition it names rather than that the edition is gone.
- **Another edition shows questions by id, in attempt order, with options in the bank's order.** The seed cannot replay option order against a different bank, so no attempt is made to.
- **A question is archived when its id is gone, or when its recorded correct or chosen option is.** Either way the card could not show what was recorded. CONTEXT.md's entry says so. The recorded choice and correctness always stand, and the score is never recomputed.
- **The newest edition is the highest version**, compared as semver closely enough: numerically by major, minor and patch, a release above its pre-releases. Not by `addedAt`, which a re-download would change.
- **An edition that no longer parses is passed over**, as if it were not held.
- **Each row has a Review button**, named with the attempt code, rather than the whole row being clickable, which a table row cannot be accessibly.
- **The help's current limits** still said there was no history screen. They now say what History does.

### Left open

- **A question whose answer key changed** between editions, keeping its options, is shown with the recorded marks beside the new explanation, which may disagree with them. The note above the list says which edition is shown.
- **The import report is not kept** on the way back from a review; only the filters are.
- **Ticket 18's `tagFilter`** must be passed to `drawSelection` inside `reviewAttempt` when it lands.
