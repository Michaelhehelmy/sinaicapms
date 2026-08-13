# SinaiCamps — Migration Guide (D1)

## 1. What migrations are

Cloudflare D1 (SQLite) schema lives as numbered `.sql` files in `backend/migrations/`. **Current head: `0053_camp_ownership.sql`** (53 migrations total; `SCHEMA_DIRECTION_PLAN.md` in the same dir is a planning note, not a migration).

Migrations are applied in filename order. Never edit an applied migration — create a new numbered file.

## 2. Workflow

Use the **`db-migration` skill** (`.opencode/skills/database/db-migration/SKILL.md`) — it encodes this flow:

1. Create `backend/migrations/0054_<slug>.sql` with the next number.
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
| `0053_camp_ownership.sql` | Camp ownership model |
| `0052_add_tenants_type.sql` | Tenant type column |
| earlier | `pos_users` generated name + `organization_id`, `pos_transactions` cashier refs |

## 6. Verification

After any migration:

```bash
cd backend && npx vitest run          # 1082 tests / 36 files
cd app && npx vitest run              # 1465 tests / 74 files
npx vitest run                        # root integration, 169 tests / 10 files
```
