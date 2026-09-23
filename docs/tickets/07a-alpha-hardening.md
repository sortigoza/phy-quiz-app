# 07a: Alpha hardening

**What to build:** The app is safe to hand to a teacher and a class for an alpha. Nothing a participant does silently loses their work, two attempts never read out the same attempt code, the app says plainly what it cannot do yet, and an unexpected failure shows a message instead of a blank page.

These came out of the general review before the alpha release. Most were small enough to fix on the spot; this ticket records them so they are not reopened by accident, and carries the one that remains.

**Blocked by:** 03

**Status:** done

- [x] The attempt code comes from the random end of the attempt id, not its timestamp, so attempts submitted in the same second get different codes, and SPEC section 5 says so
- [x] Closing, reloading or navigating away from the page between Begin and Submit asks for confirmation first, including while Help is open over the attempt
- [x] Help and `llms.txt` say that reloading mid-quiz loses the answers, until ticket 07 makes attempts resumable
- [x] Help and `llms.txt` tell participants to screenshot the review (which shows the attempt code) to hand a score to a teacher, until ticket 08 adds history and export
- [x] Help and `llms.txt` say that scores are self-reported and the app is for practice and classroom quizzes, not grading
- [x] The upload control's wording matches the "use Upload" advice in the URL failure messages
- [x] An unexpected failure on any screen shows a short message with a way back to the library, instead of a blank page
- [x] A bank already in the library that no longer validates (for example after ticket 06 tightens validation) cannot take the app down: starting it explains the problem and offers to remove it
- [x] Storage being unavailable (a private window that blocks IndexedDB, or a full disk) is explained in words a participant can act on, rather than failing silently
- [x] Tests cover each of the three failures above

## Notes for whoever picks this up

- The first six boxes landed in commit `6885ccb`. They need no further work.
- Ticket 07 still owns resuming an interrupted attempt. Its "navigating away mid-attempt asks for confirmation" box is already met by the leave warning above; tick it when 07 lands rather than reimplementing it.
- Ticket 08 still owns history and export. The screenshot advice is a stopgap, to be removed from Help and `llms.txt` when 08 lands.
- The bank that no longer validates is the likeliest real crash: every stored bank is parsed again when a quiz starts, and a stricter validator would reject banks accepted during the alpha. Consider landing this before 06.
- Ticket 07 has since landed, so Help and `llms.txt` no longer say that reloading loses the answers. They now say that the library offers to resume or discard an interrupted quiz.
