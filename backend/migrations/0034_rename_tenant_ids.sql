-- Migration 0034: Rename tenant IDs from generic (tenant_1, tenant_2) to meaningful slugs
-- tenant_1 → acaciacamp (Acacia Camp, subdomain: acacia, custom_domain: acaciacamp.com)
-- tenant_2 → michaelshouse (Michael's House, subdomain: michaelshouse)
-- marketplace stays as 'marketplace'
--
-- D1 batch mode does NOT honor PRAGMA foreign_keys within a batch.
-- Strategy: use temporary holding tenants so children never reference a missing parent.
--   1. Create holding tenants
--   2. Move all children to holding tenants
--   3. Rename original tenant PKs
--   4. Move children back to the renamed tenants
--   5. Delete holding tenants

-- Step 1: Create temporary holding tenants
INSERT INTO tenants (id, name, status) VALUES ('__h1__', 'Holding 1', 'inactive');
INSERT INTO tenants (id, name, status) VALUES ('__h2__', 'Holding 2', 'inactive');

-- Step 2: Move all child tables from tenant_1 → __h1__ and tenant_2 → __h2__

-- Core tables (0001_init.sql)
UPDATE camps SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE camps SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE room_types SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE room_types SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE rooms SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE rooms SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE rate_plans SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE rate_plans SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE reservations SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE reservations SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE expenses SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE expenses SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE meals SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE meals SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE plans SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE plans SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE financial_accounts SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE financial_accounts SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE financial_transactions SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE financial_transactions SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE revenue SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE revenue SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE leads SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE leads SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

-- POS tables (0010_pos_integration.sql)
UPDATE pos_products SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE pos_products SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE pos_transactions SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE pos_transactions SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE pos_transaction_items SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE pos_transaction_items SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE pos_recipe_ingredients SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE pos_recipe_ingredients SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

-- New tables (0028_create_new_tables.sql)
UPDATE admins SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE admins SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE products SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE products SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE rate_plans_new SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE rate_plans_new SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE customers SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE customers SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE orders SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE orders SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

UPDATE meal_categories SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE meal_categories SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

-- Categories (0031 — tenant_id is nullable, global=NULL)
UPDATE categories SET tenant_id = '__h1__' WHERE tenant_id = 'tenant_1';
UPDATE categories SET tenant_id = '__h2__' WHERE tenant_id = 'tenant_2';

-- Step 3: Rename the primary keys (no children reference tenant_1/tenant_2 anymore)
UPDATE tenants SET id = 'acaciacamp' WHERE id = 'tenant_1';
UPDATE tenants SET id = 'michaelshouse' WHERE id = 'tenant_2';

-- Step 4: Move children back from holding tenants to the renamed tenants

-- Core tables
UPDATE camps SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE camps SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE room_types SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE room_types SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE rooms SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE rooms SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE rate_plans SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE rate_plans SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE reservations SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE reservations SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE expenses SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE expenses SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE meals SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE meals SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE plans SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE plans SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE financial_accounts SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE financial_accounts SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE financial_transactions SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE financial_transactions SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE revenue SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE revenue SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE leads SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE leads SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

-- POS tables
UPDATE pos_products SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE pos_products SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE pos_transactions SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE pos_transactions SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE pos_transaction_items SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE pos_transaction_items SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE pos_recipe_ingredients SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE pos_recipe_ingredients SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

-- New tables
UPDATE admins SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE admins SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE products SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE products SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE rate_plans_new SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE rate_plans_new SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE customers SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE customers SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE orders SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE orders SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

UPDATE meal_categories SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE meal_categories SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

-- Categories
UPDATE categories SET tenant_id = 'acaciacamp' WHERE tenant_id = '__h1__';
UPDATE categories SET tenant_id = 'michaelshouse' WHERE tenant_id = '__h2__';

-- Step 5: Delete holding tenants (no children reference them anymore)
DELETE FROM tenants WHERE id IN ('__h1__', '__h2__');
