# 05: Load a bank from a URL

**What to build:** Someone pastes a link to a bank file and it loads into their library exactly as an uploaded file would. When the link cannot work, the app explains why in terms the person can act on.

The failure path matters more than the happy path here. A static app fetching a third-party URL fails on cross-origin restrictions all the time, and the browser reports it as a generic network error. Saying "that server may not allow cross-origin requests, try a raw GitHub link or download the file and upload it" is the whole point of the ticket.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A bank at a cross-origin-friendly URL loads, stores and appears in the library
- [ ] A cross-origin failure produces a specific, actionable message naming the likely cause and the two workarounds
- [ ] Other failures (not found, not a bank, invalid bank) each produce their own distinguishable message
- [ ] Loading a bank whose id and version are already present, but whose fingerprint differs, warns that the bank changed without a version bump and asks whether to replace it
- [ ] Loading a byte-identical bank that is already present reports that, and changes nothing
