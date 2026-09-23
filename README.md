# Physics Quiz

A local-first progressive web app for multiple-choice physics quizzes.

**Live: <https://sortigoza.github.io/phy-quiz-app/>**

> **Status: early.** Ticket 01 of 14 is done. What is deployed today is a walking
> skeleton: the build, tests and deployment work end to end, and the app shell
> renders its version. It cannot load a question bank or run a quiz yet.
> Follow along in [docs/tickets](./docs/tickets/README.md).

## The idea

A teacher, or an AI assistant, writes a **question bank** as a single portable
file. A student loads it by upload or by URL, types a name, answers a random
selection of questions, and gets a review with the correct answers and the
author's explanations. Results stay in the browser, rank on a per-bank
leaderboard, and move between devices as an export file or a share link.

There is no server. The build is static files, and after the first load nothing
needs the network.

## Documents

| Document | What it is |
| --- | --- |
| [SPEC.md](./SPEC.md) | The specification: bank format, quiz flow, attempt record, export and import, acceptance criteria |
| [PLAN.md](./PLAN.md) | Architecture narrative: module layout, stack rationale, risks |
| [CONTEXT.md](./CONTEXT.md) | Glossary. Every term this project uses, and the ones it avoids |
| [docs/tickets](./docs/tickets/README.md) | The fourteen vertical slices, with their dependency graph and status |
| [docs/adr](./docs/adr) | Decisions worth explaining later |

Teacher-facing guides to writing question banks arrive with ticket 13.

## Development

Requires Node 20 or later and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev          # development server
pnpm test         # unit tests
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm format       # prettier, code only: prose is hand-formatted
pnpm build        # production build into dist/
pnpm preview      # serve the production build locally
```

The build uses a relative base, so `dist/` works unchanged at a domain root, on
a GitHub Pages project subpath, or behind any static host.

TypeScript is pinned to 6.x: no stable `typescript-eslint` supports TypeScript 7
yet, and type-aware linting is worth more here than the newest compiler.

## Deployment

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). The repository
must have Pages enabled with **GitHub Actions** as the source.

Recipes for Vercel, Netlify and S3 arrive with ticket 13. The same `dist/` works
on all of them with no rebuild.

## Licence

MIT.
