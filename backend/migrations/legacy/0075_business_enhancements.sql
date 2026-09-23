-- 0075: Business module enhancements
-- Adds columns for Camp/Hotel, Supermarket, Restaurant, Service modules
-- All columns are nullable or have defaults for backward compatibility

-- ══════════════════════════════════════════════════════════════════════
-- CAMP / HOTEL ENHANCEMENTS (B1)
-- ══════════════════════════════════════════════════════════════════════

-- Room cleaning status (B1.1)
ALTER TABLE rooms_new ADD COLUMN cleaning_status TEXT DEFAULT 'clean'
  CHECK(cleaning_status IN ('dirty', 'in_progress', 'clean', 'inspected'));

-- Early / late check-in/out (B1.2)
ALTER TABLE orders ADD COLUMN early_checkin INTEGER DEFAULT 0;  -- boolean: allow early check-in
ALTER TABLE orders ADD COLUMN late_checkout INTEGER DEFAULT 0;  -- boolean: allow late check-out
ALTER TABLE orders ADD COLUMN requested_checkin_time TEXT;      -- e.g. "10:00"
ALTER TABLE orders ADD COLUMN requested_checkout_time TEXT;     -- e.g. "14:00"

-- Guest count tracking (B1.3)
ALTER TABLE orders ADD COLUMN adult_count INTEGER DEFAULT 1;
ALTER TABLE orders ADD COLUMN child_count INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN extra_guest_charge REAL DEFAULT 0;

-- Room number on rooms_new (B1.4) — explicit room_number field
-- (idx_rooms_number already created in 0074)


-- ══════════════════════════════════════════════════════════════════════
-- SUPERMARKET ENHANCEMENTS (B2)
-- ══════════════════════════════════════════════════════════════════════

-- Product variants (B2.1)
ALTER TABLE pos_products ADD COLUMN variant_of TEXT;          -- FK to parent product id (NULL = standalone)
ALTER TABLE pos_products ADD COLUMN variant_attributes TEXT DEFAULT '{}';  -- JSON: {"size":"XL","color":"Red"}

-- Inventory adjustments (B2.2) — new table for adjustment history
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  adjustment INTEGER NOT NULL,          -- positive = add, negative = remove
  reason TEXT NOT NULL DEFAULT 'manual', -- manual, received, damaged, counted, expired
  reference TEXT,                        -- optional reference (PO# etc.)
  notes TEXT,
  created_by TEXT,                       -- admin/staff user id
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_inv_adj_tenant ON inventory_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_product ON inventory_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_date ON inventory_adjustments(created_at);

-- Auto-decrement stock on POS sale (trigger) — only if stock_quantity exists
-- (handled via backend logic, not trigger, for flexibility)

-- Stock level alerts view (B2.3) — query-based, no additional table needed

-- Supplier info on products (B2.4) — extend pos_products
ALTER TABLE pos_products ADD COLUMN supplier_name TEXT;        -- text name (supplier_id already exists)
-- reorder_point already exists from earlier migration — skip


-- ══════════════════════════════════════════════════════════════════════
-- RESTAURANT ENHANCEMENTS (B3)
-- ══════════════════════════════════════════════════════════════════════

-- Course sequencing (B3.1) — add course grouping to order_items
ALTER TABLE order_items ADD COLUMN course_number INTEGER DEFAULT 0;  -- 0=none, 1=appetizer, 2=main, 3=dessert
ALTER TABLE order_items ADD COLUMN course_status TEXT DEFAULT 'pending'
  CHECK(course_status IN ('pending', 'served', 'completed'));

-- Table reservations (B3.2) — extend pos_tables with reservation fields
ALTER TABLE pos_tables ADD COLUMN reservation_name TEXT;
ALTER TABLE pos_tables ADD COLUMN reservation_time TEXT;       -- "HH:MM"
ALTER TABLE pos_tables ADD COLUMN reservation_date TEXT;       -- "YYYY-MM-DD"
ALTER TABLE pos_tables ADD COLUMN party_size INTEGER DEFAULT 0;

-- Split bills (B3.3) — order_items already has split_group (0069)
-- Add split_total tracking on orders
ALTER TABLE orders ADD COLUMN split_count INTEGER DEFAULT 1;   -- how many ways the bill is split

-- Tips (B3.4) — on orders
ALTER TABLE orders ADD COLUMN tip_amount REAL DEFAULT 0;
ALTER TABLE orders ADD COLUMN tip_method TEXT;                 -- cash, card, etc.


-- ══════════════════════════════════════════════════════════════════════
-- SERVICE MODULE ENHANCEMENTS (B4)
-- ══════════════════════════════════════════════════════════════════════

-- Worker assignment (B4.1)
ALTER TABLE service_bookings ADD COLUMN assigned_worker_id TEXT;

-- Pricing tiers (B4.2) — extend service_items
ALTER TABLE service_items ADD COLUMN price_tier TEXT DEFAULT 'standard'
  CHECK(price_tier IN ('standard', 'premium', 'luxury'));
ALTER TABLE service_items ADD COLUMN price_premium REAL DEFAULT 0;  -- additional price for premium tier

-- Reviews (B4.3) — new table
CREATE TABLE IF NOT EXISTS service_reviews (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL,
  service_item_id TEXT NOT NULL,
  booking_id TEXT,
  customer_name TEXT,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_svc_reviews_tenant ON service_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_svc_reviews_item ON service_reviews(service_item_id);
CREATE INDEX IF NOT EXISTS idx_svc_reviews_rating ON service_reviews(rating);

-- Availability calendar (B4.4) — new table for worker/item availability
CREATE TABLE IF NOT EXISTS service_availability (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL,
  service_item_id TEXT NOT NULL,
  worker_id TEXT,
  available_date TEXT NOT NULL,          -- "YYYY-MM-DD"
  available_from TEXT NOT NULL,          -- "HH:MM"
  available_to TEXT NOT NULL,            -- "HH:MM"
  is_available INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_svc_avail_item ON service_availability(service_item_id);
CREATE INDEX IF NOT EXISTS idx_svc_avail_date ON service_availability(available_date);


-- ══════════════════════════════════════════════════════════════════════
-- ONBOARDING ENHANCEMENTS (C1)
-- ══════════════════════════════════════════════════════════════════════

-- Auto-login token on admin after signup (C1.1)
ALTER TABLE admins ADD COLUMN auto_login_token TEXT;
ALTER TABLE admins ADD COLUMN auto_login_expires_at DATETIME;
CREATE INDEX IF NOT EXISTS idx_admins_auto_login ON admins(auto_login_token);


-- ══════════════════════════════════════════════════════════════════════
-- MARKETPLACE ENHANCEMENTS (C3)
-- ══════════════════════════════════════════════════════════════════════

-- Public ratings / reviews on projects (C3.4)
CREATE TABLE IF NOT EXISTS marketplace_reviews (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  reviewer_name TEXT,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  is_approved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mkt_reviews_project ON marketplace_reviews(project_id);
CREATE INDEX IF NOT EXISTS idx_mkt_reviews_tenant ON marketplace_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mkt_reviews_approved ON marketplace_reviews(is_approved);

-- Marketplace categories (C3.2)
CREATE TABLE IF NOT EXISTS marketplace_categories (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_mkt_cat_slug ON marketplace_categories(slug);

-- Project category links
CREATE TABLE IF NOT EXISTS marketplace_project_categories (
  project_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY (project_id, category_id)
);


-- ══════════════════════════════════════════════════════════════════════
-- BILLING / SUBSCRIPTIONS (D2)
-- ══════════════════════════════════════════════════════════════════════

-- Subscription tiers (D2.2)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price_monthly REAL NOT NULL DEFAULT 0,
  price_yearly REAL NOT NULL DEFAULT 0,
  max_rooms INTEGER DEFAULT 10,
  max_orders_monthly INTEGER DEFAULT 1000,
  max_pos_users INTEGER DEFAULT 5,
  max_storage_mb INTEGER DEFAULT 500,
  features TEXT DEFAULT '[]',     -- JSON array of feature flags
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tenant subscriptions (D2.3)
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'past_due', 'canceled', 'trialing')),
  billing_cycle TEXT DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly', 'yearly')),
  current_period_start DATETIME,
  current_period_end DATETIME,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tenant_sub_tenant ON tenant_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_sub_plan ON tenant_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_tenant_sub_status ON tenant_subscriptions(status);

-- Usage tracking (D2.3)
CREATE TABLE IF NOT EXISTS tenant_usage (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL,
  metric TEXT NOT NULL,               -- 'orders', 'pos_users', 'storage_mb'
  value INTEGER NOT NULL DEFAULT 0,
  period_start TEXT NOT NULL,          -- "YYYY-MM-01"
  period_end TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_tenant ON tenant_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_metric ON tenant_usage(metric, period_start);


-- ══════════════════════════════════════════════════════════════════════
-- SEED DEFAULT DATA
-- ══════════════════════════════════════════════════════════════════════

-- Default subscription plans
INSERT OR IGNORE INTO subscription_plans (id, name, slug, description, price_monthly, price_yearly, max_rooms, max_orders_monthly, max_pos_users, max_storage_mb, features)
VALUES
  ('plan_free', 'Free', 'free', 'For small camps just getting started', 0, 0, 5, 100, 2, 100, '["basic_reports","email_support"]'),
  ('plan_starter', 'Starter', 'starter', 'For growing hospitality businesses', 49, 490, 25, 2000, 5, 500, '["basic_reports","analytics","promotions","email_support"]'),
  ('plan_pro', 'Professional', 'professional', 'For established operations', 149, 1490, 100, 10000, 20, 2000, '["basic_reports","analytics","promotions","pos","inventory","priority_support"]'),
  ('plan_enterprise', 'Enterprise', 'enterprise', 'For large-scale operations', 499, 4990, -1, -1, -1, -1, '["basic_reports","analytics","promotions","pos","inventory","priority_support","api_access","custom_domain","white_label"]');

-- Default marketplace categories
INSERT OR IGNORE INTO marketplace_categories (id, name, slug, description, icon, sort_order)
VALUES
  ('cat_campgrounds', 'Campgrounds', 'campgrounds', 'Traditional camping sites', '🏕️', 1),
  ('cat_glamping', 'Glamping', 'glamping', 'Luxury camping experiences', '⛺', 2),
  ('cat_resorts', 'Resorts', 'resorts', 'Full-service resort properties', '🏨', 3),
  ('cat_ecolodges', 'Eco Lodges', 'eco-lodges', 'Sustainable nature retreats', '🌿', 4),
  ('cat_beach_camps', 'Beach Camps', 'beach-camps', 'Coastal camping sites', '🏖️', 5),
  ('cat_mountain', 'Mountain Retreats', 'mountain-retreats', 'Highland and mountain camps', '⛰️', 6);
