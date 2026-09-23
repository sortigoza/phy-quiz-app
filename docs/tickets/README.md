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
    │   │   └── 09 share a result by link
    │   ├── 10 leaderboard
    │   └── 11 installable and offline  (also needs 05)
    ├── 05 load a bank from a URL
    └── 06 author ergonomics
12 presentation and accessibility   needs 04, 10
13 documentation and examples       needs 06, 09
14 release v1.0.0                   needs 07, 11, 12, 13
```

The graph is wide on purpose. After 02, tickets 03, 05 and 06 can run in parallel; after 03, so can 04, 07, 08, 10 and 11.

## Status

| # | Ticket | Blocked by | Done |
| --- | --- | --- | --- |
| 01 | Walking skeleton, deployed | none | [x] |
| 02 | Load a bank by upload | 01 | [x] |
| 03 | Take a quiz end to end | 02 | [x] |
| 03a | In-app help and llms.txt | 03 | [x] |
| 04 | Maths and Markdown rendering | 03 | [x] |
| 05 | Load a bank from a URL | 02 | [x] |
| 06 | Author ergonomics | 02 | [ ] |
| 07 | Resume an interrupted attempt | 03 | [ ] |
| 07a | Alpha hardening | 03 | [ ] |
| 08 | History, export and import | 03 | [ ] |
| 09 | Share a result by link | 08 | [ ] |
| 10 | Leaderboard | 03 | [ ] |
| 11 | Installable and offline | 03, 05 | [ ] |
| 12 | Presentation and accessibility | 04, 10 | [ ] |
| 13 | Documentation and examples | 06, 09 | [ ] |
| 14 | Release v1.0.0 | 07, 11, 12, 13 | [ ] |

Live at <https://sortigoza.github.io/phy-quiz-app/>.
