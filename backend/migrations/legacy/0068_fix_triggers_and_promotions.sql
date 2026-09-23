-- Migration 0068: Fix broken tenants trigger + Promotions Engine + inbox table
--
-- Three backward-compatible changes:
--
--   1. CRITICAL bug fix — trg_tenants_updated_at (created by 0059) referenced
--      `tenants.updated_at`, a column that does NOT exist in this schema.
--      Every runtime UPDATE on tenants failed with
--      "no such column: updated_at" (SQLITE_ERROR), which broke tenant
--      profile edits, branding saves, and admin tenant updates in prod paths.
--      Fix mirrors the sibling triggers (trg_rooms_new / trg_projects /
--      trg_orders / trg_plans_new): add the missing column, then recreate the
--      trigger with the guarded WHEN clause that also self-heals rows whose
--      updated_at was never set (NULL or unchanged).
--
--   2. promotions table — per-tenant discount engine for POS/public checkout
--      (percentage | fixed | bogo), scoped to all products, one product, or
--      one category, with optional schedule windows and day-of-week gating.
--
--   3. inbox table — durable notification storage consumed by the low-stock
--      alert writer in routes/pos POST /orders (best-effort inserts). The
--      unified inbox feed itself still reads leads+orders; this table only
--      stores operational alerts like "Low Stock: Coke".

-- ============================================
-- 1. Tenants.updated_at column + trigger fix
-- ============================================

ALTER TABLE tenants ADD COLUMN updated_at DATETIME;

DROP TRIGGER IF EXISTS trg_tenants_updated_at;
CREATE TRIGGER trg_tenants_updated_at
AFTER UPDATE ON tenants
FOR EACH ROW
WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE tenants SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- 2. Promotions engine
-- ============================================

CREATE TABLE IF NOT EXISTS promotions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('percentage','fixed','bogo')),
  value REAL DEFAULT 0,
  applies_to TEXT DEFAULT 'all',
  applies_to_id TEXT,
  min_purchase REAL DEFAULT 0,
  day_of_week INTEGER, -- 0=Sunday .. 6=Saturday (UTC); NULL = every day
  start_date TEXT,     -- YYYY-MM-DD inclusive
  end_date TEXT,       -- YYYY-MM-DD inclusive
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_promotions_tenant ON promotions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(tenant_id, is_active);

-- ============================================
-- 3. Inbox alerts storage (low-stock etc.)
-- ============================================

CREATE TABLE IF NOT EXISTS inbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'info',
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
