-- Baseline 0013_marketplace.sql: marketplace + subscriptions + platform settings.
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Generated verbatim from the canonical post-109 schema export (2026-09-23);
-- do NOT hand-edit DDL — the Stage-1c sqlite_master diff against canonical is the gate.
-- Tables: marketplace_categories, marketplace_project_categories, marketplace_reviews, marketplace_payments, marketplace_payouts, tenant_subscriptions, subscription_plans, platform_settings
PRAGMA defer_foreign_keys = ON;

CREATE TABLE marketplace_categories (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE marketplace_project_categories (
  project_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  PRIMARY KEY (project_id, category_id)
);

CREATE TABLE marketplace_reviews (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  project_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  reviewer_name TEXT,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  is_approved INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE marketplace_payments (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_reference TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'marketplace' CHECK(channel IN ('marketplace','pos')),
  gross_amount REAL NOT NULL DEFAULT 0,
  marketplace_fee REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  paymob_transaction_id TEXT,
  paymob_intention_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'captured' CHECK(payment_status IN ('captured','settled','refunded','failed')),
  captured_at TEXT DEFAULT (datetime('now')),
  settled_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
, payout_id TEXT REFERENCES marketplace_payouts(id));

CREATE TABLE "marketplace_payouts" (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'EGP',
  method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (method IN ('bank_transfer','cash','paymob','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  reference TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE tenant_subscriptions (
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
, trial_ends_at TEXT, bookings_used INTEGER DEFAULT 0, bookings_limit INTEGER DEFAULT 100, total_paid REAL DEFAULT 0);

CREATE TABLE subscription_plans (
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
  features TEXT DEFAULT '[]',     
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE platform_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),  
  feature_flags TEXT DEFAULT '{}',
  email_templates TEXT DEFAULT '{}',
  defaults TEXT DEFAULT '{}',
  branding TEXT DEFAULT '{}',
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT
, payment TEXT DEFAULT '{}');

-- Indexes
CREATE INDEX idx_marketplace_payments_order ON marketplace_payments(order_id);
CREATE INDEX idx_marketplace_payments_payout ON marketplace_payments(payout_id);
CREATE INDEX idx_marketplace_payments_status ON marketplace_payments(payment_status, captured_at);
CREATE INDEX idx_marketplace_payments_tenant ON marketplace_payments(tenant_id, payment_status);
CREATE INDEX idx_marketplace_payouts_status_created ON marketplace_payouts(status, created_at);
CREATE INDEX idx_marketplace_payouts_tenant_status ON marketplace_payouts(tenant_id, status);
CREATE INDEX idx_mkt_cat_slug ON marketplace_categories(slug);
CREATE INDEX idx_mkt_reviews_approved ON marketplace_reviews(is_approved);
CREATE INDEX idx_mkt_reviews_project ON marketplace_reviews(project_id);
CREATE INDEX idx_mkt_reviews_tenant ON marketplace_reviews(tenant_id);
CREATE INDEX idx_tenant_sub_plan ON tenant_subscriptions(plan_id);
CREATE INDEX idx_tenant_sub_status ON tenant_subscriptions(status);
CREATE INDEX idx_tenant_sub_tenant ON tenant_subscriptions(tenant_id);
