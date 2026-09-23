# 02: Load a bank by upload and see it in the library

**What to build:** A teacher or student picks a question bank file from their device. The app validates it, stores it, and shows it as a card in the library with its title, author and question count. The bank is still there after a full page reload, and can be deleted.

This ticket carries the bank schema itself, so it decides the shape of the format the whole project depends on. Follow the normative field reference in the spec exactly, including strictness: unknown keys are errors, not warnings.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A valid JSON bank uploads, validates and appears in the library
- [ ] The schema enforces unique question ids, unique option ids within a question, and an answer that names a real option
- [ ] Unknown keys anywhere in the bank cause the load to fail
- [ ] A bank fingerprint is computed from the exact bytes loaded and stored with the bank
- [ ] Banks persist in IndexedDB across reloads and can be deleted from the library
- [ ] An invalid bank is rejected whole, never partially, with the reasons listed
- [ ] Unit tests cover each schema rule above
