-- Baseline 0003_products.sql: product catalogue + rooms + rate plans + plans + price overrides.
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Generated verbatim from the canonical post-109 schema export (2026-09-23);
-- do NOT hand-edit DDL — the Stage-1c sqlite_master diff against canonical is the gate.
-- Tables: products, product_camps, rooms_new, rate_plans_new, plans_new, price_overrides
PRAGMA defer_foreign_keys = ON;

CREATE TABLE products (
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

CREATE TABLE product_camps (
  product_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  PRIMARY KEY (product_id, camp_id)
);

CREATE TABLE "rooms_new" (
  id TEXT PRIMARY KEY,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
, room_status TEXT DEFAULT 'available', cleaning_status TEXT DEFAULT 'clean'
  CHECK(cleaning_status IN ('dirty', 'in_progress', 'clean', 'inspected')));

CREATE TABLE "rate_plans_new" (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES pos_products(id) ON DELETE CASCADE,
    camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    season TEXT DEFAULT 'all',
    start_date TEXT,
    end_date TEXT,
    price_per_night REAL NOT NULL,
    min_stay INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

CREATE TABLE "plans_new" (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  date TEXT,
  time TEXT,
  capacity INTEGER,
  status TEXT DEFAULT 'planned',
  category TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE price_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    price INTEGER NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(product_id, date)
);

-- Indexes
CREATE INDEX idx_plans_new_camp ON plans_new(camp_id);
CREATE INDEX idx_plans_new_tenant ON plans_new(tenant_id);
CREATE INDEX idx_price_overrides_product_date
    ON price_overrides(product_id, date);
CREATE INDEX idx_product_camps_camp ON product_camps(camp_id);
CREATE INDEX idx_product_camps_product ON product_camps(product_id);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_rate_plans_new_camp ON rate_plans_new(camp_id);
CREATE INDEX idx_rate_plans_new_product ON rate_plans_new(product_id);
CREATE INDEX idx_rate_plans_new_tenant ON rate_plans_new(tenant_id);
CREATE INDEX idx_rooms_camp ON rooms_new(camp_id);
CREATE INDEX idx_rooms_capacity ON rooms_new(max_guests);
CREATE INDEX idx_rooms_floor ON rooms_new(floor);
CREATE INDEX idx_rooms_new_camp ON rooms_new(camp_id);
CREATE INDEX idx_rooms_new_product ON rooms_new(product_id);
CREATE INDEX idx_rooms_new_room_status ON rooms_new(room_status);
CREATE INDEX idx_rooms_new_status ON rooms_new(status);
CREATE INDEX idx_rooms_new_tenant_id ON rooms_new(tenant_id);
CREATE INDEX idx_rooms_status ON rooms_new(status);

-- Triggers
CREATE TRIGGER trg_plans_new_updated_at
  AFTER UPDATE ON plans_new
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE plans_new SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_rooms_new_updated_at
  AFTER UPDATE ON rooms_new
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE rooms_new SET updated_at = datetime('now') WHERE id = NEW.id;
END;
