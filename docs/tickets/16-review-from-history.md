# 16: Review from history

**What to build:** A participant opens any attempt in History and sees its review again, exactly as it looked after submission, for as long as its bank is in the library. SPEC §4.3 promised this, and ticket 08 left it open.

It comes before tickets 17 to 20, because each of them adds something to the review that is worth coming back to: confident errors, the participant's own responses and self-grades, and a Markdown copy of the whole thing.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Each History row opens that attempt's review
- [ ] The review replays the selection from the attempt's `seed`, `questionCount` and, once ticket 18 lands, its `tagFilter`, against the held edition of the bank whose fingerprint matches
- [ ] When that exact edition is gone but another edition of the same bank is held, the review uses it and says so. An answer whose question no longer exists shows as an **archived question** with its recorded choice and correctness
- [ ] When no edition of the bank is held, the review degrades to the score summary plus "import the bank to see the questions"
- [ ] Imported attempts open in review too, with the unverified badge
- [ ] Back from a review opened in History returns to History with its filters intact
- [ ] Tests cover the replay against a matching bank, a different edition, and no bank

## Notes for the implementer

- Replaying from the seed is already how the post-submission review works. This ticket is mostly a route from History to that screen, plus the two degraded cases.
- Participant annotations (the Self-Grade from ticket 19) may be written from a review opened here, on local attempts only. See [ADR 0004](../adr/0004-participant-annotations-on-submitted-attempts.md).
