# 01: Walking skeleton, deployed

**What to build:** A visitor can open a public URL and see the Physics Quiz app shell with its version number in the footer. Nothing else works yet, but the whole pipeline from source to a live page exists, and every later ticket lands on top of it.

Deploying on the first ticket rather than the last is deliberate. The GitHub Pages project subpath is what later breaks service worker scope, and finding that out in ticket 11 is much cheaper than finding it out the week of release.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [x] Repository initialised with pnpm, Vite, React and TypeScript in strict mode
- [x] Vite builds with a relative base, so the same artefact works at a domain root or any subpath
- [x] Scripts exist for dev, build, preview, typecheck, lint, format and test
- [x] CI runs typecheck, lint, format check, unit tests and the production build on every push and every pull request
- [x] A GitHub Pages workflow publishes the build, and the app is reachable at its Pages URL
- [x] The app version comes from the package manifest and is visible in the footer

## Notes

Verified locally: typecheck, lint, format check, unit tests and the production
build all pass, and the build was served from a `/phy_quiz_app/` subpath with a
static file server to confirm that relative asset paths resolve the way they
will on a GitHub Pages project site.

Live at <https://sortigoza.github.io/phy-quiz-app/>, with both the script and
stylesheet resolving from the project subpath. CI is green.

The first deploy run failed because Pages had not been enabled on the
repository yet; enabling it with "GitHub Actions" as the source and re-running
the workflow fixed it. That is a one-time repository setting, not a code
problem.

TypeScript is pinned to 6.0.3 rather than the current 7.0.2, because no stable
release of typescript-eslint supports TypeScript 7 yet. Revisit when one ships.

A code review after the fact found that the deploy workflow published without
running lint or tests, in parallel with CI rather than after it, so a commit
that broke the tests could reach the live URL while CI went red. Deploy now
re-verifies before publishing. CI also lost its branch filter, so pushes to
any branch are checked.
