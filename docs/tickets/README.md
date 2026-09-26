# Tickets

Vertical slices for Physics Quiz v1.0.0. Each ticket cuts a narrow but complete path through the whole app and is demoable on its own. Source documents: [SPEC.md](../../SPEC.md), [PLAN.md](../../PLAN.md), [CONTEXT.md](../../CONTEXT.md).

Tracking is local and in git: tick the checkboxes in a ticket as you go, and commit. A ticket is done when every box is ticked and CI is green.

## Order and dependencies

```
01 walking skeleton, deployed
└── 02 load a bank by upload
    ├── 03 take a quiz end to end
    │   ├── 03a in-app help and llms.txt
    │   ├── 04 maths and Markdown rendering
    │   ├── 07 resume an interrupted attempt
    │   ├── 07a alpha hardening
    │   ├── 08 history, export and import
    │   │   ├── 09 share a result by link  (v1.1)
    │   │   └── 16 review from history
    │   │       ├── 18 tag filter and tag breakdown  (uses 17)
    │   │       ├── 19 answer-first mode  (uses 17)
    │   │       └── 20 copy review as Markdown  (uses 17, 19)
    │   ├── 10 leaderboard  (v1.1)
    │   ├── 15 music on the library
    │   ├── 17 confidence per answer
    │   └── 11 installable and offline  (also needs 05)
    ├── 05 load a bank from a URL
    │   ├── 05a bank repositories
    │   └── 06a private banks by link  (v1.1)
    │       └── 06b private bank repositories  (v1.1, also needs 05a)
    └── 06 author ergonomics
12 presentation and accessibility   needs 04
13 documentation and examples       needs 06
14 release v1.0.0                   needs 07, 11, 12, 13, 16 to 20
```

The graph is wide on purpose. After 02, tickets 03, 05 and 06 can run in parallel; after 03, so can 04, 07, 08, 10 and 11.

06a and 06b are v1.1 work. Nothing in v1.0.0 waits for them, and ticket 14 does not depend on them.

16 to 20 are learning features added to v1.0.0: seeing a past review, confidence, tags, answer-first mode and a pasteable review. To make room, 09 share links and 10 leaderboard, which serve classroom competition more than learning, moved to v1.1. 17 can start at once, and 16 unblocks the other three.

## Status

| # | Ticket | Blocked by | Done |
| --- | --- | --- | --- |
| 01 | Walking skeleton, deployed | none | [x] |
| 02 | Load a bank by upload | 01 | [x] |
| 03 | Take a quiz end to end | 02 | [x] |
| 03a | In-app help and llms.txt | 03 | [x] |
| 04 | Maths and Markdown rendering | 03 | [x] |
| 05 | Load a bank from a URL | 02 | [x] |
| 05a | Bank repositories | 05 | [x] |
| 06 | Author ergonomics | 02 | [x] |
| 06a | Private banks by link (v1.1) | 05 | [x] |
| 06b | Private bank repositories (v1.1) | 05a, 06a | [x] |
| 07 | Resume an interrupted attempt | 03 | [x] |
| 07a | Alpha hardening | 03 | [x] |
| 08 | History, export and import | 03 | [x] |
| 09 | Share a result by link (v1.1) | 08 | [ ] |
| 10 | Leaderboard (v1.1) | 03 | [ ] |
| 11 | Installable and offline | 03, 05 | [ ] |
| 12 | Presentation and accessibility | 04 | [ ] |
| 13 | Documentation and examples | 06 | [ ] |
| 14 | Release v1.0.0 | 07, 11, 12, 13, 16 to 20 | [ ] |
| 15 | Music on the library | 03 | [x] |
| 16 | Review from history | 08 | [x] |
| 17 | Confidence per answer | 03 | [x] |
| 18 | Tag filter and tag breakdown | 08, 16 | [x] |
| 19 | Answer-first mode | 16 | [x] |
| 20 | Copy review as Markdown | 16 | [x] |

Live at <https://sortigoza.github.io/phy-quiz-app/>.
