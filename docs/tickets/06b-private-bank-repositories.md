# 06b: Private bank repositories (v1.1)

**What to build:** A teacher with a course of private banks sends one link, and a student who taps it gets every bank in the course, public and private, in their library. Today that takes one repository link plus one bank link per private bank, and a student who opens the repository first sees a report full of locked banks.

The link is an ordinary bank link. What it points at is a **private repository**: a bank repository encrypted exactly as a private bank is, so its title and its list of banks are hidden, and whose entries carry the keys of the private banks they list. After decrypting, the app looks at the content: a bank goes down the 06a path, a repository down the 05a path, with each private entry opened by the key it carries.

The design is SPEC section 3.5.1. The addendum to [ADR 0003](../adr/0003-private-banks-by-capability-link.md) records why this is one more key per repository rather than one key per course. Do not reopen that choice here.

**Blocked by:** 05a, 06a

**Status:** ready-for-agent

### Repository format

- [ ] A repository accepts an optional `id` (the bank id pattern), and an entry accepts an optional `bank` (a bank id, which the app ignores) and an optional `key` (base64url of 32 bytes)
- [ ] A plaintext repository with a `key` on any entry is refused whole, saying the keys in it are now public and must be rotated; the same file arriving encrypted is valid
- [ ] A malformed `key` is a field-path error on that entry, like any other

### Author CLI

- [ ] `pnpm bank-crypto encrypt` recognises a repository by content and refuses one that is invalid or has no `id`
- [ ] For each entry with `bank`, it reads `keys/<bank>.key.json`, and refuses, naming the entry, when that key does not exist yet
- [ ] It swaps each `bank` for that bank's `key` in memory only, never writing key-bearing plaintext to disk, then encrypts under `keys/<repository-id>.key.json` (created on first use, stable across editions, `--rotate` as for banks) and prints the link
- [ ] `encrypt --rotate` on a bank warns that every private repository listing it must be encrypted again
- [ ] `decrypt` on a private repository prints it with its keys shown as `bank` ids where a matching key file exists, so the author can check it without the keys going to the terminal

### In the app

- [ ] Opening a bank link to a private repository stores its key, clears the fragment, fetches and decrypts it, and loads it through the 05a path with its report
- [ ] Each private entry's key is stored before that entry is fetched, so a bank whose fetch fails opens later by upload, and so does a downloaded copy of the repository
- [ ] The entry's own key is tried first, then the stored key matching the file's `kid`; when neither opens it, the line says the key in the course list is out of date
- [ ] Relative entries resolve against the encrypted repository's address
- [ ] An entry without a key is loaded as a public bank, so one course can mix both
- [ ] Each bank delivered by a private repository records the repository's `kid`, and the repository key is deleted when the last such bank leaves the library; existing libraries upgrade without losing banks or keys
- [ ] In a plaintext repository, a private bank with no stored key reads "This bank is private. Open the private course link or bank link your teacher sent."
- [ ] A private repository listing a repository is refused per entry, as 05a does, including when the listed file is itself encrypted

### Proof

- [ ] A round-trip test encrypts two banks and a repository listing them with the CLI's code, opens the repository link with the app's code, and ends with both banks in the library and three keys stored
- [ ] A second edition of the repository, with one bank added, opens from the stored repository key alone
- [ ] Removing the delivered banks deletes the repository key and the bank keys
- [ ] Tests cover the refusal of plaintext keys, the out-of-date key line, and a mixed public and private course
- [ ] Help and `llms.txt` say that one link can open a whole private course; the teacher guide to publishing one is left to ticket 13

## Notes for whoever picks this up

- `readPrivateBankHeader` and `decryptBank` in `src/domain/private-bank.ts` already handle any encrypted text. The only new question is what the plaintext turns out to be, so decrypt first, then branch on `isBankRepository`.
- `openBankLink` in `src/bank-link.ts` currently hands the decrypted text to `addBankFromText`. It needs to hand a repository to `loadBankRepository` instead, and `Library` needs to show the report for a link outcome as it does for a pasted URL.
- `loadBankRepository` needs a way to pass each entry's key through to `addBankFromText`, whose `key` option already exists for exactly this.
- Recording the delivering repository is a new optional field on `StoredBank` and a new Dexie schema version (06a took version 4). Extend `putBank` and `deleteBank`'s key clean-up rather than adding a second mechanism.
- The CLI must build the key-bearing plaintext and encrypt it in one step. Do not add a flag to write it out, even for debugging.
- Use the terms in [CONTEXT.md](../../CONTEXT.md): private repository, bank key, bank link. A bank link now points at a private bank or a private repository.
- Out of scope: remembering repositories in the library with an Update button. Students open the course link again to pick up new banks.
