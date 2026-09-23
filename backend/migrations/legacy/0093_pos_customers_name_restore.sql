-- Migration 0093: Restore pos_customers.name generated column (M9)
--
-- 0016 added `name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name)
-- STORED` to pos_customers. 0040 then rebuilt the table with an explicit
-- column list that DROPPED the generated column. This migration restores the
-- exact 0016 expression at the same position ALTER TABLE ADD COLUMN would have
-- produced (end of the column list), preserving every other column, the
-- organization/tenant FKs, the five indexes, and the live child FK from
-- pos_transactions (auto-repointed by SQLite on RENAME).
--
-- The generated column is STORED — INSERT column lists must never include it
-- (any reader of pos_customers gets `name` for free).

-- No live triggers reference pos_customers (0055 dropped the last two), so no
-- trigger dance is required.

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
    -- restored generated column (0016 expression; 0040's rebuild dropped it)
    name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
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
    c.tenant_id,
    c.customer_number, c.first_name, c.last_name,
    c.email, c.phone, c.date_of_birth, c.gender, c.address, c.city, c.state, c.postal_code,
    c.country, c.customer_group, c.loyalty_points, c.total_spent, c.total_orders,
    c.average_order_value, c.last_order_date, c.acquisition_source, c.preferences,
    c.notes, c.is_vip, c.is_active, c.created_at, c.updated_at
FROM pos_customers c
WHERE EXISTS (SELECT 1 FROM pos_organizations WHERE id = c.organization_id);

DROP TABLE IF EXISTS pos_customers;
ALTER TABLE pos_customers_new RENAME TO pos_customers;

CREATE INDEX IF NOT EXISTS idx_customers_organization ON pos_customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON pos_customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON pos_customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_number ON pos_customers(customer_number);
CREATE INDEX IF NOT EXISTS idx_pos_customers_tenant ON pos_customers(tenant_id);

PRAGMA foreign_key_check;