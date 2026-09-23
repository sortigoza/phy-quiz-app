# 13: Documentation and example banks

**What to build:** Everything a teacher needs to write a bank without reading the source, and everything an operator needs to deploy the app somewhere else. Plus real example banks that double as test fixtures.

The published schema is generated from the same definitions the app validates with, so the documentation cannot drift from the behaviour.

**Blocked by:** 06, 09

**Status:** ready-for-agent

- [ ] A JSON Schema is generated at build time from the app's own validation rules and served by the deployed app at a stable path
- [ ] A bank declaring that schema gets autocomplete and inline errors in a normal editor
- [ ] A teacher-facing format guide documents every field, with a minimal example, a full example, the escaping warning, the YAML alternative, and an FAQ of the errors the validator actually emits
- [ ] An AI authoring guide contains a copy-pasteable prompt that produces a valid bank, plus guidance on writing good distractors and explanations
- [ ] A deployment guide covers GitHub Pages first, then Vercel, Netlify and S3
- [ ] A development guide covers setup, scripts, test layout and the release process
- [ ] The README explains what the app is, with a screenshot and a quickstart
- [ ] Three example banks of around ten questions each, at least one in YAML, with real explanations and real distractor notes
- [ ] CI validates every example bank
