# 02: Load a bank by upload and see it in the library

**What to build:** A teacher or student picks a question bank file from their device. The app validates it, stores it, and shows it as a card in the library with its title, author and question count. The bank is still there after a full page reload, and can be deleted.

This ticket carries the bank schema itself, so it decides the shape of the format the whole project depends on. Follow the normative field reference in the spec exactly, including strictness: unknown keys are errors, not warnings.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] A valid JSON bank uploads, validates and appears in the library
- [x] The schema enforces unique question ids, unique option ids within a question, and an answer that names a real option
- [x] Unknown keys anywhere in the bank cause the load to fail
- [x] A bank fingerprint is computed from the exact bytes loaded and stored with the bank
- [x] Banks persist in IndexedDB across reloads and can be deleted from the library
- [x] An invalid bank is rejected whole, never partially, with the reasons listed
- [x] Unit tests cover each schema rule above

## Notes

49 tests pass across the schema, the store, the add-a-bank orchestration, the
library screen and the example bank.

Three things decided while building it:

- The stored row keeps the exact text that was loaded as its single source of
  truth. Title, author and question count are denormalised onto the row purely
  so the library can render without parsing every bank it holds, and the
  fingerprint is computed over the raw text, so the two can never disagree.
- Adding a bank reports whether it was added, replaced or was already held
  byte for byte. Ticket 05 turns the replace case into a prompt; for now the
  screen just says what happened rather than silently doing nothing.
- The loading state uses Dexie's `useLiveQuery` rather than an effect, so
  adding or removing a bank updates the list without anything having to
  remember to refresh it.

`examples/kinematics.json` was added ahead of ticket 13 because otherwise there
is nothing to upload. A test validates it against the real schema and asserts
every distractor carries a `why`.

Validation messages are currently Zod's own wording for the generic cases
(`Too small: expected array to have >=1 items`). The custom messages that read
like a teacher wrote them, and the backslash detector, are ticket 06.
