# 04: Maths and Markdown rendering

**What to build:** Question prompts, options, explanations and bank descriptions render properly: inline and display maths, plus a restricted set of Markdown. A bank that arrived from a stranger's URL cannot inject anything into the page.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] Inline and display maths render throughout the quiz and review screens
- [x] Emphasis, code, lists, links and tables render; raw HTML in a bank does not
- [x] Maths is protected from the Markdown parser, and sanitising happens before maths is reinserted
- [x] A malformed formula renders as visibly marked raw source rather than blanking the question or crashing the screen
- [x] Bank text carries the bank's declared language so screen readers pronounce non-English banks correctly
- [x] A test fixture containing a formula, a Markdown table and an attempted script injection renders correctly and safely
