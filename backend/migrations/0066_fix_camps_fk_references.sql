-- Migration 0066: Fix FKs that still reference the dropped 'camps' table
--
-- After migration 0063 renamed camps → projects, two tables still hold
-- FK constraints pointing at the now-deleted camps table:
--   - rooms_new.camp_id  (REFERENCES camps(id) from migration 0054)
--   - meal_schedules.camp_id (REFERENCES camps(id) from migration 0037)
--
-- SQLite cannot ALTER CONSTRAINT, so we rebuild each table with the
-- corrected FK → projects(id) ON DELETE SET NULL.
--
-- ⚠️  Run AFTER 0063 (which drops camps). Safe to run multiple times
--     (CREATE TABLE IF NOT EXISTS + idempotent copies).

PRAGMA defer_foreign_keys = true;

-- ============================================
-- STEP 1: Rebuild rooms_new with FK → projects
-- ============================================

CREATE TABLE IF NOT EXISTS rooms_new_v3 (
  id TEXT PRIMARY KEY,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES pos_products(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  bed_type TEXT,
  max_guests INTEGER DEFAULT 2,
  price REAL DEFAULT 0,
  cost_price REAL DEFAULT 0,
  tenant_id TEXT,
  organization_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

INSERT OR IGNORE INTO rooms_new_v3 (
  id, camp_id, product_id, name, status, bed_type, max_guests,
  price, cost_price, tenant_id, organization_id, created_at, updated_at
)
SELECT
  id, camp_id, product_id, name, status, bed_type, max_guests,
  price, cost_price, tenant_id, organization_id, created_at, updated_at
FROM rooms_new;

DROP TABLE IF EXISTS rooms_new;
ALTER TABLE rooms_new_v3 RENAME TO rooms_new;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_rooms_new_camp ON rooms_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_product ON rooms_new(product_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_status ON rooms_new(status);
CREATE INDEX IF NOT EXISTS idx_rooms_new_tenant_id ON rooms_new(tenant_id);

-- ============================================
-- STEP 2: Rebuild meal_schedules with FK → projects
-- ============================================

CREATE TABLE IF NOT EXISTS meal_schedules_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'standard',
  max_servings INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO meal_schedules_new (
  id, tenant_id, camp_id, date, meal_id, package_type, max_servings, created_at
)
SELECT
  id, tenant_id, camp_id, date, meal_id, package_type, max_servings, created_at
FROM meal_schedules;

DROP TABLE IF EXISTS meal_schedules;
ALTER TABLE meal_schedules_new RENAME TO meal_schedules;

CREATE INDEX IF NOT EXISTS idx_meal_schedules_camp_date ON meal_schedules(camp_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant ON meal_schedules(tenant_id);

-- ============================================
-- STEP 3: Recreate updated_at trigger for rooms_new
-- ============================================
-- The original trigger (trg_rooms_new_updated_at) was lost during
-- the table rebuild. Recreate it to fire on every UPDATE.

DROP TRIGGER IF EXISTS trg_rooms_new_updated_at;
CREATE TRIGGER trg_rooms_new_updated_at
  AFTER UPDATE ON rooms_new
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE rooms_new SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- STEP 4: Recreate updated_at trigger for projects
-- ============================================
-- The camps trigger died with the camps table in 0063. Recreate for projects.

DROP TRIGGER IF EXISTS trg_projects_updated_at;
CREATE TRIGGER trg_projects_updated_at
  AFTER UPDATE ON projects
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE projects SET updated_at = datetime('now') WHERE id = NEW.id;
END;

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain
PRAGMA foreign_key_check;
