# Physics Quiz: Implementation Plan

Companion to [SPEC.md](./SPEC.md). Terms come from [CONTEXT.md](./CONTEXT.md).

> **Execution order lives in [docs/tickets/](./docs/tickets/README.md).** Those fourteen tickets are vertical slices, each demoable on its own, and they supersede the phase ordering below. This document remains the architectural narrative: what each area contains, why it is shaped that way, and what to watch out for. Read a ticket for what to do next; read this for what the thing you are building is.

Eleven phases. Each one ends in something you can run, and each names the acceptance criteria from SPEC section 9 that it closes. Build order is deliberate: the pure domain first, because it is where every rule lives and where tests are cheap; the UI after, because it is then mostly wiring.

Rule of thumb for the whole plan: if a phase starts growing a second concern, stop and ship the first one.

---

## Phase 0: Repository bootstrap

**Do**

```bash
git init
pnpm create vite . --template react-ts
pnpm add zod dexie katex marked dompurify yaml
pnpm add -D vitest @vitest/coverage-v8 @playwright/test vite-plugin-pwa \
            typescript-eslint prettier zod-to-json-schema
```

- `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- `vite.config.ts`: `base: './'`.
- `package.json` scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `typecheck`, `lint`, `format`, `validate:examples`.
- `.github/workflows/ci.yml`: pnpm via `pnpm/action-setup`, then typecheck, lint, test, build.
- `CONTEXT.md` and `SPEC.md` already exist; commit them first so the history starts with the agreement.

**Done when** `pnpm build` produces a `dist/` and CI is green on an empty app.

---

## Phase 1: The domain core

No React, no IndexedDB, no DOM. Pure functions and types under `src/domain/`. This phase is where the specification becomes executable.

**`bank.ts`**
- Zod schema for Bank, Question, Option exactly as SPEC section 2.3, `.strict()` everywhere.
- Cross-field rules: unique question ids, unique option ids per question, `answer` matches an option id.
- `parseBank(text, filename)`: choose JSON or YAML by extension and content, parse, validate, return either a bank or a list of `{ path, message }` errors.
- The **backslash detector**: scan raw string values for control characters that indicate an unescaped LaTeX command and report them as errors with the guidance from SPEC section 2.5.
- `fingerprint(bytes)`: SHA-256 via `crypto.subtle`, first 8 hex characters.

**`selection.ts`**
- `mulberry32(seed)`, a 32-bit seeded PRNG in about six lines.
- `drawSelection(bank, n, seed)`: seeded Fisher-Yates over questions, take N, and a seeded shuffle of each question's options. Same seed gives the same selection, forever.

**`scoring.ts`**: `correctCount` over an answer list; percentage derived, never stored.

**`attempt.ts`**: the `Attempt` type, `createAttempt`, UUIDv7 generation, and `attemptCode(id)` rendering the last (random) 35 bits as Crockford base32, grouped `XXX-XXXX`.

**`share.ts`**: `encodeShare` / `decodeShare` using `CompressionStream("deflate-raw")` plus base64url, with a plain-base64 fallback. Round trip must be lossless.

**`history-file.ts`**: the export envelope, and `mergeAttempts(existing, incoming)` returning `{ merged, imported, duplicates, rejected }`. Dedupe by `id`, existing wins.

**Tests (Vitest)**: every rule above, plus these specific cases, which are the ones that will actually break:
- a bank with a duplicate question id
- an `answer` naming an option that does not exist
- an unknown key (`explaination`) rejected
- `"\times"` in a JSON bank detected and explained
- the same YAML and JSON bank parsing to identical objects
- the same seed producing an identical selection twice
- `mergeAttempts` applied twice being identical to applied once
- a share payload round-tripping through encode and decode

**Done when** the domain is fully tested with no UI in existence. Closes nothing user-visible, and is the phase most worth doing carefully.

---

## Phase 2: Storage and the library

**`storage/db.ts`** (Dexie), four tables:

| Table | Key | Notes |
| --- | --- | --- |
| `banks` | `[id+version]` | plus fingerprint, source, addedAt, raw text |
| `attempts` | `id` | indexes on `bankId`, `name`, `submittedAt` |
| `inProgress` | fixed key | at most one row |
| `settings` | fixed key | last name used |

**Loading**: upload via a file input, URL via `fetch`. On failure, classify the error and emit the specific CORS message from SPEC section 3.1. Re-loading a known `id` plus `version` with a different fingerprint prompts to replace.

**Screens**: Library (bank cards, add-by-upload, add-by-URL, delete) and Validate a bank (drop a file, see errors, never stores it).

**Closes** acceptance 1, and acceptance 2 once Phase 7 adds the service worker.

---

## Phase 3: Rendering

`render/markdown.ts`, one deep function: text in, safe HTML out.

1. Extract `$...$` and `$$...$$` into placeholders.
2. `marked` over the remainder, restricted to emphasis, code, lists, links, tables.
3. `DOMPurify.sanitize`.
4. Render each placeholder with `katex.renderToString({ throwOnError: false })` and reinsert.

A KaTeX failure renders as the raw source in a marked-up error span, never as a blank or a crash. Bank text is wrapped in an element carrying the bank's `language`.

**Done when** a fixture containing `$\frac{1}{2}mv^2$`, a Markdown table, and an attempted `<script>` injection all render correctly and safely.

---

## Phase 4: The attempt flow

`app/state.ts`, one `useReducer` state machine: `library | start | attempt | review | history | leaderboard | validate`.

- Start screen: name pre-filled from settings, question count 5 / 10 / 20 / All clamped to bank size with a note when clamped.
- Attempt screen: one question per screen, progress indicator, free back and forth, native radios in a fieldset, number keys 1 to 9.
- Persist the in-progress attempt on every answer. On boot, offer resume or discard.
- Submit: warn about blanks, score, write the attempt, go to review.
- Review: score ring, per-question breakdown, correct and chosen marks, `explanation`, and the chosen wrong option's `why`. Degrades to a summary when the bank is missing.
- Confirm before leaving mid-attempt.

**Closes** acceptance 3 and 4.

---

## Phase 5: History, export, import, share

- History screen: list, filter by name and bank, unverified badges.
- Export: current filter or everything, as `physics-quiz-history-YYYY-MM-DD.json`.
- Import: file input through `mergeAttempts`, then the report line ("Imported 27, skipped 3 duplicates, rejected 1 invalid").
- Share: a button in review producing the `#share=` link, with copy-to-clipboard.
- Boot: if `location.hash` starts with `#share=`, decode, recompute the score against the local bank when present, show a confirmation screen before storing, then clear the hash.

**Closes** acceptance 5 and 6.

---

## Phase 6: Leaderboard

Per bank. Sort by percentage descending, then shorter duration, then earlier submission. Toggle between best-per-name (default) and every attempt. Badge fingerprint mismatches.

**Closes** acceptance 7.

---

## Phase 7: PWA

- `vite-plugin-pwa` in `prompt` mode; manifest with relative `start_url: "."` and `scope: "./"`, icons at 192 and 512 plus maskable.
- Precache the shell and KaTeX fonts; suppress the update toast while an attempt is in progress.
- Install button on the library screen behind `beforeinstallprompt` (Chrome and Firefox only; no iOS instruction line).
- **Verify offline on the deployed GitHub Pages URL, not just localhost.** The project-site subpath and service worker scope is the sharp edge called out in SPEC section 11.

**Closes** acceptance 2 and 8.

---

## Phase 8: Presentation and accessibility

- Plain CSS with custom properties; light and dark palettes from `prefers-color-scheme`.
- Mobile-first single column near 640px, 44px touch targets, AA contrast, visible focus rings.
- Score ring animation respecting `prefers-reduced-motion`; one encouraging line per score band.
- Keyboard pass over every screen; screen reader pass over the attempt flow.

---

## Phase 9: Documentation and examples

- `public/schema/bank-v1.schema.json` generated from the Zod types by a build script, so the schema can never drift from the validator.
- `examples/`: three banks of around ten questions each (kinematics, electrostatics, waves), at least one in YAML, all with real explanations and real distractor `why` text. They are documentation and CI fixtures at once.
- `docs/bank-format.md`, `docs/authoring-with-ai.md`, `docs/deploy.md`, `docs/development.md`, `README.md`.
- `pnpm validate:examples` in CI.

**Closes** acceptance 9.

---

## Phase 10: Release 1.0.0

- One Playwright test walking load a bank, take a quiz, review, export.
- `CHANGELOG.md` in Keep a Changelog format.
- `pnpm version 1.0.0`, tag, push.
- `.github/workflows/deploy.yml`: build and publish to GitHub Pages on tag.
- Install and run the deployed app on a real phone, offline, before calling it done.

---

## Risks worth watching

| Risk | Mitigation |
| --- | --- |
| Service worker scope on a GitHub Pages project site | Relative `start_url` and `scope`; test on the real URL in Phase 7, not at the end |
| KaTeX font weight in the precache | Subset if the precache gets uncomfortable; measure before optimising |
| Teachers hitting the backslash trap anyway | The detector, the docs, the YAML escape hatch, and the in-app validator all point at the same failure |
| `CompressionStream` absent in an old browser | Plain-base64 fallback, longer links, same behaviour |
| Scope creep into figures, timers and practice mode | The out-of-scope table in SPEC section 1.2 is the answer to all three |

---

## Suggested commit sequence

Phase 0 and 1 are one arc and should land as several small commits (`chore: bootstrap`, `feat(domain): bank schema`, `feat(domain): seeded selection`, and so on). From Phase 2 onward, one phase is one pull request, each leaving the app runnable.
