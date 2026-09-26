# 06: Author ergonomics: YAML, the backslash detector, and the validate screen

**What to build:** A teacher writing a bank can check it without installing anything: they drop the file onto a validate screen and get errors that name the exact field and say what to do. They can also write the bank in YAML if they would rather not fight JSON escaping.

The backslash detector is the reason this ticket exists. In JSON, a LaTeX command written with a single backslash does not fail loudly: it silently becomes a control character. Every physics bank contains such commands, so the validator must recognise the wreckage and name the cause.

**Blocked by:** 02

**Status:** ready-for-agent

- [x] A validate screen accepts a file, reports success or a list of errors, and never stores the bank
- [x] Each error names the path to the offending field and explains the problem in a sentence a teacher can act on
- [x] Stray control characters inside strings are reported as a probable unescaped LaTeX command, naming the field
- [x] YAML banks parse and validate through the identical schema as JSON banks
- [x] A test proves the same bank written as YAML and as JSON produces identical results
- [x] The error list is capped at a readable length rather than dumping hundreds of lines

## Notes

Three things decided while building it:

- JSON and YAML are told apart by content, not by file name: text JSON can
  read is JSON, text that starts with `{` or `[` but does not parse gets JSON's
  error, and anything else is read as YAML. A stored bank keeps the exact text
  it was loaded from, and is parsed again from that text with no file name at
  hand, so the content has to be enough.
- A tab, form feed, backspace, carriage return or any other control character
  in a string is always reported. A line break is legitimate Markdown, so it
  is reported only when the rest of a LaTeX command follows it (`\nabla`,
  `\neq`, `\nu_0`, `\ne b`), not when a line merely starts with "u" or "e.g.".
  A backslash JSON cannot read at all, as in `"\alpha"`, is a parse error, and
  the parse error now names the command and gives the same advice.
- Zod's own wording is replaced by an error map passed to `safeParse`, so the
  messages a schema already gives (the semver rule, the answer rule) are kept.
  An unknown key becomes one issue per key at the key's own path, suggesting
  the field it most resembles.

The validate screen also checks bank repositories, and opens a private file
only with a key this browser already holds. The list shows the first 20
problems and says how many more there are; `parseBank` itself still returns
them all.

