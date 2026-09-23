# 11: Installable and offline

**What to build:** A student installs the app to their home screen, goes offline, opens it, and takes a quiz on a bank they loaded earlier. Updates are offered rather than applied behind their back.

**Blocked by:** 03, 05

**Status:** ready-for-agent

- [ ] A web manifest with relative start url and scope, plus icons including a maskable one
- [ ] The app shell and maths fonts are precached; banks stay in IndexedDB because they are data, not assets
- [ ] With the network off, the app opens and a previously loaded bank is fully takeable
- [ ] A waiting update shows a reload prompt rather than swapping the bundle silently
- [ ] The update prompt never appears while an attempt is in progress
- [ ] An install button appears when the browser offers installation, with a short instruction line for iOS Safari which never does
- [ ] Offline behaviour is verified on the deployed Pages URL, not only on localhost
