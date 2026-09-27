# 13: Documentation and example banks

**What to build:** Everything a teacher needs to write a bank without reading the source, and everything an operator needs to deploy the app somewhere else. Plus real example banks that double as test fixtures.

The published schema is generated from the same definitions the app validates with, so the documentation cannot drift from the behaviour.

**Blocked by:** 06. Share links (09) moved to v1.1; document them when they land.

**Status:** done

- [x] A JSON Schema is generated at build time from the app's own validation rules and served by the deployed app at a stable path
- [x] A bank declaring that schema gets autocomplete and inline errors in a normal editor
- [x] A teacher-facing format guide documents every field, with a minimal example, a full example, the escaping warning, the YAML alternative, and an FAQ of the errors the validator actually emits
- [x] An AI authoring guide contains a copy-pasteable prompt that produces a valid bank, plus guidance on writing good distractors and explanations
- [x] A deployment guide covers GitHub Pages first, then Vercel, Netlify and S3
- [x] A development guide covers setup, scripts, test layout and the release process
- [x] The README explains what the app is, with a screenshot and a quickstart
- [x] Three example banks of around ten questions each, at least one in YAML, with real explanations and real distractor notes
- [x] CI validates every example bank

## Notes

What was built, and what was decided along the way.

### Where things are

- `src/docs/bank-json-schema.ts`: the JSON Schema, generated with `z.toJSONSchema` from `bankSchema`, with each field's rules from `bank-reference.ts` as its description. `vite.config.ts` serves it at `schema/bank-v1.schema.json`, beside `llms.txt`, and now publishes every file in `examples/` rather than a hard-coded list.
- `docs/bank-format.md`, `docs/authoring-with-ai.md`, `docs/deploy.md`, `docs/development.md`, and a rewritten `README.md` with screenshots in `docs/images/`.
- `examples/`: kinematics grew from five questions to ten (v1.1.0); `dc-circuits.json` and `energy-and-momentum.yaml` are new. Every example declares the schema, so its bytes changed; advanced quantum mechanics went to v1.0.1 for that alone.
- `scripts/validate-banks.ts`, run as `pnpm validate-banks <files or folders>`, and by CI on `examples/`.
- Help gives the schema address to put in a bank.

### Decisions

- **The schema is draft 7 and has no `$id`.** Draft 7 is what VS Code and JetBrains understand best. The build uses a relative base and does not know the address it will be deployed at, so the schema does not claim one; editors find it by the bank's `$schema`.
- **Checked the way an editor checks.** The tests compile the schema with Ajv and validate the examples with it. By hand, VS Code's own JSON language service (`vscode-json-languageservice`) was pointed at the served schema: it completes field names, shows the rules on hover, and flags unknown fields, bad patterns and short lists. What a schema cannot say (an answer naming no option, duplicate ids, a lost backslash) stays the app's job, and the guide says so.
- **The guides are held to the code.** `src/docs/guides.test.ts` checks that `bank-format.md` documents every field, that every JSON and YAML example in the guides is one the app accepts, and that every error the FAQ quotes is one the validator really emits for a matching broken bank.
- **`validate-banks` rather than a test-only check.** CI could have relied on `examples.test.ts`, but a teacher with a repository of banks wants the same check, so it is a CLI with its own tests, which CI runs. It also checks a repository's relative entries exist on disk, and skips private banks, which are ciphertext.
- **YAML examples are out of Prettier's reach.** Prettier rewrites single-quoted strings holding an apostrophe into double quotes, which is where YAML's own backslash escapes live. The YAML examples teach single quotes throughout, so `.prettierignore` excludes them.
- **The quantum mechanics bank stays at 25 questions.** The ticket asks for three banks of around ten; kinematics, DC circuits and energy and momentum are those. The longer bank is a fourth.
- **The private-bank teacher guide** that 06a left for this ticket is a section of `bank-format.md`.

### Left open

- The AI prompt has not been run against an assistant in CI. It restates every field and rule, and a test checks it names every field, but whether a given model follows it is only checkable by trying.
- Share links (09) are v1.1 and undocumented until they land.
- `CHANGELOG.md` does not exist yet; `development.md` describes the release process ticket 14 will follow.
