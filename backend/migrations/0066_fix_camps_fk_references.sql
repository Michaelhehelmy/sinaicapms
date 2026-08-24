-- Migration 0066: Fix FKs that still reference the dropped 'camps' table
--
-- After migration 0063 renamed camps → projects, four tables still hold
-- FK constraints pointing at the now-deleted camps table:
--   - rooms_new.camp_id      (REFERENCES camps(id) from migration 0054)
--   - meal_schedules.camp_id (REFERENCES camps(id) from migration 0037)
--   - orders.camp_id         (REFERENCES camps(id) from migration 0028)
--   - plans_new.camp_id      (REFERENCES camps(id) from migration 0028)
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
);

INSERT OR IGNORE INTO rooms_new_v3 (
  id, camp_id, product_id, name, status, bed_type, max_guests,
  base_price, floor, notes, is_active, tenant_id, created_at, updated_at
)
SELECT
  id, camp_id, product_id, name, status, bed_type, max_guests,
  base_price, floor, notes, is_active, tenant_id, created_at, updated_at
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
  package_type TEXT NOT NULL DEFAULT 'all',
  max_servings INTEGER DEFAULT 100,
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

-- Recreate ALL live indexes (the DROP above removed them): 0037 originals
-- plus the 0038 composite/JOIN indexes.
CREATE INDEX IF NOT EXISTS idx_meal_schedules_camp_date ON meal_schedules(camp_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant_date ON meal_schedules(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant_camp_date ON meal_schedules(tenant_id, camp_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_meal ON meal_schedules(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant ON meal_schedules(tenant_id);

-- ============================================
-- STEP 2b: Rebuild orders with FK → projects
-- ============================================
-- orders.camp_id REFERENCES camps(id) from the original 0028 schema.
-- Must rebuild to point at projects(id) ON DELETE SET NULL (camp_id drops
-- NOT NULL so the SET NULL action is reachable). All other columns, FKs
-- (rooms_new RESTRICT, customers SET NULL, order_state RESTRICT) and the
-- UNIQUE reference constraint are preserved verbatim.

CREATE TABLE IF NOT EXISTS orders_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO orders_v2 (
  id, tenant_id, camp_id, room_id, customer_id, order_state_id,
  check_in_date, check_out_date, number_of_people, total_amount, amount_paid,
  payment_method, payment_status, reference, invoice_date, notes,
  created_at, updated_at
)
SELECT
  id, tenant_id, camp_id, room_id, customer_id, order_state_id,
  check_in_date, check_out_date, number_of_people, total_amount, amount_paid,
  payment_method, payment_status, reference, invoice_date, notes,
  created_at, updated_at
FROM orders;

DROP TABLE IF EXISTS orders;
ALTER TABLE orders_v2 RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_camp ON orders(camp_id);
CREATE INDEX IF NOT EXISTS idx_orders_room ON orders(room_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(order_state_id);
CREATE INDEX IF NOT EXISTS idx_orders_dates ON orders(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(reference);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

-- ============================================
-- STEP 2c: Rebuild plans_new with FK → projects
-- ============================================
-- plans_new.camp_id REFERENCES camps(id) from the original 0028 schema.
-- Rebuild to point at projects(id) ON DELETE SET NULL. Live shape is
-- 0028 + tenant_id (0044); tenant_id stays nullable because api/others.js
-- inserts plans without it — the new CASCADE FK tolerates NULLs.
-- A nullable updated_at is added so the STEP 5 trigger can stamp it
-- (the 0028 original had no such column; inserts are unaffected).

CREATE TABLE IF NOT EXISTS plans_new_v2 (
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

INSERT OR IGNORE INTO plans_new_v2 (
  id, tenant_id, camp_id, name, description, date, time,
  capacity, status, category, created_at
)
SELECT
  id, tenant_id, camp_id, name, description, date, time,
  capacity, status, category, created_at
FROM plans_new;

DROP TABLE IF EXISTS plans_new;
ALTER TABLE plans_new_v2 RENAME TO plans_new;

CREATE INDEX IF NOT EXISTS idx_plans_new_tenant ON plans_new(tenant_id);
CREATE INDEX IF NOT EXISTS idx_plans_new_camp ON plans_new(camp_id);

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

-- ============================================
-- STEP 5: Recreate updated_at triggers for orders and plans_new
-- ============================================
-- Both tables were rebuilt above (STEP 2b/2c); any historical triggers died
-- with the drops. Recreate them with the same pattern as rooms_new/projects.

DROP TRIGGER IF EXISTS trg_orders_updated_at;
CREATE TRIGGER trg_orders_updated_at
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
END;

DROP TRIGGER IF EXISTS trg_plans_new_updated_at;
CREATE TRIGGER trg_plans_new_updated_at
  AFTER UPDATE ON plans_new
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE plans_new SET updated_at = datetime('now') WHERE id = NEW.id;
END;

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain
PRAGMA foreign_key_check;
