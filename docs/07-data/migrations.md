---
title: "SinaiCamps — Migration Guide (D1)"
aliases:
  - "MIGRATION_GUIDE"
tags:
  - type/guide
  - audience/developer
  - domain/data
  - status/live
created: 2026-08-13
updated: 2026-10-06
relates-to:
  - "[[07-data/README]]"
  - "[[98-history/migrations/SCHEMA_DIRECTION_PLAN]]"
  - "[[tenant-import]]"
  - "[[05-operations/RUNBOOK]]"
code-references:
  - "backend/migrations/0127_meals_tenant_composite_pk.sql"
  - "backend/migrations/0126_tenant_scoped_unique_sku_email.sql"
  - "backend/migrations/0124_guest_folios.sql"
  - "backend/migrations/0123_storefront_order_items_fk_pos_products.sql"
  - "backend/migrations/legacy/README.md"
  - "backend/wrangler.toml"
  - "backend/migrations/0122_add_storefront_order_items_project_id.sql"
  - "backend/migrations/0121_add_cart_items_project_id.sql"
  - "backend/migrations/0120_add_tip_amount_to_pos_transactions.sql"
  - "backend/migrations/0119_pos_shifts_store_id.sql"
  - "backend/migrations/0110_create_payment_records.sql:20-23"
  - "scripts/check-deploy-parity.sh:55-57"
verified: never
---
# SinaiCamps — Migration Guide (D1)

## 1. What migrations are

Cloudflare D1 (SQLite) schema lives as numbered `.sql` files in `backend/migrations/`.

**One authority: the directory itself.** A count and a head are *derived*, never
transcribed. Re-derive both with the same two commands
`scripts/check-deploy-parity.sh` uses (`:55-57`):

```bash
find backend/migrations -maxdepth 1 -name '*.sql' | wc -l   # file count
ls backend/migrations/*.sql | sort | tail -1 | xargs basename   # head
```

As of 2026-10-06 that is **40** top-level `.sql` files with head
**`0127_meals_tenant_composite_pk.sql`**. Three facts about the ledger are normal
and must not be read as drift:

- **The ranges are not contiguous, by design.** The applied lineage is
  `0001`–`0014` (14 files) plus `0100`–`0127` (26 files). Two slots are
  **reserved-but-absent**: `0109` (documented in its successor's own header —
  `0110_create_payment_records.sql:20-23` — the slot belonged to a workstream
  that would have dropped camp columns destructively, so `0110` skipped it) and
  `0125` (verified free when the D3 mission took `0126`). A gap in the numbering
  means nothing runs in that slot; D1 applies in lexicographic order.
- **The head is "the highest-numbered file present", not "N files after 0001".**
  Adding one migration changes the head without changing the count's meaning.
- **`legacy/` is not the lineage.** `backend/migrations/legacy/` holds **99**
  pre-squash files (`0001`–`0099`, including `0053_camp_ownership.sql` and
  `0099_normalize_marketplace_payouts_ids.sql`) for archaeology only.
  `scripts/check-deploy-parity.sh:56` inventories top-level `*.sql` **only**, and
  wrangler scans the top level, so reading a number out of `legacy/` — or out of
  an archived report written before the squash — describes a lineage nothing runs.
  `SCHEMA_DIRECTION_PLAN.md` is a planning note, not a migration; it now lives at
  [[SCHEMA_DIRECTION_PLAN|98-history/migrations/SCHEMA_DIRECTION_PLAN.md]].

**"In the tree" and "applied" are two different claims, and a doc that states a
head must say which it means.** `0127_meals_tenant_composite_pk.sql:4-10`
declares itself:

> ⚠️ PENDING-APPLY. This file is committed but NOT applied to any database.

So the head **in the tree** is `0127`; the head **applied** to any database is at
most `0126`, and no repository command can tell you the applied head — that is
`d1 migrations list --remote` (see §4 and [[RUNBOOK]] §8). Apply it before
deploying any code that depends on the new shape; the owner command is in that
header.

Migrations are applied in filename order. Never edit an applied migration — create a new numbered file.

## 2. Workflow

Use the **`db-migration` skill** (`.opencode/skills/database/db-migration/SKILL.md`) — it encodes this flow:

1. Create `backend/migrations/0128_<slug>.sql` — **derive the next number, never
   recall it**: `ls backend/migrations/*.sql | sort | tail -1` gives the head, and
   the next file is the next number (head is `0127` as of 2026-10-06). Never reuse
   a reserved-absent slot (`0109`, `0125`) — see §1 for why they are empty.
2. Style: `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN` (SQLite) — prefer additive, idempotent DDL.
3. Apply locally: `npx wrangler d1 migrations apply <DB_NAME> --local --config backend/wrangler.toml` (check the DB name in `backend/wrangler.toml` `[[d1_databases]]`).
4. Apply remotely: `./deploy.sh` applies migrations during deploy; or `npx wrangler d1 migrations apply <DB_NAME> --remote --config backend/wrangler.toml`.

## 3. Schema gotchas (learned the hard way)

- **`pos_users.name` is a GENERATED column** (`first_name || ' ' || last_name`). INSERT with `first_name`/`last_name` only — never write `name` directly.
- **`pos_users.organization_id` is `INTEGER NOT NULL`** — every INSERT must include it (a missing value fails the whole insert).
- **`pos_transactions` references staff via `cashier_id`**, not `staff_id`.
- SQLite `ALTER TABLE ADD COLUMN` cannot add NOT NULL columns without a DEFAULT — add a default then backfill.
- When adding an index, name it `idx_<table>_<column>` and use `CREATE INDEX IF NOT EXISTS`.

## 4. KV and the free-plan rate-limit trap

Cloudflare's free plan allows **1,000 KV writes/day**. A KV write per API request exhausts the quota → full API outage until reset.

- The **rate limiter** is the only KV consumer. `RATE_LIMIT_KV_ENABLED="false"` (current, in `backend/wrangler.toml` `[vars]`) forces the in-memory fallback — **keep it** unless the account is on a paid plan.
- HTTP response caching (`cachedJsonResponse`) uses **only `Cache-Control` headers — no KV writes** — and is safe on the free plan.

## 5. Recent migrations of note

| File | Change |
| --- | --- |
| `0127_meals_tenant_composite_pk.sql` | Tenant-scoped composite `PRIMARY KEY` on `meals` (rebuilds three tables). **Committed but NOT applied** — see §1 |
| `0126_tenant_scoped_unique_sku_email.sql` | Replaces three global inline `UNIQUE`s with tenant-scoped `UNIQUE INDEX`es on `pos_products.sku`, `pos_users.email`, `pos_users.username` (`barcode` stays global) |
| `0124_guest_folios.sql` | Guest folios table + `foliosRoutes.post('/:id/void')` |
| `0123_storefront_order_items_fk_pos_products.sql` | Retarget `storefront_order_items.product_id` FK `products(id)` → `pos_products(id)` (checkout writes pos_products ids; single-table rebuild, 0111 idiom) |
| `0122_add_storefront_order_items_project_id.sql` | Nullable `project_id` on `storefront_order_items` (unified-checkout line scoping) |
| `0121_add_cart_items_project_id.sql` | Nullable `project_id` on `cart_items` (lines stamped server-side from `pos_products.project_id`) |
| `0120_add_tip_amount_to_pos_transactions.sql` | `tip_amount REAL DEFAULT 0` on `pos_transactions` (INSERT already bound it — drift fix) |
| earlier | `0100`–`0119` project-scoping series (+ `0111` SET NULL idiom; `0119_pos_shifts_store_id.sql` is the POS-shift member of it — shifts get `store_id`); `pos_users` generated name + `organization_id`, `pos_transactions` cashier refs |

## 6. Verification

After any migration:

```bash
cd backend && npx vitest run          # 127 files / 2743 tests   (9e58dae)
cd app && npx vitest run              # 155 files / 3632 tests   (88f307a)
npx vitest run --config vitest.integration.config.ts   # root integration, 37 files / 255 tests
```

Each figure is the newest **committed** run, quoted from
[[98-history/sessions/AGENT_LOGBOOK_HISTORY]] — `ARCHITECTURE.md` §7 is the
canonical table. A count is a claim with a date on it; if it has none, re-run the
suite rather than repeating it.

The root integration suite includes `tests/core/migration-integrity.test.js`, which
statically inventories this folder: sequential numbering (`:16-25`), filename
shape (`:27-35`), balanced parens (`:37-48`) and unsafe drops (`:76-91`). Its file
list is a **non-recursive** `readdirSync`, so it covers the 40 applied files and
never `legacy/` (`:5-10`).

> ⚠️ **Its unsafe-drop regex also matches SQL comments.** `migration-integrity.test.js:80`
> is `/DROP TABLE\s+(?!IF EXISTS)/gi` applied to the raw file text, so a line that
> only *discusses* `DROP TABLE` counts. Six lines in the applied lineage match —
> **two real statements** (`0108_add_meals_project_id.sql:68` dropping the
> `_0108_project_guard` helper the same file creates, and
> `0115_rooms_new_tenant_not_null_fk.sql:108` dropping `rooms_new`) and **four
> `--` comments** (`0107:53`, `0111:42`, `0112:374`, `0126:96`). Both statements
> drop a table their own file just created, so neither can fail on a clean
> lineage; every other drop in the applied set — and every drop in
> `legacy/` — is `IF EXISTS`. But the assertion at `:90` is `toBe(0)`, so any new
> file must avoid the literal `DROP TABLE` outside an `IF EXISTS` statement,
> **including in a comment**. Worth knowing before you wonder why a green
> migration turns the gate red.
