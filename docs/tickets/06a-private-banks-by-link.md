# 06a: Private banks by link (v1.1)

**What to build:** A teacher keeps a bank's plaintext in a private repo, runs one command, commits the encrypted file to a public repo, and gets a link. A student taps that link and the bank opens in their library, ready to take. Anyone who finds the encrypted file without the link sees nothing but ciphertext: no questions, no explanations, not even the title.

The link carries the file's address and the bank key in its URL fragment, which browsers never send to a server. The app keeps the key, so when the teacher publishes the next edition of the bank, it opens without the link. Everything after decryption is the existing bank path: the private bank is validated, stored and taken exactly like any other.

This is v1.1 work. Nothing in v1.0.0 depends on it. The design is SPEC section 3.4, and [ADR 0003](../adr/0003-private-banks-by-capability-link.md) records why it is a link carrying a per-bank key rather than per-student public-key encryption. Do not reopen that choice here.

**Blocked by:** 05

**Status:** done

### Author CLI

- [x] `pnpm bank-crypto encrypt <bank-file> --out <file> --url <public URL> [--app-url <url>] [--rotate]` validates the bank with the app's own parser and refuses an invalid one, printing the same field-path errors as the app
- [x] `encrypt` creates `keys/<bank-id>.key.json` on first use and reuses it afterwards, so every edition of a bank shares one key; `--rotate` replaces it and warns that earlier links will not open new editions
- [x] The output is a General JSON JWE with `alg: dir`, `enc: A256GCM`, our `cty`, and `kid` set to the key's RFC 7638 thumbprint, all in the protected header, and no bank metadata readable without the key
- [x] `encrypt` prints the bank link; `--app-url` defaults to the live Pages URL
- [x] `pnpm bank-crypto decrypt <file> --key <key-file>` prints the plaintext bank

### In the app

- [x] Opening a bank link stores the key, clears the fragment from the address bar, fetches the file through the ticket 05 path, decrypts it and adds the bank to the library
- [x] When that fetch fails, the key is still stored, so downloading the file and uploading it opens the bank without the link
- [x] Upload and URL loading recognise an encrypted bank by its content, not its file name, and open it with the stored key whose `kid` matches
- [x] An encrypted bank with no matching key, one that fails to decrypt, and one that decrypts to an invalid bank each produce their own message, as listed in SPEC section 3.4.4
- [x] The library stores the decrypted text, fingerprints the plaintext, records the `kid` the bank was opened with, and shows a 🔒 badge on private banks
- [x] Keys live in a Dexie `bankKeys` table as non-extractable `CryptoKey`s, and a key is deleted when the last bank opened with it leaves the library
- [x] Attempts, history exports and share links never contain a bank key (proven for attempts; exports and share links are built from attempts by tickets 08 and 09, which must keep it so)

### Proof

- [x] A round-trip test encrypts a bank with the CLI's code and opens it with the app's code, and a second edition encrypted with the same key opens from the stored key alone
- [x] A test proves that a tampered ciphertext is rejected, not partially loaded
- [x] Help and `llms.txt` say that private banks exist and how a student opens one; the teacher guide for publishing them is left to ticket 13

## Notes for whoever picks this up

- Add `jose` as a dependency. Put the encrypt, decrypt, header and link-parsing code in `src/domain/private-bank.ts`, with no DOM and no Dexie, so the CLI and the app share it. `jose` runs on WebCrypto in both the browser and Node 20.
- The CLI needs a TypeScript runner for `scripts/bank-crypto.ts`. `tsx` as a dev dependency is the smallest choice.
- `StoredBank.raw` stays the single source of truth, and for a private bank it holds the plaintext. Record the `kid` on the stored bank (a new optional field, or a new `BankSource` kind), not by keeping the ciphertext.
- The `bankKeys` table is a new Dexie schema version. Existing libraries must upgrade without losing banks or attempts.
- The key parameter is base64url of the raw 32 bytes, not a JWK, so the link stays short. Import it with `extractable: false` before storing it.
- Clear the fragment before any await, so a failure halfway through never leaves the key in the address bar.
- Use the terms in [CONTEXT.md](../../CONTEXT.md): private bank, bank key, bank link. "Share link" means an attempt, never a bank.

## Implementation notes

Built on top of 05, then rebased onto 07. What was built, where it lives, and what was left open on purpose.

### Where things are

- `src/domain/private-bank.ts`: JWE encrypt and decrypt, key encoding, `kid` thumbprint, content-based recognition (`readPrivateBankHeader`), and bank link building and parsing. Shared by the app and the CLI; no DOM, no Dexie.
- `src/bank-link.ts`: `takeBankLink` reads and clears the fragment synchronously, and is called in `main.tsx` before the first render. `openBankLink` stores the key, then fetches and adds the bank.
- `src/library.ts`: `addBankFromText` is still the single entry point. It decrypts a private bank before parsing, fingerprints the plaintext and records the `kid`. Its failures now carry a `reason`: `invalid` (with `private`), `no-key` or `undecryptable`.
- `src/storage/db.ts`: a `bankKeys` table, and a `kid` index on `banks`. `putBank` and `deleteBank` release a key once no bank uses it.
- `scripts/bank-crypto.ts`: the author CLI. Paths resolve against `INIT_CWD`, so it works when run from the teacher's own repo.
- `src/docs/bank-reference.ts` (`privateBanks`), rendered in Help and `llms.txt`.

### Decisions made along the way

- **The link's own key is tried first.** A bank link decrypts with the key it carries, not with the stored key whose `kid` matches the file. A link whose key belongs to another bank then gets the "different bank" message rather than "open the link your teacher sent", which the student has just done.
- **Key clean-up goes beyond "last bank leaves".** A link key that fails to decrypt a file it did fetch is deleted at once. Replacing a bank with an edition under a rotated key lets the old key go. A key from a failed fetch is kept, by design, so an uploaded copy opens.
- **A bank already held gets its key recorded.** If the same plaintext arrives again as a private bank, the stored bank gains the `kid` (and the 🔒 badge). Re-uploading the plaintext never strips a `kid`.
- **A truncated link gets its own message.** A `#bank=` link with a missing or malformed key says it is incomplete. This is a fourth case beyond SPEC §3.4.4's three, because chat apps do cut links short.
- **The bank link is held in `App` state, not in the reducer.** It is a one-shot boot input, not screen data. `Library` shows the outcome, then `App` drops the link so returning to the library does not open it again. A ref keeps StrictMode from fetching twice.
- **Tooling.** `pnpm-workspace.yaml` sets `allowBuilds: esbuild: false`, because pnpm 11 fails the install on an undecided build script. `tsx` works without it. `src/test/setup.ts` wraps `TextEncoder` so jsdom and Node agree on `Uint8Array`, which `jose` checks with `instanceof`.
- **Merging with 07.** Both tickets claimed Dexie version 3; 06a takes version 4.

### Left open

- **History exports and share links (08, 09) do not exist yet.** The "never contain a bank key" box is proven for attempts only. Those tickets build on attempts and must keep keys out.
- **Leaving the library mid-open.** If the student goes to Start before a bank link finishes opening, returning to the library opens it again: one extra fetch and a repeated key write, with nothing corrupted.
- **Only automated tests so far.** Everything is covered in jsdom with fake-indexeddb. Before v1.1 ships, open a real bank link on a phone and a desktop browser.
- **`--rotate` with no key file** creates a key without printing the rotation warning, since nothing was replaced.
- **The teacher guide** for publishing private banks is ticket 13.
