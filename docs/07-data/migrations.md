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
  - "backend/migrations/0123_storefront_order_items_fk_pos_products.sql"
  - "backend/wrangler.toml"
  - "backend/migrations/0122_add_storefront_order_items_project_id.sql"
  - "backend/migrations/0121_add_cart_items_project_id.sql"
  - "backend/migrations/0120_add_tip_amount_to_pos_transactions.sql"
verified: never
---
# SinaiCamps — Migration Guide (D1)

## 1. What migrations are

Cloudflare D1 (SQLite) schema lives as numbered `.sql` files in `backend/migrations/`. **Current head: `0123_storefront_order_items_fk_pos_products.sql`** (37 files total: `0001`–`0014` + `0100`–`0123` minus reserved-absent `0109`, filesystem-verified; `SCHEMA_DIRECTION_PLAN.md` is a planning note, not a migration — it now lives at [[SCHEMA_DIRECTION_PLAN|98-history/migrations/SCHEMA_DIRECTION_PLAN.md]]). The pre-squash `0001`–`0099` lineage is archived in `backend/migrations/legacy/` (+ README) — archaeology only, wrangler scans the top level and ignores it.

Migrations are applied in filename order. Never edit an applied migration — create a new numbered file.

## 2. Workflow

Use the **`db-migration` skill** (`.opencode/skills/database/db-migration/SKILL.md`) — it encodes this flow:

1. Create `backend/migrations/0124_<slug>.sql` with the next number (head is `0123`; never reuse reserved-absent `0109`).
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
| `0123_storefront_order_items_fk_pos_products.sql` | Retarget `storefront_order_items.product_id` FK `products(id)` → `pos_products(id)` (checkout writes pos_products ids; single-table rebuild, 0111 idiom) |
| `0122_add_storefront_order_items_project_id.sql` | Nullable `project_id` on `storefront_order_items` (unified-checkout line scoping) |
| `0121_add_cart_items_project_id.sql` | Nullable `project_id` on `cart_items` (lines stamped server-side from `pos_products.project_id`) |
| `0120_add_tip_amount_to_pos_transactions.sql` | `tip_amount REAL DEFAULT 0` on `pos_transactions` (INSERT already bound it — drift fix) |
| earlier | `0100`–`0118` project-scoping series (+ `0111` SET NULL idiom); `pos_users` generated name + `organization_id`, `pos_transactions` cashier refs |

## 6. Verification

After any migration:

```bash
cd backend && npx vitest run          # 2610 tests / 115 files
cd app && npx vitest run              # 3561 tests / 149 files
npx vitest run --config vitest.integration.config.ts   # root integration, 255 tests / 37 files
```
