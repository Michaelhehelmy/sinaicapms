-- Baseline 0004_pos.sql: POS organizations/stores/products/transactions/users/shifts + tenant-org mapping + view.
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Generated verbatim from the canonical post-109 schema export (2026-09-23);
-- do NOT hand-edit DDL — the Stage-1c sqlite_master diff against canonical is the gate.
-- Tables: pos_organizations, pos_stores, pos_products, pos_recipe_ingredients, pos_transactions, pos_transaction_items, pos_users, pos_shifts, pos_customers, pos_tables, tenant_org_mapping
PRAGMA defer_foreign_keys = ON;

CREATE TABLE pos_organizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    logo_url TEXT,
    website TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'VN',
    postal_code TEXT,
    timezone TEXT DEFAULT 'Asia/Ho_Chi_Minh',
    currency TEXT DEFAULT 'VND',
    tax_rate REAL DEFAULT 0.1,
    business_type TEXT DEFAULT 'retail',
    license_number TEXT,
    pos_settings JSON DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pos_stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    phone TEXT,
    email TEXT,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT,
    postal_code TEXT,
    latitude REAL,
    longitude REAL,
    manager_id INTEGER,
    opening_hours JSON DEFAULT '{}',
    pos_settings JSON DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
    FOREIGN KEY (manager_id) REFERENCES pos_users(id)
);

CREATE TABLE "pos_products" (
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
, variant_of TEXT, variant_attributes TEXT DEFAULT '{}', supplier_name TEXT);

CREATE TABLE "pos_recipe_ingredients" (
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

CREATE TABLE "pos_transactions" (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_1',
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
  FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
  FOREIGN KEY (store_id) REFERENCES pos_stores(id),
  FOREIGN KEY (customer_id) REFERENCES pos_customers(id)
);

CREATE TABLE "pos_transaction_items" (
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
    FOREIGN KEY (order_id) REFERENCES pos_transactions(id),
    FOREIGN KEY (product_id) REFERENCES pos_products(id)
);

CREATE TABLE pos_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    store_id INTEGER,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'cashier',
    permissions JSON DEFAULT '[]',
    employee_id TEXT,
    department TEXT,
    hire_date DATE,
    salary DECIMAL(10,2),
    commission_rate REAL DEFAULT 0.0,
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    last_login_at DATETIME,
    password_reset_token TEXT,
    password_reset_expires DATETIME,
    two_factor_secret TEXT,
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    login_attempts INTEGER DEFAULT 0,
    locked_until DATETIME,
    pos_settings JSON DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED, tenant_id TEXT, deleted_at DATETIME, last_login DATETIME, status TEXT DEFAULT 'active', camp_id TEXT,
    FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
    FOREIGN KEY (store_id) REFERENCES pos_stores(id)
);

CREATE TABLE pos_shifts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', 
  opening_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closing_time DATETIME,
  opening_cash REAL NOT NULL DEFAULT 0.0,
  expected_closing_cash REAL NOT NULL DEFAULT 0.0,
  actual_closing_cash REAL,
  notes TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE "pos_customers" (
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
    
    name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
    FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE pos_tables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 2,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'reserved', 'cleaning')),
  section TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, reservation_name TEXT, reservation_time TEXT, reservation_date TEXT, party_size INTEGER DEFAULT 0);

CREATE TABLE tenant_org_mapping (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     TEXT    NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL UNIQUE,
  created_at    TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id)     REFERENCES tenants(id)           ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES pos_organizations(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX idx_customers_email ON pos_customers(email);
CREATE INDEX idx_customers_number ON pos_customers(customer_number);
CREATE INDEX idx_customers_organization ON pos_customers(organization_id);
CREATE INDEX idx_customers_phone ON pos_customers(phone);
CREATE INDEX idx_orders_cashier ON pos_transactions(cashier_id);
CREATE INDEX idx_orders_customer ON pos_transactions(customer_id);
CREATE INDEX idx_orders_date ON pos_transactions(created_at);
CREATE INDEX idx_orders_number ON pos_transactions(order_number);
CREATE INDEX idx_orders_organization_store ON pos_transactions(organization_id, store_id);
CREATE INDEX idx_orders_status ON pos_transactions(status);
CREATE INDEX idx_pos_customers_tenant ON pos_customers(tenant_id);
CREATE INDEX idx_pos_products_active ON pos_products(is_active, deleted_at);
CREATE INDEX idx_pos_products_active_tenant ON pos_products(is_active, tenant_id, type);
CREATE INDEX idx_pos_products_barcode ON pos_products(barcode);
CREATE INDEX idx_pos_products_camp ON pos_products(camp_id);
CREATE INDEX idx_pos_products_category ON pos_products(category_id);
CREATE INDEX idx_pos_products_deleted ON pos_products(deleted_at);
CREATE INDEX idx_pos_products_org ON pos_products(organization_id);
CREATE INDEX idx_pos_products_stock ON pos_products(stock_quantity, min_stock_level);
CREATE INDEX idx_pos_products_tenant ON pos_products(tenant_id);
CREATE INDEX idx_pos_products_tenant_type ON pos_products(tenant_id, type, is_active);
CREATE INDEX idx_pos_products_type ON pos_products(type);
CREATE INDEX idx_pos_shifts_dates ON pos_shifts(opening_time, closing_time);
CREATE INDEX idx_pos_shifts_staff ON pos_shifts(cashier_id);
CREATE INDEX idx_pos_shifts_tenant ON pos_shifts(tenant_id);
CREATE INDEX idx_pos_stores_organization
  ON pos_stores(organization_id);
CREATE INDEX idx_pos_tables_section ON pos_tables(section);
CREATE INDEX idx_pos_tables_status ON pos_tables(tenant_id, status);
CREATE INDEX idx_pos_tables_tenant ON pos_tables(tenant_id);
CREATE INDEX idx_pos_transaction_items_transaction ON pos_transaction_items(transaction_id);
CREATE INDEX idx_pos_transactions_cashier ON pos_transactions(cashier_id, created_at);
CREATE INDEX idx_pos_transactions_customer ON pos_transactions(customer_id);
CREATE UNIQUE INDEX idx_pos_transactions_idempotency
  ON pos_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_pos_transactions_tenant_date ON pos_transactions(tenant_id, created_at);
CREATE INDEX idx_pos_tx_items_product ON pos_transaction_items(product_id);
CREATE INDEX idx_pos_tx_items_tenant ON pos_transaction_items(tenant_id);
CREATE INDEX idx_pos_tx_items_tx ON pos_transaction_items(transaction_id);
CREATE INDEX idx_pos_tx_kitchen ON pos_transactions(kitchen_status);
CREATE INDEX idx_pos_tx_staff ON pos_transactions(cashier_id);
CREATE INDEX idx_pos_tx_status ON pos_transactions(status);
CREATE INDEX idx_pos_tx_tenant_date ON pos_transactions(tenant_id, created_at);
CREATE INDEX idx_pos_tx_type ON pos_transactions(order_type);
CREATE INDEX idx_pos_users_email ON pos_users(email);
CREATE INDEX idx_pos_users_email_tenant
    ON pos_users(email, tenant_id);
CREATE INDEX idx_pos_users_email_username ON pos_users(email, username, tenant_id);
CREATE INDEX idx_pos_users_org ON pos_users(organization_id);
CREATE INDEX idx_pos_users_password_reset_token ON pos_users(password_reset_token);
CREATE INDEX idx_pos_users_role ON pos_users(role);
CREATE INDEX idx_pos_users_status ON pos_users(status);
CREATE INDEX idx_pos_users_tenant
    ON pos_users(tenant_id);
CREATE INDEX idx_pos_users_tenant_role ON pos_users(tenant_id, role, deleted_at);
CREATE INDEX idx_pos_users_username ON pos_users(username);
CREATE INDEX idx_products_active ON pos_products(is_active);
CREATE INDEX idx_products_barcode ON pos_products(barcode);
CREATE INDEX idx_products_category ON pos_products(category_id);
CREATE INDEX idx_products_organization ON pos_products(organization_id);
CREATE INDEX idx_products_sku ON pos_products(sku);
CREATE INDEX idx_recipe_ingredient
    ON pos_recipe_ingredients(ingredient_id);
CREATE INDEX idx_recipe_product
    ON pos_recipe_ingredients(product_id);
CREATE INDEX idx_recipe_tenant_product
  ON pos_recipe_ingredients(tenant_id, product_id);
CREATE INDEX idx_shifts_status ON pos_shifts(status);
CREATE INDEX idx_shifts_tenant_cashier ON pos_shifts(tenant_id, cashier_id);
CREATE INDEX idx_shifts_tenant_cashier_status
  ON pos_shifts(tenant_id, cashier_id, status);
CREATE INDEX idx_tenant_org_mapping_org
  ON tenant_org_mapping(organization_id);
CREATE INDEX idx_users_email ON pos_users(email);
CREATE INDEX idx_users_organization_store ON pos_users(organization_id, store_id);
CREATE INDEX idx_users_role ON pos_users(role);

-- Triggers
CREATE TRIGGER update_products_timestamp
    AFTER UPDATE ON pos_products
    BEGIN
        UPDATE pos_products SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER update_users_timestamp 
    AFTER UPDATE ON pos_users
    BEGIN
        UPDATE pos_users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

-- Views
CREATE VIEW v_tenant_org AS
SELECT tenant_id, organization_id
FROM   tenant_org_mapping;
