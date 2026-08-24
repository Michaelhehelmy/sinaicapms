-- Migration 0067: Accommodation operations — room lifecycle, order add-ons, stay limits
--
-- Three backward-compatible changes for the camp/hotel operational model:
--
--   1. rooms_new.room_status — operational room lifecycle driven by the order
--      state machine (orders.js PATCH /:id/status):
--        available → reserved (order confirmed)
--                  → occupied (guest checked in)
--                  → cleaning (guest checked out)
--                  → available (order cancelled / booking deleted)
--      The legacy `status` column is left untouched (still defaults
--      'available'); delete paths sync BOTH columns so the old flag and the
--      new lifecycle never disagree.
--
--   2. order_items — line items / add-ons attached to an order (BBQ dinner,
--      equipment rental, extra nights…). `type` defaults to 'room_night';
--      `reference_id` is reserved for future product/meal linkage.
--
--   3. projects.min_stay / max_stay — project-level stay-length limits,
--      enforced in orders.js validateOrder. min_stay DEFAULT 1 is safe: the
--      existing check_out > check_in validation guarantees nights >= 1.

-- ============================================
-- 1. Room status lifecycle
-- ============================================

ALTER TABLE rooms_new ADD COLUMN room_status TEXT DEFAULT 'available';
CREATE INDEX IF NOT EXISTS idx_rooms_new_room_status ON rooms_new(room_status);

-- ============================================
-- 2. Order items / add-ons
-- ============================================

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'room_night',
  reference_id TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ============================================
-- 3. Min/max stay limits per project (camp)
-- ============================================

ALTER TABLE projects ADD COLUMN min_stay INTEGER DEFAULT 1;
ALTER TABLE projects ADD COLUMN max_stay INTEGER;
