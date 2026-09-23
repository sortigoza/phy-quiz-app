# 06a: Private banks by link (v1.1)

**What to build:** A teacher keeps a bank's plaintext in a private repo, runs one command, commits the encrypted file to a public repo, and gets a link. A student taps that link and the bank opens in their library, ready to take. Anyone who finds the encrypted file without the link sees nothing but ciphertext: no questions, no explanations, not even the title.

The link carries the file's address and the bank key in its URL fragment, which browsers never send to a server. The app keeps the key, so when the teacher publishes the next edition of the bank, it opens without the link. Everything after decryption is the existing bank path: the private bank is validated, stored and taken exactly like any other.

This is v1.1 work. Nothing in v1.0.0 depends on it. The design is SPEC section 3.4, and [ADR 0003](../adr/0003-private-banks-by-capability-link.md) records why it is a link carrying a per-bank key rather than per-student public-key encryption. Do not reopen that choice here.

**Blocked by:** 05

**Status:** ready-for-agent

### Author CLI

- [ ] `pnpm bank-crypto encrypt <bank-file> --out <file> --url <public URL> [--app-url <url>] [--rotate]` validates the bank with the app's own parser and refuses an invalid one, printing the same field-path errors as the app
- [ ] `encrypt` creates `keys/<bank-id>.key.json` on first use and reuses it afterwards, so every edition of a bank shares one key; `--rotate` replaces it and warns that earlier links will not open new editions
- [ ] The output is a General JSON JWE with `alg: dir`, `enc: A256GCM`, our `cty`, and `kid` set to the key's RFC 7638 thumbprint, all in the protected header, and no bank metadata readable without the key
- [ ] `encrypt` prints the bank link; `--app-url` defaults to the live Pages URL
- [ ] `pnpm bank-crypto decrypt <file> --key <key-file>` prints the plaintext bank

### In the app

- [ ] Opening a bank link stores the key, clears the fragment from the address bar, fetches the file through the ticket 05 path, decrypts it and adds the bank to the library
- [ ] When that fetch fails, the key is still stored, so downloading the file and uploading it opens the bank without the link
- [ ] Upload and URL loading recognise an encrypted bank by its content, not its file name, and open it with the stored key whose `kid` matches
- [ ] An encrypted bank with no matching key, one that fails to decrypt, and one that decrypts to an invalid bank each produce their own message, as listed in SPEC section 3.4.4
- [ ] The library stores the decrypted text, fingerprints the plaintext, records the `kid` the bank was opened with, and shows a 🔒 badge on private banks
- [ ] Keys live in a Dexie `bankKeys` table as non-extractable `CryptoKey`s, and a key is deleted when the last bank opened with it leaves the library
- [ ] Attempts, history exports and share links never contain a bank key

### Proof

- [ ] A round-trip test encrypts a bank with the CLI's code and opens it with the app's code, and a second edition encrypted with the same key opens from the stored key alone
- [ ] A test proves that a tampered ciphertext is rejected, not partially loaded
- [ ] Help and `llms.txt` say that private banks exist and how a student opens one; the teacher guide for publishing them is left to ticket 13

## Notes for whoever picks this up

- Add `jose` as a dependency. Put the encrypt, decrypt, header and link-parsing code in `src/domain/private-bank.ts`, with no DOM and no Dexie, so the CLI and the app share it. `jose` runs on WebCrypto in both the browser and Node 20.
- The CLI needs a TypeScript runner for `scripts/bank-crypto.ts`. `tsx` as a dev dependency is the smallest choice.
- `StoredBank.raw` stays the single source of truth, and for a private bank it holds the plaintext. Record the `kid` on the stored bank (a new optional field, or a new `BankSource` kind), not by keeping the ciphertext.
- The `bankKeys` table is a new Dexie schema version. Existing libraries must upgrade without losing banks or attempts.
- The key parameter is base64url of the raw 32 bytes, not a JWK, so the link stays short. Import it with `extractable: false` before storing it.
- Clear the fragment before any await, so a failure halfway through never leaves the key in the address bar.
- Use the terms in [CONTEXT.md](../../CONTEXT.md): private bank, bank key, bank link. "Share link" means an attempt, never a bank.
