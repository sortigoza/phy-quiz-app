# 08: History, export and import

**What to build:** A participant sees every attempt taken in this browser, newest first, and can filter by name or bank. They can export those attempts to a file, and a teacher can import files from thirty students into one browser to see them all together.

Import is additive and idempotent. Importing the same file twice must change nothing the second time, which is an acceptance test rather than an aspiration.

**Blocked by:** 03

**Status:** done

- [x] History lists attempts newest first with date, name, bank, score, duration and attempt code
- [x] History filters by participant name and by bank
- [x] Export writes a dated file containing either everything or the current filter, wrapped in a versioned envelope
- [x] Import validates the envelope, rejects unknown envelope versions, and skips individual malformed attempts without abandoning the file
- [x] Import deduplicates by attempt id, keeping the record already present
- [x] Import reports how many attempts were added, skipped as duplicates and rejected, with the reasons available
- [x] Imported attempts are marked as such and badged unverified wherever they appear
- [x] A test imports the same file twice and asserts the second import is a no-op

## Implementation notes

What was built, where it lives, and what was left open on purpose.

### Where things are

- `src/domain/history-file.ts`: the envelope. `writeHistoryFile`, `historyFileName` and `readHistoryFile`, with the per-attempt Zod schema. No DOM, no Dexie.
- `src/history.ts`: `filterHistory`, `historyFilterValues` (what the two filters can be set to) and `importHistory`, the single entry point for import, in the way `addBankFromText` is for banks.
- `src/storage/db.ts`: `addAttempts` adds inside one transaction and never overwrites a record already held. No schema change: the `attempts` table from Dexie version 2 already had the indexes needed.
- `src/ui/History.tsx`, opened from a History button in the header, which is shown on the library screen only. `src/ui/download.ts` saves a file through a blob URL.
- Tests are at three seams: the domain module, `src/history.ts` against fake-indexeddb (where the import-twice acceptance test lives), and the whole app in `src/app/history.test.tsx`.

### Decisions made along the way

- **The format is read leniently.** SPEC §11 bumps `formatVersion` only for breaking changes, so a later app may add fields to an attempt within version 1. Unknown keys are dropped rather than refused. The bank format stays strict, because that is a contract with authors.
- **An import does not take the file's word for derived fields.** `code` is derived again from `id`, and `origin` is always `imported`. Ids are lower-cased, so the same attempt cannot get past deduplication by changing case. Times are rewritten as `toISOString` does, because history sorts by comparing the strings.
- **An attempt that contradicts itself is rejected.** That means a `correctCount` that its own answers don't produce, a `questionCount` that doesn't match the number of answers, or a submission before the start. The rejection reason names the field, as bank issues do.
- **Several files at once.** The import control accepts many files. They are imported one after another, so an attempt that appears in two files counts once as added. The report adds up totals across files, lists every rejection with its file and position, and names each file refused whole.
- **The filters are selects, not free text.** A participant is exactly their name (CONTEXT.md), so the name filter offers the names held. The bank filter matches by bank id across versions, under the title of the bank's newest attempt.
- **The score cell carries the badge.** "Unverified" sits next to the score, which is the thing that cannot be verified. History is the only screen that shows imported attempts so far.
- **The file name uses the exporter's local date**, while `exportedAt` inside the file is UTC. Near midnight the two can name different days, and the local date is the one the person expects.

### Left open

- **Review from history** (SPEC §4.3) is not in this ticket's checklist and was not built. `seed` and `questionCount` on the record are enough to replay the selection when the bank is held.
- **The leaderboard (10) and share links (09)** must badge imported attempts too. `origin` and the `badge badge--unverified` class are there to reuse.
- **No limit on file size.** A very large file will not crash the import, but it could make the tab unresponsive while it is read. `durationMs` is not checked against the start and submission times, and times in the future are accepted, which the unverified badge already warns about.
- **Some existing tests are flaky under a full parallel run, and were before this change.** Private-bank and leave-warning tests occasionally miss their 1 s `findBy` timeout. The same happened on `main` in 1 run of 8.
