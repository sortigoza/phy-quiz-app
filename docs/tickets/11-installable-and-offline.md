# 11: Installable and offline

**What to build:** A student installs the app to their home screen, goes offline, opens it, and takes a quiz on a bank they loaded earlier. Updates are offered rather than applied behind their back.

**Blocked by:** 03, 05

**Status:** in-review: the last box can only be ticked once the branch is on `main` and deployed

- [x] A web manifest with relative start url and scope, plus icons including a maskable one
- [x] The app shell and maths fonts are precached; banks stay in IndexedDB because they are data, not assets
- [x] With the network off, the app opens and a previously loaded bank is fully takeable
- [x] A waiting update shows a reload prompt rather than swapping the bundle silently
- [x] The update prompt never appears while an attempt is in progress
- [x] An install button appears when the browser offers installation, only support Firefox and Chrome.
- [ ] Offline behaviour is verified on the deployed Pages URL, not only on localhost

## Notes for the implementer

- Icons are drawn in `public/icon.svg` and generated into `public/` by `pnpm pwa-assets`; the output is committed.
- Only Chromium fires `beforeinstallprompt`, so the Install button appears in Chrome and Edge. Firefox installs from its own menu (Android) and never fires the event, so it gets no button. iOS Safari gets no button or instruction line.
- The precache holds the shell, icons, KaTeX woff2 fonts and the library music. The example banks and `llms.txt` stay out: banks are data.
- Verified locally in Chromium with the build served at a `/phy-quiz-app/` subpath: service worker scope, offline reload with a stored bank, a full attempt offline with KaTeX fonts, no update offer mid-attempt, the offer after submit, and Reload activating the waiting worker.
