-- Migration 0048: price_overrides — per-room-product, per-night price overrides
--
-- Seasonal rate_plans_new rows price a whole range; this table lets a tenant
-- pin an exact price for a single product on a single night (YYYY-MM-DD),
-- overriding whatever the rate plan or the product base_price would otherwise
-- produce. Unit matches rate_plans_new.price_per_night (integer pounds).
--
-- Tenant scoping is intentionally NOT stored here: it is enforced via the
-- products join (price_overrides.product_id -> products.id), exactly like
-- rate_plans_new does. product_id is typed INTEGER to match the surrounding
-- schema style; SQLite's dynamic typing keeps TEXT product ids (prod_1, ...)
-- working unchanged.

-- ============================================================
-- 1. price_overrides
-- ============================================================
CREATE TABLE price_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    price INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(product_id, date)
);

CREATE INDEX idx_price_overrides_product_date
    ON price_overrides(product_id, date);
