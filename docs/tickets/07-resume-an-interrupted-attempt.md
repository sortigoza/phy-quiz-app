# 07: Resume an interrupted attempt

**What to build:** A student whose phone kills the tab halfway through a quiz reopens the app and picks up where they left off, with their previous answers intact.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Every answer is persisted as it is given, not only at submission
- [ ] Reopening the app with an unsubmitted attempt offers to resume or discard it, naming the bank and the progress
- [ ] Resuming restores the same selection, the same option order and every answer already given
- [ ] Discarding removes the in-progress attempt and records nothing in history
- [ ] At most one attempt is in progress at a time, and starting a new quiz while one is in progress asks first
- [ ] Navigating away mid-attempt asks for confirmation
