# docs/07-data

Data layer: the D1 schema and the procedures that change it.

| Doc | What it is |
|---|---|
| [`migrations.md`](migrations.md) | **The migration guide.** How to author, number and apply a D1 migration, the schema gotchas that have cost real time, and the free-plan KV trap. |

## Archived

- [`../98-history/migrations/SCHEMA_DIRECTION_PLAN.md`](../98-history/migrations/SCHEMA_DIRECTION_PLAN.md) —
  the schema-direction planning note. It still heads "Decision Required" after 40 migrations landed;
  every decision it left open is resolved in the tree and in `AGENT_LOGBOOK_HISTORY.md`.

> ⚠️ **Migration-head drift is still live.** This doc's §1 says head `0123_…` / 37 files,
> `AGENTS.md` §2 says `0053_camp_ownership.sql` / 53 files, and the archived
> [`../98-history/sessions/WAVE6_EXIT_REPORT.md`](../98-history/sessions/WAVE6_EXIT_REPORT.md) says
> `0099_…` / 99 files. The tree has **40** migrations with head
> `0127_meals_tenant_composite_pk.sql`. Fixing it is an owner content edit and was deliberately
> left out of the 2026-10-06 restructure.
