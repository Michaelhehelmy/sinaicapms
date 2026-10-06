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
  - "[[docs/98-history/migrations/SCHEMA_DIRECTION_PLAN]]"
  - "[[docs/98-history/sessions/WAVE6_EXIT_REPORT]]"
  - "[[docs/10-tenant-import/BLOCKED-pos-products-composite-pk]]"
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
- **The lineage has two halves** — the live top level (`0001`–`0014` + `0100`–`0127`) is what wrangler
  scans, and the pre-squash `0001`–`0099` lineage sits in `backend/migrations/legacy/` for
  archaeology only. Reading the legacy folder to answer "what does the schema look like" is a trap.
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

> ⚠️ **Migration-head drift is still live.** This doc's §1 says head `0123_…` / 37 files,
> `AGENTS.md` §2 says `0053_camp_ownership.sql` / 53 files, and the archived
> [[WAVE6_EXIT_REPORT\|98-history/sessions/WAVE6_EXIT_REPORT.md]] says
> `0099_…` / 99 files. The tree has **40** migrations with head
> `0127_meals_tenant_composite_pk.sql`. Fixing it is an owner content edit and was deliberately
> left out of the 2026-10-06 restructure.

## Related

- [[README|docs/README.md]] — vault entry point
- [[ARCHITECTURE]] — §5, the database layer's place in the four-layer contract
- [[API_SURFACE_MAP]] — endpoint → table, the other way to find out what changed
- [[RUNBOOK]] — where migrations get applied during a deploy
- [[tenant-import-schema]] — the manifest that writes into these tables
- [[BLOCKED-pos-products-composite-pk]] — the live schema item this folder cannot resolve alone

## Gaps

<!-- Populated by 99-gaps/code-vs-docs.md -->
