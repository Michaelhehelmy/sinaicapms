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
  - "[[98-history/plans/README]]"
code-references:
  - "app/src/lib/api.ts"
  - "backend/src/api/folios.js"
  - "backend/src/api/orders.js:1382"
  - "backend/src/api/folios.js:337"
  - "backend/src/routes/pos/index.js"
  - "backend/src/api/reports.js"
  - "app/src/components/admin/ReportsPanel.tsx"
  - "tests/core/migration-integrity.test.js:110"
  - "docs/01-architecture/ARCHITECTURE.md"
  - "docs/07-data/migrations.md"
  - "docs/98-history/sessions/AGENT_LOGBOOK_HISTORY.md:9093"
verified: never
---
# docs/09-plans — Plans & backlogs

## Overview

What is still being decided. Spent plans are under `../98-history/plans/`. The distinction matters:
a live backlog claims to describe the present, so it is falsifiable and must be folded forward; a
spent plan is a record of a decision and is allowed to be stale.

## Concepts

- **A roadmap's "current state" line is the most falsifiable sentence in the repo** — grep it before
  trusting it. The live backlog here is folded forward through 2026-09-28. Note what that folding
  means: rows like `T9` (+8 a11y primitives) and `T19` ("53 migrations, 18 admin panels, 552 E2E
  gate") were TRUE on the day they were written and are false now, because the primitives were
  deleted in `69311ce` and the counts describe the pre-squash tree. **A `Done` row records what
  shipped, not what is still installed** — read its Notes column for the removal.
- **A reserved migration slot is an executable instruction** — the wave plan's "migration budget"
  reserved `0100` for the tip migration while `0100_add_project_id_nullable.sql` was already live,
  and "Current | 99 | head `0099`" counted the excluded `legacy/` folder. Both would have been
  followed literally. **Slot numbers must be derived from the directory, never transcribed**
  (`docs/07-data/migrations.md` §1 prints the two commands).
- **Known pre-existing type errors are a baseline, not regressions** — they are recorded separately so
  a clean `tsc` run and a `tsc` run with the baseline are distinguishable. This baseline is now
  **retired**: `tsc --noEmit` reached 0 at T33 (2026-09-06), and `tsc` cannot see `.astro` files at
  all, so any residual `.astro` diagnostics are LSP-level, outside its reach.
- **Waves, and a dependency graph owners must read first** — the plan is ordered by dependency, not by
  convenience, and the graph is the first subsection because executing a wave out of order invalidates
  the acceptance criteria of the next.
- **Deploy gates G1–G6.5 are NOT the appendices' governance incidents G1–G4** — both files are live and
  both use `G`. The gates are stopping points ("this wave must be green"); the incidents are closure
  records of things that went wrong during an audit. Always qualify a `G` reference with its file.
- **Evidence appendices 9.1–9.6** — the unabridged artifacts (305-row export→route mapping, ledgers,
  before/after assertion diffs) that let a reviewer check a verdict instead of trusting it.
- **Wave 7 is a carry-forward bucket** — future and product backlog, explicitly not a commitment.

## Docs

| Doc | What it is |
|---|---|
| [[DEVELOPER_ROADMAP\|DEVELOPER_ROADMAP.md]] | **The live backlog state**, folded forward through 2026-09-28. |
| [[BACKLOG_VOID_REFUND\|BACKLOG_VOID_REFUND.md]] | Live backlog proposal for the next POS cycle — **43 lines** (`wc -l`). Its § *Current* was wrong about the endpoint it opens on: `POST /api/pos/orders/:id/void` **does not exist**, the only void in the backend is the admin-only folio flip at `backend/src/api/folios.js:337`. |
| [[FINAL_IMPLEMENTATION_PLAN_v3_waves\|FINAL_IMPLEMENTATION_PLAN_v3_waves.md]] | Wave plan, dependency graph, acceptance criteria and risk register — the execution tier of the deep-audit plan. |
| [[FINAL_IMPLEMENTATION_PLAN_v3_appendices\|FINAL_IMPLEMENTATION_PLAN_v3_appendices.md]] | Governance-incident closure (G1–G4) and the 9.1–9.6 evidence appendices. |

## Related

- [[README|docs/README.md]] — vault entry point
- [[AUDIT_MASTER_FINDINGS]] — the P0 round these waves are the execution tier of
- [[98-history/plans/README]] — the spent plans this folder's live state replaced
- [[98-history/merged/FINAL_IMPLEMENTATION_PLAN]] — the pre-v3 predecessor
- [[BLOCKED-pos-products-composite-pk]] — the one item here with a named verdict and no author

## Gaps

Audited 2026-10-06 against the tree, read-only. This folder's queued doc fixes:

- **[[code-vs-docs]]** — **13** `STALE`/`FALSE` claims, plus **5** `MATCHED` controls this folder's findings rest on. `MATCHED` entries are reproduced at the foot of that note, because a finding that quotes one of them is only auditable if it is readable there.
- **[[unverified]]** — none · **[[unimplemented]]** — **1** item of real code no doc here claims.

Nothing is fixed yet. Each entry carries the `file:line` its claim was measured against and a named action; fix this folder's carriers together, not one file at a time — see [[99-gaps/README]] for the workflow.

