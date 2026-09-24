-- Migration 0112: drop the divergent pos tenant_id DEFAULTs (P1a — 4 tables).
--
-- WHAT: rebuilds 4 tables removing the hardcoded `tenant_id` DEFAULT clause
-- while keeping `tenant_id TEXT NOT NULL`:
--   pos_customers / pos_products: `… NOT NULL DEFAULT 'acaciacamp'` → `… NOT NULL`
--   pos_transactions / pos_transaction_items: `… NOT NULL DEFAULT 'tenant_1'` → `… NOT NULL`
-- Plus a DDL-IDENTICAL structural rebuild of order_discounts (no column changes
-- at all — its tenant_id is already DEFAULT-free NOT NULL). This 5th rebuild is
-- forced by SQLite DROP mechanics, not by the P1a verdict (see DROP-ORDER note
-- in PHASE C): order_discounts carries dual ON DELETE CASCADE FKs to TWO
-- rebuilt tables (order_id → pos_transactions, transaction_item_id →
-- pos_transaction_items), which makes sequential parent DROPs impossible while
-- it survives — so it is dropped first and rebuilt like the rest.
-- Every insert that omits tenant_id currently inherits a hardcoded tenant
-- (implicit-tenant risk); after this file such inserts fail loudly instead.
-- All other DDL — column lists, defaults, CHECKs, UNIQUEs, GENERATED columns,
-- project_id states as left by 0111 (pos_products / pos_transaction_items
-- nullable; pos_transactions nullable via 0100; pos_customers has NO
-- project_id column — preserved), FK targets/actions (except the staging
-- edges below) — is preserved verbatim. No data rewrite: all live rows carry
-- explicit tenant_ids (see counts below), so copies move values untouched.
--
-- Recon ground truth: /tmp/opencode/s-recon.md §2 (4/4 CONFIRMED on both DBs —
-- live DDL lines + pre-check COUNTs: zero `tenant_1` rows in pos_transactions /
-- pos_transaction_items on both DBs; zero `acaciacamp` rows in pos_customers
-- (empty table); pos_products 42/43 local + 6/6 staging acaciacamp with explicit
-- values — no row depends on the DEFAULT), §6 (this file = the 0112 leg).
--
-- GATE (S-D must re-run at apply time and STOP on divergence):
--   SELECT COUNT(*) FROM pos_transactions WHERE tenant_id='tenant_1';
--   SELECT COUNT(*) FROM pos_customers WHERE tenant_id='acaciacamp';
--   SELECT COUNT(*) FROM pos_products WHERE tenant_id='acaciacamp';
--   SELECT COUNT(*) FROM pos_transaction_items WHERE tenant_id='tenant_1';
-- (Post-0112 behavior is unchanged for existing rows — counts are data, not
-- DDL — but any NEW reliance on the implicit default must be fixed in the
-- write path first. The plain-INSERT copies below are fail-closed, no OR
-- IGNORE, and D1 applies each migration atomically so reruns are safe.)
--
-- Rebuild idiom (precedent 0106/0107, applied to this file's rebuild set):
-- `PRAGMA defer_foreign_keys = true` → CREATE real (non-TEMP — D1 blocks temp)
-- staging tables → copy-ALL → drop-ALL-olds (children-first) → rename-ALL
-- (parents-first) → `PRAGMA defer_foreign_keys = false` +
-- `PRAGMA foreign_key_check`. Never `foreign_keys=OFF` (skill).
--
-- FK-ACTION SEMANTICS under D1 (same verification as 0111, 2026-09-24):
--   - RESTRICT (rooms_new.product_id → pos_products): DROP is DEFERRED and
--     COMMIT-validated; keys are repopulated by the copies below. No guard.
--   - NO ACTION (pos_recipe_ingredients.product_id/ingredient_id → pos_products,
--     pos_transactions.customer_id → pos_customers): deferred; the renamed
--     final tables carry the same keys. No guard.
--   - CASCADE (rate_plans_new.product_id → pos_products): DROP fires
--     IMMEDIATELY by table NAME (never deferred) — this non-rebuilt dependent
--     is guard-saved BEFORE any DROP and restored AFTER the renames (0107
--     guard pattern). order_discounts (CASCADE child of BOTH pos_transactions
--     and pos_transaction_items) is instead fully rebuilt (see WHAT above) —
--     a save/restore guard alone cannot save it (DROP-ORDER note in PHASE C).
-- Rebuilt-to-rebuilt edges point at STAGING parents (pos_transactions_new →
-- pos_customers_new; pos_transaction_items_new → pos_transactions_new +
-- pos_products_new; order_discounts_new → pos_transactions_new +
-- pos_transaction_items_new) so DROP-ing an old parent cannot wipe a freshly copied
-- staging child; SQLite rewrites those references to the final names on
-- RENAME (parents-first rename order below).
--
-- GENERATED-COLUMN EXCLUSIONS: pos_products.profit_margin AND
-- pos_customers.name (`first_name || ' ' || last_name`) are GENERATED ALWAYS
-- STORED — declared in the new CREATEs, EXCLUDED from the INSERT…SELECT lists
-- so they recompute (pos_users.name needs no handling — pos_users is NOT
-- rebuilt here; INSERTs elsewhere still use first_name/last_name ONLY).
--
-- INDEX RECREATION: the DROPs destroy indexes, so ALL pre-existing indexes are
-- recreated — the 0004 baseline sets + 0100 project-id indexes + the 0107
-- filtered index (idx_pos_transactions_project_nn) + the duplicate-coverage
-- baseline names (idx_products_*), all with IF NOT EXISTS.
--
-- ROLLBACK SAFETY (hard rule 7): table rebuilds are forward-only — there is no
-- down-migration. Rollback = restore-from-backup ("locker") procedure, stated in
-- the S-D apply commit body. Do NOT attempt DROP/rename reversals once writes
-- land on the rebuilt tables.

PRAGMA defer_foreign_keys = true;

-- Trigger-drop-first (0047 lesson): update_products_timestamp is ON pos_products
-- (rebuilt below) — drop first, recreate AFTER the renames. update_users_timestamp
-- is ON pos_users (NOT rebuilt) — untouched. No triggers exist ON pos_customers,
-- pos_transactions, or pos_transaction_items.
DROP TRIGGER IF EXISTS update_products_timestamp;

-- ══════════════════════════════════════════════════════════════
-- GUARD SAVE (non-rebuilt CASCADE dependent) — BEFORE any DROP.
-- rate_plans_new: real on every D1 DB (ledger set-complete); IF-NOT-EXISTS
--   stub (no FKs, minimal shape) keeps minimal-schema replays safe.
--   (order_discounts needs no guard — it is rebuilt below, not guarded.)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS rate_plans_new (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, product_id TEXT NOT NULL, camp_id TEXT, name TEXT NOT NULL, price_per_night REAL NOT NULL);
CREATE TABLE _guard_rate_plans_new AS SELECT * FROM rate_plans_new;

-- ══════════════════════════════════════════════════════════════
-- PHASE A: create-ALL staging tables.
-- Column lists preserved verbatim from 0004 (pos_customers, pos_transactions),
-- 0107-A1-as-left-by-0111 (pos_products), 0107-A10-as-left-by-0111
-- (pos_transaction_items); the ONLY change vs live DDL is the REMOVED
-- `DEFAULT '<…>'` on tenant_id (NOT NULL kept). pos_customers keeps NO
-- project_id column. Rebuilt-to-rebuilt FK edges point at STAGING parents;
-- all other FK targets and all actions are unchanged.
-- ══════════════════════════════════════════════════════════════

-- A1. pos_customers (no project_id column — preserved; GENERATED name declared,
-- EXCLUDED from the copy list below)
CREATE TABLE "pos_customers_new" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    tenant_id TEXT NOT NULL,
    customer_number TEXT UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    date_of_birth DATE,
    gender TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    postal_code TEXT,
    country TEXT DEFAULT 'VN',
    customer_group TEXT DEFAULT 'regular',
    loyalty_points INTEGER DEFAULT 0,
    total_spent DECIMAL(12,2) DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    average_order_value DECIMAL(10,2) DEFAULT 0,
    last_order_date DATE,
    acquisition_source TEXT,
    preferences JSON DEFAULT '{}',
    notes TEXT,
    is_vip BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- A2. pos_products (GENERATED profit_margin declared, EXCLUDED from the copy;
-- project_id nullable as left by 0111)
CREATE TABLE pos_products_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
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

-- A3. pos_transactions (customer edge → pos_customers_new staging; table_id →
-- pos_tables is NOT rebuilt — target unchanged; project_id nullable via 0100)
CREATE TABLE "pos_transactions_new" (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  organization_id INTEGER NOT NULL DEFAULT 1,
  store_id INTEGER NOT NULL DEFAULT 1,
  order_number TEXT UNIQUE NOT NULL,
  transaction_number TEXT,
  customer_id INTEGER,
  cashier_id TEXT NOT NULL,
  order_type TEXT DEFAULT 'sale',
  status TEXT DEFAULT 'pending',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  discount_type TEXT,
  discount_reason TEXT,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  tax_rate REAL DEFAULT 0.1,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  change_amount DECIMAL(10,2) DEFAULT 0,
  payment_method TEXT,
  points_earned INTEGER DEFAULT 0,
  points_redeemed INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'pending',
  order_status TEXT DEFAULT 'completed',
  notes TEXT,
  receipt_url TEXT,
  void_reason TEXT,
  voided_by TEXT,
  voided_at DATETIME,
  refunded_amount DECIMAL(12,2) DEFAULT 0,
  refunded_at DATETIME,
  refunded_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  amount_cash REAL DEFAULT 0.0,
  amount_card REAL DEFAULT 0.0,
  idempotency_key TEXT,
  table_id TEXT REFERENCES pos_tables(id) ON DELETE SET NULL,
  kitchen_status TEXT DEFAULT 'confirmed' CHECK(kitchen_status IN ('pending', 'confirmed', 'preparing', 'ready', 'served', 'canceled')),
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
  FOREIGN KEY (store_id) REFERENCES pos_stores(id),
  FOREIGN KEY (customer_id) REFERENCES pos_customers_new(id)
);

-- A4. pos_transaction_items (order edge → pos_transactions_new staging,
-- product edge → pos_products_new staging, NO ACTION unchanged; project_id
-- nullable as left by 0111)
CREATE TABLE pos_transaction_items_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
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
    FOREIGN KEY (order_id) REFERENCES pos_transactions_new(id),
    FOREIGN KEY (product_id) REFERENCES pos_products_new(id)
);

-- A5. order_discounts (DDL-IDENTICAL structural rebuild — no column changes;
-- order edge → pos_transactions_new staging, item edge →
-- pos_transaction_items_new staging, CASCADE actions unchanged; see WHAT.
-- Created AFTER A3/A4: SQLite validates REFERENCES targets at CREATE time.)
CREATE TABLE order_discounts_new (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id            TEXT NOT NULL REFERENCES pos_transactions_new(id) ON DELETE CASCADE,
  transaction_item_id TEXT REFERENCES pos_transaction_items_new(id) ON DELETE CASCADE,
  promotion_id        TEXT NOT NULL,
  promotion_name      TEXT NOT NULL,
  discount_type       TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed','bogo')),
  discount_value      REAL NOT NULL,
  discount_amount     REAL NOT NULL,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ══════════════════════════════════════════════════════════════
-- PHASE B: copy-ALL (plain INSERT — fail-closed on column drift, no OR IGNORE;
-- existing rows carry explicit tenant_ids, so no data rewrite occurs).
-- Parents before children so staging→staging FKs hold during the copy.
-- ══════════════════════════════════════════════════════════════

INSERT INTO pos_customers_new (
  id, organization_id, tenant_id, customer_number, first_name, last_name,
  email, phone, date_of_birth, gender, address, city, state, postal_code,
  country, customer_group, loyalty_points, total_spent, total_orders,
  average_order_value, last_order_date, acquisition_source, preferences, notes,
  is_vip, is_active, created_at, updated_at
)
SELECT
  id, organization_id, tenant_id, customer_number, first_name, last_name,
  email, phone, date_of_birth, gender, address, city, state, postal_code,
  country, customer_group, loyalty_points, total_spent, total_orders,
  average_order_value, last_order_date, acquisition_source, preferences, notes,
  is_vip, is_active, created_at, updated_at
FROM pos_customers;

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

INSERT INTO pos_transactions_new (
  id, tenant_id, organization_id, store_id, order_number, transaction_number,
  customer_id, cashier_id, order_type, status, subtotal, discount_amount,
  discount_type, discount_reason, tax_amount, tax_rate, total_amount,
  paid_amount, change_amount, payment_method, points_earned, points_redeemed,
  payment_status, order_status, notes, receipt_url, void_reason, voided_by,
  voided_at, refunded_amount, refunded_at, refunded_by, created_at, updated_at,
  amount_cash, amount_card, idempotency_key, table_id, kitchen_status, project_id
)
SELECT
  id, tenant_id, organization_id, store_id, order_number, transaction_number,
  customer_id, cashier_id, order_type, status, subtotal, discount_amount,
  discount_type, discount_reason, tax_amount, tax_rate, total_amount,
  paid_amount, change_amount, payment_method, points_earned, points_redeemed,
  payment_status, order_status, notes, receipt_url, void_reason, voided_by,
  voided_at, refunded_amount, refunded_at, refunded_by, created_at, updated_at,
  amount_cash, amount_card, idempotency_key, table_id, kitchen_status, project_id
FROM pos_transactions;

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

INSERT INTO order_discounts_new (
  id, tenant_id, order_id, transaction_item_id, promotion_id, promotion_name,
  discount_type, discount_value, discount_amount, created_at
)
SELECT
  id, tenant_id, order_id, transaction_item_id, promotion_id, promotion_name,
  discount_type, discount_value, discount_amount, created_at
FROM order_discounts;

-- ══════════════════════════════════════════════════════════════
-- PHASE C: drop-ALL-olds (children-first — old-to-old cascades hit only
-- already-copied old rows, harmless; staging children point at STAGING parents
-- so they are NOT resolved/wiped here; the non-rebuilt CASCADE dependent
-- rate_plans_new is guarded above. RESTRICT/NO-ACTION referrers — rooms_new →
-- pos_products, pos_recipe_ingredients → pos_products — are deferred to COMMIT
-- and validate against the repopulated final tables.)
--
-- DROP-ORDER NOTE (verified 2026-09-24 on SQLite 3.45.1 under the D1 pattern):
-- when DROP TABLE fires an immediate CASCADE into a surviving table, SQLite
-- resolves that survivor's FULL FK schema — so a survivor with a second FK to
-- an already-dropped table aborts the DROP with `no such table` (row counts
-- are irrelevant; verified with empty survivors too). order_discounts carries
-- CASCADE FKs to BOTH pos_transactions and pos_transaction_items, so dropping
-- either parent while it survives fails whichever is dropped second — hence
-- order_discounts is dropped FIRST (it has no referencers of its own) and
-- rebuilt with the rest, instead of guard-saved.
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS order_discounts;
DROP TABLE IF EXISTS pos_transaction_items;
DROP TABLE IF EXISTS pos_transactions;
DROP TABLE IF EXISTS pos_products;
DROP TABLE IF EXISTS pos_customers;

-- ══════════════════════════════════════════════════════════════
-- PHASE D: rename-ALL to final names (parents-first so the staging→staging FK
-- references rewrite to the final names; verified via fk_list + check below).
-- ══════════════════════════════════════════════════════════════
ALTER TABLE pos_customers_new RENAME TO pos_customers;
ALTER TABLE pos_products_new RENAME TO pos_products;
ALTER TABLE pos_transactions_new RENAME TO pos_transactions;
ALTER TABLE pos_transaction_items_new RENAME TO pos_transaction_items;
ALTER TABLE order_discounts_new RENAME TO order_discounts;

-- ══════════════════════════════════════════════════════════════
-- PHASE E: guard RESTORE (non-rebuilt CASCADE dependent) — AFTER renames so
-- parent linkage verifies against the FINAL tables.
-- rate_plans_new: rows cascade-deleted by the old-pos_products drop → INSERT
--   back (product_ids survive via the pos_products copy).
--   (order_discounts needs no restore — it was rebuilt via copy in PHASE B.)
-- ══════════════════════════════════════════════════════════════
INSERT INTO rate_plans_new SELECT * FROM _guard_rate_plans_new;

-- ══════════════════════════════════════════════════════════════
-- PHASE F: recreate ALL pre-existing indexes (the DROPs destroyed them).
-- 0004 baseline sets + 0100 project-id indexes + the 0107 filtered index on
-- pos_transactions + the duplicate-coverage idx_products_* names, all
-- IF NOT EXISTS. Staging's idx_orders_customer ON pos_transactions(customer_id)
-- is recreated here (the DROP destroyed it) — left otherwise untouched.
-- ══════════════════════════════════════════════════════════════
-- pos_customers
CREATE INDEX IF NOT EXISTS idx_customers_email ON pos_customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_number ON pos_customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_customers_organization ON pos_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON pos_customers(phone);
CREATE INDEX IF NOT EXISTS idx_pos_customers_tenant ON pos_customers(tenant_id);
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
-- pos_transactions
CREATE INDEX IF NOT EXISTS idx_orders_cashier ON pos_transactions(cashier_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON pos_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON pos_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_number ON pos_transactions(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_organization_store ON pos_transactions(organization_id, store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON pos_transactions(status);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_cashier ON pos_transactions(cashier_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_customer ON pos_transactions(customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_transactions_idempotency ON pos_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_transactions_tenant_date ON pos_transactions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_tx_kitchen ON pos_transactions(kitchen_status);
CREATE INDEX IF NOT EXISTS idx_pos_tx_staff ON pos_transactions(cashier_id);
CREATE INDEX IF NOT EXISTS idx_pos_tx_status ON pos_transactions(status);
CREATE INDEX IF NOT EXISTS idx_pos_tx_tenant_date ON pos_transactions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_tx_type ON pos_transactions(order_type);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_project ON pos_transactions(project_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_project_nn ON pos_transactions(project_id) WHERE project_id IS NOT NULL;
-- pos_transaction_items
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_transaction ON pos_transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_tx_items_product ON pos_transaction_items(product_id);
CREATE INDEX IF NOT EXISTS idx_pos_tx_items_tenant ON pos_transaction_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_tx_items_tx ON pos_transaction_items(transaction_id);
CREATE INDEX IF NOT EXISTS idx_pos_transaction_items_project ON pos_transaction_items(project_id);
-- order_discounts (0002 baseline — the DROP destroyed them)
CREATE INDEX IF NOT EXISTS idx_order_discounts_order ON order_discounts(order_id);
CREATE INDEX IF NOT EXISTS idx_order_discounts_tenant ON order_discounts(tenant_id);

-- Recreate the updated_at trigger dropped above (0004:363-368 live def)
DROP TRIGGER IF EXISTS update_products_timestamp;
CREATE TRIGGER update_products_timestamp
    AFTER UPDATE ON pos_products
    BEGIN
        UPDATE pos_products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Guard cleanup (stub rate_plans_new is NOT dropped — real in prod, empty no-op
-- in minimal-schema replays).
DROP TABLE IF EXISTS _guard_rate_plans_new;

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain (incl. the customer_id staging→final rewrite,
-- the order/product/discount staging edges, RESTRICT/NO-ACTION referrers,
-- and the rate_plans guard restore above)
PRAGMA foreign_key_check;
