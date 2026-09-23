# 08: History, export and import

**What to build:** A participant sees every attempt taken in this browser, newest first, and can filter by name or bank. They can export those attempts to a file, and a teacher can import files from thirty students into one browser to see them all together.

Import is additive and idempotent. Importing the same file twice must change nothing the second time, which is an acceptance test rather than an aspiration.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] History lists attempts newest first with date, name, bank, score, duration and attempt code
- [ ] History filters by participant name and by bank
- [ ] Export writes a dated file containing either everything or the current filter, wrapped in a versioned envelope
- [ ] Import validates the envelope, rejects unknown envelope versions, and skips individual malformed attempts without abandoning the file
- [ ] Import deduplicates by attempt id, keeping the record already present
- [ ] Import reports how many attempts were added, skipped as duplicates and rejected, with the reasons available
- [ ] Imported attempts are marked as such and badged unverified wherever they appear
- [ ] A test imports the same file twice and asserts the second import is a no-op
