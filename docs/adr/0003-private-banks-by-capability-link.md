# Private banks travel as a link carrying a per-bank key, not as per-student public-key encryption

Teachers want to host banks in a public GitHub repo without the questions and explanations being readable by anyone who finds them. We chose a capability link: each bank is encrypted as a JWE (`dir` + `A256GCM`) under its own random 256-bit key, the same key for every edition of that bank, and the teacher sends students a bank link whose URL fragment carries both the address of the encrypted file and the key. One tap fetches, decrypts and stores the bank; the fragment never reaches a server; the app remembers the key so later editions open without the link. The author side is a small CLI in this repo that validates, encrypts and prints the link.

The first design was per-student public-key encryption: the CLI would generate a P-256 keypair per student, encrypt each bank to every student with `ECDH-ES+A256KW` in a multi-recipient JWE, and students would hold their private key in an in-app keyring. It was rejected because its one real advantage, revoking a single student, is weaker than it sounds. Revocation only stops future editions: old files stay in git history, and a revoked student keeps everything they have already opened. Nothing stops a student in good standing from forwarding the plaintext either. For that, the teacher would have run key generation, a recipients file per class, a keyring screen, key import and `kid` matching in the app, and would have had to deliver a private key to each student before a bank could be delivered at all. Under the capability link, delivering the key and delivering the bank are the same act, and a key can be rotated with a new link to the remaining students when revocation matters.

The cost is stated plainly in SPEC §3.4.5, in the spirit of ADR 0001: a bank link is a bearer secret, forwarding it grants access, anyone who can take the quiz can copy it, and rotation protects future editions only. Private banks protect the file on a public host from people who were never given the link, not the bank from its readers.

## Considered options

- **Per-student EC keys (above).** Real per-reader access control and one key per student across all banks, at several times the app and CLI surface, for revocation that cannot reach anything already published.
- **Both modes.** Two crypto paths, two sets of documentation, and a choice every teacher has to understand before publishing anything.
- **A passphrase (`PBES2`).** Students would type a secret, which is exactly the friction the link removes, and short classroom passphrases are guessable offline against a public file.
- **A hosted redirect page holding the key.** Whoever finds that page has the key, and static hosts serve and log it, so it is equivalent to publishing the key. The key belongs in a fragment.
- **The whole encrypted bank in the fragment.** No hosting needed, but real banks are tens of KB, which chat apps truncate and QR codes cannot hold.

## Addendum: private repositories (v1.1, ticket 06b)

A course of private banks needed one link per bank, which is the burden bank repositories exist to remove. We keep one key per bank and add a **private repository**: a bank repository encrypted the same way, under its own key, whose entries carry the keys of the private banks it lists. The ordinary bank link opens it, and the app tells a repository from a bank by the decrypted content. The repository's key is one more capability, not a replacement for the per-bank ones.

A **course key**, one key shared by every bank in a course, was rejected. Rotating it for one bank would rotate it for all, and forwarding the link to any one bank would open the whole course. With a private repository, a bank's link still opens only that bank, and rotating one bank's key means publishing that bank and its repositories again.
