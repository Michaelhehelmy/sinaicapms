---
title: "docs/09-plans — Plans & backlogs"
aliases:
tags:
  - type/index
  - audience/developer
  - domain/plans
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[DEVELOPER_ROADMAP]]"
  - "[[BACKLOG_VOID_REFUND]]"
  - "[[FINAL_IMPLEMENTATION_PLAN_v3_waves]]"
  - "[[FINAL_IMPLEMENTATION_PLAN_v3_appendices]]"
  - "[[docs/98-history/plans/README]]"
code-references:
  - "app/src/lib/api.ts"
  - "backend/src/api/folios.js"
  - "backend/src/api/orders.js:1382"
verified: never
---
# docs/09-plans — Plans & backlogs

## Overview

What is still being decided. Spent plans are under `../98-history/plans/`. The distinction matters:
a live backlog claims to describe the present, so it is falsifiable and must be folded forward; a
spent plan is a record of a decision and is allowed to be stale.

## Concepts

- **A roadmap's "current state" line is the most falsifiable sentence in the repo** — grep it before
  trusting it. The live backlog here is folded forward through 2026-09-28.
- **Known pre-existing type errors are a baseline, not regressions** — they are recorded separately so
  a clean `tsc` run and a `tsc` run with the baseline are distinguishable.
- **Waves, and a dependency graph owners must read first** — the plan is ordered by dependency, not by
  convenience, and the graph is the first subsection because executing a wave out of order invalidates
  the acceptance criteria of the next.
- **Deploy gates G1–G6.5** — waves terminate in a gate, so a half-landed wave has a defined stopping
  point rather than an undefined half-state.
- **Governance incidents G1–G4 are closure records, not plans** — migrations authored during an audit,
  a production fix applied into the tree, a commit shipped without a definition, a probe against the
  live R2 bucket. They live in the appendices because the rule they produced outlives the event.
- **Evidence appendices 9.1–9.6** — the unabridged artifacts (305-row export→route mapping, ledgers,
  before/after assertion diffs) that let a reviewer check a verdict instead of trusting it.
- **Wave 7 is a carry-forward bucket** — future and product backlog, explicitly not a commitment.

## Docs

| Doc | What it is |
|---|---|
| [[DEVELOPER_ROADMAP\|DEVELOPER_ROADMAP.md]] | **The live backlog state**, folded forward through 2026-09-28. |
| [[BACKLOG_VOID_REFUND\|BACKLOG_VOID_REFUND.md]] | Live 18-line backlog proposal for the next POS cycle. |
| [[FINAL_IMPLEMENTATION_PLAN_v3_waves\|FINAL_IMPLEMENTATION_PLAN_v3_waves.md]] | Wave plan, dependency graph, acceptance criteria and risk register — the execution tier of the deep-audit plan. |
| [[FINAL_IMPLEMENTATION_PLAN_v3_appendices\|FINAL_IMPLEMENTATION_PLAN_v3_appendices.md]] | Governance-incident closure (G1–G4) and the 9.1–9.6 evidence appendices. |

## Related

- [[README|docs/README.md]] — vault entry point
- [[AUDIT_MASTER_FINDINGS]] — the P0 round these waves are the execution tier of
- [[98-history/plans/README]] — the spent plans this folder's live state replaced
- [[98-history/merged/FINAL_IMPLEMENTATION_PLAN]] — the pre-v3 predecessor
- [[BLOCKED-pos-products-composite-pk]] — the one item here with a named verdict and no author

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->
