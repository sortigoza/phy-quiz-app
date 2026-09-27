# Developing Physics Quiz

This guide is for contributors: how to set up, what the scripts do, where the tests are, and how a release is made. What the app does is in [SPEC.md](../SPEC.md), why it is built this way in [PLAN.md](../PLAN.md) and [docs/adr](./adr), and what each word means in [CONTEXT.md](../CONTEXT.md).

## Setup

You need Node 20 or later (CI uses 22) and [pnpm](https://pnpm.io). The repository pins pnpm's version in `package.json`, so with Corepack enabled (`corepack enable`) the right one is used automatically.

```bash
git clone https://github.com/sortigoza/phy-quiz-app.git
cd phy-quiz-app
pnpm install
pnpm dev
```

`pnpm dev` serves the app at <http://localhost:5173/> with hot reload. `llms.txt`, the JSON Schema and the example banks are served beside it, as in production. The service worker is not registered in development; use `pnpm build && pnpm preview` to try installing the app or going offline.

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | The development server |
| `pnpm build` | Typechecks, then builds the production app into `dist/` |
| `pnpm preview` | Serves `dist/` locally, service worker included |
| `pnpm test` | Every test, once |
| `pnpm test:watch` | Tests in watch mode |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint, with type-aware rules |
| `pnpm format` | Prettier on code, JSON and YAML. Markdown is hand-formatted and left alone |
| `pnpm format:check` | What CI runs: fails on unformatted files |
| `pnpm validate-banks <paths>` | Checks bank files and repositories with the app's own validator. See [bank-format.md](./bank-format.md#on-the-command-line-validate-banks) |
| `pnpm bank-crypto` | The author tool for private banks. See [bank-format.md](./bank-format.md#private-banks) |
| `pnpm crab-canon` | Writes `public/music/crab-canon.mid`, the library music, from its transcription in `scripts/crab-canon.ts` |
| `pnpm pwa-assets` | Regenerates the app icons in `public/` from `public/icon.svg` |

The scripts in `scripts/` run under `tsx` and resolve paths against the directory you ran pnpm from, so `pnpm --dir path/to/phy-quiz-app validate-banks my-bank.json` works from anywhere.

TypeScript is pinned to 6.x: no stable `typescript-eslint` supports TypeScript 7 yet, and type-aware linting is worth more here than the newest compiler.

## Layout

```text
src/
  domain/     Pure TypeScript: the bank format, selection, scoring, attempts, history files,
              private banks, tags, review. No React, no IndexedDB, no DOM.
  storage/    Dexie: the IndexedDB schema and its upgrades
  render/     Markdown and maths: marked, DOMPurify and KaTeX
  music/      The library music: MIDI parsing and a Web Audio player
  docs/       The bank format as documentation: Help, llms.txt and the JSON Schema are built from here
  app/        The state machine that moves between screens
  ui/         One component per screen, plus shared pieces
  test/       Test setup and helpers
scripts/      Command-line tools, each with its tests beside it
examples/     The example banks: documentation, test fixtures, and published with the app
banks/        Encrypted private banks this repository publishes (ciphertext only)
docs/         Guides, ADRs and tickets
public/       Static files copied into the build: icons and music
```

`vite.config.ts` also emits three kinds of file that are not in `public/`, from one map in its `publishedFiles` plugin: `llms.txt`, `schema/bank-v1.schema.json` and everything in `examples/`. Both the build and the development server use that map.

## Tests

Vitest runs every `*.test.ts` and `*.test.tsx` under `src/` and `scripts/`, in jsdom, with IndexedDB provided by `fake-indexeddb`. There are no browser tests yet.

- **Domain tests** sit beside their module in `src/domain/`: `bank.test.ts` beside `bank.ts`. Most of the logic lives there, and most tests should too.
- **Flow tests** in `src/app/` render the whole `<App />` and drive it as a participant would, with Testing Library and `user-event`: load a bank, take a quiz, read the review. `src/test/quiz.tsx` has the helpers for driving an attempt, and `src/test/attempts.ts` a ready-made attempt record.
- **Documentation tests** hold the docs to the code: `src/docs/*.test.ts` check that Help, `llms.txt`, the JSON Schema and the guides in `docs/` document every field the validator accepts, that every example in them is a bank the app accepts, and that every error message the bank format guide quotes is one the validator emits. Changing the format fails them until the docs say so too.
- **Example tests** in `src/domain/examples.test.ts` check every bank in `examples/` against both the validator and the published schema.
- **Script tests** in `scripts/` run each CLI's `run` function against a temporary directory.

Some habits the suite relies on:

- Test through public interfaces: a module's exports, or the screen as a person sees it. Query by role and accessible name, not by class or test id.
- Clear the database between tests that use it: `await Promise.all(db.tables.map((table) => table.clear()))`.
- Selections and options are shuffled, so flow tests recognise questions by their prompts and options by their text, never by position.

Run one file while working, and the whole suite before pushing:

```bash
pnpm vitest run src/domain/bank.test.ts
pnpm test
```

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push and pull request: typecheck, lint, format check, tests, `pnpm validate-banks examples`, and a production build. [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) publishes to GitHub Pages; it lints and tests again rather than trusting CI, because the two run in parallel.

## Working on a change

- Work is planned as vertical slices in [docs/tickets](./tickets/README.md). A ticket is done when every box is ticked and CI is green; tick the boxes in the same change.
- Use the words in [CONTEXT.md](../CONTEXT.md), in code as in prose: a **bank**, an **attempt**, an **option**, never a "quiz file", a "session" or a "choice".
- A decision that someone will later wonder about gets an ADR in [docs/adr](./adr).
- If a change alters the bank format or how banks load, update `src/docs/bank-reference.ts` (the source of Help and `llms.txt`) and [bank-format.md](./bank-format.md) in the same change. The documentation tests say where.
- A change to the IndexedDB schema is a new Dexie version with an upgrade test: existing libraries and history must survive it.

## Releasing

Versions follow semver, in `package.json`. The app shows its version in the footer and stamps it on every attempt.

1. Add the release's entry to `CHANGELOG.md`, in [Keep a Changelog](https://keepachangelog.com) form, creating the file on the first release, and commit it. The next step refuses to run on a working tree with changes.
2. Bump the version: `pnpm version minor` (or `patch`, or `major`). It updates `package.json`, commits, and tags the commit `v<version>`.
3. Push the commit and the tag: `git push --follow-tags`.
4. Once it is live, open the deployed app on a phone, check the footer shows the new version, and check it still works offline.

Until v1.0.0, every push to `main` deploys, and a release is only a tag. Ticket 14 switches the deploy workflow to publish on version tags, so from v1.0.0 pushing the tag is what publishes.

The bank format has its own version, `formatVersion`, which changes only when the format does, and independently of the app's. A new `formatVersion` also needs a new schema path (`bank-v2.schema.json`), because banks in the wild point at the old one.
