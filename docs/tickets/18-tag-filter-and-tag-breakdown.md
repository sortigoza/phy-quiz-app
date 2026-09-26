# 18: Tag filter and tag breakdown

**What to build:** A participant sees their accuracy on a bank per tag, weakest first, in History. They can then start a quiz restricted to the tags they choose, either from the Start screen or with one tap on a weak tag.

Tags are recorded in banks but not used, so a participant can neither see a weak area nor aim a quiz at it. In a random draw, weak areas are missed by chance.

**Blocked by:** 08, 16. Shows confident errors if 17 is done.

**Status:** ready-for-agent

### Tag filter

- [ ] The Start screen offers a multi-select of the bank's tags, each with its number of questions, plus **untagged** for questions without tags
- [ ] A question qualifies when it carries any chosen tag. No tag chosen means the whole bank
- [ ] The question count is clamped to the number of qualifying questions, and the screen says so
- [ ] The filter is stored as `attempt.tagFilter: { tags: string[]; untagged: boolean }`, which is optional. When it is missing or empty, the attempt drew from the whole bank
- [ ] The filter is applied to the bank's questions before the seeded shuffle, so an unfiltered attempt draws exactly as it does today, and review (16) replays a filtered one exactly
- [ ] The filter is not remembered between attempts. It starts empty unless preset from the tag breakdown

### Tag breakdown

- [ ] History gains a **Tag Breakdown** panel, shown when the bank filter names one bank. It covers the attempts matching the current name filter, including all names
- [ ] Tags come from the newest held edition of that bank. Answers are joined to questions by `questionId`, and an answer whose question is not in that edition goes under **Archived question** rather than breaking the table
- [ ] When no edition of the bank is held, the panel says "load the bank to see the tag breakdown"
- [ ] Each row shows correct/total and a percentage, sorted weakest first. Rows with fewer than 5 answers carry a "low data" marker
- [ ] If ticket 17 is done, each row also shows its count of confident errors
- [ ] A question with several tags counts towards each of them. Unanswered questions count as wrong, as they do in the score
- [ ] Tapping a tag opens the Start screen for that bank with the filter preset to that tag and the name pre-filled as usual. It does not begin the attempt
- [ ] Aggregates are computed on demand from browser storage. There is nothing to cache or sync

### Counted attempts

- [ ] An attempt averaging under 5 s per question (`durationMs / questionCount`) is **not counted**. The threshold is a named constant
- [ ] History shows a "not counted" marker on such attempts, and the tag breakdown excludes them
- [ ] The participant can overrule the marker on a local attempt, stored as `attempt.countedOverride: boolean`. Imported attempts are read-only. See [ADR 0004](../adr/0004-participant-annotations-on-submitted-attempts.md)
- [ ] Each answer records `answers[].answeredAt` (ISO 8601), the time its option was last changed, which is optional. The in-progress record keeps it. No rule uses it yet: it is there for the spaced-review scheduler

### Format

- [ ] `tagFilter`, `countedOverride` and `answeredAt` are optional fields added to `attemptSchema`. Old exports still import, and `formatVersion` stays 1

## Notes for the implementer

- An idle-gap rule was considered and dropped. A resumed attempt (ticket 07) would always trip it, and the time-per-question rule already catches clicking through.
- The panel never spans banks, for the same reason the leaderboard doesn't: tags belong to a bank.
- Charts and cross-device sync are out of scope.
