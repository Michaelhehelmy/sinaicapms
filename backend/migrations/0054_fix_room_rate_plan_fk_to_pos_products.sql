-- Migration 0054: Fix rooms_new and rate_plans_new FKs to reference pos_products
--
-- ROOT CAUSE: rooms_new.product_id REFERENCES products(id), but all actual product
-- data lives in pos_products (the `products` table from 0028 is empty in production).
-- The backend already reads from pos_products exclusively (D5 fix). This migration
-- rebuilds rooms_new and rate_plans_new with FK → pos_products(id).
--
-- D1 (SQLite) does not support ALTER CONSTRAINT, so we use the rename-swap pattern.
-- IMPORTANT: PRAGMA foreign_keys = OFF is required (not defer_foreign_keys) because
-- DROP TABLE checks FK constraints even when deferred. The orders table references
-- rooms_new(id), so we must fully disable FK enforcement during the swap.

PRAGMA foreign_keys = OFF;

-- ============================================================
-- 1. rooms_new → rebuild with FK to pos_products
-- ============================================================
CREATE TABLE rooms_new_v2 (
    id TEXT PRIMARY KEY,
    camp_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES pos_products(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    bed_type TEXT DEFAULT 'single',
    max_guests INTEGER DEFAULT 2,
    base_price REAL DEFAULT 0,
    floor TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    tenant_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

INSERT INTO rooms_new_v2 (
    id, camp_id, product_id, name, status, bed_type, max_guests,
    base_price, floor, notes, is_active, tenant_id, created_at, updated_at
)
SELECT
    id, camp_id, product_id, name, status, bed_type, max_guests,
    base_price, floor, notes, is_active, tenant_id, created_at, updated_at
FROM rooms_new;

DROP TABLE rooms_new;
ALTER TABLE rooms_new_v2 RENAME TO rooms_new;

CREATE INDEX IF NOT EXISTS idx_rooms_new_camp ON rooms_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_product ON rooms_new(product_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_status ON rooms_new(status);

-- ============================================================
-- 2. rate_plans_new → rebuild with FK to pos_products
-- ============================================================
CREATE TABLE rate_plans_new_v2 (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    season TEXT CHECK(season IN ('summer', 'winter', 'all')) DEFAULT 'all',
    start_date TEXT,
    end_date TEXT,
    price_per_night REAL NOT NULL,
    min_stay INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

INSERT INTO rate_plans_new_v2 (
    id, tenant_id, product_id, name, season, start_date, end_date,
    price_per_night, min_stay, is_active, created_at, updated_at
)
SELECT
    id, tenant_id, product_id, name, season, start_date, end_date,
    price_per_night, min_stay, is_active, created_at, updated_at
FROM rate_plans_new;

DROP TABLE rate_plans_new;
ALTER TABLE rate_plans_new_v2 RENAME TO rate_plans_new;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_tenant ON rate_plans_new(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_product ON rate_plans_new(product_id);

PRAGMA foreign_keys = ON;
