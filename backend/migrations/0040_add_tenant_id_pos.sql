-- Migration 0040: Add tenant_id to POS tables missing tenant scoping
-- Tables affected: pos_customers, pos_activity_logs, pos_staff_stats, pos_inventory_logs
--
-- D1 batch mode does NOT honor PRAGMA foreign_keys within a batch.
-- Strategy: create new tables WITH FK constraints, but filter INSERT to only valid rows.
-- Orphaned rows are silently dropped. Default tenant_id: 'acaciacamp'.

-- Drop triggers that reference pos_customers (recreated after table swap)
DROP TRIGGER IF EXISTS update_customer_stats_after_order;
DROP TRIGGER IF EXISTS update_customers_timestamp;

-- ============================================================
-- 1. pos_customers — Add tenant_id, preserve organization_id
-- ============================================================

CREATE TABLE pos_customers_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    tenant_id TEXT NOT NULL DEFAULT 'acaciacamp',
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
    FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT INTO pos_customers_new (
    id, organization_id, tenant_id, customer_number, first_name, last_name,
    email, phone, date_of_birth, gender, address, city, state, postal_code,
    country, customer_group, loyalty_points, total_spent, total_orders,
    average_order_value, last_order_date, acquisition_source, preferences,
    notes, is_vip, is_active, created_at, updated_at
)
SELECT
    c.id, c.organization_id,
    'acaciacamp',
    c.customer_number, c.first_name, c.last_name,
    c.email, c.phone, c.date_of_birth, c.gender, c.address, c.city, c.state, c.postal_code,
    c.country, c.customer_group, c.loyalty_points, c.total_spent, c.total_orders,
    c.average_order_value, c.last_order_date, c.acquisition_source, c.preferences,
    c.notes, c.is_vip, c.is_active, c.created_at, c.updated_at
FROM pos_customers c
WHERE EXISTS (SELECT 1 FROM pos_organizations WHERE id = c.organization_id);

DROP TABLE pos_customers;
ALTER TABLE pos_customers_new RENAME TO pos_customers;

CREATE INDEX IF NOT EXISTS idx_customers_organization ON pos_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON pos_customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON pos_customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_number ON pos_customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_pos_customers_tenant ON pos_customers(tenant_id);

-- ============================================================
-- 2. pos_activity_logs — Add tenant_id
-- ============================================================

CREATE TABLE pos_activity_logs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    tenant_id TEXT DEFAULT 'acaciacamp',
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    new_values TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES pos_users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT INTO pos_activity_logs_new (
    id, user_id, tenant_id, action, entity_type, entity_id, new_values, created_at
)
SELECT
    l.id, l.user_id,
    'acaciacamp',
    l.action, l.entity_type, l.entity_id, l.new_values, l.created_at
FROM pos_activity_logs l
WHERE l.user_id IS NULL OR EXISTS (SELECT 1 FROM pos_users WHERE id = l.user_id);

DROP TABLE pos_activity_logs;
ALTER TABLE pos_activity_logs_new RENAME TO pos_activity_logs;

CREATE INDEX IF NOT EXISTS idx_pos_activity_logs_user ON pos_activity_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_activity_logs_tenant ON pos_activity_logs(tenant_id);

-- ============================================================
-- 3. pos_staff_stats — Add tenant_id
-- ============================================================

CREATE TABLE pos_staff_stats_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    tenant_id TEXT DEFAULT 'acaciacamp',
    total_sales DECIMAL(12,2) DEFAULT 0.0,
    total_orders INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    commission_earned DECIMAL(10,2) DEFAULT 0.0,
    current_streak INTEGER DEFAULT 0,
    last_sale DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES pos_users(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT INTO pos_staff_stats_new (
    id, user_id, tenant_id, total_sales, total_orders, total_points,
    commission_earned, current_streak, last_sale, created_at, updated_at
)
SELECT
    s.id, s.user_id,
    'acaciacamp',
    s.total_sales, s.total_orders, s.total_points,
    s.commission_earned, s.current_streak, s.last_sale, s.created_at, s.updated_at
FROM pos_staff_stats s
WHERE EXISTS (SELECT 1 FROM pos_users WHERE id = s.user_id);

DROP TABLE pos_staff_stats;
ALTER TABLE pos_staff_stats_new RENAME TO pos_staff_stats;

CREATE INDEX IF NOT EXISTS idx_pos_staff_stats_tenant ON pos_staff_stats(tenant_id);

-- ============================================================
-- 4. pos_inventory_logs — Add tenant_id
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
    id, product_id, user_id, tenant_id, type, quantity_change,
    previous_quantity, new_quantity, reason, reference_id, created_at
)
SELECT
    l.id, l.product_id, l.user_id,
    'acaciacamp',
    l.type, l.quantity_change,
    l.previous_quantity, l.new_quantity, l.reason, l.reference_id, l.created_at
FROM pos_inventory_logs l
WHERE EXISTS (SELECT 1 FROM pos_products WHERE id = l.product_id)
  AND EXISTS (SELECT 1 FROM pos_users WHERE id = l.user_id);

DROP TABLE pos_inventory_logs;
ALTER TABLE pos_inventory_logs_new RENAME TO pos_inventory_logs;

CREATE INDEX IF NOT EXISTS idx_pos_inventory_logs_product ON pos_inventory_logs(product_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_inventory_logs_tenant ON pos_inventory_logs(tenant_id);

-- Recreate triggers that were dropped at the start of this migration
CREATE TRIGGER update_customers_timestamp
    AFTER UPDATE ON pos_customers
    BEGIN
        UPDATE pos_customers SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_customer_stats_after_order
    AFTER INSERT ON pos_transactions
    WHEN NEW.status = 'completed' AND NEW.customer_id IS NOT NULL
    BEGIN
        UPDATE pos_customers SET
            total_spent = total_spent + NEW.total_amount,
            total_orders = total_orders + 1,
            average_order_value = (total_spent + NEW.total_amount) / (total_orders + 1),
            last_order_date = DATE(NEW.created_at),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.customer_id;
    END;
