---
name: db-migration
description: Create and apply a database migration safely in SinaiCamps
---

## When to use
When you need to add a column, create a table, or modify the schema.

## Steps

1. **Create the migration file**
   - Add a numbered SQL file in `backend/migrations/` (e.g. `0039_add_xxx.sql` — check the highest existing number first). This project uses **raw D1/SQLite SQL, not an ORM/Drizzle**.
   - Example: `ALTER TABLE tenants ADD COLUMN xxx TEXT DEFAULT '';`

2. **Write safe SQL**
   - Use `IF NOT EXISTS` / `IF EXISTS` for tables, indexes, and destructive ops.
   - Never drop columns/tables unless explicitly requested.
   - Do NOT create the table in code — migrations are the single source of schema truth.

3. **Apply locally and verify**
   ```bash
   cd backend
   npx wrangler d1 migrations apply campmaster-db --local
   ```
   - Inspect the result through the backend API or D1 queries — do not inspect `sinaicamps.db`/`database.db` at the repo root (those are local dev artifacts, not the D1 store).

4. **Remember the gotchas**
   - `pos_users.name` is GENERATED (`first_name || ' ' || last_name`) — never insert into it.
   - `pos_users.organization_id` is `INTEGER NOT NULL` — every INSERT must include it.
   - `pos_transactions` uses `cashier_id` (not `staff_id`).

5. **Apply remotely only via deploy flow**
   - `npx wrangler d1 migrations apply campmaster-db --remote` (or let `./deploy.sh` do it) — only when the migration is ready for production.

6. **Verify**
   - Run the backend unit suite: `cd backend && npx vitest run`.
