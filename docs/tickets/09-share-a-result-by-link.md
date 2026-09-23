# 09: Share a result by link

**What to build:** After finishing a quiz, a participant taps Share and gets a link they can paste into a chat. Whoever opens it sees the attempt and can add it to their own history.

The receiving app recomputes the score from the answers against its own copy of the bank rather than believing the number in the link. The attempt travels in the URL fragment, which browsers never send to a server, so sharing stays local even when the app is hosted somewhere that has servers.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] A Share button in review produces a link and copies it to the clipboard
- [ ] Opening that link in another browser decodes the attempt and shows a confirmation before storing anything
- [ ] The score is recomputed from the answers against the local copy of the bank, and a mismatch with the claimed score is shown rather than hidden
- [ ] Without the bank, the attempt still imports, with the claimed score and a clear note that it could not be verified
- [ ] The fragment is cleared from the address bar after handling, so a reload does not re-import
- [ ] Encoding falls back gracefully where the platform compression API is unavailable
- [ ] A round-trip test proves encode then decode is lossless
