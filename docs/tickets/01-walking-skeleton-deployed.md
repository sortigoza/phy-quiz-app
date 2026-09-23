# 01: Walking skeleton, deployed

**What to build:** A visitor can open a public URL and see the Physics Quiz app shell with its version number in the footer. Nothing else works yet, but the whole pipeline from source to a live page exists, and every later ticket lands on top of it.

Deploying on the first ticket rather than the last is deliberate. The GitHub Pages project subpath is what later breaks service worker scope, and finding that out in ticket 11 is much cheaper than finding it out the week of release.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Repository initialised with pnpm, Vite, React and TypeScript in strict mode
- [ ] Vite builds with a relative base, so the same artefact works at a domain root or any subpath
- [ ] Scripts exist for dev, build, preview, typecheck, lint, format and test
- [ ] CI runs typecheck, lint, unit tests and the production build on every push
- [ ] A GitHub Pages workflow publishes the build, and the app is reachable at its Pages URL
- [ ] The app version comes from the package manifest and is visible in the footer
