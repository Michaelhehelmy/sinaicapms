-- Migration 0126: tenant-scoped UNIQUE on pos_products.sku + pos_users
-- email/username (manifest blocker D3).
--
-- WHAT: rebuilds 2 tables, replacing three GLOBAL inline UNIQUEs with
-- tenant-scoped UNIQUE INDEXes:
--   pos_products:  `sku TEXT UNIQUE NOT NULL`   → `sku TEXT NOT NULL`
--                  + UNIQUE INDEX (tenant_id, sku)
--   pos_users:     `username TEXT UNIQUE NOT NULL` → `username TEXT NOT NULL`
--                  `email    TEXT UNIQUE NOT NULL` → `email    TEXT NOT NULL`
--                  + UNIQUE INDEX (tenant_id, username) / (tenant_id, email)
-- No other table is rebuilt: `pos_products.barcode TEXT UNIQUE` is deliberately
-- left GLOBAL (a barcode is a manufacturer-assigned EAN/UPC — two tenants
-- scanning the same packaged SKU legitimately share it, and unlike `sku` it is
-- not an authoring field in the manifest schema), and no other table carries an
-- inline UNIQUE that blocks multi-tenant authoring.
--
-- WHY: POST /api/tenants/import refuses to load the SAME catalog into two
-- tenants. Every uniqueness arbiter on the three import-written columns was
-- global, so two overlapping manifests (the same products/rooms/menu/staff
-- data, e.g. an agency template imported for tenant A and tenant B) collided
-- with `UNIQUE constraint failed: pos_products.sku` — surfacing as a 409
-- "One or more products already exist (duplicate SKU or ID)" / generic 500 and
-- making the second import impossible. pos_users is worse than a nuisance:
-- staff emails/usernames are per-tenant credentials, so forcing them globally
-- unique leaks tenant existence and blocks the common "same agency staff
-- accounts at two camps" case. Scoping the arbiter to (tenant_id, …) makes the
-- DB agree with what every writer already assumes — pos-users.js:196-200
-- already probes duplicates by `organization_id`, and pos-barcode.js:21 already
-- scopes the (sku, barcode) lookup by `tenant_id`. NO read path in backend/src
-- relied on the global arbiter (verified: no `WHERE sku = ?` / `WHERE email = ?`
-- probe outside a tenant/organization scope), so no query changes are needed.
--
-- TENANT-SCOPE MECHANICS: `tenant_id` is NOT NULL on pos_products (0112 removed
-- the DEFAULT but kept NOT NULL) and NULLable on pos_users (legacy rows). SQLite
-- treats NULLs as distinct inside a UNIQUE index, so legacy NULL-tenant
-- pos_users rows are NOT covered by the new arbiter. That is intentional and
-- matches the read paths (every pos_users probe is by id or organization_id);
-- the census below proves no NULL-tenant row exists today, and new rows always
-- bind an explicit tenant_id (tenant-import.js:547, pos-users.js).
--
-- PRE-EXISTING DUPE CENSUS (production D1 campmaster-db, 2026-09-30,
-- read-only `wrangler d1 execute --remote --command "SELECT …"`, zero writes):
--   pos_products                                       0 rows (0 tenants)
--   pos_products duplicate (tenant_id, sku) groups    0
--   pos_users                                          1 row
--   pos_users  tenant_id IS NULL                      0
--   pos_users  duplicate (tenant_id, email) groups    0
--   pos_users  duplicate (tenant_id, username) groups 0
--   pos_users  duplicate email among NULL-tenant rows 0
-- Every new index therefore builds with zero conflicts, and NO cleanup
-- migration (0127) is warranted: the census proves there is no duplicate or
-- orphan row to merge. Per the D3 mission rule the copies below stay
-- fail-closed (plain INSERT…SELECT, no OR IGNORE) — an environment that DOES
-- carry per-tenant duplicates aborts the apply loudly instead of silently
-- dropping a row, and the arbiter is then created only after the copy succeeds.
--
-- SLOT: the migration ledger head is 0124 (0109 is reserved-but-absent — see
-- 0110:20-25). This file takes slot 0126 as assigned by the D3 mission spec.
--
-- Rebuild idiom (precedent 0106/0107/0111/0112, replicated verbatim):
-- `PRAGMA defer_foreign_keys = true` → CREATE real (non-TEMP — D1 blocks temp)
-- staging tables → copy-ALL → drop-ALL-olds → rename-ALL → guard RESTORE →
-- recreate ALL indexes + triggers → `PRAGMA defer_foreign_keys = false` +
-- `PRAGMA foreign_key_check`. Never `foreign_keys=OFF` (skill).
--
-- FK-ACTION SEMANTICS under D1 (enforcement ≡ PRAGMA foreign_keys=ON; same
-- verification as 0111/0112, 2026-09-24, SQLite 3.45.1):
-- Inbound edges on pos_products: rooms_new (RESTRICT), pos_transaction_items +
-- pos_recipe_ingredients (NO ACTION), rate_plans_new (CASCADE),
-- storefront_order_items (SET NULL, added by 0123). Inbound edge on pos_users:
-- pos_stores.manager_id (NO ACTION).
--   - RESTRICT / NO ACTION: the DROP's implicit DELETE is deferred and
--     COMMIT-validated, so keys are simply repopulated by the copies below. No
--     guard needed.
--   - CASCADE / SET NULL: fire IMMEDIATELY by table NAME (never deferred) — the
--     two non-rebuilt dependents are guard-saved BEFORE any DROP and restored
--     AFTER the renames (0111/0112 guard pattern).
-- Rebuild-to-rebuild edges: none (neither rebuilt table is an FK target of the
-- other), so no staging-name rewrites are required.
--
-- GUARDS: rate_plans_new (full-row save + DELETE-free INSERT restore — CASCADE
-- wiped every referencing row) and storefront_order_items (id + product_id save,
-- UPDATE restore — SET NULL blanked product_id). Both get IF-NOT-EXISTS stubs
-- (no FKs, minimal shape) so a minimal-schema replay stays safe and no-ops
-- where the tables are empty.
--
-- GENERATED-COLUMN EXCLUSIONS: pos_products.profit_margin and pos_users.name
-- (`first_name || ' ' || last_name`) are GENERATED ALWAYS STORED — declared in
-- the new CREATEs, EXCLUDED from the INSERT…SELECT lists so they recompute
-- (0111/0112 pattern). pos_users.name keeps its position (after updated_at) so
-- the rebuild is column-order-identical to the live table for any positional
-- reader; id (INTEGER PRIMARY KEY AUTOINCREMENT) is copied explicitly, and
-- SQLite carries the sqlite_sequence high-water mark across the rename.
--
-- AUTOINCREMENT SAFETY: pos_users.id is INTEGER PRIMARY KEY AUTOINCREMENT.
-- DROP TABLE removes its sqlite_sequence row and the staging table's own
-- sequence row is renamed onto the final name, so the sequence high-water mark
-- (= max copied id) survives the swap and later inserts still never collide
-- with a legacy id.
--
-- INDEX RECREATION: the DROPs destroy every index, so ALL pre-existing indexes
-- on both tables are recreated (17 pos_products + 15 pos_users, verified
-- against the 0124-head local replay), plus the 3 new UNIQUE ones, all IF NOT
-- EXISTS so both envs converge without error.
--
-- ROLLBACK SAFETY (hard rule 7): table rebuilds are forward-only — there is no
-- down-migration. Rollback = restore-from-backup ("locker") procedure, stated
-- in the S-D apply commit body. Do NOT attempt DROP/rename reversals once writes
-- land on the rebuilt tables.
--
-- No KV writes (free-plan 1,000 writes/day quota).

PRAGMA defer_foreign_keys = true;

-- Trigger-drop-first (0047 lesson): update_products_timestamp is ON
-- pos_products and update_users_timestamp is ON pos_users — BOTH tables are
-- rebuilt below, so both triggers are dropped first and recreated AFTER the
-- renames (0112 only had to handle the products one because pos_users was left
-- alone).
DROP TRIGGER IF EXISTS update_products_timestamp;
DROP TRIGGER IF EXISTS update_users_timestamp;

-- ══════════════════════════════════════════════════════════════
-- GUARD SAVE (non-rebuilt CASCADE / SET NULL dependents) — BEFORE any DROP.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rate_plans_new (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, product_id TEXT NOT NULL, camp_id TEXT, name TEXT NOT NULL, season TEXT DEFAULT 'all', start_date TEXT, end_date TEXT, price_per_night REAL NOT NULL, min_stay INTEGER DEFAULT 1, is_active INTEGER DEFAULT 1);
CREATE TABLE _guard_rate_plans_new AS SELECT * FROM rate_plans_new;
CREATE TABLE IF NOT EXISTS storefront_order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT, product_name TEXT NOT NULL, quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0, total_price REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, project_id TEXT);
CREATE TABLE _guard_storefront_order_items AS SELECT id, product_id FROM storefront_order_items;

-- ══════════════════════════════════════════════════════════════
-- PHASE A: create-ALL staging tables.
-- Column lists preserved verbatim from the live DDL (0004_pos.sql as rebuilt by
-- 0112 + 0100's project_id ALTER for pos_users); the ONLY change is the removal
-- of the three global inline UNIQUE clauses. Defaults, CHECKs, NOT NULL, FK
-- targets/actions and column ORDER are unchanged.
-- ══════════════════════════════════════════════════════════════

-- A1. pos_products (GENERATED profit_margin declared, EXCLUDED from the copy)
CREATE TABLE pos_products_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  organization_id INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER,
  brand_id INTEGER,
  supplier_id INTEGER,
  sku TEXT NOT NULL,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  short_description TEXT,
  images JSON DEFAULT '[]',
  cost_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
  selling_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
  compare_price DECIMAL(10,2),
  profit_margin REAL GENERATED ALWAYS AS (
    CASE
      WHEN selling_price > 0 THEN ((selling_price - cost_price) / selling_price) * 100
      ELSE 0
    END
  ) STORED,
  weight REAL,
  dimensions JSON DEFAULT '{}',
  unit TEXT DEFAULT 'pcs',
  min_stock_level INTEGER DEFAULT 10,
  max_stock_level INTEGER DEFAULT 1000,
  reorder_point INTEGER DEFAULT 20,
  is_trackable BOOLEAN DEFAULT TRUE,
  is_serialized BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  tags JSON DEFAULT '[]',
  attributes JSON DEFAULT '{}',
  seo_title TEXT,
  seo_description TEXT,
  type TEXT CHECK(type IN ('room','menu','buffet','retail')) DEFAULT 'retail',
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  stock_quantity INTEGER DEFAULT 0,
  image_url TEXT,
  tax_rate DECIMAL(5,2) DEFAULT 0.0,
  camp_id TEXT,
  capacity INTEGER DEFAULT 1,
  variant_of TEXT,
  variant_attributes TEXT DEFAULT '{}',
  supplier_name TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- A2. pos_users (GENERATED name declared in its live position and EXCLUDED from
-- the copy; parents pos_organizations / pos_stores / projects are NOT rebuilt —
-- targets unchanged)
CREATE TABLE pos_users_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    store_id INTEGER,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'cashier',
    permissions JSON DEFAULT '[]',
    employee_id TEXT,
    department TEXT,
    hire_date DATE,
    salary DECIMAL(10,2),
    commission_rate REAL DEFAULT 0.0,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    last_login_at DATETIME,
    password_reset_token TEXT,
    password_reset_expires DATETIME,
    two_factor_secret TEXT,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    login_attempts INTEGER DEFAULT 0,
    locked_until DATETIME,
    pos_settings JSON DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    tenant_id TEXT,
    deleted_at DATETIME,
    last_login DATETIME,
    status TEXT DEFAULT 'active',
    camp_id TEXT,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
    FOREIGN KEY (store_id) REFERENCES pos_stores(id)
);

-- ══════════════════════════════════════════════════════════════
-- PHASE B: copy-ALL (plain INSERT — fail-closed on column drift, no OR IGNORE).
-- ══════════════════════════════════════════════════════════════

INSERT INTO pos_products_new (
  id, tenant_id, organization_id, category_id, brand_id, supplier_id, sku,
  barcode, name, description, short_description, images, cost_price,
  selling_price, compare_price, weight, dimensions, unit, min_stock_level,
  max_stock_level, reorder_point, is_trackable, is_serialized, is_active,
  is_featured, tags, attributes, seo_title, seo_description, type, deleted_at,
  created_at, updated_at, stock_quantity, image_url, tax_rate, camp_id, capacity,
  variant_of, variant_attributes, supplier_name, project_id
)
SELECT
  id, tenant_id, organization_id, category_id, brand_id, supplier_id, sku,
  barcode, name, description, short_description, images, cost_price,
  selling_price, compare_price, weight, dimensions, unit, min_stock_level,
  max_stock_level, reorder_point, is_trackable, is_serialized, is_active,
  is_featured, tags, attributes, seo_title, seo_description, type, deleted_at,
  created_at, updated_at, stock_quantity, image_url, tax_rate, camp_id, capacity,
  variant_of, variant_attributes, supplier_name, project_id
FROM pos_products;

INSERT INTO pos_users_new (
  id, organization_id, store_id, username, email, password_hash, first_name,
  last_name, phone, avatar_url, role, permissions, employee_id, department,
  hire_date, salary, commission_rate, is_active, is_verified, last_login_at,
  password_reset_token, password_reset_expires, two_factor_secret,
  two_factor_enabled, login_attempts, locked_until, pos_settings, created_at,
  updated_at, tenant_id, deleted_at, last_login, status, camp_id, project_id
)
SELECT
  id, organization_id, store_id, username, email, password_hash, first_name,
  last_name, phone, avatar_url, role, permissions, employee_id, department,
  hire_date, salary, commission_rate, is_active, is_verified, last_login_at,
  password_reset_token, password_reset_expires, two_factor_secret,
  two_factor_enabled, login_attempts, locked_until, pos_settings, created_at,
  updated_at, tenant_id, deleted_at, last_login, status, camp_id, project_id
FROM pos_users;

-- ══════════════════════════════════════════════════════════════
-- PHASE C: drop-ALL-olds. No rebuilt-to-rebuilt edge exists, so the order is
-- irrelevant; RESTRICT/NO ACTION referrers are deferred to COMMIT by the top
-- PRAGMA and validate against the repopulated final tables.
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS pos_users;
DROP TABLE IF EXISTS pos_products;

-- ══════════════════════════════════════════════════════════════
-- PHASE D: rename-ALL to final names.
-- ══════════════════════════════════════════════════════════════
ALTER TABLE pos_products_new RENAME TO pos_products;
ALTER TABLE pos_users_new RENAME TO pos_users;

-- ══════════════════════════════════════════════════════════════
-- PHASE E: guard RESTORE (non-rebuilt dependents) — AFTER the renames so parent
-- linkage verifies against the FINAL tables.
-- rate_plans_new: every row was cascade-deleted by the old-pos_products drop
--   (each row's product_id necessarily existed in pos_products, else the FK was
--   already invalid) → plain INSERT back.
-- storefront_order_items: product_id was SET NULL'd for rows that pointed at a
--   real product → UPDATE back by id. Rows whose product_id was a grandfathered
--   mirror-only id (0123 note) were never NULLed and are left untouched.
-- ══════════════════════════════════════════════════════════════
INSERT INTO rate_plans_new SELECT * FROM _guard_rate_plans_new;
UPDATE storefront_order_items SET product_id = (
  SELECT g.product_id FROM _guard_storefront_order_items g WHERE g.id = storefront_order_items.id
)
WHERE product_id IS NULL
  AND EXISTS (
    SELECT 1 FROM _guard_storefront_order_items g
    WHERE g.id = storefront_order_items.id AND g.product_id IS NOT NULL
  );

-- ══════════════════════════════════════════════════════════════
-- PHASE F: recreate ALL pre-existing indexes (the DROPs destroyed them) + the
-- 3 new tenant-scoped UNIQUE arbiters, all IF NOT EXISTS so both envs converge.
-- ══════════════════════════════════════════════════════════════
-- pos_products — the arbiter this migration exists for (D3).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_products_tenant_sku_unique ON pos_products(tenant_id, sku);
-- pos_products — 0004/0111/0112 baseline sets (sku index kept non-unique)
CREATE INDEX IF NOT EXISTS idx_pos_products_camp ON pos_products(camp_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_type ON pos_products(type);
CREATE INDEX IF NOT EXISTS idx_pos_products_tenant_type ON pos_products(tenant_id, type, is_active);
CREATE INDEX IF NOT EXISTS idx_pos_products_deleted ON pos_products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_pos_products_active_tenant ON pos_products(is_active, tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_pos_products_tenant ON pos_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_org ON pos_products(organization_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_category ON pos_products(category_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_active ON pos_products(is_active, deleted_at);
CREATE INDEX IF NOT EXISTS idx_pos_products_stock ON pos_products(stock_quantity, min_stock_level);
CREATE INDEX IF NOT EXISTS idx_pos_products_barcode ON pos_products(barcode);
CREATE INDEX IF NOT EXISTS idx_pos_products_project ON pos_products(project_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON pos_products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON pos_products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON pos_products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_organization ON pos_products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON pos_products(sku);
-- pos_users — the arbiters this migration exists for (D3)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_users_tenant_email_unique ON pos_users(tenant_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_users_tenant_username_unique ON pos_users(tenant_id, username);
-- pos_users — 0004 baseline + 0100 project_id indexes + 0107 filtered index
CREATE INDEX IF NOT EXISTS idx_pos_users_email ON pos_users(email);
CREATE INDEX IF NOT EXISTS idx_pos_users_email_tenant ON pos_users(email, tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_email_username ON pos_users(email, username, tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_org ON pos_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_password_reset_token ON pos_users(password_reset_token);
CREATE INDEX IF NOT EXISTS idx_pos_users_role ON pos_users(role);
CREATE INDEX IF NOT EXISTS idx_pos_users_status ON pos_users(status);
CREATE INDEX IF NOT EXISTS idx_pos_users_tenant ON pos_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_username ON pos_users(username);
CREATE INDEX IF NOT EXISTS idx_pos_users_tenant_role ON pos_users(tenant_id, role, deleted_at);
CREATE INDEX IF NOT EXISTS idx_pos_users_project ON pos_users(project_id);
CREATE INDEX IF NOT EXISTS idx_pos_users_project_nn ON pos_users(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_email ON pos_users(email);
CREATE INDEX IF NOT EXISTS idx_users_organization_store ON pos_users(organization_id, store_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON pos_users(role);

-- Recreate the updated_at triggers dropped above (0004/0010 shapes verbatim)
DROP TRIGGER IF EXISTS update_products_timestamp;
CREATE TRIGGER update_products_timestamp
    AFTER UPDATE ON pos_products
    BEGIN
        UPDATE pos_products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

DROP TRIGGER IF EXISTS update_users_timestamp;
CREATE TRIGGER update_users_timestamp
    AFTER UPDATE ON pos_users
    BEGIN
        UPDATE pos_users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Guard cleanup (the rate_plans_new / storefront_order_items stubs are NOT
-- dropped — real on every D1 DB, empty no-ops in a stub replay).
DROP TABLE IF EXISTS _guard_rate_plans_new;
DROP TABLE IF EXISTS _guard_storefront_order_items;

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain (rooms_new RESTRICT chain, pos_transaction_items /
-- pos_recipe_ingredients NO ACTION, pos_stores.manager_id NO ACTION, the
-- rate_plans_new / storefront_order_items guard restores above).
PRAGMA foreign_key_check;
