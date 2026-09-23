# Local-first with share links, and no backend

The requirements asked for both a leaderboard and a statically hosted, local-first app. A real cross-device leaderboard needs a server, an anti-spoofing story and somewhere to keep student names, so we chose to keep all state in the browser (IndexedDB via Dexie) and to move results between devices two ways instead: an additive export/import file, and a share link that carries one attempt in its URL fragment, which browsers never transmit to a server.

The cost is honest and documented: a student can edit their own IndexedDB or hand-craft a share link, and no client-side signature fixes that because the key would ship in the bundle. Imported attempts are therefore badged unverified in the UI, and the teacher documentation states plainly that the app is for practice and formative assessment, not grading.

The attempt record was deliberately designed in a shape a future backend could accept unchanged (a UUIDv7 primary key, a self-contained answer list, a recorded seed, no client-only fields). If a backend ever arrives, the open problem it must solve is identity: v1 identifies a participant by the typed name alone, so attempts would need a migration to attach real accounts.

## Considered options

- **Backend from the start** (Supabase, Cloudflare D1, a Vercel function): gives a true shared leaderboard, but ends static hosting, adds cost, auth and data-protection obligations for what is currently a classroom tool.
- **Device-local only, no sharing at all**: simpler still, but a teacher collecting a class's results was an explicit requirement.
