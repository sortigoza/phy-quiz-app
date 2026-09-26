# 12: Presentation and accessibility pass

**What to build:** The app looks and feels finished on a phone, works in dark mode, and is fully usable with a keyboard or a screen reader.

This lands after the screens exist so it polishes finished work rather than a moving target.

**Blocked by:** 04. The leaderboard (10) moved to v1.1 and gets its own pass when it lands.

**Status:** ready-for-agent

- [ ] Mobile-first single column with a sensible maximum width, tested at phone and tablet sizes
- [ ] The retro terminal palette (phosphor green on near-black, neon pink and cyan accents) holds AA contrast everywhere. It is deliberately dark only: there is no light theme and no toggle
- [ ] Touch targets of at least 44 pixels and text contrast meeting WCAG AA
- [ ] Visible focus indicators on every interactive element, and a sensible focus order through the quiz
- [x] Number keys select options during an attempt (done with ticket 19)
- [ ] The review screen opens with a score ring and one line of encouragement keyed to the score band
- [ ] Animation is suppressed when the system asks for reduced motion
- [ ] A keyboard-only pass and a screen reader pass over the full quiz flow both succeed
