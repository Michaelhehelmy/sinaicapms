-- Migration 0111: fix the project_id NOT NULL + ON DELETE SET NULL contradiction
-- (P0 — 11 tables).
--
-- WHAT: rebuilds 11 tables flipping `project_id TEXT NOT NULL REFERENCES
-- projects(id) ON DELETE SET NULL` → `project_id TEXT REFERENCES projects(id)
-- ON DELETE SET NULL` (NOT NULL dropped, REFERENCES clause preserved verbatim).
-- A NOT NULL column with ON DELETE SET NULL is a contradiction: deleting a
-- parent project would try to SET NULL a NOT NULL column, so the delete fails
-- instead of orphaning. Full column lists, defaults, CHECKs, FK targets/actions
-- (except the staging edges below) and tenant_id DEFAULTs are preserved
-- verbatim — tenant_id DEFAULT removal is owned by 0112, not here.
--
-- Recon ground truth: /tmp/opencode/s-recon.md §1 (11/11 CONFIRMED on both DBs —
-- order_items in 0106 + 10 in 0107; live string per table is exactly
-- `project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL`),
-- §5 (repo-wide scan proves no 12th occurrence), §6 (this file = the 0111 leg
-- of the 0111/0112/0113 split), §7 (ledger head is 0110, 0109 absent — 0111 is
-- the correct next number).
--
-- Tables covered (11): order_items (0106:62 CREATE), pos_products (0107:A1),
-- meal_categories (0107:A2), meals (0107:A3), pos_tables (0107:A4),
-- rooms_new (0107:A5), rate_plans_new (0107:A6), meal_schedules (0107:A7),
-- service_items (0107:A8), inventory_adjustments (0107:A9),
-- pos_transaction_items (0107:A10).
--
-- GATE: nullability only relaxes, so no NULL-count pre-check is required (any
-- existing value — NULL or not — survives). The plain-INSERT copies below are
-- still fail-closed (no OR IGNORE): a column-list drift between CREATE and
-- live DDL aborts loudly instead of silently dropping rows, and D1 applies
-- each migration atomically so reruns are safe.
--
-- Rebuild idiom (precedent 0106/0107, which this file replicates):
-- `PRAGMA defer_foreign_keys = true` → CREATE real (non-TEMP — D1 blocks temp)
-- staging tables → copy-ALL → drop-ALL-olds (children-first) → rename-ALL
-- (parents-first) → `PRAGMA defer_foreign_keys = false` +
-- `PRAGMA foreign_key_check`. Never `foreign_keys=OFF` (skill).
--
-- FK-ACTION SEMANTICS under D1 (enforcement ≡ PRAGMA foreign_keys=ON;
-- verified 2026-09-24 on SQLite 3.45.1 using the exact D1 pattern — explicit
-- transaction + PRAGMA defer_foreign_keys set INSIDE it):
--   - RESTRICT (orders.room_id → rooms_new, rooms_new.product_id → pos_products):
--     DROP TABLE of the parent is DEFERRED and COMMIT-validated, so drops
--     succeed with live chains as long as keys are repopulated before COMMIT
--     (the copies below do this). No guard needed.
--   - CASCADE / SET NULL (meal_lang → meals, meal_categories_lang →
--     meal_categories, service_bookings → service_items, order_discounts →
--     pos_transactions/pos_transaction_items, orders.table_id +
--     pos_transactions.table_id → pos_tables): DROP fires the action
--     IMMEDIATELY by table NAME (never deferred) — non-rebuilt dependents are
--     guard-saved BEFORE any DROP and restored AFTER the renames.
-- Rebuilt-to-rebuilt FK edges in the staging CREATEs point at STAGING parent
-- names (0107 CASCADE-FIX) so DROP-ing an old parent cannot resolve to (and
-- wipe) the freshly copied staging child; SQLite rewrites those references to
-- the final names on RENAME.
--
-- GUARDS (0107 block replicated verbatim, plus two idiom-required extensions):
-- orders.table_id save + UPDATE restore, pos_transactions full-row save +
-- DELETE+INSERT restore, order_discounts + meal_lang IF-NOT-EXISTS stubs +
-- save/restore (all four copied from 0107) — PLUS meal_categories_lang and
-- service_bookings stubs + save/restore. Those two are non-rebuilt CASCADE
-- children of rebuilt parents (meal_categories, service_items) that 0107 left
-- unguarded; the CASCADE-FIX rule above requires them. Test-safe (same stub
-- pattern as 0107) and no-ops where the tables are empty.
--
-- GENERATED-COLUMN EXCLUSION: pos_products.profit_margin is GENERATED ALWAYS
-- STORED — declared in the new CREATE, EXCLUDED from the INSERT…SELECT list so
-- it recomputes (0107 pattern). No other rebuilt table has a GENERATED column.
--
-- INDEX RECREATION: the DROPs destroy indexes, so ALL pre-existing indexes are
-- recreated — the 0107 PHASE F / 0106 sets PLUS the duplicate-coverage baseline
-- names the 0107 file did not re-list (idx_rooms_camp, idx_rooms_status,
-- idx_si_definition, idx_si_tenant, idx_products_active, idx_products_barcode,
-- idx_products_category, idx_products_organization, idx_products_sku), all with
-- IF NOT EXISTS so both envs converge without error.
--
-- ROLLBACK SAFETY (hard rule 7): table rebuilds are forward-only — there is no
-- down-migration. Rollback = restore-from-backup ("locker") procedure, stated in
-- the S-D apply commit body. Do NOT attempt DROP/rename reversals once writes
-- land on the rebuilt tables.

PRAGMA defer_foreign_keys = true;

-- Trigger-drop-first (0047 lesson): live triggers ON tables being rebuilt would
-- break the DROP/RENAME swap. Recreated AFTER the renames below.
DROP TRIGGER IF EXISTS trg_rooms_new_updated_at;
DROP TRIGGER IF EXISTS update_products_timestamp;

-- ══════════════════════════════════════════════════════════════
-- GUARD SAVE (non-rebuilt dependents) — BEFORE any DROP.
-- orders stub HAS table_id → explicit id+table_id save is safe.
-- pos_transactions full-row SELECT * save never names columns (0107 pattern).
-- order_discounts + meal_lang (+ meal_categories_lang + service_bookings) are
-- IF-NOT-EXISTS stubs (no FKs, empty = no-op where absent; no-op in prod where
-- the real tables exist) making the SELECT * saves safe.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE _guard_orders_table AS SELECT id, table_id FROM orders WHERE table_id IS NOT NULL;
CREATE TABLE _guard_ptx AS SELECT * FROM pos_transactions;
CREATE TABLE IF NOT EXISTS order_discounts (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, order_id TEXT NOT NULL, discount_amount REAL DEFAULT 0);
CREATE TABLE _guard_order_discounts AS SELECT * FROM order_discounts;
CREATE TABLE IF NOT EXISTS meal_lang (meal_id TEXT, lang TEXT NOT NULL, name TEXT NOT NULL, description TEXT, PRIMARY KEY (meal_id, lang));
CREATE TABLE _guard_meal_lang AS SELECT * FROM meal_lang;
CREATE TABLE IF NOT EXISTS meal_categories_lang (meal_category_id TEXT, lang TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (meal_category_id, lang));
CREATE TABLE _guard_meal_categories_lang AS SELECT * FROM meal_categories_lang;
CREATE TABLE IF NOT EXISTS service_bookings (id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))), tenant_id TEXT NOT NULL, service_item_id TEXT NOT NULL, customer_name TEXT, customer_phone TEXT, scheduled_date DATETIME, status TEXT NOT NULL DEFAULT 'pending', notes TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, assigned_worker_id TEXT);
CREATE TABLE _guard_service_bookings AS SELECT * FROM service_bookings;

-- ══════════════════════════════════════════════════════════════
-- PHASE A: create-ALL staging tables.
-- Column lists preserved verbatim from 0106 (order_items) / 0107 (A1–A10);
-- the ONLY change vs the live DDL is `project_id TEXT NOT NULL …` →
-- `project_id TEXT …` (REFERENCES clause verbatim). Rebuilt-to-rebuilt FK
-- edges point at STAGING parents (0107 CASCADE-FIX); all other FK targets and
-- all actions (CASCADE/RESTRICT/SET NULL/NO ACTION) are unchanged.
-- ══════════════════════════════════════════════════════════════

-- A0. order_items (child of orders — parent NOT rebuilt, target unchanged)
CREATE TABLE order_items_new (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'room_night',
  reference_id TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  split_group INTEGER DEFAULT 1,
  course_number INTEGER DEFAULT 0,
  course_status TEXT DEFAULT 'pending' CHECK(course_status IN ('pending', 'served', 'completed')),
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- A1. pos_products (rebuild parent — no rebuilt-table FKs; GENERATED
-- profit_margin declared, EXCLUDED from the copy list below)
CREATE TABLE pos_products_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'acaciacamp',
  organization_id INTEGER NOT NULL DEFAULT 1,
  category_id INTEGER,
  brand_id INTEGER,
  supplier_id INTEGER,
  sku TEXT UNIQUE NOT NULL,
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

-- A2. meal_categories (rebuild parent — tenant/project only)
CREATE TABLE meal_categories_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- A3. meals (child of meal_categories_new staging — CASCADE action unchanged)
CREATE TABLE meals_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meal_category_id TEXT NOT NULL REFERENCES meal_categories_new(id) ON DELETE CASCADE,
  price REAL NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- A4. pos_tables (rebuild parent — tenant/project only; non-rebuilt
-- orders/pos_transactions.table_id SET NULL referrers are guarded above)
CREATE TABLE pos_tables_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 2,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'reserved', 'cleaning')),
  section TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  reservation_name TEXT,
  reservation_time TEXT,
  reservation_date TEXT,
  party_size INTEGER DEFAULT 0,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- A5. rooms_new (child of pos_products_new staging — RESTRICT action unchanged)
CREATE TABLE rooms_new_new (
  id TEXT PRIMARY KEY,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL REFERENCES pos_products_new(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'available',
  bed_type TEXT DEFAULT 'single',
  max_guests INTEGER DEFAULT 2,
  base_price REAL DEFAULT 0,
  floor TEXT,
  notes TEXT,
  is_active INTEGER DEFAULT 1,
  tenant_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  room_status TEXT DEFAULT 'available',
  cleaning_status TEXT DEFAULT 'clean' CHECK(cleaning_status IN ('dirty', 'in_progress', 'clean', 'inspected')),
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- A6. rate_plans_new (child of pos_products_new staging — CASCADE unchanged)
CREATE TABLE rate_plans_new_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES pos_products_new(id) ON DELETE CASCADE,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  season TEXT DEFAULT 'all',
  start_date TEXT,
  end_date TEXT,
  price_per_night REAL NOT NULL,
  min_stay INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- A7. meal_schedules (child of meals_new staging — CASCADE unchanged)
CREATE TABLE meal_schedules_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'all',
  max_servings INTEGER DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_id) REFERENCES meals_new(id) ON DELETE CASCADE
);

-- A8. service_items (0072:20-32 + price_tier/price_premium 0075:94-96; parents
-- tenants/service_definitions/projects are NOT rebuilt — targets unchanged)
CREATE TABLE service_items_new (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_definition_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_price REAL DEFAULT 0,
  meta_data JSON DEFAULT ('{}'),
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  price_tier TEXT DEFAULT 'standard' CHECK(price_tier IN ('standard', 'premium', 'luxury')),
  price_premium REAL DEFAULT 0
);

-- A9. inventory_adjustments (project only — no inbound FKs)
CREATE TABLE inventory_adjustments_new (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  adjustment INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT 'manual',
  reference TEXT,
  notes TEXT,
  created_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- A10. pos_transaction_items (product edge → pos_products_new staging, NO ACTION
-- unchanged; order edge → pos_transactions is NOT rebuilt — target unchanged)
CREATE TABLE pos_transaction_items_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_1',
  order_id TEXT NOT NULL,
  transaction_id TEXT,
  product_id TEXT NOT NULL,
  variant_id INTEGER,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.0,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  tax_amount DECIMAL(10,2) DEFAULT 0.0,
  discount_amount DECIMAL(10,2) DEFAULT 0.0,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id) REFERENCES pos_transactions(id),
  FOREIGN KEY (product_id) REFERENCES pos_products_new(id)
);

-- ══════════════════════════════════════════════════════════════
-- PHASE B: copy-ALL (plain INSERT — fail-closed on column drift, no OR IGNORE).
-- Parents before children so staging→staging FKs hold during the copy.
-- ══════════════════════════════════════════════════════════════

INSERT INTO order_items_new (
  id, order_id, type, reference_id, name, quantity, unit_price, total_price,
  created_at, split_group, course_number, course_status, project_id
)
SELECT
  id, order_id, type, reference_id, name, quantity, unit_price, total_price,
  created_at, split_group, course_number, course_status, project_id
FROM order_items;

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

INSERT INTO meal_categories_new (
  id, tenant_id, position, created_at, updated_at, project_id
)
SELECT
  id, tenant_id, position, created_at, updated_at, project_id
FROM meal_categories;

INSERT INTO meals_new (
  id, tenant_id, meal_category_id, price, image_url, is_active, created_at, updated_at, project_id
)
SELECT
  id, tenant_id, meal_category_id, price, image_url, is_active, created_at, updated_at, project_id
FROM meals;

INSERT INTO pos_tables_new (
  id, tenant_id, name, capacity, status, section, created_at,
  reservation_name, reservation_time, reservation_date, party_size, project_id
)
SELECT
  id, tenant_id, name, capacity, status, section, created_at,
  reservation_name, reservation_time, reservation_date, party_size, project_id
FROM pos_tables;

INSERT INTO rooms_new_new (
  id, camp_id, product_id, name, status, bed_type, max_guests,
  base_price, floor, notes, is_active, tenant_id, created_at, updated_at,
  room_status, cleaning_status, project_id
)
SELECT
  id, camp_id, product_id, name, status, bed_type, max_guests,
  base_price, floor, notes, is_active, tenant_id, created_at, updated_at,
  room_status, cleaning_status, project_id
FROM rooms_new;

INSERT INTO rate_plans_new_new (
  id, tenant_id, product_id, camp_id, name, season, start_date, end_date,
  price_per_night, min_stay, is_active, created_at, updated_at, project_id
)
SELECT
  id, tenant_id, product_id, camp_id, name, season, start_date, end_date,
  price_per_night, min_stay, is_active, created_at, updated_at, project_id
FROM rate_plans_new;

INSERT INTO meal_schedules_new (
  id, tenant_id, camp_id, date, meal_id, package_type, max_servings, created_at, project_id
)
SELECT
  id, tenant_id, camp_id, date, meal_id, package_type, max_servings, created_at, project_id
FROM meal_schedules;

INSERT INTO service_items_new (
  id, tenant_id, service_definition_id, project_id, name, description, base_price,
  meta_data, status, created_at, updated_at, price_tier, price_premium
)
SELECT
  id, tenant_id, service_definition_id, project_id, name, description, base_price,
  meta_data, status, created_at, updated_at, price_tier, price_premium
FROM service_items;

INSERT INTO inventory_adjustments_new (
  id, tenant_id, product_id, adjustment, reason, reference, notes, created_by, created_at, project_id
)
SELECT
  id, tenant_id, product_id, adjustment, reason, reference, notes, created_by, created_at, project_id
FROM inventory_adjustments;

INSERT INTO pos_transaction_items_new (
  id, tenant_id, order_id, transaction_id, product_id, variant_id, quantity,
  unit_price, subtotal, tax_amount, discount_amount, total_amount, notes,
  created_at, updated_at, project_id
)
SELECT
  id, tenant_id, order_id, transaction_id, product_id, variant_id, quantity,
  unit_price, subtotal, tax_amount, discount_amount, total_amount, notes,
  created_at, updated_at, project_id
FROM pos_transaction_items;

-- ══════════════════════════════════════════════════════════════
-- PHASE C: drop-ALL-olds (children-first — old-to-old cascades hit only
-- already-copied old rows, harmless; staging children point at STAGING parents
-- so they are NOT resolved/wiped here; non-rebuilt dependents are guarded).
-- RESTRICT referrers (orders → rooms_new, rooms_new → pos_products) are
-- deferred to COMMIT by the top PRAGMA and validate against the repopulated
-- final tables (keys preserved by the copies above).
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS pos_transaction_items;
DROP TABLE IF EXISTS rate_plans_new;
DROP TABLE IF EXISTS meal_schedules;
DROP TABLE IF EXISTS rooms_new;
DROP TABLE IF EXISTS service_items;
DROP TABLE IF EXISTS inventory_adjustments;
DROP TABLE IF EXISTS meals;
DROP TABLE IF EXISTS meal_categories;
DROP TABLE IF EXISTS pos_products;
DROP TABLE IF EXISTS pos_tables;

-- ══════════════════════════════════════════════════════════════
-- PHASE D: rename-ALL to final names (parents-first so the staging→staging FK
-- references rewrite to the final names; verified via fk_list + check below).
-- ══════════════════════════════════════════════════════════════
ALTER TABLE pos_products_new RENAME TO pos_products;
ALTER TABLE meal_categories_new RENAME TO meal_categories;
ALTER TABLE meals_new RENAME TO meals;
ALTER TABLE pos_tables_new RENAME TO pos_tables;
ALTER TABLE rooms_new_new RENAME TO rooms_new;
ALTER TABLE rate_plans_new_new RENAME TO rate_plans_new;
ALTER TABLE meal_schedules_new RENAME TO meal_schedules;
ALTER TABLE service_items_new RENAME TO service_items;
ALTER TABLE inventory_adjustments_new RENAME TO inventory_adjustments;
ALTER TABLE pos_transaction_items_new RENAME TO pos_transaction_items;
ALTER TABLE order_items_new RENAME TO order_items;

-- ══════════════════════════════════════════════════════════════
-- PHASE E: guard RESTORE (non-rebuilt dependents) — AFTER renames so parent
-- linkage verifies against the FINAL tables.
-- orders.table_id: SET NULL during the old-pos_tables drop → UPDATE back.
-- pos_transactions: full-row DELETE+INSERT via SELECT * (never names columns);
--   NO-ACTION children stay intact under defer; the CASCADE child
--   order_discounts is saved/restored around it.
-- meal_lang / meal_categories_lang / service_bookings: rows cascade-deleted by
--   the old-meals / old-meal_categories / old-service_items drops → INSERT
--   back; parent linkage verified by the final foreign_key_check.
-- order_discounts: rows cascade-deleted by the old-pos_transaction_items drop
--   → INSERT back.
-- ══════════════════════════════════════════════════════════════
UPDATE orders SET table_id = (SELECT table_id FROM _guard_orders_table WHERE _guard_orders_table.id = orders.id) WHERE EXISTS (SELECT 1 FROM _guard_orders_table WHERE _guard_orders_table.id = orders.id);
DELETE FROM pos_transactions;
INSERT INTO pos_transactions SELECT * FROM _guard_ptx;
INSERT INTO order_discounts SELECT * FROM _guard_order_discounts;
INSERT INTO meal_lang SELECT * FROM _guard_meal_lang;
INSERT INTO meal_categories_lang SELECT * FROM _guard_meal_categories_lang;
INSERT INTO service_bookings SELECT * FROM _guard_service_bookings;

-- ══════════════════════════════════════════════════════════════
-- PHASE F: recreate ALL pre-existing indexes (the DROPs destroyed them).
-- 0106 set (order_items) + 0107 PHASE F sets + the duplicate-coverage baseline
-- names (idx_rooms_camp, idx_rooms_status, idx_si_definition, idx_si_tenant,
-- idx_products_active, idx_products_barcode, idx_products_category,
-- idx_products_organization, idx_products_sku), all IF NOT EXISTS.
-- ══════════════════════════════════════════════════════════════
-- order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_type ON order_items(type);
CREATE INDEX IF NOT EXISTS idx_order_items_split ON order_items(split_group);
CREATE INDEX IF NOT EXISTS idx_order_items_project ON order_items(project_id);
-- rooms_new
CREATE INDEX IF NOT EXISTS idx_rooms_new_camp ON rooms_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_product ON rooms_new(product_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_status ON rooms_new(status);
CREATE INDEX IF NOT EXISTS idx_rooms_new_tenant_id ON rooms_new(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_room_status ON rooms_new(room_status);
CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms_new(floor);
CREATE INDEX IF NOT EXISTS idx_rooms_capacity ON rooms_new(max_guests);
CREATE INDEX IF NOT EXISTS idx_rooms_new_project ON rooms_new(project_id);
CREATE INDEX IF NOT EXISTS idx_rooms_camp ON rooms_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms_new(status);
-- rate_plans_new
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_tenant ON rate_plans_new(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_product ON rate_plans_new(product_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_camp ON rate_plans_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_project ON rate_plans_new(project_id);
-- meal_schedules
CREATE INDEX IF NOT EXISTS idx_meal_schedules_camp_date ON meal_schedules(camp_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant_date ON meal_schedules(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant_camp_date ON meal_schedules(tenant_id, camp_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_meal ON meal_schedules(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant ON meal_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_camp ON meal_schedules(camp_id);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_date ON meal_schedules(date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_project ON meal_schedules(project_id);
-- service_items
CREATE INDEX IF NOT EXISTS idx_service_items_tenant ON service_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_service_items_def ON service_items(service_definition_id);
CREATE INDEX IF NOT EXISTS idx_service_items_project ON service_items(project_id);
CREATE INDEX IF NOT EXISTS idx_service_items_status ON service_items(status);
CREATE INDEX IF NOT EXISTS idx_si_definition ON service_items(service_definition_id);
CREATE INDEX IF NOT EXISTS idx_si_tenant ON service_items(tenant_id);
-- meals
CREATE INDEX IF NOT EXISTS idx_meals_tenant ON meals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meals_category ON meals(meal_category_id);
CREATE INDEX IF NOT EXISTS idx_meals_project ON meals(project_id);
-- meal_categories
CREATE INDEX IF NOT EXISTS idx_meal_categories_tenant ON meal_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meal_categories_project ON meal_categories(project_id);
-- pos_products
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
-- pos_tables
CREATE INDEX IF NOT EXISTS idx_pos_tables_tenant ON pos_tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_tables_status ON pos_tables(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_tables_section ON pos_tables(section);
CREATE INDEX IF NOT EXISTS idx_pos_tables_project ON pos_tables(project_id);
-- inventory_adjustments
CREATE INDEX IF NOT EXISTS idx_inv_adj_tenant ON inventory_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_product ON inventory_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_date ON inventory_adjustments(created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_project ON inventory_adjustments(project_id);
-- pos_transaction_items
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_transaction ON pos_transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_tx_items_tx ON pos_transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_tx_items_product ON pos_transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pos_tx_items_tenant ON pos_transaction_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_project ON pos_transaction_items(project_id);

-- Recreate the updated_at triggers dropped above (0066:201-208 shape + live defs)
DROP TRIGGER IF EXISTS trg_rooms_new_updated_at;
CREATE TRIGGER trg_rooms_new_updated_at
  AFTER UPDATE ON rooms_new
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE rooms_new SET updated_at = datetime('now') WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS update_products_timestamp;
CREATE TRIGGER update_products_timestamp
    AFTER UPDATE ON pos_products
    BEGIN
        UPDATE pos_products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Guard cleanup (stubs order_discounts / meal_lang / meal_categories_lang /
-- service_bookings are NOT dropped — real in prod, empty no-ops in stub replay).
DROP TABLE IF EXISTS _guard_orders_table;
DROP TABLE IF EXISTS _guard_ptx;
DROP TABLE IF EXISTS _guard_order_discounts;
DROP TABLE IF EXISTS _guard_meal_lang;
DROP TABLE IF EXISTS _guard_meal_categories_lang;
DROP TABLE IF EXISTS _guard_service_bookings;

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain (incl. triple-referrer pos_products, orders→rooms
-- RESTRICT chain, meals/meal_categories dependents, staging→staging rewrites,
-- and the table_id / order_discounts / lang / bookings guard restores above)
PRAGMA foreign_key_check;
