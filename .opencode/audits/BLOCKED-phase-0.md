# Phase-0 gate record — CORRECTED (tenant-arch-p0e-regate)

Date: 2026-09-23 · Re-gate agent: tenant-arch-p0e-regate · Verdict: **PASS** · Phase-0 exit committed + pushed.

> **SUPERSEDED BY OWNER DIRECTIVE**: the original p0d BLOCKED verdict below (a DATA assertion —
> `SELECT id, project_id FROM orders LIMIT 5` must return rows) is **SUPERSEDED**. The owner rejected
> the data gate: Phase 0 is schema-only, staging `orders` is genuinely empty, and seeding fake orders
> to satisfy a row-count is out of scope. The corrected gate is SCHEMA assertions only (column
> presence + type + DDL + tenant project coverage), all re-run below and PASSING.
>
> Original blocker text retained verbatim below for provenance.

## Original verdict (SUPERSEDED — retained for provenance)

Date: 2026-09-23 · Agent: tenant-arch-p0d-gate · Verdict: **BLOCKED** · No commit made.

## Blocking failure

Gate SELECT 1 against staging returned zero rows:

- Command: `npx wrangler d1 execute campmaster-db-staging --env staging --remote --command "SELECT id, project_id FROM orders LIMIT 5;"`
- Exit: 0, output: `[]` (rows: 0)
- Corroborating query: `SELECT COUNT(*) AS orders_n FROM orders` on the same target → `[{'orders_n': 0}]`
- Done-condition requirement: "`SELECT id, project_id FROM orders LIMIT 5` returns rows" — NOT met.

Root cause is **staging data state, not a migration defect**: the `project_id` column EXISTS on staging
`orders` (`SELECT COUNT(*) FROM pragma_table_info('orders') WHERE name='project_id'` → 1), the table is
genuinely empty on staging. Seeding fake orders into staging to satisfy the row-count is out of scope
(schema-only phase; no data writes beyond migrations), so the gate stops here per mission hard rule 6.

## Evidence of what PASSED

1. Backend suite: `cd backend && npx vitest run` → **85 files / 2253 tests passed**, exit 0.
2. Staging target verified against `backend/wrangler.toml`: `database_name = "campmaster-db-staging"`
   (`database_id = "4a9e6e45-f90d-4897-823b-6dd16dc0f347"`) under `[env.staging]` — mission string
   `campmaster-db-staging --env staging` matches exactly, no discrepancy.
3. Local apply: `npx wrangler d1 migrations apply campmaster-db --local` → "No migrations to apply"
   (0100–0104 already recorded in local `d1_migrations` journal). Local pragma spot-checks:
   `project_id` present (1) on all 12 checked tables
   (orders, order_items, pos_stores, carts, rooms_new, pos_products, rate_plans_new,
   pos_transactions, pos_users, meals, promotions, storefront_orders). Local: 8 tenants, 8 with ≥1 project.
4. Staging remote apply: `npx wrangler d1 migrations apply campmaster-db-staging --env staging --remote`
   → all 5 ✅ (0100_add_project_id_nullable, 0101_add_pos_stores_project_id,
   0102_add_order_items_project_id_nullable, 0103_add_carts_project_id, 0104_provision_default_projects).
   Staging `d1_migrations` journal confirms all five `010%` rows.
5. Staging pragma spot-checks: `project_id` present (1) on all 12 tables listed above.
6. Gate SELECT 2: `SELECT COUNT(*) AS tenants, SUM(...with project...) FROM tenants t` on staging →
   `[{'tenants': 3, 'with_project': 3}]` — **every tenant has ≥1 project** (projects: `camp_fdcd2ef9-855`
   → acaciacamp, `deffc032913955d0a56ec308016c72bc` → michaelshouse, `1875a354e1e3a9c53b6d041d8b693abc`
   → marketplace). Requirement met.

## Notes for orchestrator

- Local `.wrangler` journal contains two ghost rows (`0100_cleanup_redundant_indexes.sql`,
  `0101_backfill_rooms_new_tenant_id.sql`) with no corresponding files on disk — leftover from an
  earlier sibling iteration; harmless (D1 keys applied-state by filename, ghosts block nothing).
- Suggested unblock options (orchestrator decision): (a) create a real order on staging via the
  storefront/checkout flow, then re-run gate SELECT 1; (b) explicitly waive the "returns rows"
  half of the gate given the column demonstrably exists and the query executes cleanly.
- Production untouched. `deploy.sh` never run. Working tree left uncommitted (migrations + tests +
  logbook still unstaged/untracked).

## Corrected gate re-run (tenant-arch-p0e-regate, 2026-09-23) — PASS

Staging target re-verified vs `backend/wrangler.toml` `[env.staging]`: `database_name =
"campmaster-db-staging"` (`database_id = "4a9e6e45-f90d-4897-823b-6dd16dc0f347"`) — matches exactly.
Ledger: `SELECT name FROM d1_migrations WHERE name LIKE '010%'` on staging returns all five
(`0100_add_project_id_nullable.sql`, `0101_add_pos_stores_project_id.sql`,
`0102_add_order_items_project_id_nullable.sql`, `0103_add_carts_project_id.sql`,
`0104_provision_default_projects.sql`) — already applied, NOT re-applied (no duplicate apply).

Corrected assertions (all `--env staging --remote`, read-only):

1. `PRAGMA table_info` — `project_id` present with expected type on all 17 tables:
   orders / order_items / carts / pos_stores + the 0100 core set (rooms_new, rate_plans_new,
   pos_products, pos_transactions, pos_transaction_items, pos_users, pos_tables, meals,
   meal_categories, meal_schedules, inventory_adjustments, promotions, storefront_orders).
   Every row: `{"name": "project_id", "type": "TEXT", "nn": 0}` — TEXT, nullable, as designed. **PASS.**
2. `SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN
   ('orders','order_items','carts','pos_stores')` — all four DDLs contain
   `project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`. **PASS.**
3. `SELECT tenant_id, COUNT(*) FROM projects GROUP BY tenant_id` →
   `[{acaciacamp: 1}, {marketplace: 1}, {michaelshouse: 1}]`; corroborating
   `tenants LEFT JOIN projects` → every tenant has exactly 1 project (3 tenants, 0 without). **PASS.**

Backend suite: `cd backend && npx vitest run` → **85 files / 2253 tests passed**, exit 0. **PASS.**

Notes: one transient `fetch failed` + one `too many terms in compound SELECT` (17-way UNION exceeds
the D1 compound limit — split into ≤4-way batches) during the re-run; both resolved by retry/smaller
batches, no code impact. Production untouched. `deploy.sh` never run. No Phase-1 work.
