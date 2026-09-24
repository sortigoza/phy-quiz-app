# 05a: Load many banks at once from a bank repository

**What to build:** A teacher publishes one small JSON file that lists the URLs of several banks, a **bank repository**, and hands out its link. A student pastes that one link into the same "load a bank URL" box they already use, and every bank it lists lands in their library. The app tells the two kinds of file apart by their content, so the student never has to say which one they are pasting.

Each bank a repository lists is loaded through the ticket 05 path exactly as if its URL had been pasted on its own: same fetch, same failure messages, same add-replace-unchanged rules. What is new is the fan-out and the report at the end, which must say, per bank, what happened. One unreachable or invalid bank never stops the others from loading.

The same ticket tidies the library's add controls: the "Upload a bank file" button moves into the URL row, next to "Load from URL", so both ways of adding a bank sit together.

**Blocked by:** 05

**Status:** done

### The repository file

```json
{
  "formatVersion": 1,
  "title": "Mechanics, autumn term",
  "description": "Every bank for the first-year mechanics course.",
  "author": "A. Teacher",
  "banks": [
    { "url": "kinematics.json" },
    { "url": "https://raw.githubusercontent.com/someone/banks/main/forces.json" }
  ]
}
```

- `formatVersion` (required, `1`), `title` (required), `description` and `author` (optional), `banks` (required, at least one entry, at most 100).
- Each entry is an object with a required `url`. Objects rather than bare strings, so later fields (a label, a pinned fingerprint) can be added without a new format version.
- A `url` may be relative, and is resolved against the repository's own URL, so a folder of banks plus one index file can be moved between hosts unchanged.
- Strict like the bank schema: unknown keys and duplicate URLs (after resolving) are errors, and an invalid repository is rejected whole, before any bank is fetched.

### Checklist

- [x] A repository file is recognised by its content (a top-level `banks` array and no `questions`), never by its file name, and anything else goes down the existing bank path, including private banks
- [x] A repository has its own strict schema in `src/domain/`, with field-path errors in the same style as a bank's
- [x] Pasting a repository URL fetches every listed bank through `fetchBankText` and `addBankFromText`, with a small concurrency cap (about 4), and relative URLs resolved against the repository's URL
- [x] One bank failing (unreachable, not found, web page, invalid, private with no key) does not stop the others, and does not roll back the ones already added
- [x] When it finishes, the library shows one report listing every entry with its outcome: added, replaced, already in the library, changed without a version bump, or failed with the same message ticket 05 would have given for that URL
- [x] A bank that changed without a version bump is not replaced silently: its line in the report carries its own Replace button
- [x] A repository entry that is itself a repository is reported as a failure for that entry, not followed, so repositories never nest or loop
- [x] An encrypted bank listed in a repository opens if a matching bank key is already stored, and otherwise reports the ticket 06a "no key" message for that entry
- [x] While a repository loads, the button reads "Loading…" and the status shows progress (for example "Loading 3 of 8…")
- [x] Uploading a repository file works too; its absolute URLs are fetched, and each relative one fails with a message saying it needs the repository's URL to resolve
- [x] The "Upload a bank file" button sits in the URL row beside "Load from URL", the separate upload block is gone, and the upload input keeps its label, its accessible name and its `accept` filter
- [x] The hint under the row covers both inputs, and the label reads so that a bank or a bank repository both fit (for example "Load a bank or bank repository")
- [x] Help and `llms.txt` describe the repository format with an example, and say that one link can load a whole course
- [x] `examples/` gains a repository listing the two example banks by relative URL, and a test validates it against the real schema
- [x] Tests cover recognition, the schema rules, relative URL resolution, a mixed repository (some banks load, some fail, one conflicts), the nesting refusal, and the moved upload button

## Notes for whoever picks this up

- Add **Bank Repository** to [CONTEXT.md](../../CONTEXT.md) and a short §3.5 to [SPEC.md](../../SPEC.md) before building. The word clashes with the git repositories teachers already keep banks in, so the glossary entry should say that a bank repository is the index file, not the git repo it may live in. If a less ambiguous word turns up first ("bank list", "bank index"), rename before code depends on it.
- A repository is not stored. The library holds banks, and the repository is only a way of delivering several at once. Each bank's `BankSource` is its own resolved URL, so re-fetching one later does not depend on the repository still existing.
- Recognition belongs next to `readPrivateBankHeader`: one function that looks at the parsed text and says bank, private bank or repository. `Library.tsx`'s `handleUrl` and `handleFiles` both branch on it.
- `fetchBankText` already returns the address it actually read after GitHub rewriting. Resolve relative entries against that, not against the pasted link, so a repository pasted as a `github.com/.../blob/...` link resolves its entries on `raw.githubusercontent.com`.
- The per-entry report replaces the single notice/rejection panel only for repository loads. A single-bank load keeps today's behaviour exactly.
- Bank links (`#bank=…&key=…`) inside a repository are out of scope: a repository is a public file, and putting bank keys in it would publish them.

## Implementation notes

### Where things are

- `src/domain/bank-repository.ts`: the strict schema, `isBankRepository` (recognition by content) and `parseBankRepository` (validation, relative resolution, duplicate check). Pure, no DOM.
- `src/bank-repository.ts`: `loadBankRepository` fans out over the entries, four at a time, through `fetchBankText` and `addBankFromText`, and returns one outcome per entry. `replaceRepositoryEntry` answers a line's Replace button.
- `src/ui/Library.tsx`: both upload and URL loading branch on `isBankRepository`. The report is its own panel (`RepositoryReportPanel`), with a summary line of counts.
- `examples/physics-course.json` lists both example banks by relative URL and is published beside them, so `<app>/examples/physics-course.json` loads from the live site.

### Decisions made along the way

- **Recognition is a separate check, not one three-way function.** The notes suggested one function answering bank, private bank or repository. `addBankFromText` already recognises a private bank itself, so a repository check before it was the smaller change.
- **Duplicates are compared as fetched.** A GitHub file page and its raw link count as the same bank, and so does a relative entry listed twice in an uploaded repository, where it cannot be resolved.
- **One load at a time.** While a URL, an upload or a repository is loading, Load from URL reads "Loading…" and upload is disabled, so two loads never share a progress line or overwrite each other's report. A Replace in the report waits its turn the same way.
- **Any later action clears the report,** including removing a bank, so a stale report never offers to replace a bank that is gone.

### Left open

- **An encrypted entry that decrypts to a repository** is reported as "not a valid bank" rather than as nesting. Nobody is expected to encrypt a repository.
- **The conflict sentence** is written twice, once in the single-bank panel (JSX with `<code>`) and once in the report line (plain text). Keep them in step until one of them changes shape.
- **Only automated tests so far.** The moved upload button has not been looked at on a phone.
