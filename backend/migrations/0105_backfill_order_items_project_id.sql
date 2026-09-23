-- Migration 0105: Phase-1 project_id backfill (data-only, no schema change).
--
-- WHAT: fills the nullable `project_id` columns added in 0100–0103, one UPDATE per
-- table, each scoped `WHERE project_id IS NULL` (only NULLs are touched — never
-- overwrites an already-tagged row). Covers 15 tables; promotions / carts /
-- storefront_orders get NO statement by verdict (see below).
--
-- Recon ground truth: /tmp/opencode/p1-recon.md §1–§3 (task tenant-arch-p1a-recon,
-- 2026-09-23; read-only census of the miniflare local D1 copy). Statement shapes
-- below implement the §3 table literally (sources + tie-break).
--
-- TIE-BREAK (recon §3 head): every "→ tenant default project" fall-through resolves
-- to the row-tenant's oldest live project:
--   SELECT p.id FROM projects p
--   WHERE p.tenant_id = <row tenant> AND p.deleted_at IS NULL
--   ORDER BY p.created_at ASC, p.id ASC LIMIT 1
-- Deterministic on the observed tie (`acaciacamp` vs `michaelshouse` share
-- created_at 2026-09-05 07:41:14 → `id ASC` picks `acaciacamp`).
--
-- ORDERING: order_items MUST run after orders in this file (parent-copy source is
-- orders.project_id backfilled here); pos_transactions runs before
-- pos_transaction_items (the items' parent-txn fall-through reads the backfilled
-- header value); inventory_adjustments / pos_transaction_items run after
-- pos_products (product-camp source). All other statements are order-independent.
--
-- ROLLBACK SAFETY (hard rule 7): data-only, forward-only. Each UPDATE touches NULLs
-- only, so a pre-apply backup is the restore path — rollback = restore from backup
-- (the "locker" procedure, stated in the P1-D apply commit body). Do NOT re-null
-- project_id after 0106/0107 enforce NOT NULL.
--
-- STAGING GATE (recon §1b/§6): staging was unreachable from the recon sandbox, so
-- P1-D must re-run the §1a NULL matrix remotely at apply time and STOP on any
-- divergence (rows with invalid camp_id, tenants without projects beyond the 0104
-- provisioner, missing 0100–0104 columns) before applying this file.

-- ─────────────────────────────────────────────────────────────
-- 1. rooms_new — direct rename-source (161/161 camp_id valid locally)
-- ─────────────────────────────────────────────────────────────
UPDATE rooms_new SET project_id = camp_id WHERE project_id IS NULL AND camp_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. rate_plans_new — camp_id per the 0091:40-45 rule (32/32 valid locally)
-- ─────────────────────────────────────────────────────────────
UPDATE rate_plans_new SET project_id = camp_id WHERE project_id IS NULL AND camp_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. pos_products — soft camp_id, else tenant default (43/43 via camp_id locally)
-- ─────────────────────────────────────────────────────────────
UPDATE pos_products SET project_id = COALESCE(
  camp_id,
  (SELECT p.id FROM projects p
   WHERE p.tenant_id = pos_products.tenant_id AND p.deleted_at IS NULL
   ORDER BY p.created_at ASC, p.id ASC LIMIT 1)
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. orders — camp_id → room's project → tenant default (24/24 via camp_id locally)
-- Single-project rows get tagged; genuinely multi-project carts keep NULL by
-- design (T+tags D3 header — closure must NOT gate NOT NULL, recon §2).
-- ─────────────────────────────────────────────────────────────
UPDATE orders SET project_id = COALESCE(
  camp_id,
  (SELECT r.camp_id FROM rooms_new r WHERE r.id = orders.room_id),
  (SELECT p.id FROM projects p
   WHERE p.tenant_id = orders.tenant_id AND p.deleted_at IS NULL
   ORDER BY p.created_at ASC, p.id ASC LIMIT 1)
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. order_items — parent-copy (MUST run after statement 4 in this file).
-- Today every line's project IS its parent's (recon §4.6). Locally vacuous.
-- ─────────────────────────────────────────────────────────────
UPDATE order_items SET project_id = (
  SELECT o.project_id FROM orders o WHERE o.id = order_items.order_id
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 6. pos_transactions — first line-item product's camp (MIN(rowid) line per
-- order_id; lines join via order_id → pos_transactions(id), transaction_id is
-- unused), else tenant default. 119/119 via lines locally. Best-effort: mixed
-- carts keep NULL by design (T+tags D3 header, recon §2).
-- ─────────────────────────────────────────────────────────────
UPDATE pos_transactions SET project_id = COALESCE(
  (SELECT p.camp_id FROM pos_transaction_items i
   JOIN pos_products p ON p.id = i.product_id
   WHERE i.order_id = pos_transactions.id
   ORDER BY i.rowid ASC LIMIT 1),
  (SELECT p.id FROM projects p
   WHERE p.tenant_id = pos_transactions.tenant_id AND p.deleted_at IS NULL
   ORDER BY p.created_at ASC, p.id ASC LIMIT 1)
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 7. pos_transaction_items — line product's camp → parent-txn derivation
-- (backfilled in statement 6 above) → tenant default. 119/119 via product.
-- ─────────────────────────────────────────────────────────────
UPDATE pos_transaction_items SET project_id = COALESCE(
  (SELECT p.camp_id FROM pos_products p WHERE p.id = pos_transaction_items.product_id),
  (SELECT t.project_id FROM pos_transactions t WHERE t.id = pos_transaction_items.order_id),
  (SELECT p.id FROM projects p
   WHERE p.tenant_id = pos_transaction_items.tenant_id AND p.deleted_at IS NULL
   ORDER BY p.created_at ASC, p.id ASC LIMIT 1)
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 8. inventory_adjustments — product's camp, else tenant default
-- (512/512 via product locally; product_id has no FK clause, 0075:37-47)
-- ─────────────────────────────────────────────────────────────
UPDATE inventory_adjustments SET project_id = COALESCE(
  (SELECT p.camp_id FROM pos_products p WHERE p.id = inventory_adjustments.product_id),
  (SELECT p.id FROM projects p
   WHERE p.tenant_id = inventory_adjustments.tenant_id AND p.deleted_at IS NULL
   ORDER BY p.created_at ASC, p.id ASC LIMIT 1)
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 9. meals — tenant default (5/5 tenants have live projects locally)
-- ─────────────────────────────────────────────────────────────
UPDATE meals SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.tenant_id = meals.tenant_id AND p.deleted_at IS NULL
  ORDER BY p.created_at ASC, p.id ASC LIMIT 1
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 10. meal_categories — tenant default, moves with its meals (3/3 locally)
-- ─────────────────────────────────────────────────────────────
UPDATE meal_categories SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.tenant_id = meal_categories.tenant_id AND p.deleted_at IS NULL
  ORDER BY p.created_at ASC, p.id ASC LIMIT 1
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 11. meal_schedules — camp_id, else tenant default (locally vacuous)
-- ─────────────────────────────────────────────────────────────
UPDATE meal_schedules SET project_id = COALESCE(
  camp_id,
  (SELECT p.id FROM projects p
   WHERE p.tenant_id = meal_schedules.tenant_id AND p.deleted_at IS NULL
   ORDER BY p.created_at ASC, p.id ASC LIMIT 1)
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 12. pos_tables — tenant default (locally vacuous)
-- ─────────────────────────────────────────────────────────────
UPDATE pos_tables SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.tenant_id = pos_tables.tenant_id AND p.deleted_at IS NULL
  ORDER BY p.created_at ASC, p.id ASC LIMIT 1
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 13. service_items — tenant default over the pre-existing 0072:24 column
-- (locally vacuous)
-- ─────────────────────────────────────────────────────────────
UPDATE service_items SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.tenant_id = service_items.tenant_id AND p.deleted_at IS NULL
  ORDER BY p.created_at ASC, p.id ASC LIMIT 1
) WHERE project_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 14. pos_users — PARTIAL: tenant default only where resolvable (tenant has a
-- live project). Locally 1/43; the 42 orphan-tenant `cascade-*` probe leftovers
-- (orgs 3–46, no tenant_org_mapping row, no such tenant) stay NULL — floaters
-- stay NULL by design (T+tags home-project tag, recon §2).
-- ─────────────────────────────────────────────────────────────
UPDATE pos_users SET project_id = (
  SELECT p.id FROM projects p
  WHERE p.tenant_id = pos_users.tenant_id AND p.deleted_at IS NULL
  ORDER BY p.created_at ASC, p.id ASC LIMIT 1
) WHERE project_id IS NULL
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.tenant_id = pos_users.tenant_id AND p.deleted_at IS NULL
  );

-- ─────────────────────────────────────────────────────────────
-- 15. pos_stores — PARTIAL: organization_id → tenant_org_mapping.tenant_id →
-- tenant default. Locally 1/45 (mapped org 2 only); the 44 stores in orgs 3–46
-- with no mapping row stay NULL (store→project binding is convention-only,
-- recon §12 Q1 — enforcement would enshrine bad defaults).
-- ─────────────────────────────────────────────────────────────
UPDATE pos_stores SET project_id = (
  SELECT p.id FROM projects p
  JOIN tenant_org_mapping m ON m.tenant_id = p.tenant_id
  WHERE m.organization_id = pos_stores.organization_id
    AND p.deleted_at IS NULL
  ORDER BY p.created_at ASC, p.id ASC LIMIT 1
) WHERE project_id IS NULL;

-- NO statement for promotions (tenant-wide promos keep NULL — "no forced
-- defaulting", recon §2), carts (ephemeral session rows, recon §12 Q3 analogy),
-- or storefront_orders (read-only legacy, recon §12 Q4).

-- ─────────────────────────────────────────────────────────────
-- VERIFY (post-apply, read-only — comments only, not executed statements).
-- Expected residuals per recon §1a (local): ENFORCE tables 0; orders /
-- pos_transactions NULL only for genuinely multi-project rows (locally 0);
-- pos_users 42 orphan rows; pos_stores 44 unmapped rows.
-- ─────────────────────────────────────────────────────────────
-- SELECT 'rooms_new', COUNT(*) FROM rooms_new WHERE project_id IS NULL;               -- expect 0
-- SELECT 'rate_plans_new', COUNT(*) FROM rate_plans_new WHERE project_id IS NULL;     -- expect 0
-- SELECT 'pos_products', COUNT(*) FROM pos_products WHERE project_id IS NULL;         -- expect 0
-- SELECT 'orders', COUNT(*) FROM orders WHERE project_id IS NULL;                     -- expect 0 locally (multi-project residuals only)
-- SELECT 'order_items', COUNT(*) FROM order_items WHERE project_id IS NULL;           -- expect 0
-- SELECT 'pos_transactions', COUNT(*) FROM pos_transactions WHERE project_id IS NULL; -- expect 0 locally (multi-project residuals only)
-- SELECT 'pos_transaction_items', COUNT(*) FROM pos_transaction_items WHERE project_id IS NULL; -- expect 0
-- SELECT 'inventory_adjustments', COUNT(*) FROM inventory_adjustments WHERE project_id IS NULL; -- expect 0
-- SELECT 'meals', COUNT(*) FROM meals WHERE project_id IS NULL;                       -- expect 0
-- SELECT 'meal_categories', COUNT(*) FROM meal_categories WHERE project_id IS NULL;   -- expect 0
-- SELECT 'meal_schedules', COUNT(*) FROM meal_schedules WHERE project_id IS NULL;     -- expect 0
-- SELECT 'pos_tables', COUNT(*) FROM pos_tables WHERE project_id IS NULL;             -- expect 0
-- SELECT 'service_items', COUNT(*) FROM service_items WHERE project_id IS NULL;       -- expect 0
-- SELECT 'pos_users', COUNT(*) FROM pos_users WHERE project_id IS NULL;               -- expect 42 (documented orphans)
-- SELECT 'pos_stores', COUNT(*) FROM pos_stores WHERE project_id IS NULL;             -- expect 44 (unmapped orgs)
