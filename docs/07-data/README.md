---
title: "docs/07-data"
aliases:
tags:
  - type/index
  - audience/developer
  - domain/data
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[migrations]]"
  - "[[98-history/migrations/SCHEMA_DIRECTION_PLAN]]"
  - "[[98-history/sessions/WAVE6_EXIT_REPORT]]"
  - "[[10-tenant-import/BLOCKED-pos-products-composite-pk]]"
code-references:
  - "backend/wrangler.toml"
  - "backend/migrations/0127_meals_tenant_composite_pk.sql"
  - "backend/migrations/legacy/0053_camp_ownership.sql"
  - "deploy.sh"
  - "tests/core/migration-integrity.test.js"
verified: never
---
# docs/07-data

## Overview

The data layer: the D1 schema and the procedures that change it. One live guide here, plus an
archived planning note whose open questions the tree has since answered.

## Concepts

- **Migrations are numbered `.sql` files in `backend/migrations/`** — applied in filename order, and
  **never edited after being applied**: a change is a new numbered file, not a rewrite of history.
- **The lineage has two halves** — the live top level is what wrangler scans, and
  the pre-squash `0001`–`0099` lineage (99 files) sits in `backend/migrations/legacy/`
  for archaeology only. Reading the legacy folder to answer "what does the schema
  look like" is a trap. **Two numbers in the top-level ranges are absent on purpose**:
  `0109` (reserved by its successor's header, `0110_create_payment_records.sql:20-23`)
  and `0125` (free when D3 took `0126`). A gap is not a missing migration.
- **"Head in the tree" ≠ "head applied"** — `0127_meals_tenant_composite_pk.sql`
  is committed and **not applied to any database** (its own header says so). The
  tree answers the first question; only `d1 migrations list --remote` answers the
  second, and no doc should state an applied head it cannot check.
- **Authoring style is additive and idempotent** — `CREATE TABLE IF NOT EXISTS` /
  `ALTER TABLE ... ADD COLUMN`, never a destructive rewrite in the same file as a feature.
- **SQLite cannot drop an index-backed constraint** — any migration that needs to re-scope a
  `UNIQUE` column must rebuild the table and re-apply the full rebuild idiom.
- **Rebuild migrations need the defer-pragma bracket** — `PRAGMA defer_foreign_keys = true` … `false`
  survives D1 because D1 wraps each file in a transaction; a better-sqlite3 replay must supply its own
  transaction or the pragma resets between statements and the parent DROP fails.
- **`PRAGMA table_info` hides generated columns** — use `table_xinfo`, or a column-order assertion
  silently skips the very GENERATED column it was written to protect.
- **Every query is tenant-scoped** — cross-tenant reads are the critical security failure mode here,
  and the tenant predicate is part of authoring a query, not a review step.
- **The free-plan traps are data-layer traps** — KV writes cap at 1,000/day and D1 remote reads cap
  per day; both bite as hard 429/7500 errors during verification, not during feature work.

## Docs

| Doc | What it is |
|---|---|
| [[migrations\|migrations.md]] | **The migration guide.** How to author, number and apply a D1 migration, the schema gotchas that have cost real time, and the free-plan KV trap. |

## Archived

- [[SCHEMA_DIRECTION_PLAN\|98-history/migrations/SCHEMA_DIRECTION_PLAN.md]] —
  the schema-direction planning note. It still heads "Decision Required" after 40 migrations landed;
  every decision it left open is resolved in the tree and in `AGENT_LOGBOOK_HISTORY.md`.

> ⚠️ **Migration-head drift: one carrier fixed, two remain.** [[migrations|migrations.md]] §1
> used to say head `0123_…` / 37 files while this index published the truth; that carrier is
> corrected as of 2026-10-06 (**40** files, head `0127_meals_tenant_composite_pk.sql`, derived by
> the two commands in §1 rather than transcribed). Two carriers outside `docs/07-data` still carry
> superseded numbers and are **not** fixed by this folder: repo-root `AGENTS.md` §2 says
> `0053_camp_ownership.sql` / 53 files, and the archived
> [[WAVE6_EXIT_REPORT|98-history/sessions/WAVE6_EXIT_REPORT.md]] says `0099_…` / 99 files —
> **99 is the size of the excluded `legacy/` folder**, and the WAVE6 figure was true on its
> `created:` date. Three copies of a number is the failure mode; the rule that prevents it is in
> [[migrations|migrations.md]] §1: derive the count and head from the directory, and say which of
> "in the tree" / "applied" you mean.

## Related

- [[README|docs/README.md]] — vault entry point
- [[ARCHITECTURE]] — §5, the database layer's place in the four-layer contract
- [[API_SURFACE_MAP]] — endpoint → table, the other way to find out what changed
- [[RUNBOOK]] — where migrations get applied during a deploy
- [[tenant-import-schema]] — the manifest that writes into these tables
- [[BLOCKED-pos-products-composite-pk]] — the live schema item this folder cannot resolve alone

## Gaps

Audited 2026-10-06 against the tree, read-only. This folder's queued doc fixes:

- **[[code-vs-docs]]** — **5** `STALE`/`FALSE` claims, plus **7** `MATCHED` controls this folder's findings rest on. `MATCHED` entries are reproduced at the foot of that note, because a finding that quotes one of them is only auditable if it is readable there.
- **[[unverified]]** — none · **[[unimplemented]]** — **1** item of real code no doc here claims.

Nothing is fixed yet. Each entry carries the `file:line` its claim was measured against and a named action; fix this folder's carriers together, not one file at a time — see [[99-gaps/README]] for the workflow.

