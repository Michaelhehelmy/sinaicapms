-- Migration 0072: Dynamic Service Module
-- Adds service_definitions, service_items, and service_bookings tables
-- for tenant-defined bookable services (transportation, electrician, plumber, etc.)

-- Service Definitions (template for a service type)
CREATE TABLE IF NOT EXISTS service_definitions (
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

-- Service Items (actual bookable services/items under a definition)
CREATE TABLE IF NOT EXISTS service_items (
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
);

-- Service Bookings (orders for services)
CREATE TABLE IF NOT EXISTS service_bookings (
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
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sd_tenant ON service_definitions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_si_tenant ON service_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_si_definition ON service_items(service_definition_id);
CREATE INDEX IF NOT EXISTS idx_sb_item ON service_bookings(service_item_id);
CREATE INDEX IF NOT EXISTS idx_sb_status ON service_bookings(status);
CREATE INDEX IF NOT EXISTS idx_sb_tenant ON service_bookings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sb_scheduled ON service_bookings(scheduled_date);
