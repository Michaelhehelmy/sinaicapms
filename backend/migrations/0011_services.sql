-- Baseline 0011_services.sql: dynamic services + promotions.
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Generated verbatim from the canonical post-109 schema export (2026-09-23);
-- do NOT hand-edit DDL — the Stage-1c sqlite_master diff against canonical is the gate.
-- Tables: service_definitions, service_items, service_bookings, service_availability, service_reviews, promotions
PRAGMA defer_foreign_keys = ON;

CREATE TABLE service_definitions (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  fields_schema JSON NOT NULL DEFAULT ('[]'),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, slug)
);

CREATE TABLE service_items (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_definition_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_price REAL DEFAULT 0,
  meta_data JSON DEFAULT ('{}'),
  status TEXT NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, price_tier TEXT DEFAULT 'standard'
  CHECK(price_tier IN ('standard', 'premium', 'luxury')), price_premium REAL DEFAULT 0);

CREATE TABLE service_bookings (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  service_item_id TEXT NOT NULL REFERENCES service_items(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  scheduled_date DATETIME,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, assigned_worker_id TEXT);

CREATE TABLE service_availability (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL,
  service_item_id TEXT NOT NULL,
  worker_id TEXT,
  available_date TEXT NOT NULL,          
  available_from TEXT NOT NULL,          
  available_to TEXT NOT NULL,            
  is_available INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE service_reviews (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL,
  service_item_id TEXT NOT NULL,
  booking_id TEXT,
  customer_name TEXT,
  rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE promotions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage','fixed','bogo')),
  value REAL DEFAULT 0,
  applies_to TEXT DEFAULT 'all',
  applies_to_id TEXT,
  min_purchase REAL DEFAULT 0,
  day_of_week INTEGER, 
  start_date TEXT,     
  end_date TEXT,       
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_promotions_active ON promotions(tenant_id, is_active);
CREATE INDEX idx_promotions_dates ON promotions(start_date, end_date);
CREATE INDEX idx_promotions_day ON promotions(day_of_week);
CREATE INDEX idx_promotions_tenant ON promotions(tenant_id);
CREATE INDEX idx_sb_item ON service_bookings(service_item_id);
CREATE INDEX idx_sb_scheduled ON service_bookings(scheduled_date);
CREATE INDEX idx_sb_status ON service_bookings(status);
CREATE INDEX idx_sb_tenant ON service_bookings(tenant_id);
CREATE INDEX idx_sd_tenant ON service_definitions(tenant_id);
CREATE INDEX idx_service_bookings_date ON service_bookings(scheduled_date);
CREATE INDEX idx_service_bookings_item ON service_bookings(service_item_id);
CREATE INDEX idx_service_bookings_status ON service_bookings(status);
CREATE INDEX idx_service_bookings_tenant ON service_bookings(tenant_id);
CREATE INDEX idx_service_defs_slug ON service_definitions(slug);
CREATE INDEX idx_service_defs_tenant ON service_definitions(tenant_id);
CREATE INDEX idx_service_items_def ON service_items(service_definition_id);
CREATE INDEX idx_service_items_project ON service_items(project_id);
CREATE INDEX idx_service_items_status ON service_items(status);
CREATE INDEX idx_service_items_tenant ON service_items(tenant_id);
CREATE INDEX idx_si_definition ON service_items(service_definition_id);
CREATE INDEX idx_si_tenant ON service_items(tenant_id);
CREATE INDEX idx_svc_avail_date ON service_availability(available_date);
CREATE INDEX idx_svc_avail_item ON service_availability(service_item_id);
CREATE INDEX idx_svc_bookings_worker ON service_bookings(assigned_worker_id);
CREATE INDEX idx_svc_reviews_item ON service_reviews(service_item_id);
CREATE INDEX idx_svc_reviews_rating ON service_reviews(rating);
CREATE INDEX idx_svc_reviews_tenant ON service_reviews(tenant_id);
