-- Migration 0106: enforce NOT NULL on order_items.project_id.
--
-- WHAT: rebuilds order_items with `project_id TEXT NOT NULL REFERENCES
-- projects(id) ON DELETE SET NULL` (the 0102 column, nullability flipped — the
-- REFERENCES clause is unchanged from 0102). Full column list and all
-- pre-existing indexes are preserved verbatim.
--
-- Recon ground truth: /tmp/opencode/p1-recon.md §2 (ENFORCE #1) + §4. order_items
-- holds 0 rows locally, so the 0105 parent-copy backfill is vacuous and 0 NULLs
-- remain — enforcement is safe. Design §3 row 4 + §12 Q2 RECOMMENDATION terminate
-- NOT NULL with the parent-copy backfill (0105 statement 5, which MUST run first
-- in the same pre-req file).
--
-- GATE (design §8): this file enforces ONLY because the recon verdict is ENFORCE
-- (zero NULLs closable). Had NULLs remained, this file would document deferral
-- (stay nullable + filtered index) instead of performing a partial/unsafe
-- enforcement — never enforce over remaining NULLs. P1-D must confirm
-- `SELECT COUNT(*) FROM order_items WHERE project_id IS NULL` = 0 at apply time.
--
-- Rebuild idiom: primary precedent 0066_fix_camps_fk_references.sql —
-- `PRAGMA defer_foreign_keys = true` (0066:16) → CREATE real (non-TEMP) staging
-- table (D1 authorizer blocks temp tables) → full-list copy → DROP + RENAME
-- (0066:48-49) → recreate ALL pre-existing indexes (the DROP destroys them,
-- 0066:51-55 pattern) → `PRAGMA defer_foreign_keys = false` +
-- `PRAGMA foreign_key_check` (0066:248-251). No `foreign_keys=OFF` (skill).
--
-- DELIBERATE DEVIATION from 0066:39-46: plain `INSERT INTO` (no `OR IGNORE`).
-- OR IGNORE would SILENTLY DROP rows violating the new NOT NULL constraint on
-- divergence; a loud abort is the correct gate behavior, and D1 applies each
-- migration atomically so reruns are safe.
--
-- ROLLBACK SAFETY (hard rule 7): table rebuilds are forward-only — there is no
-- down-migration. Rollback = restore-from-backup ("locker") procedure, stated in
-- the P1-D apply commit body. Do NOT attempt a DROP/rename reversal once writes
-- land on the rebuilt table.
--
-- FK caution: order_items is a child of orders(order_id) CASCADE; the parent is
-- untouched. Post-rename FK targets are verified via foreign_key_check below.
-- No triggers exist ON order_items — no trigger handling needed.

PRAGMA defer_foreign_keys = true;

-- ─────────────────────────────────────────────────────────────
-- Rebuild order_items with NOT NULL project_id
-- (base CREATE 0067:34-44 + split_group 0069:48 + course_number/course_status
-- 0075:67-68 + project_id 0102 — live DDL verified against the 0100–0104
-- local D1 copy, 2026-09-23)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE order_items_new (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'room_night',
  reference_id TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  split_group INTEGER DEFAULT 1,
  course_number INTEGER DEFAULT 0,
  course_status TEXT DEFAULT 'pending' CHECK(course_status IN ('pending', 'served', 'completed')),
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE SET NULL
);

INSERT INTO order_items_new (
  id, order_id, type, reference_id, name, quantity, unit_price, total_price,
  created_at, split_group, course_number, course_status, project_id
)
SELECT
  id, order_id, type, reference_id, name, quantity, unit_price, total_price,
  created_at, split_group, course_number, course_status, project_id
FROM order_items;

DROP TABLE IF EXISTS order_items;
ALTER TABLE order_items_new RENAME TO order_items;

-- Recreate ALL pre-existing indexes (live sqlite_master, 2026-09-23 —
-- idx_order_items_order/type/split + 0102 idx_order_items_project)
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_type ON order_items(type);
CREATE INDEX IF NOT EXISTS idx_order_items_split ON order_items(split_group);
CREATE INDEX IF NOT EXISTS idx_order_items_project ON order_items(project_id);

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain (incl. the child→orders CASCADE link)
PRAGMA foreign_key_check;
