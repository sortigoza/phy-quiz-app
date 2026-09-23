# 06: Author ergonomics: YAML, the backslash detector, and the validate screen

**What to build:** A teacher writing a bank can check it without installing anything: they drop the file onto a validate screen and get errors that name the exact field and say what to do. They can also write the bank in YAML if they would rather not fight JSON escaping.

The backslash detector is the reason this ticket exists. In JSON, a LaTeX command written with a single backslash does not fail loudly: it silently becomes a control character. Every physics bank contains such commands, so the validator must recognise the wreckage and name the cause.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A validate screen accepts a file, reports success or a list of errors, and never stores the bank
- [ ] Each error names the path to the offending field and explains the problem in a sentence a teacher can act on
- [ ] Stray control characters inside strings are reported as a probable unescaped LaTeX command, naming the field
- [ ] YAML banks parse and validate through the identical schema as JSON banks
- [ ] A test proves the same bank written as YAML and as JSON produces identical results
- [ ] The error list is capped at a readable length rather than dumping hundreds of lines
