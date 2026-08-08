-- Migration 0038: Add performance indexes identified by schema audit
-- Addresses missing composite indexes on high-frequency query paths
-- All statements use IF NOT EXISTS for idempotency

-- ============================================================
-- 1. pos_shifts: Active shift lookup
-- Query: SELECT id FROM pos_shifts WHERE tenant_id = ? AND cashier_id = ? AND status = 'open'
-- Existing idx_shifts_tenant_cashier(tenant_id, cashier_id) covers first 2 cols,
-- but adding status makes this a covering index for the open-shift check.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_cashier_status
  ON pos_shifts(tenant_id, cashier_id, status);

-- ============================================================
-- 2. meal_schedules: Weekly meal planning
-- Query: WHERE ms.tenant_id = ? AND ms.camp_id = ? AND ms.date >= ? AND ms.date <= ?
-- Existing idx_meal_schedules_tenant_date(tenant_id, date) and
-- idx_meal_schedules_camp_date(camp_id, date) are partial — neither covers
-- the common tenant+camp+date triple filter used by the meal planner UI.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant_camp_date
  ON meal_schedules(tenant_id, camp_id, date);

-- ============================================================
-- 3. meal_schedules: JOIN on meal_id
-- Query: LEFT JOIN meals m ON m.id = ms.meal_id
-- No existing index on meal_id for meal_schedules.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_meal_schedules_meal
  ON meal_schedules(meal_id);

-- ============================================================
-- 4. orders: Availability overlap check
-- Query: WHERE tenant_id = ? AND room_id = ? AND (check_in_date < ? AND check_out_date > ?)
--        AND order_state_id != 'cancelled'
-- Existing idx_orders_dates(check_in_date, check_out_date) does not include
-- tenant_id or room_id, forcing a full scan before the date filter.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_tenant_room_dates
  ON orders(tenant_id, room_id, check_in_date, check_out_date);

-- ============================================================
-- 5. orders: Status filtering within tenant
-- Query: WHERE tenant_id = ? AND order_state_id != 'cancelled' (used in dashboards)
-- Existing idx_orders_tenant(tenant_id) is single-column only.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_tenant_state
  ON orders(tenant_id, order_state_id);

-- ============================================================
-- 6. pos_recipe_ingredients: Tenant-scoped recipe lookups
-- Query: SELECT ingredient_id, quantity FROM pos_recipe_ingredients WHERE product_id = ?
-- Existing idx_recipe_product(product_id) exists but lacks tenant_id prefix
-- for tenant-isolated queries. Adding tenant_id improves multi-tenant safety.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_recipe_tenant_product
  ON pos_recipe_ingredients(tenant_id, product_id);

-- ============================================================
-- 7. pos_products: Soft-delete filter (exclude deleted in queries)
-- Query: WHERE tenant_id = ? AND type = 'room' AND deleted_at IS NULL
-- Existing idx_pos_products_tenant_type covers tenant_id + type,
-- but adding is_active and filtering on deleted_at benefits common list queries.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pos_products_active_tenant
  ON pos_products(is_active, tenant_id, type);

-- ============================================================
-- 8. meal_schedules: Composite for DELETE cascade on camp removal
-- Query: DELETE FROM meal_schedules WHERE camp_id = ?
-- No index on camp_id alone; existing idx_meal_schedules_camp_date(camp_id, date)
-- covers camp_id but the date suffix is unnecessary for DELETE operations.
-- The existing index is sufficient — skip adding a redundant one.
-- ============================================================

-- ============================================================
-- 9. orders: Room availability for camp deletion cascade
-- Query: DELETE FROM orders WHERE tenant_id = ? AND room_id IN (SELECT id FROM rooms_new WHERE camp_id = ?)
-- Covered by idx_orders_tenant_room_dates added above.
-- ============================================================
