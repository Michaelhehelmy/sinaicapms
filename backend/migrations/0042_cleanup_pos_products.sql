-- Migration 0042: Remove redundant columns from pos_products
-- Drops 3 columns: price, reorder_level, category TEXT
--
-- D1 batch mode: use PRAGMA defer_foreign_keys to defer FK checks until COMMIT.
-- This allows the RENAME-swap pattern to work without triggering FK violations
-- on child tables (pos_recipe_ingredients, pos_inventory_logs, etc.).

PRAGMA defer_foreign_keys = ON;

-- ============================================================
-- 1. Drop triggers and indexes that reference pos_products
-- ============================================================
DROP TRIGGER IF EXISTS update_products_timestamp;

DROP INDEX IF EXISTS idx_products_organization;
DROP INDEX IF EXISTS idx_products_category;
DROP INDEX IF EXISTS idx_products_sku;
DROP INDEX IF EXISTS idx_products_barcode;
DROP INDEX IF EXISTS idx_products_active;
DROP INDEX IF EXISTS idx_pos_products_camp;
DROP INDEX IF EXISTS idx_pos_products_type;
DROP INDEX IF EXISTS idx_pos_products_tenant_type;
DROP INDEX IF EXISTS idx_pos_products_deleted;
DROP INDEX IF EXISTS idx_pos_products_active_tenant;

-- ============================================================
-- 2. Create new table WITHOUT the 3 redundant columns
-- ============================================================
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
    capacity INTEGER DEFAULT 1
);

-- ============================================================
-- 3. Copy data (exclude profit_margin — generated, and 3 dropped columns)
-- ============================================================
INSERT INTO pos_products_new (
    id, tenant_id, organization_id, category_id, brand_id, supplier_id,
    sku, barcode, name, description, short_description, images,
    cost_price, selling_price, compare_price,
    weight, dimensions, unit,
    min_stock_level, max_stock_level, reorder_point,
    is_trackable, is_serialized, is_active, is_featured,
    tags, attributes, seo_title, seo_description, type,
    deleted_at, created_at, updated_at,
    stock_quantity, image_url, tax_rate,
    camp_id, capacity
)
SELECT
    id, tenant_id, organization_id, category_id, brand_id, supplier_id,
    sku, barcode, name, description, short_description, images,
    cost_price, selling_price, compare_price,
    weight, dimensions, unit,
    min_stock_level, max_stock_level, reorder_point,
    is_trackable, is_serialized, is_active, is_featured,
    tags, attributes, seo_title, seo_description, type,
    deleted_at, created_at, updated_at,
    stock_quantity, image_url, tax_rate,
    camp_id, capacity
FROM pos_products;

-- ============================================================
-- 4. Swap tables
-- ============================================================
ALTER TABLE pos_products RENAME TO pos_products_old;
ALTER TABLE pos_products_new RENAME TO pos_products;

-- ============================================================
-- 5. Clean up old table (FK checks deferred, so DROP succeeds)
-- ============================================================
DROP TABLE pos_products_old;

-- ============================================================
-- 6. Recreate indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_products_organization ON pos_products(organization_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON pos_products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON pos_products(sku);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON pos_products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_active ON pos_products(is_active);
CREATE INDEX IF NOT EXISTS idx_pos_products_camp ON pos_products(camp_id);
CREATE INDEX IF NOT EXISTS idx_pos_products_type ON pos_products(type);
CREATE INDEX IF NOT EXISTS idx_pos_products_tenant_type ON pos_products(tenant_id, type, is_active);
CREATE INDEX IF NOT EXISTS idx_pos_products_deleted ON pos_products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_pos_products_active_tenant ON pos_products(is_active, tenant_id, type);

-- ============================================================
-- 7. Recreate trigger
-- ============================================================
CREATE TRIGGER update_products_timestamp
    AFTER UPDATE ON pos_products
    BEGIN
        UPDATE pos_products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Re-enable FK checks (deferred checks will run at COMMIT)
PRAGMA defer_foreign_keys = OFF;
