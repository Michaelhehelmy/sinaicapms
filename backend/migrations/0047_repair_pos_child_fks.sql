-- Migration 0047: Repair 6 POS child-table foreign keys to pos_products
--
-- Root cause: migration 0042 (cleanup_pos_products) used the SQLite
-- RENAME-swap pattern to drop columns from pos_products (created
-- pos_products_new, renamed pos_products -> pos_products_old, created the new
-- pos_products, then dropped pos_products_old). SQLite auto-rewrites
-- child-table FK clauses on RENAME, so every child table that referenced
-- pos_products ended up referencing the now-dropped "pos_products_old" table.
-- Any INSERT/UPDATE into those child tables then fails FK validation with
-- `D1_ERROR: no such table: main.pos_products_old` (500s).
--
-- Migration 0046 fixed pos_transaction_items. This migration fixes the
-- remaining 6 child tables:
--   pos_product_variants        (product_id -> pos_products_old)
--   pos_inventory               (product_id -> pos_products_old)
--   pos_stock_movements         (product_id -> pos_products_old)
--   pos_stock_adjustment_items  (product_id -> pos_products_old)
--   pos_recipe_ingredients      (product_id AND ingredient_id -> pos_products_old)
--   pos_inventory_logs          (product_id -> pos_products_old, ON DELETE CASCADE)
--
-- Fix: recreate each table with product/ingredient references pointing at
-- pos_products(id), preserving every column, constraint, default, index and
-- trigger exactly as it exists today, and copying all data unchanged.
-- Generated columns are excluded from the INSERT...SELECT column lists.

PRAGMA defer_foreign_keys = ON;

-- Drop the pos_stock_movements trigger up front: SQLite recompiles triggers
-- that reference a renamed table, and ALTER TABLE ... RENAME fails with
-- "error in trigger ...: no such table" while a live trigger references a
-- parent table that is being dropped/renamed (pos_inventory below). The
-- trigger is recreated after pos_stock_movements is rebuilt (section 3).
DROP TRIGGER IF EXISTS update_inventory_after_movement;

-- ============================================================
-- 1. pos_product_variants
-- ============================================================
CREATE TABLE pos_product_variants_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    barcode TEXT UNIQUE,
    name TEXT NOT NULL,
    attributes JSON NOT NULL DEFAULT '{}',
    cost_price DECIMAL(10,2) NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    compare_price DECIMAL(10,2),
    weight REAL,
    images JSON DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES pos_products(id)
);

INSERT INTO pos_product_variants_new (
    id, product_id, sku, barcode, name, attributes,
    cost_price, selling_price, compare_price, weight, images,
    is_active, created_at, updated_at
)
SELECT
    id, product_id, sku, barcode, name, attributes,
    cost_price, selling_price, compare_price, weight, images,
    is_active, created_at, updated_at
FROM pos_product_variants;

DROP TABLE pos_product_variants;
ALTER TABLE pos_product_variants_new RENAME TO pos_product_variants;

-- ============================================================
-- 2. pos_inventory
-- ============================================================
CREATE TABLE pos_inventory_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    quantity_on_hand INTEGER NOT NULL DEFAULT 0,
    quantity_allocated INTEGER NOT NULL DEFAULT 0,
    quantity_available INTEGER GENERATED ALWAYS AS (quantity_on_hand - quantity_allocated) STORED,
    reorder_point INTEGER DEFAULT 20,
    max_stock_level INTEGER DEFAULT 1000,
    last_counted_at DATETIME,
    last_received_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
    FOREIGN KEY (store_id) REFERENCES pos_stores(id),
    FOREIGN KEY (product_id) REFERENCES pos_products(id),
    FOREIGN KEY (variant_id) REFERENCES pos_product_variants(id),
    UNIQUE(store_id, product_id, variant_id)
);

INSERT INTO pos_inventory_new (
    id, organization_id, store_id, product_id, variant_id,
    quantity_on_hand, quantity_allocated,
    reorder_point, max_stock_level,
    last_counted_at, last_received_at,
    created_at, updated_at
)
SELECT
    id, organization_id, store_id, product_id, variant_id,
    quantity_on_hand, quantity_allocated,
    reorder_point, max_stock_level,
    last_counted_at, last_received_at,
    created_at, updated_at
FROM pos_inventory;

DROP TABLE pos_inventory;
ALTER TABLE pos_inventory_new RENAME TO pos_inventory;

CREATE INDEX idx_inventory_store_product ON pos_inventory(store_id, product_id);
CREATE INDEX idx_inventory_organization ON pos_inventory(organization_id);

-- ============================================================
-- 3. pos_stock_movements
-- ============================================================
CREATE TABLE pos_stock_movements_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    movement_type TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    unit_cost DECIMAL(10,2),
    total_cost DECIMAL(10,2),
    reference_type TEXT,
    reference_id INTEGER,
    reason TEXT,
    notes TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
    FOREIGN KEY (store_id) REFERENCES pos_stores(id),
    FOREIGN KEY (product_id) REFERENCES pos_products(id),
    FOREIGN KEY (variant_id) REFERENCES pos_product_variants(id),
    FOREIGN KEY (created_by) REFERENCES pos_users(id)
);

INSERT INTO pos_stock_movements_new (
    id, organization_id, store_id, product_id, variant_id,
    movement_type, quantity, previous_quantity, new_quantity,
    unit_cost, total_cost,
    reference_type, reference_id,
    reason, notes,
    created_by, created_at
)
SELECT
    id, organization_id, store_id, product_id, variant_id,
    movement_type, quantity, previous_quantity, new_quantity,
    unit_cost, total_cost,
    reference_type, reference_id,
    reason, notes,
    created_by, created_at
FROM pos_stock_movements;

DROP TABLE pos_stock_movements;
ALTER TABLE pos_stock_movements_new RENAME TO pos_stock_movements;

CREATE INDEX idx_stock_movements_product ON pos_stock_movements(product_id);
CREATE INDEX idx_stock_movements_store ON pos_stock_movements(store_id);
CREATE INDEX idx_stock_movements_date ON pos_stock_movements(created_at);
CREATE INDEX idx_stock_movements_type ON pos_stock_movements(movement_type);

CREATE TRIGGER update_inventory_after_movement
    AFTER INSERT ON pos_stock_movements
    BEGIN
        UPDATE pos_inventory SET
            quantity_on_hand = NEW.new_quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE store_id = NEW.store_id
            AND product_id = NEW.product_id
            AND (variant_id = NEW.variant_id OR (variant_id IS NULL AND NEW.variant_id IS NULL));
    END;

-- ============================================================
-- 4. pos_stock_adjustment_items
-- ============================================================
CREATE TABLE pos_stock_adjustment_items_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    adjustment_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    expected_quantity INTEGER NOT NULL,
    actual_quantity INTEGER NOT NULL,
    difference INTEGER GENERATED ALWAYS AS (actual_quantity - expected_quantity) STORED,
    unit_cost DECIMAL(10,2) NOT NULL,
    cost_impact DECIMAL(10,2) GENERATED ALWAYS AS (difference * unit_cost) STORED,
    reason TEXT,
    FOREIGN KEY (adjustment_id) REFERENCES pos_stock_adjustments(id),
    FOREIGN KEY (product_id) REFERENCES pos_products(id),
    FOREIGN KEY (variant_id) REFERENCES pos_product_variants(id)
);

INSERT INTO pos_stock_adjustment_items_new (
    id, adjustment_id, product_id, variant_id,
    expected_quantity, actual_quantity,
    unit_cost, reason
)
SELECT
    id, adjustment_id, product_id, variant_id,
    expected_quantity, actual_quantity,
    unit_cost, reason
FROM pos_stock_adjustment_items;

DROP TABLE pos_stock_adjustment_items;
ALTER TABLE pos_stock_adjustment_items_new RENAME TO pos_stock_adjustment_items;

-- ============================================================
-- 5. pos_recipe_ingredients  (both product_id AND ingredient_id -> pos_products)
-- ============================================================
CREATE TABLE pos_recipe_ingredients_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    ingredient_id TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES pos_products(id),
    FOREIGN KEY (ingredient_id) REFERENCES pos_products(id)
);

INSERT INTO pos_recipe_ingredients_new (
    id, tenant_id, product_id, ingredient_id,
    quantity, unit, created_at
)
SELECT
    id, tenant_id, product_id, ingredient_id,
    quantity, unit, created_at
FROM pos_recipe_ingredients;

DROP TABLE pos_recipe_ingredients;
ALTER TABLE pos_recipe_ingredients_new RENAME TO pos_recipe_ingredients;

CREATE INDEX idx_recipe_product
    ON pos_recipe_ingredients(product_id);
CREATE INDEX idx_recipe_ingredient
    ON pos_recipe_ingredients(ingredient_id);
CREATE INDEX idx_recipe_tenant_product
  ON pos_recipe_ingredients(tenant_id, product_id);

-- ============================================================
-- 6. pos_inventory_logs  (product_id -> pos_products, ON DELETE CASCADE)
-- ============================================================
CREATE TABLE pos_inventory_logs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    tenant_id TEXT DEFAULT 'acaciacamp',
    type TEXT NOT NULL,
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    reference_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES pos_products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES pos_users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT INTO pos_inventory_logs_new (
    id, product_id, user_id, tenant_id, type,
    quantity_change, previous_quantity, new_quantity,
    reason, reference_id, created_at
)
SELECT
    id, product_id, user_id, tenant_id, type,
    quantity_change, previous_quantity, new_quantity,
    reason, reference_id, created_at
FROM pos_inventory_logs;

DROP TABLE pos_inventory_logs;
ALTER TABLE pos_inventory_logs_new RENAME TO pos_inventory_logs;

CREATE INDEX idx_pos_inventory_logs_product ON pos_inventory_logs(product_id, created_at);
CREATE INDEX idx_pos_inventory_logs_tenant ON pos_inventory_logs(tenant_id);

PRAGMA defer_foreign_keys = OFF;
