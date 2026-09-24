-- Migration 0115: rooms_new.tenant_id NOT NULL + FK + backfill (audit U-011, LOW).
--
-- WHAT: backfills rooms_new.tenant_id from projects.tenant_id via camp_id,
-- then rebuilds rooms_new flipping `tenant_id TEXT` (nullable, FK-less) to
-- `tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`.
-- Column order, defaults, CHECKs and every other FK target/action are
-- preserved verbatim from the post-0111 DDL (0111 A5); the ONLY change is the
-- tenant_id line.
--
-- WHY (U-011, LOW, CONFIRMED — .opencode/audits/full-audit-2026-09-24/02-u-probe.md):
-- the column is nullable with no FK and BOTH live writers (camps.js room-POST,
-- tenant-import.js rooms section) omit it, so every room created via today's
-- API/import lands tenant_id=NULL. No reader filters on the column (all 12
-- scope via camp_id → projects.tenant_id joins), so this is hygiene/hardening,
-- not an invisibility fix — scope kept tight. Local census at write time:
-- 161/161 rows non-NULL, 0 truly-orphan rows (camp_id NULL + tenant_id NULL).
--
-- BACKFILL: `UPDATE rooms_new SET tenant_id = (SELECT p.tenant_id FROM
-- projects p WHERE p.id = rooms_new.camp_id) WHERE tenant_id IS NULL`.
-- Rows whose camp_id is NULL or dangles (no matching project) keep NULL —
-- they are REPORTED, never deleted. The NOT NULL copy below is fail-closed
-- (no OR IGNORE): such orphans abort the migration loudly instead of being
-- silently dropped, and D1 applies each migration atomically so a failed 0115
-- leaves the DB at 0114 with zero data loss. The companion code change binds
-- tenant_id in both writers, and is backward-compatible with the pre-0115
-- schema (the column already exists nullable), so app code is safe on either
-- side of this migration.
--
-- FK ACTION (ON DELETE CASCADE): matches the closest sibling rate_plans_new
-- (`tenant_id … REFERENCES tenants(id) ON DELETE CASCADE`, likewise added by
-- 0044) and closes the audit note that deleting a tenant leaves rooms dangling
-- where every sibling table CASCADEs. Safe: every app tenant delete goes
-- through buildTenantCascadeStmts (admin.js), which DELETEs the tenant's
-- rooms_new rows BEFORE the tenants row — CASCADE is a no-op on that path and
-- a safety net on any other path.
--
-- Rebuild idiom (precedent 0106/0107/0111, replicated minimal for one table):
-- `PRAGMA defer_foreign_keys = true` → CREATE real (non-TEMP — D1 blocks temp)
-- staging table → copy-ALL → drop-old → rename → `PRAGMA defer_foreign_keys =
-- false` + `PRAGMA foreign_key_check`. Never `foreign_keys=OFF` (skill).
--
-- NO GUARD TABLES NEEDED (verified 2026-09-24):
--   - orders.room_id → rooms_new ON DELETE RESTRICT is the ONLY live referrer.
--     RESTRICT drops are DEFERRED to COMMIT by the top PRAGMA and validate
--     against the repopulated final table (keys preserved by the copy) — the
--     exact edge 0111 already dropped/rebuilt without a guard.
--   - rooms_new.product_id → pos_products RESTRICT is child-side; DROP-ing the
--     child fires nothing on the parent. pos_products is NOT rebuilt here, so
--     the staging FK targets the live `pos_products(id)` directly (unlike 0111
--     A5, which pointed at its staging parent).
--   - The legacy order_return_detail.room_id → rooms_new SET NULL edge is dead
--     (table dropped by 0056). No CASCADE/SET NULL referrer of rooms_new is live.
--   - Trigger-drop-first (0047 lesson): trg_rooms_new_updated_at is dropped
--     before the swap and recreated after (0066 shape, 0111 text verbatim).
--
-- INDEX RECREATION: the DROP destroys indexes, so ALL 10 pre-existing rooms_new
-- index names are recreated (0111 PHASE F rooms set), all IF NOT EXISTS.
--
-- ROLLBACK SAFETY (hard rule 7): table rebuilds are forward-only — no
-- down-migration. Rollback = restore-from-backup ("locker") procedure. Do NOT
-- attempt DROP/rename reversals once writes land on the rebuilt table.

PRAGMA defer_foreign_keys = true;

-- ── Backfill tenant_id from the owning project (NULL stays NULL for orphans) ──
UPDATE rooms_new
SET tenant_id = (SELECT p.tenant_id FROM projects p WHERE p.id = rooms_new.camp_id)
WHERE tenant_id IS NULL;

-- Trigger-drop-first (0047 lesson): live triggers ON the rebuilt table would
-- break the DROP/RENAME swap. Recreated AFTER the rename below.
DROP TRIGGER IF EXISTS trg_rooms_new_updated_at;

-- ── Staging CREATE: verbatim post-0111 DDL (0111 A5) EXCEPT tenant_id ──
CREATE TABLE rooms_new_new (
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
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  room_status TEXT DEFAULT 'available',
  cleaning_status TEXT DEFAULT 'clean' CHECK(cleaning_status IN ('dirty', 'in_progress', 'clean', 'inspected')),
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL
);

-- ── Copy-ALL, fail-closed (no OR IGNORE): column-list drift or surviving NULL
-- tenant_id (truly-orphan rows) aborts loudly instead of dropping rows ──
INSERT INTO rooms_new_new (
  id, camp_id, product_id, name, status, bed_type, max_guests,
  base_price, floor, notes, is_active, tenant_id, created_at, updated_at,
  room_status, cleaning_status, project_id
)
SELECT
  id, camp_id, product_id, name, status, bed_type, max_guests,
  base_price, floor, notes, is_active, tenant_id, created_at, updated_at,
  room_status, cleaning_status, project_id
FROM rooms_new;

DROP TABLE rooms_new;
ALTER TABLE rooms_new_new RENAME TO rooms_new;

-- ── Recreate ALL pre-existing rooms_new indexes (0111 PHASE F rooms set) ──
CREATE INDEX IF NOT EXISTS idx_rooms_new_camp ON rooms_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_product ON rooms_new(product_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_status ON rooms_new(status);
CREATE INDEX IF NOT EXISTS idx_rooms_new_tenant_id ON rooms_new(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rooms_new_room_status ON rooms_new(room_status);
CREATE INDEX IF NOT EXISTS idx_rooms_floor ON rooms_new(floor);
CREATE INDEX IF NOT EXISTS idx_rooms_capacity ON rooms_new(max_guests);
CREATE INDEX IF NOT EXISTS idx_rooms_new_project ON rooms_new(project_id);
CREATE INDEX IF NOT EXISTS idx_rooms_camp ON rooms_new(camp_id);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms_new(status);

-- Recreate the updated_at trigger dropped above (0066 shape, 0111 text verbatim)
DROP TRIGGER IF EXISTS trg_rooms_new_updated_at;
CREATE TRIGGER trg_rooms_new_updated_at
  AFTER UPDATE ON rooms_new
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE rooms_new SET updated_at = datetime('now') WHERE id = NEW.id;
END;

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain (orders → rooms RESTRICT chain, rooms → tenants
-- new FK, rooms → pos_products RESTRICT edge, trigger restore)
PRAGMA foreign_key_check;
