-- Migration 0028: Create simplified booking-only schema
-- This migration creates all new tables alongside existing ones.
-- Old tables will be dropped in a later migration after data is migrated.

-- ============================================================
-- 1. languages – Language lookup (required for all _lang tables)
-- ============================================================
CREATE TABLE IF NOT EXISTS languages (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_default INTEGER DEFAULT 0
);

-- ============================================================
-- 2. admins – Simple admin users (replaces pos_users for auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('super_admin', 'admin')),
    first_name TEXT,
    last_name TEXT,
    is_active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

-- ============================================================
-- 3. categories – Hierarchical product categories
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    active INTEGER DEFAULT 1,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

-- ============================================================
-- 4. category_lang – Multilingual category names
-- ============================================================
CREATE TABLE IF NOT EXISTS category_lang (
    category_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    link_rewrite TEXT,
    meta_title TEXT,
    meta_description TEXT,
    meta_keywords TEXT,
    PRIMARY KEY (category_id, lang)
);

-- ============================================================
-- 5. products – Room types only (replaces pos_products type='room')
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
    sku TEXT,
    base_price REAL NOT NULL DEFAULT 0,
    capacity INTEGER DEFAULT 2,
    image_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

-- ============================================================
-- 6. product_lang – Multilingual room descriptions
-- ============================================================
CREATE TABLE IF NOT EXISTS product_lang (
    product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
    lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    short_description TEXT,
    meta_title TEXT,
    meta_description TEXT,
    link_rewrite TEXT,
    PRIMARY KEY (product_id, lang)
);

-- ============================================================
-- 7. product_camps – Many-to-many products <-> camps
-- ============================================================
CREATE TABLE IF NOT EXISTS product_camps_new (
    product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
    camp_id TEXT REFERENCES camps(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, camp_id)
);

-- ============================================================
-- 8. rooms_new – Physical rooms (updated FK to products)
-- ============================================================
CREATE TABLE IF NOT EXISTS rooms_new (
    id TEXT PRIMARY KEY,
    camp_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'available',
    bed_type TEXT DEFAULT 'single',
    max_guests INTEGER DEFAULT 2,
    base_price REAL DEFAULT 0,
    floor TEXT,
    notes TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

-- ============================================================
-- 9. rate_plans_new – Seasonal pricing (updated FK to products)
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_plans_new (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
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

-- ============================================================
-- 10. order_state – Reservation status definitions
-- ============================================================
CREATE TABLE IF NOT EXISTS order_state (
    id TEXT PRIMARY KEY,
    color TEXT,
    logable INTEGER DEFAULT 0,
    shipped INTEGER DEFAULT 0,
    invoice INTEGER DEFAULT 0,
    paid INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0
);

-- ============================================================
-- 11. order_state_lang – Multilingual status names
-- ============================================================
CREATE TABLE IF NOT EXISTS order_state_lang (
    order_state_id TEXT REFERENCES order_state(id) ON DELETE CASCADE,
    lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template TEXT,
    PRIMARY KEY (order_state_id, lang)
);

-- ============================================================
-- 12. order_return_state – Refund status definitions (before order_return)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_return_state (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT
);

-- ============================================================
-- 13. customers – Guest CRM (simplified)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

-- ============================================================
-- 14. orders – Reservations (replaces reservations table)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    camp_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
    room_id TEXT NOT NULL REFERENCES rooms_new(id) ON DELETE RESTRICT,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    order_state_id TEXT NOT NULL REFERENCES order_state(id) ON DELETE RESTRICT,
    check_in_date TEXT NOT NULL,
    check_out_date TEXT NOT NULL,
    number_of_people INTEGER DEFAULT 1,
    total_amount REAL NOT NULL DEFAULT 0,
    amount_paid REAL DEFAULT 0,
    payment_method TEXT,
    payment_status TEXT DEFAULT 'pending',
    reference TEXT UNIQUE NOT NULL,
    invoice_date TEXT,
    notes TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

-- ============================================================
-- 15. order_return – Refund requests
-- ============================================================
CREATE TABLE IF NOT EXISTS order_return (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
    state_id TEXT REFERENCES order_return_state(id) ON DELETE RESTRICT,
    date_add TEXT DEFAULT CURRENT_TIMESTAMP,
    date_upd TEXT
);

-- ============================================================
-- 16. order_return_detail – Refund line items
-- ============================================================
CREATE TABLE IF NOT EXISTS order_return_detail (
    id TEXT PRIMARY KEY,
    order_return_id TEXT NOT NULL REFERENCES order_return(id) ON DELETE CASCADE,
    room_id TEXT REFERENCES rooms_new(id) ON DELETE SET NULL,
    product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price REAL NOT NULL DEFAULT 0,
    total_price REAL NOT NULL DEFAULT 0,
    reason TEXT
);

-- ============================================================
-- 17. meal_categories – Menu categories
-- ============================================================
CREATE TABLE IF NOT EXISTS meal_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    position INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

-- ============================================================
-- 18. meal_categories_lang – Multilingual menu category names
-- ============================================================
CREATE TABLE IF NOT EXISTS meal_categories_lang (
    meal_category_id TEXT REFERENCES meal_categories(id) ON DELETE CASCADE,
    lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    PRIMARY KEY (meal_category_id, lang)
);

-- ============================================================
-- 19. meals – Menu items
-- ============================================================
CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    meal_category_id TEXT NOT NULL REFERENCES meal_categories(id) ON DELETE CASCADE,
    price REAL NOT NULL DEFAULT 0,
    image_url TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

-- ============================================================
-- 20. meal_lang – Multilingual meal names
-- ============================================================
CREATE TABLE IF NOT EXISTS meal_lang (
    meal_id TEXT REFERENCES meals(id) ON DELETE CASCADE,
    lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    PRIMARY KEY (meal_id, lang)
);

-- ============================================================
-- 21. plans_new – Activity/event plans (updated schema)
-- ============================================================
CREATE TABLE IF NOT EXISTS plans_new (
    id TEXT PRIMARY KEY,
    camp_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    date TEXT,
    time TEXT,
    capacity INTEGER,
    status TEXT DEFAULT 'planned',
    category TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Indexes for new tables
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_admins_tenant ON admins(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
CREATE INDEX IF NOT EXISTS idx_admins_role ON admins(role);

CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(tenant_id, is_active);

CREATE INDEX IF NOT EXISTS idx_product_camps_new_product ON product_camps_new(product_id);
CREATE INDEX IF NOT EXISTS idx_product_camps_new_camp ON product_camps_new(camp_id);

CREATE INDEX IF NOT EXISTS idx_rooms_new_camp ON rooms_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_product ON rooms_new(product_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_status ON rooms_new(status);

CREATE INDEX IF NOT EXISTS idx_rate_plans_new_tenant ON rate_plans_new(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_product ON rate_plans_new(product_id);
CREATE INDEX IF NOT EXISTS idx_rate_plans_new_season ON rate_plans_new(season, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_camp ON orders(camp_id);
CREATE INDEX IF NOT EXISTS idx_orders_room ON orders(room_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(order_state_id);
CREATE INDEX IF NOT EXISTS idx_orders_dates ON orders(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(reference);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

CREATE INDEX IF NOT EXISTS idx_order_return_order ON order_return(order_id);
CREATE INDEX IF NOT EXISTS idx_order_return_detail_return ON order_return_detail(order_return_id);

CREATE INDEX IF NOT EXISTS idx_meal_categories_tenant ON meal_categories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meals_tenant ON meals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meals_category ON meals(meal_category_id);

CREATE INDEX IF NOT EXISTS idx_plans_new_camp ON plans_new(camp_id);
