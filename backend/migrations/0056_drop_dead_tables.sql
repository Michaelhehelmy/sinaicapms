-- Migration 0056: Drop Tier-A dead tables (Unified Architecture Plan — Phase 2 / DB-B1)
--
-- Drops every table with ZERO backend SQL references and zero inbound FKs from a
-- surviving table (verified empirically against the live schema via
-- PRAGMA foreign_key_list + an SQL-context scan of backend/src on 2026-08-23).
-- All 30 tables are empty except `order_return_state` (3 seeded lookup rows, never queried).
--
-- NOTE ON COUNT: the DATABASE_SCHEMA_AUDIT labels this batch "27" but is internally
-- inconsistent — §2.4 lists exactly 27 while Phase-B1 enumerates 28 (adding
-- pos_user_sessions). This migration drops all 30 genuinely dead, unblocked tables:
-- the §2.4 list of 27 + `pos_user_sessions` + `pos_inventory` + `pos_stock_movements`
-- (the latter two were unblocked by 0055's trigger drop and have zero backend refs;
-- leaving them alive would violate the plan's exit criterion "every remaining table
-- has ≥1 backend SQL reference").
--
-- DELIBERATELY NOT DROPPED HERE:
--   pos_customers   — FK from ACTIVE pos_transactions.customer_id; requires a
--                     hot-table create-copy-swap rebuild (deferred to DB-B3 / migration 0058,
--                     maintenance window).
--   pos_categories  — one LEFT JOIN in backend/src/api/inventory.js still references it;
--                     code fix + drop happen in migration 0057.
--   products        — quasi-dead mirror shim (ensureProductInProductsTable) kept deliberately
--                     as belt-and-suspenders; removal needs explicit sign-off.
--   product_camps   — read-compat junction (0053); readers switch in a follow-up.
--
-- D1 ground rules: triggers already dropped by 0055 (BEFORE touching their subjects);
-- defer_foreign_keys during the batch; child-before-parent order; foreign_key_check last.

PRAGMA defer_foreign_keys = true;

-- ── Chain: financial_transactions → financial_accounts ──
DROP TABLE IF EXISTS financial_transactions;
DROP TABLE IF EXISTS financial_accounts;

-- ── Chain: order_return_detail → order_return → order_return_state ──
DROP TABLE IF EXISTS order_return_detail;
DROP TABLE IF EXISTS order_return;
DROP TABLE IF EXISTS order_return_state;

-- ── Chain: pos_user_achievements → pos_achievements ──
DROP TABLE IF EXISTS pos_user_achievements;
DROP TABLE IF EXISTS pos_achievements;

-- ── Chain: pos_promotion_usage → pos_promotions ──
DROP TABLE IF EXISTS pos_promotion_usage;
DROP TABLE IF EXISTS pos_promotions;

-- ── Chain: pos_stock_adjustment_items → pos_stock_adjustments ──
DROP TABLE IF EXISTS pos_stock_adjustment_items;
DROP TABLE IF EXISTS pos_stock_adjustments;

-- ── Trigger subjects unlocked by 0055 (both reference pos_product_variants) ──
DROP TABLE IF EXISTS pos_inventory;
DROP TABLE IF EXISTS pos_stock_movements;

-- ── Leaves (no candidate depends on them) ──
DROP TABLE IF EXISTS pos_inventory_logs;       -- rebuilt twice (0039/0040/0047), never written
DROP TABLE IF EXISTS pos_customer_addresses;   -- child of pos_customers (which survives until B3)
DROP TABLE IF EXISTS pos_loyalty_programs;     -- loyalty never shipped
DROP TABLE IF EXISTS pos_loyalty_transactions; -- recreated 0015 for FK hygiene, unused
DROP TABLE IF EXISTS pos_gamification_stats;   -- gamification stubbed out (staff.js 501)
DROP TABLE IF EXISTS pos_analytics_daily;      -- analytics computed live instead
DROP TABLE IF EXISTS pos_audit_logs;           -- never written
DROP TABLE IF EXISTS pos_activity_logs;        -- rebuilt twice, zero writers
DROP TABLE IF EXISTS pos_staff_stats;          -- stats computed live from pos_transactions
DROP TABLE IF EXISTS pos_user_sessions;        -- sessions are JWT-only since Track C Phase 2.2
DROP TABLE IF EXISTS plans;                    -- superseded by plans_new; seeds purged 0051
DROP TABLE IF EXISTS revenue;                  -- reporting computes from orders.total_amount
DROP TABLE IF EXISTS product_lang;             -- i18n for products, which lost to pos_products
DROP TABLE IF EXISTS product_camps_new;        -- accidental second junction from 0028, never used

-- ── Parents whose children are all dropped above ──
DROP TABLE IF EXISTS pos_brands;               -- pos_products.brand_id is a soft column (0042)
DROP TABLE IF EXISTS pos_suppliers;            -- pos_products.supplier_id is a soft column (0042)
DROP TABLE IF EXISTS pos_product_variants;     -- referenced only by dropped inventory/movement/
                                               -- adjustment tables; inbound FKs gone at this point

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
