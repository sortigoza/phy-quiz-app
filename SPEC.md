# Physics Quiz: Specification

Version of this document: 1.0.0-draft
Target release: app v1.0.0
Status: agreed, not yet implemented

Read [CONTEXT.md](./CONTEXT.md) first. It defines every term used here, and this document uses those terms strictly.

---

## 1. What this is

A local-first progressive web app for taking multiple-choice physics quizzes.

A teacher or an AI assistant writes a **question bank** as a single file. A student loads that file into the app by upload or by URL, types a name, answers N randomly selected questions, and gets a **review** with the correct answers and the author's explanations. Results accumulate in the browser as **history**, rank per bank on a **leaderboard**, and move between devices as an export file or a **share link**.

There is no server. The built app is static files.

### 1.1 Design commitments

These are the rules every later decision defers to.

1. **Local-first, and actually local.** No network call is required after the first load. No telemetry. Nothing a student does leaves their device unless they explicitly export or share.
2. **The bank file is the product.** One portable, documented, validated file that a teacher can email, commit to git, or serve from a static host. The app is a reader for it.
3. **Simple now, additive later.** Every v1 decision favours the smaller surface. The formats are versioned so v1.1 can add without breaking v1.
4. **Honest about what it cannot do.** A static app cannot prevent cheating. The app says so rather than implying otherwise.

### 1.2 Explicitly out of scope for v1

Named here so nobody has to wonder whether they were forgotten.

| Not in v1 | Why | Path later |
| --- | --- | --- |
| Backend, accounts, cross-device leaderboard | Would end static hosting; see [ADR 0001](./docs/adr/0001-local-first-no-backend.md) | Attempt record is already backend-shaped |
| Question types beyond single-choice | One type done well | `type` discriminant already in schema |
| Figures and diagrams | Text plus maths covers introductory physics | Additive `figure` field |
| Practice mode with per-question feedback | Exam mode only; all teaching happens in review | Additive mode flag |
| Timers | Duration is recorded, not enforced | Additive per-bank time limit |
| Pasting bank JSON as text | Upload and URL cover it | Trivial to add |
| Dark mode toggle, i18n, gamification | Complexity without teaching value | System dark mode already works |

---

## 2. The question bank format

### 2.1 Identity and versioning

Three versions coexist in this project and must not be confused:

- **App version**: semver in `package.json`, shown in the footer, stamped on every attempt.
- **Bank format version**: the integer `formatVersion` inside each bank. v1 readers reject a bank whose `formatVersion` they do not know.
- **Bank version**: the semver string a bank author gives their own bank, bumped when questions change.

A bank is identified by `id` plus `version`. Because authors forget to bump versions, the app additionally computes a **bank fingerprint**: SHA-256 of the exact bytes loaded, first 8 hex characters, stored on every attempt.

### 2.2 Example

```json
{
  "$schema": "https://<your-pages-url>/schema/bank-v1.schema.json",
  "formatVersion": 1,
  "id": "se.kth.mechanics.kinematics",
  "version": "1.0.0",
  "title": "Kinematics in one dimension",
  "description": "Constant acceleration, free fall, and reading motion graphs.",
  "author": "A. Teacher",
  "license": "CC-BY-4.0",
  "language": "en",
  "tags": ["mechanics", "kinematics"],
  "defaultQuestionCount": 10,
  "questions": [
    {
      "id": "free-fall-speed",
      "type": "single-choice",
      "prompt": "A ball is released from rest and falls freely for $1.00\\,\\mathrm{s}$. Taking $g = 9.81\\,\\mathrm{m/s^2}$ and ignoring air resistance, what is its speed?",
      "options": [
        { "id": "a", "text": "$4.91\\,\\mathrm{m/s}$", "why": "This is $\\tfrac{1}{2}gt$, the **average** speed over the fall, not the final speed." },
        { "id": "b", "text": "$9.81\\,\\mathrm{m/s}$" },
        { "id": "c", "text": "$19.6\\,\\mathrm{m/s}$", "why": "This is $2gt$. Check which factor the kinematic equation actually carries." },
        { "id": "d", "text": "$4.91\\,\\mathrm{m}$", "why": "That is a distance, not a speed. Check the units before choosing." }
      ],
      "answer": "b",
      "explanation": "From rest, $v = gt = 9.81 \\times 1.00 = 9.81\\,\\mathrm{m/s}$. The distance fallen in the same second is $\\tfrac{1}{2}gt^2 = 4.91\\,\\mathrm{m}$, which is why option (a) and option (d) look tempting.",
      "tags": ["free-fall"],
      "difficulty": "easy"
    }
  ]
}
```

### 2.3 Normative field reference

**Bank object**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `$schema` | string | no | Ignored by the app. Present so editors validate while authoring. |
| `formatVersion` | integer | **yes** | Must be `1`. |
| `id` | string | **yes** | 3 to 128 chars, `[a-z0-9]` plus `.`, `-`, `_`. Reverse-DNS style recommended. Stable across versions. |
| `version` | string | **yes** | Semver. Bump on any question change. |
| `title` | string | **yes** | 1 to 200 chars. Shown everywhere the bank appears. |
| `description` | string | no | Up to 2000 chars. Markdown and maths allowed. |
| `author` | string | no | Up to 200 chars. |
| `license` | string | no | SPDX identifier recommended, e.g. `CC-BY-4.0`. |
| `language` | string | no | BCP 47 tag, default `en`. Sets `lang` on rendered bank text. |
| `tags` | string[] | no | Up to 20. Recorded; unused in v1 UI. |
| `defaultQuestionCount` | integer | no | 1 or more. The start screen's default N. Clamped to the number of questions. |
| `questions` | Question[] | **yes** | 1 to 500 entries, unique `id`s. |

**Question object**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | **yes** | 1 to 128 chars, unique within the bank. Stable: attempt records reference it. |
| `type` | string | no | `"single-choice"`, the default and the only v1 value. |
| `prompt` | string | **yes** | 1 to 4000 chars. Markdown plus LaTeX. |
| `options` | Option[] | **yes** | 2 to 8 entries, unique `id`s. |
| `answer` | string | **yes** | Must equal the `id` of one option. |
| `explanation` | string | **yes** | 1 to 4000 chars. Required on purpose: an explanation-free bank is a scoreboard, not a lesson. |
| `tags` | string[] | no | Up to 20. Recorded; unused in v1 UI. |
| `difficulty` | string | no | `easy` \| `medium` \| `hard`. Recorded; unused in v1 UI. |

**Option object**

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | **yes** | 1 to 16 chars, unique within the question. `a`, `b`, `c`, `d` recommended. |
| `text` | string | **yes** | 1 to 1000 chars. Markdown plus LaTeX. |
| `why` | string | no | Up to 2000 chars. Shown in review only when this option was the one chosen and it was wrong. The highest-value optional field in the format. |

**Strictness.** Unknown keys are a validation error, not a warning. A typo like `explaination` must fail loudly at load time rather than silently produce a bank with no explanations.

### 2.4 Maths and Markdown

- Maths renders with **KaTeX**. `$...$` is inline, `$$...$$` is display.
- KaTeX has no `siunitx`. Write `9.81\,\mathrm{m/s^2}`, not `\SI{9.81}{m/s^2}`. `mhchem` is available.
- Text is **Markdown**, restricted to emphasis, code, lists, links and tables. It is parsed with `marked`, then sanitised with `DOMPurify`. Raw HTML in a bank is stripped. Banks come from URLs strangers control, so this is not optional.
- Maths is extracted before Markdown parsing and reinserted after sanitising, so Markdown cannot mangle a formula and a formula cannot smuggle HTML.

### 2.5 The backslash trap

JSON treats `\` as an escape character, and this quietly destroys LaTeX:

| Author writes | JSON actually produces |
| --- | --- |
| `"\times"` | a TAB character followed by `imes` |
| `"\frac"` | a form feed followed by `rac` |
| `"\nu"` | a newline followed by `u` |
| `"\alpha"` | a parse error (in strict parsers) |

In a `.json` bank **every backslash must be doubled**: `"$5 \\times 10^{3}$"`. The validator detects stray control characters inside strings and reports "this looks like an unescaped LaTeX command" with the field path, because the silent cases are the dangerous ones.

**Or write YAML instead.** The app accepts `.yaml` and `.yml` banks, validated against the identical schema. Single-quoted YAML scalars need no escaping at all:

```yaml
formatVersion: 1
id: se.kth.mechanics.kinematics
version: 1.0.0
title: Kinematics in one dimension
questions:
  - id: free-fall-speed
    prompt: 'A ball falls for $1.00\,\mathrm{s}$. What is its speed?'
    options:
      - { id: a, text: '$4.91\,\mathrm{m/s}$' }
      - { id: b, text: '$9.81\,\mathrm{m/s}$' }
    answer: b
    explanation: 'From rest, $v = gt$.'
```

JSON is the canonical, published format. YAML is an accepted input that means the same thing.

---

## 3. Loading banks

Two inputs, both on the library screen:

1. **Upload** a `.json`, `.yaml` or `.yml` file.
2. **Paste a URL** to such a file.

### 3.1 CORS

Fetching a URL from a static app only works when that server sends `Access-Control-Allow-Origin`. Raw GitHub, GitHub Pages, jsDelivr and most CDNs do. Many university web servers and Google Drive share links do not, and the browser reports a generic network failure.

When a fetch fails in a way consistent with CORS, the app must say so specifically:

> Could not load that URL. The server may not allow cross-origin requests. Try a raw GitHub or GitHub Pages link, or download the file and use Upload.

Generic "network error" is a bug, not an acceptable message.

### 3.2 Storage and re-fetching

A loaded bank is stored in IndexedDB keyed by `id` and `version`, with its fingerprint, source (upload or URL), and the time it was added. It stays available offline until deleted. Loading a bank whose `id` and `version` already exist:

- **same fingerprint**: no change, the app says "already in your library".
- **different fingerprint**: the app warns that the bank changed without a version bump, and asks whether to replace. Existing attempts keep the old fingerprint and get badged on the leaderboard.

### 3.3 Validation failures

A bank that fails validation is never partially loaded. The error screen lists up to 20 errors, each with the JSON path (`questions[7].answer`) and a human sentence ("answer 'e' does not match any option id; options are a, b, c, d"). The same view is reachable directly as the **Validate a bank** screen, so a teacher can check a file without starting a quiz and without installing anything.

---

## 4. Taking a quiz

### 4.1 Start

The start screen asks for a **name** (pre-filled with the last name used in this browser, stored in IndexedDB) and a **question count**: 5, 10, 20 or All, defaulting to the bank's `defaultQuestionCount` or 10, clamped to the bank size with a note when clamped.

Identity is the name string and nothing else. The app trims and collapses whitespace, and does not case-fold or fuzzy-match. "anna" and "Anna" are two participants; silently merging two real students would be worse.

### 4.2 The run

- Exam mode only. No feedback of any kind until submission.
- One question per screen, with progress ("4 of 10") and free navigation back and forth.
- Options are native radio inputs in a fieldset legended by the prompt, so keyboard and screen reader support come from the platform. Number keys 1 to 9 select options.
- Question order and option order are both shuffled from a recorded 32-bit **seed**, so any attempt can be reconstructed exactly. Selection is a seeded Fisher-Yates shuffle, then take N.
- Every answer is written to IndexedDB immediately. Reopening the app with an unsubmitted attempt offers "You have a quiz in progress on X, 6 of 10 answered. Resume or discard?". At most one attempt is in progress at a time.
- Leaving mid-attempt asks for confirmation. Unanswered questions are allowed; submission warns how many are blank.

### 4.3 Review

Shown immediately after submission and reachable later from history whenever the bank is still in the library.

- Opens with an animated score ring and one line of encouragement keyed to the score band.
- Then every question in attempt order: the prompt, every option marked correct / chosen / both / neither, the author's `explanation`, and, when the participant chose a wrong option that has a `why`, that option's `why`.
- Unanswered questions are shown as "not answered", visually distinct from a wrong answer, and scored as wrong.
- A **Share result** button produces a share link.

When the bank is no longer in the library, review degrades to the score summary plus "import the bank to see the questions".

### 4.4 Scoring

`correctCount` and `questionCount` are stored; the percentage is always derived, never stored. One point per question, no partial credit, no negative marking.

---

## 5. The attempt record

The unit of history, export, share and any future sync.

```ts
type Attempt = {
  id: string;                 // UUIDv7, time-sortable
  code: string;               // e.g. "7KQ-3M2", derived from id, display only
  name: string;               // trimmed, whitespace-collapsed
  bankId: string;
  bankVersion: string;
  bankFingerprint: string;    // first 8 hex of SHA-256 of the bank bytes
  bankTitle: string;          // snapshotted so history reads sensibly without the bank
  startedAt: string;          // ISO 8601
  submittedAt: string;        // ISO 8601
  durationMs: number;
  seed: number;               // 32-bit, reproduces the exact selection and option order
  questionCount: number;
  correctCount: number;
  answers: Array<{
    questionId: string;
    chosenOptionId: string | null;   // null means unanswered
    correctOptionId: string;
  }>;
  appVersion: string;
  origin: "local" | "imported";
};
```

**Lean by design.** The record references question ids and does not snapshot question text. A teacher collecting results has the bank by definition, and a class of 30 exports as tens of KB rather than megabytes.

**Attempt Code.** The first 35 bits of the UUID rendered in Crockford base32 as 7 characters grouped `XXX-XXXX`. Display only: deduplication always uses the full `id`.

---

## 6. History, export and import

### 6.1 History

All attempts in this browser, newest first, filterable by name and by bank. Each row shows date, name, bank title, score, duration, attempt code, and an **unverified** badge when `origin` is `imported`.

### 6.2 Export

```json
{
  "format": "physics-quiz-history",
  "formatVersion": 1,
  "exportedAt": "2026-09-23T10:15:00.000Z",
  "appVersion": "1.0.0",
  "attempts": [ /* Attempt records */ ]
}
```

Exports everything, or the current filter. Downloads as `physics-quiz-history-YYYY-MM-DD.json`.

### 6.3 Import

Import is **additive and idempotent**:

- Validate the envelope and every attempt; reject the file if the envelope is unknown, skip individual attempts that fail.
- Deduplicate by attempt `id`. On collision, **keep the existing record** and count it as a duplicate.
- Mark every newly imported attempt `origin: "imported"`.
- Report back: "Imported 27, skipped 3 duplicates, rejected 1 invalid", with the rejection reasons available.

Importing the same file twice changes nothing the second time. This is an acceptance test, not an aspiration.

### 6.4 Share links

`https://<host>/<path>#share=<payload>` where payload is base64url of deflate-raw of the attempt JSON, produced with the platform's `CompressionStream` (plain base64 where unavailable). Roughly 300 to 600 characters for a 10-question attempt.

The payload is in the **fragment**, which browsers never send to a server, so sharing stays local even on Vercel.

On open, the app decodes, validates, and **recomputes** `correctCount` from the answer list against its own copy of the bank rather than trusting the number in the link. Mismatch is shown, not hidden. Without the bank, the attempt imports with the claimed score and a clear "cannot verify" note.

### 6.5 This is not exam-proof

A student can edit their own IndexedDB or hand-craft a share link. No client-side signature fixes this, because the key would ship in the bundle. Imported and shared attempts are therefore badged **unverified** everywhere they appear, and the teacher documentation says this plainly. Use the app for practice, formative assessment and classroom competition, not for grading.

---

## 7. Leaderboard

One bank at a time. Never across banks: 90% on a 5-question warm-up is not comparable to 70% on a 20-question exam.

Ranking: score percentage descending, ties broken by shorter `durationMs`, then by earlier `submittedAt`.

A toggle switches between **best attempt per name** (default) and **every attempt**. Attempts whose `bankFingerprint` differs from the copy of the bank currently in the library are badged, not hidden.

---

## 8. Application shape

### 8.1 Screens

Library (home) | Start | Attempt | Review | History | Leaderboard | Validate a bank | Import share link

No router. One `useReducer` state machine holds `screen` plus its data; the in-progress attempt is persisted to IndexedDB on every change, which is what makes both resume and `base: './'` deployment work. The only URL the app reads is the `#share=` fragment on boot.

### 8.2 Modules

```
src/
  domain/      bank.ts  selection.ts  scoring.ts  attempt.ts  share.ts  history-file.ts
  storage/     db.ts                      # Dexie: banks, attempts, inProgress, settings
  render/      markdown.ts                # marked + DOMPurify + KaTeX
  app/         state.ts  App.tsx
  ui/          one component per screen, plus shared primitives
public/
  schema/bank-v1.schema.json              # generated from the Zod types at build time
```

`domain/` is pure TypeScript: no React, no IndexedDB, no DOM. That is where every unit test points.

### 8.3 Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite, `base: './'` | Static output that works at a domain root or any subpath |
| UI | React 19, TypeScript strict | As specified |
| PWA | `vite-plugin-pwa` (Workbox), prompt mode | Hand-written service workers are the code you asked to avoid |
| Validation | Zod, JSON Schema generated from it | Schema and runtime validator cannot drift |
| Storage | Dexie | IndexedDB without the ceremony |
| Maths | KaTeX | Synchronous, offline, small, sufficient |
| Text | marked + DOMPurify | Untrusted remote content must be sanitised |
| YAML | `yaml` | Removes the backslash trap for hand authors |
| Styling | Plain CSS, custom properties | Small surface, no framework |
| Tests | Vitest, Playwright | Unit on `domain/`, one end-to-end smoke |
| Package manager | pnpm | As specified |

### 8.4 PWA behaviour

- Update in **prompt** mode: a toast offers reload when a new service worker is waiting, and **never while an attempt is in progress**.
- Precache the app shell and KaTeX fonts. Banks live in IndexedDB, not the service worker cache: they are data, not assets.
- Custom Install button on the library screen when `beforeinstallprompt` fires, with a short iOS Safari instruction line since iOS never fires it.
- Fully functional offline after first load.

### 8.5 Accessibility and presentation

- Options are native radios in a fieldset. Arrow keys, space, focus order and screen reader semantics come from the platform.
- Number keys 1 to 9 select options. 44px minimum touch targets. WCAG AA contrast. `prefers-reduced-motion` respected by the score ring.
- Mobile-first single column, capped near 640px, system font stack.
- Dark mode from `prefers-color-scheme`. No toggle.
- English UI with inline strings. Bank text is wrapped in the bank's `language` tag so screen readers pronounce non-English banks correctly.

---

## 9. Acceptance criteria for v1.0.0

1. Load a bank by upload, by URL, and reject an invalid one with field-level errors naming the JSON path.
2. A loaded bank survives a full offline reload and is still takeable with the network off.
3. Start an attempt, answer N questions, submit, and see review with explanations and distractor `why` text.
4. Refresh mid-attempt and resume at the same question with previous answers intact.
5. History shows the attempt; export produces a file; importing that file twice changes nothing the second time.
6. A share link opened in another browser imports, and the score is recomputed rather than trusted.
7. The leaderboard ranks correctly and badges a fingerprint mismatch.
8. Lighthouse PWA install criteria pass; the app installs on Android and iOS.
9. Every file in `examples/` validates in CI.

Anything not on this list is v1.1.

---

## 10. Documentation deliverables

| File | Audience | Content |
| --- | --- | --- |
| `README.md` | everyone | What it is, screenshot, quickstart, links |
| `docs/bank-format.md` | teachers | Normative spec, examples, the backslash warning, YAML alternative, validator error FAQ |
| `docs/authoring-with-ai.md` | teachers | A copy-pasteable prompt that makes Claude emit a valid bank, plus how to write good distractors and explanations |
| `docs/deploy.md` | operators | GitHub Pages first, then Vercel, Netlify, S3 plus CloudFront |
| `docs/development.md` | contributors | Setup, scripts, test layout, release process |
| `CONTEXT.md` | everyone | Glossary |
| `docs/adr/` | contributors | Decisions worth explaining |
| `CHANGELOG.md` | everyone | Keep a Changelog format |
| `examples/` | teachers | Two or three real physics banks, also used as CI fixtures |

---

## 11. Versioning and release

- **App**: semver in `package.json`. `pnpm version minor`, a `CHANGELOG.md` entry, a git tag. No Changesets: ceremony this project would resent.
- **Bank format**: integer `formatVersion` inside the bank. v1 readers reject unknown values with a message naming the app version needed.
- **Export envelope**: integer `formatVersion`, bumped only on breaking changes.
- The app version appears in the footer and on every attempt record.

### Deployment

Primary target **GitHub Pages**, via an Actions workflow on tag push. Because `base: './'` makes every asset path relative, the same artefact also works on Vercel, Netlify, S3 or any subpath with no rebuild.

The one sharp edge to verify during implementation: a service worker on a GitHub Pages **project** site is scoped to `/<repo>/`. The manifest must use relative `start_url: "."` and `scope: "./"`, and offline behaviour must be tested on the deployed Pages URL, not only on `localhost`.
