-- Migration 0051: Remove all seed/mock data from the production database
-- Cleans up data inserted by 0002_seed.sql, 0004_seed_tenants.sql, 0006_room_type_images.sql,
-- 0012_seed_pos_defaults.sql, 0020_unify_inventory.sql, 0041_create_tenant_org_mapping.sql,
-- 0043_seed_e2e_pos_user.sql plus E2E residue (leads, test tenant).
--
-- Deletion order is FK-safe:
--   pos_recipe_ingredients (FK -> pos_products)  -> product_camps -> plans -> revenue
--   -> financial_transactions (FK -> financial_accounts) -> pos_users (FK -> pos_organizations/pos_stores)
--   -> pos_products -> financial_accounts -> camps -> tenant_org_mapping -> pos_stores
--   -> pos_organizations -> leads -> test tenant
--
-- Kept intentionally: marketplace tenant, real tenants (acaciacamp, michaelshouse),
-- languages/order_states (0029 seed), empty schema tables.

-- 1. pos_recipe_ingredients (seed rows referencing pos_products)
DELETE FROM pos_recipe_ingredients WHERE id IN ('mi_1', 'mi_2', 'mi_3', 'mi_4');

-- 2. product_camps (seed rows mapping pos_products to camps)
DELETE FROM product_camps WHERE camp_id IN ('camp_1', 'camp_2');

-- 3. plans (seed rows, FK to camps)
DELETE FROM plans WHERE id IN ('pln_1', 'pln_2', 'pln_3') AND camp_id IN ('camp_1', 'camp_2');

-- 4. revenue (seed rows, FK to camps)
DELETE FROM revenue WHERE id IN ('rev_1', 'rev_2') AND camp_id IN ('camp_1', 'camp_2');

-- 5. financial_transactions (seed row, FK to financial_accounts)
DELETE FROM financial_transactions WHERE id = 'tx_1' AND account_id IN ('acc_1', 'acc_2', 'acc_3', 'acc_4', 'acc_5', 'acc_6', 'acc_cash_1783614962124', 'acc_bank_1783614962208');

-- 6. pos_users (seed rows, FK to pos_organizations/pos_stores)
DELETE FROM pos_users WHERE username IN ('admin1', 'haloom', 'cashier');

-- 7. pos_products (seed rows, now safe after children deleted)
DELETE FROM pos_products WHERE id IN (
  'meal_1', 'meal_2', 'ing_1', 'ing_2', 'ing_3',
  'rt_acacia_bungalow', 'rt_acacia_room', 'rt_acacia_cabin', 'rt_acacia_suite',
  'meal_3', 'ing_4', 'rt_4', 'rt_5'
);

-- 8. financial_accounts (seed rows)
DELETE FROM financial_accounts WHERE id IN (
  'acc_1', 'acc_2', 'acc_3', 'acc_4', 'acc_5', 'acc_6',
  'acc_cash_1783614962124', 'acc_bank_1783614962208'
);

-- 9. camps (seed rows)
DELETE FROM camps WHERE id IN ('camp_1', 'camp_2');

-- 10. tenant_org_mapping (seed mapping acaciacamp -> org 1)
DELETE FROM tenant_org_mapping WHERE tenant_id = 'acaciacamp' AND organization_id = 1;

-- 11. pos_stores (seed store)
DELETE FROM pos_stores WHERE id = 1;

-- 12. pos_organizations (seed organization)
DELETE FROM pos_organizations WHERE id = 1;

-- 13. leads (all 12 are E2E residue)
DELETE FROM leads;

-- 14. Test tenant created by E2E prod tests
DELETE FROM tenants WHERE id = 'pos-prod-test-1783614960781';
