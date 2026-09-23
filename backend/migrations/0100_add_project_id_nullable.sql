-- Migration 0100: Phase-0 core project_id columns (nullable, schema-only).
--
-- WHAT: adds a nullable `project_id TEXT REFERENCES projects(id) ON DELETE SET NULL`
-- column to each of the 14 Phase-0 core tables listed below, plus a matching
-- lookup index per table. Zero behavior change: all columns are nullable, no
-- backfill, no NOT NULL, no defaults, no data touched.
--
-- Recon ground truth: /tmp/opencode/p0-recon.md §2–§3 (task tenant-arch-p0a-recon,
-- 2026-09-23). Every table below is EXISTS + `project_id` MISSING per the recon
-- ledger grep (full-ledger `ADD COLUMN project_id` = zero hits); `camp_id`
-- presence per table is noted inline so no further ledger lookup is needed.
--
-- Tables covered (14):
--   1. rooms_new (has nullable camp_id 0066:24, tenant_id 0044:10)
--   2. rate_plans_new (has camp_id 0091:24)
--   3. orders (has camp_id 0092:32)
--   4. pos_products (has camp_id 0020:7; GENERATED profit_margin untouched)
--   5. pos_transactions (no camp_id; cashier_id — NOT staff_id — untouched)
--   6. pos_transaction_items (no camp_id)
--   7. pos_users (has camp_id 0023:5; GENERATED name untouched — INSERTs still
--      use first_name/last_name ONLY; organization_id NOT NULL untouched)
--   8. pos_tables (no camp_id)
--   9. meals (no camp_id; canonical DDL 0028:257-266)
--  10. meal_categories (no camp_id)
--  11. meal_schedules (has camp_id 0066:64)
--  12. inventory_adjustments (no camp_id)
--  13. promotions (no camp_id)
--  14. storefront_orders (no camp_id; Paymob cols 0098:6-8 untouched)
--
-- Explicitly EXCLUDED (per recon §3, not missing — do not add here):
--   - service_items: already HAS project_id (0072:24, indexed 0074:85) — verify-only, no statement.
--   - pos_stores → 0101 (dedicated file; org-scoped root).
--   - order_items → 0102 (dedicated file; booking-line-item table).
--   - carts / cart_items → 0103 (dedicated file; carts EXISTS 0082:1-19).
--   - tenant_org_mapping: junction keyed by tenant_id + organization_id (0041:10-17);
--     scoping it by project is a P0-D modeling decision — default: skip.
--
-- IDEMPOTENCY: SQLite/D1 has no `ADD COLUMN IF NOT EXISTS`, so the ADD COLUMN
-- statements below are intentionally bare — this reuses the project's established
-- additive-migration pattern (mirrors 0087_order_payment_paymob.sql and
-- 0098_storefront_paymob.sql: plain ALTER TABLE ADD COLUMN, applied once by the
-- migration ledger). Rerun safety for the companion objects uses guards SQLite
-- DOES support: `CREATE INDEX IF NOT EXISTS` (mirrors 0094_index_gaps.sql and
-- 0096_storefront_orders.sql).
--
-- FK PRECISION: the inline `REFERENCES projects(id) ON DELETE SET NULL` clause
-- follows the project's ADD COLUMN precedent (0069_restaurant_tables.sql:46,54
-- `table_id ... REFERENCES pos_tables(id) ON DELETE SET NULL`;
-- 0090_marketplace_payouts.sql:34). It is recorded as the logical scope link;
-- full FK enforcement/backfill is deferred to Phase 1 (mirroring how camp_id
-- FKs arrived via later rebuilds, e.g. 0066/0091) — no enforcement beyond the
-- existing precedent is claimed here.
--
-- ROLLBACK SAFETY (hard rule 7): ADD COLUMN is forward-only. There is no
-- down-migration; rollback = a NEW migration dropping the column (SQLite 3.35+
-- `ALTER TABLE <t> DROP COLUMN project_id`). The indexes drop implicitly with
-- their columns; a follow-up migration may `DROP INDEX IF EXISTS idx_<t>_project`
-- for hygiene. No data migration is involved, so nothing else needs reverting.
--
-- PHASE-1 NOTE: this file performs NO backfill of project_id values. Backfill
-- (default-project resolution per tenant) is owned by Phase 1.

-- ─────────────────────────────────────────────────────────────
-- 1. rooms_new
-- ─────────────────────────────────────────────────────────────
ALTER TABLE rooms_new ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_new_project ON rooms_new(project_id);

-- ─────────────────────────────────────────────────────────────
-- 2. rate_plans_new
-- ─────────────────────────────────────────────────────────────
ALTER TABLE rate_plans_new ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_project ON rate_plans_new(project_id);

-- ─────────────────────────────────────────────────────────────
-- 3. orders
-- ─────────────────────────────────────────────────────────────
ALTER TABLE orders ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_project ON orders(project_id);

-- ─────────────────────────────────────────────────────────────
-- 4. pos_products
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pos_products ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pos_products_project ON pos_products(project_id);

-- ─────────────────────────────────────────────────────────────
-- 5. pos_transactions
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pos_transactions ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pos_transactions_project ON pos_transactions(project_id);

-- ─────────────────────────────────────────────────────────────
-- 6. pos_transaction_items
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pos_transaction_items ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_project ON pos_transaction_items(project_id);

-- ─────────────────────────────────────────────────────────────
-- 7. pos_users (GENERATED name + organization_id NOT NULL untouched)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pos_users ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pos_users_project ON pos_users(project_id);

-- ─────────────────────────────────────────────────────────────
-- 8. pos_tables
-- ─────────────────────────────────────────────────────────────
ALTER TABLE pos_tables ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pos_tables_project ON pos_tables(project_id);

-- ─────────────────────────────────────────────────────────────
-- 9. meals
-- ─────────────────────────────────────────────────────────────
ALTER TABLE meals ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_meals_project ON meals(project_id);

-- ─────────────────────────────────────────────────────────────
-- 10. meal_categories
-- ─────────────────────────────────────────────────────────────
ALTER TABLE meal_categories ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_meal_categories_project ON meal_categories(project_id);

-- ─────────────────────────────────────────────────────────────
-- 11. meal_schedules
-- ─────────────────────────────────────────────────────────────
ALTER TABLE meal_schedules ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_meal_schedules_project ON meal_schedules(project_id);

-- ─────────────────────────────────────────────────────────────
-- 12. inventory_adjustments
-- ─────────────────────────────────────────────────────────────
ALTER TABLE inventory_adjustments ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_project ON inventory_adjustments(project_id);

-- ─────────────────────────────────────────────────────────────
-- 13. promotions
-- ─────────────────────────────────────────────────────────────
ALTER TABLE promotions ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_promotions_project ON promotions(project_id);

-- ─────────────────────────────────────────────────────────────
-- 14. storefront_orders
-- ─────────────────────────────────────────────────────────────
ALTER TABLE storefront_orders ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_storefront_orders_project ON storefront_orders(project_id);
