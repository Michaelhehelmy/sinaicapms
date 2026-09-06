-- Migration 0096: Storefront product-cart orders.
--
-- The canonical `orders` table (0028) is room-booking-centric (room_id NOT
-- NULL, order_state_id, check_in/out) and CANNOT hold product-cart sales; the
-- booking flow also owns `order_items` (0067 — type/reference_id/name).
-- Storefront checkout therefore gets its own order tables: a product-cart
-- order plus per-line snapshots of the product name/price. Reference follows
-- the booking-flow convention (ORD- + 6 random alnum chars, no COUNT(*) races).
CREATE TABLE IF NOT EXISTS storefront_orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    reference TEXT UNIQUE NOT NULL,
    session_id TEXT,
    total_amount REAL DEFAULT 0,
    currency TEXT DEFAULT 'EGP',
    status TEXT DEFAULT 'pending',
    payment_status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS storefront_order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER DEFAULT 1,
    unit_price REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_storefront_orders_tenant ON storefront_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_storefront_orders_session ON storefront_orders(session_id);
CREATE INDEX IF NOT EXISTS idx_storefront_order_items_order ON storefront_order_items(order_id);