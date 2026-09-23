-- Migration 0107: enforce NOT NULL on the remaining ENFORCE tables + filtered
-- indexes for the STAY-NULLABLE tables.
--
-- WHAT (part 1 — ENFORCE): rebuilds 10 tables with `project_id TEXT NOT NULL
-- REFERENCES projects(id) ON DELETE SET NULL` (the 0100 column + 0072:24
-- service_items column, nullability flipped — REFERENCES clauses unchanged).
-- Full column lists (incl. the 0100–0102 project_id columns) and all
-- pre-existing indexes are preserved verbatim.
--
-- Recon ground truth: /tmp/opencode/p1-recon.md §2 (ENFORCE #2–#11) + §4. The
-- 0105 backfill closes 100% of local NULLs per table (rooms_new 161/161 via
-- camp_id; rate_plans_new 32/32 via camp_id; meal_schedules / service_items /
-- pos_tables vacuous; meals 5/5 + meal_categories 3/3 via tenant default;
-- pos_products 43/43 via soft camp_id; inventory_adjustments 512/512 via product
-- camp; pos_transaction_items 119/119 via line-product camp).
--
-- NOTE on pos_transaction_items: design §8 row 8 (0107 list) omits this table
-- although design §3 row 7 mandates its path ends NOT NULL (D3 line tag) — recon
-- §2 ENFORCE #11 recommends including it, implemented here literally per recon.
--
-- GATE (design §8): every table below enforces ONLY because its recon verdict is
-- ENFORCE. P1-D must confirm `SELECT COUNT(*) FROM <t> WHERE project_id IS NULL`
-- = 0 per table at apply time and STOP on divergence — never enforce over
-- remaining NULLs.
--
-- WHAT (part 2 — STAY-NULLABLE): filtered `idx_<t>_project_nn ... WHERE
-- project_id IS NOT NULL` indexes (recon §5, names used literally — the plain
-- idx_<t>_project names are taken by 0100–0103; precedent: 0073:11
-- idx_tenants_onboarding_token) for orders, pos_transactions, pos_users,
-- promotions, pos_stores, carts, storefront_orders.
--
-- Rebuild idiom: primary precedent 0066_fix_camps_fk_references.sql —
-- `PRAGMA defer_foreign_keys = true` (0066:18) → CREATE real (non-TEMP) staging
-- tables (D1 authorizer blocks temp tables) → full-list copies → DROP + RENAME
-- (0066:48-49) → recreate ALL pre-existing indexes (0066:51-55 + 0066:86-90
-- pattern) → trigger-drop-first + recreate (AGENT_LOGBOOK 2026-08-06
-- RENAME-swap gotchas: DROP TRIGGER IF EXISTS at the top, recreate AFTER) →
-- `PRAGMA defer_foreign_keys = false` + `PRAGMA foreign_key_check`
-- (0066:248-251). No `foreign_keys=OFF` (skill).
--
-- DELIBERATE DEVIATION from 0066:39-46: plain `INSERT INTO` (no `OR IGNORE`).
-- OR IGNORE would SILENTLY DROP rows violating the new NOT NULL constraint on
-- divergence; a loud abort is the correct gate behavior, and D1 applies each
-- migration atomically so reruns are safe.
--
-- GENERATED-COLUMN EXCLUSION (logbook 0047 lesson): pos_products.profit_margin
-- (0042:45) is GENERATED ALWAYS STORED — it is declared in the new CREATE TABLE
-- (copy pattern 0042:77) but EXCLUDED from the INSERT…SELECT column lists so it
-- recomputes on read. (pos_users.name would need the same treatment, but
-- pos_users stays nullable and is NOT rebuilt here.)
--
-- CASCADE-FIX (P1-C sibling proves one-at-a-time DROP wipes rebuilt children):
-- DROP TABLE under FK enforcement fires immediate ON DELETE CASCADE/SET NULL
-- actions that resolve by table NAME (never deferred, even with
-- defer_foreign_keys=true) — so dropping an already-rebuilt parent wipes rows
-- just copied into its rebuilt child. Proven casualties in P1-C:
-- DROP old pos_products → cascade deletes rebuilt rate_plans_new rows;
-- DROP old meals → deletes rebuilt meal_schedules rows;
-- DROP old meal_categories → deletes rebuilt meals rows.
-- Predicted further blast radii in prod (non-rebuilt dependents, same mechanism):
-- DROP old pos_tables SET NULLs orders/pos_transactions.table_id;
-- DROP old meals cascade-deletes meal_lang rows.
-- FIX STRUCTURE (this file): create-ALL-staging + copy-ALL first (children still
-- reference their parents during copy — parents still hold rows, so copies pass
-- under defer), then drop-ALL-olds (children-first, so old-to-old cascades hit
-- only already-copied old rows — harmless), then rename-ALL to final names,
-- then recreate triggers + indexes. Rebuilt-to-rebuilt FK edges in the staging
-- CREATEs point at STAGING parent names (pos_products_new / meals_new /
-- meal_categories_new) instead of the final names — so DROP-ing an old parent
-- cannot resolve to (and wipe) the freshly copied staging child; SQLite rewrites
-- those staging references to the final names on RENAME (verified: fk_list shows
-- final names + foreign_key_check clean). All other FK clauses (tenants,
-- projects, service_definitions, pos_transactions, and the ON DELETE
-- CASCADE/RESTRICT/SET NULL/NO ACTION actions themselves) are preserved verbatim.
-- Non-rebuilt dependents are explicitly guarded (test-safe: no statement names a
-- table/column missing from the P1-C stub, so the 103-test replay stays green):
-- orders.table_id via id+table_id save + UPDATE restore (orders stub HAS
-- table_id); pos_transactions full-row save + DELETE+INSERT restore via SELECT *
-- (never names the stub-missing table_id column; NO-ACTION children stay intact
-- under defer); order_discounts (CASCADE child of pos_transactions, missing from
-- the stub) via IF-NOT-EXISTS stub (no FKs, empty in test = no-op; no-op in prod
-- where the real table exists) + save/restore; meal_lang (CASCADE child of
-- meals, missing from the stub) via IF-NOT-EXISTS stub (no FKs, empty in test =
-- no-op; no-op in prod) + save/restore with parent linkage verified by the final
-- foreign_key_check. DROP/RENAME ordering (children-first drops, parents-first
-- renames) keeps old-to-old cascades harmless and lets the RENAME rewrite land.
--
-- ROLLBACK SAFETY (hard rule 7): table rebuilds are forward-only — there is no
-- down-migration. Rollback = restore-from-backup ("locker") procedure, stated in
-- the P1-D apply commit body. Do NOT attempt DROP/rename reversals once writes
-- land on the rebuilt tables.
--
-- STAGING GATE (recon §1b/§6): staging was unreachable from the recon sandbox —
-- P1-D must re-run the §1a NULL matrix remotely at apply time and STOP on any
-- divergence before applying.

PRAGMA defer_foreign_keys = true;

-- Trigger-drop-first (0047 lesson): live triggers ON tables being rebuilt would
-- break the DROP/RENAME swap. Recreated AFTER the renames below.
DROP TRIGGER IF EXISTS trg_rooms_new_updated_at;
DROP TRIGGER IF EXISTS update_products_timestamp;

-- ══════════════════════════════════════════════════════════════
-- GUARD SAVE (non-rebuilt dependents) — test-safe, BEFORE any DROP.
-- orders stub HAS table_id → explicit id+table_id save is safe.
-- pos_transactions stub LACKS table_id → full-row SELECT * save never names it.
-- order_discounts + meal_lang are MISSING from the stub → IF-NOT-EXISTS stubs
-- (no FKs, empty in test = no-op; no-op in prod) make the SELECT * saves safe.
-- ══════════════════════════════════════════════════════════════
CREATE TABLE _guard_orders_table AS SELECT id, table_id FROM orders WHERE table_id IS NOT NULL;
CREATE TABLE _guard_ptx AS SELECT * FROM pos_transactions;
CREATE TABLE IF NOT EXISTS order_discounts (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, order_id TEXT NOT NULL, discount_amount REAL DEFAULT 0);
CREATE TABLE _guard_order_discounts AS SELECT * FROM order_discounts;
CREATE TABLE IF NOT EXISTS meal_lang (meal_id TEXT, lang TEXT NOT NULL, name TEXT NOT NULL, description TEXT, PRIMARY KEY (meal_id, lang));
CREATE TABLE _guard_meal_lang AS SELECT * FROM meal_lang;

-- ══════════════════════════════════════════════════════════════
-- PHASE A: create-ALL staging tables.
-- Column lists + indexes preserved verbatim; the ONLY deliberate text change vs
-- the one-at-a-time version is the FK TARGET on the 5 rebuilt-to-rebuilt edges,
-- which points at the STAGING parent (see CASCADE-FIX header). All actions
-- (CASCADE/RESTRICT/SET NULL/NO ACTION) and all other FK targets are unchanged.
-- ══════════════════════════════════════════════════════════════

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
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
);

-- A2. meal_categories (rebuild parent — tenant/project only)
CREATE TABLE meal_categories_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
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
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
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
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
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
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
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
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
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
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_id) REFERENCES meals_new(id) ON DELETE CASCADE
);

-- A8. service_items (0072:20-32 + price_tier/price_premium 0075:94-96; parents
-- tenants/service_definitions/projects are NOT rebuilt — targets unchanged)
CREATE TABLE service_items_new (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_definition_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL,
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
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
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
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id) REFERENCES pos_transactions(id),
  FOREIGN KEY (product_id) REFERENCES pos_products_new(id)
);

-- ══════════════════════════════════════════════════════════════
-- PHASE B: copy-ALL (plain INSERT — fail-closed on residual NULLs, no OR IGNORE).
-- Parents before children so staging→staging FKs hold during the copy.
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
-- ══════════════════════════════════════════════════════════════
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

-- ══════════════════════════════════════════════════════════════
-- PHASE E: guard RESTORE (non-rebuilt dependents) — AFTER renames so parent
-- linkage verifies against the FINAL tables.
-- orders.table_id: SET NULL during the old-pos_tables drop → UPDATE back.
-- pos_transactions: full-row DELETE+INSERT via SELECT * (never names the
--   stub-missing table_id column); NO-ACTION children stay intact under defer;
--   the CASCADE child order_discounts is saved/restored around it.
-- meal_lang: rows cascade-deleted by the old-meals drop → INSERT back; parent
--   linkage (meal_id → meals) verified by the final foreign_key_check.
-- ══════════════════════════════════════════════════════════════
UPDATE orders SET table_id = (SELECT table_id FROM _guard_orders_table WHERE _guard_orders_table.id = orders.id) WHERE EXISTS (SELECT 1 FROM _guard_orders_table WHERE _guard_orders_table.id = orders.id);
DELETE FROM pos_transactions;
INSERT INTO pos_transactions SELECT * FROM _guard_ptx;
INSERT INTO order_discounts SELECT * FROM _guard_order_discounts;
INSERT INTO meal_lang SELECT * FROM _guard_meal_lang;

-- ══════════════════════════════════════════════════════════════
-- PHASE F: recreate ALL pre-existing indexes (the DROPs destroyed them).
-- Live sets verified 2026-09-23 — preserved verbatim from the one-at-a-time file.
-- ══════════════════════════════════════════════════════════════
-- rooms_new
CREATE INDEX IF NOT EXISTS idx_rooms_new_camp ON rooms_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_product ON rooms_new(product_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_status ON rooms_new(status);
CREATE INDEX IF NOT EXISTS idx_rooms_new_tenant_id ON rooms_new(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_room_status ON rooms_new(room_status);
CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms_new(floor);
CREATE INDEX IF NOT EXISTS idx_rooms_capacity ON rooms_new(max_guests);
CREATE INDEX IF NOT EXISTS idx_rooms_new_project ON rooms_new(project_id);
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

-- ══════════════════════════════════════════════════════════════
-- PART 2: filtered indexes for the STAY-NULLABLE tables (recon §5).
-- The plain idx_<t>_project names are taken by 0100–0103, hence the _nn
-- (not-null) suffix (precedent 0073:11). P1-C asserts each via
-- sqlite_master.sql LIKE '%WHERE project_id IS NOT NULL%'.
-- ══════════════════════════════════════════════════════════════
-- orders: T+tags D3 header, NULL = multi-project cart (recon §2)
CREATE INDEX IF NOT EXISTS idx_orders_project_nn ON orders(project_id) WHERE project_id IS NOT NULL;
-- pos_transactions: T+tags D3 header, NULL = multi-project payment (recon §2)
CREATE INDEX IF NOT EXISTS idx_pos_transactions_project_nn ON pos_transactions(project_id) WHERE project_id IS NOT NULL;
-- pos_users: T+tags home-project tag, NULL = floater (recon §2)
CREATE INDEX IF NOT EXISTS idx_pos_users_project_nn ON pos_users(project_id) WHERE project_id IS NOT NULL;
-- promotions: T+tags, NULL = tenant-wide promo, no forced defaulting (recon §2)
CREATE INDEX IF NOT EXISTS idx_promotions_project_nn ON promotions(project_id) WHERE project_id IS NOT NULL;
-- pos_stores: 44/45 stores unresolvable — enforcement would enshrine bad defaults (recon §2)
CREATE INDEX IF NOT EXISTS idx_pos_stores_project_nn ON pos_stores(project_id) WHERE project_id IS NOT NULL;
-- carts: ephemeral pre-checkout container; NOT NULL would break session-cart creation (recon §2)
CREATE INDEX IF NOT EXISTS idx_carts_project_nn ON carts(project_id) WHERE project_id IS NOT NULL;
-- storefront_orders: read-only legacy, never rewritten (recon §2, §12 Q4)
CREATE INDEX IF NOT EXISTS idx_storefront_orders_project_nn ON storefront_orders(project_id) WHERE project_id IS NOT NULL;

-- Guard cleanup (stubs meal_lang / order_discounts are NOT dropped — real in
-- prod, empty no-ops in the P1-C stub replay).
DROP TABLE IF EXISTS _guard_orders_table;
DROP TABLE IF EXISTS _guard_ptx;
DROP TABLE IF EXISTS _guard_order_discounts;
DROP TABLE IF EXISTS _guard_meal_lang;

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain (incl. triple-referrer pos_products, orders→rooms,
-- meals/meal_categories dependents, staging→staging rewrites, and the
-- meal_lang/order_discounts/table_id guard restores above)
PRAGMA foreign_key_check;
