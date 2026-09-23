# 10: Leaderboard

**What to build:** For one bank, a ranked table of the attempts held in this browser, so a class can see who did best.

One bank at a time, never across banks: ninety percent on a five-question warm-up is not comparable to seventy percent on a twenty-question exam, and a combined table would quietly imply otherwise.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The leaderboard is chosen per bank and never mixes banks
- [ ] Ranking is by score percentage, then shorter duration, then earlier submission
- [ ] A toggle switches between best attempt per name and every attempt, defaulting to best per name
- [ ] Names are compared after trimming and collapsing whitespace, and are not case-folded or fuzzy-matched
- [ ] Attempts whose bank fingerprint differs from the copy currently in the library are badged, not hidden
- [ ] Imported attempts show their unverified badge here too
