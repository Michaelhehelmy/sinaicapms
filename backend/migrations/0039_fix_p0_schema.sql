-- Migration 0039: Fix P0 schema issues
-- P0-1: Drop dangerous sync_room_type triggers (FK conflict with rooms.room_type_id RESTRICT)
-- P0-2: Add FK constraints to 3 disconnected tables (pos_inventory_logs, pos_staff_stats, pos_activity_logs)
--
-- D1 batch mode does NOT honor PRAGMA foreign_keys within a batch.
-- Strategy: create new tables WITH FK constraints, but filter INSERT to only valid rows.
-- Orphaned rows (referencing non-existent product_id/user_id) are silently dropped.

-- ============================================================
-- P0-1: DROP SYNC TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS sync_room_type_insert;
DROP TRIGGER IF EXISTS sync_room_type_update;
DROP TRIGGER IF EXISTS sync_room_type_delete;

-- ============================================================
-- P0-2: ADD FK CONSTRAINTS VIA TABLE RECREATION
-- ============================================================

-- -----------------------------------------------------------
-- 2a. pos_inventory_logs (created in migration 0013)
--     Add: FK(product_id) → pos_products(id) ON DELETE CASCADE
--     Add: FK(user_id)    → pos_users(id)    ON DELETE CASCADE
-- -----------------------------------------------------------
CREATE TABLE pos_inventory_logs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason TEXT,
    reference_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES pos_products(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES pos_users(id) ON DELETE CASCADE
);

INSERT INTO pos_inventory_logs_new (
    id, product_id, user_id, type, quantity_change,
    previous_quantity, new_quantity, reason, reference_id, created_at
)
SELECT
    l.id, l.product_id, l.user_id, l.type, l.quantity_change,
    l.previous_quantity, l.new_quantity, l.reason, l.reference_id, l.created_at
FROM pos_inventory_logs l
WHERE EXISTS (SELECT 1 FROM pos_products WHERE id = l.product_id)
  AND EXISTS (SELECT 1 FROM pos_users WHERE id = l.user_id);

DROP TABLE pos_inventory_logs;
ALTER TABLE pos_inventory_logs_new RENAME TO pos_inventory_logs;

CREATE INDEX IF NOT EXISTS idx_pos_inventory_logs_product ON pos_inventory_logs(product_id, created_at);

-- -----------------------------------------------------------
-- 2b. pos_staff_stats (created in migration 0016)
--     Add: FK(user_id) → pos_users(id) ON DELETE CASCADE
-- -----------------------------------------------------------
CREATE TABLE pos_staff_stats_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT UNIQUE NOT NULL,
    total_sales DECIMAL(12,2) DEFAULT 0.0,
    total_orders INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    commission_earned DECIMAL(10,2) DEFAULT 0.0,
    current_streak INTEGER DEFAULT 0,
    last_sale DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES pos_users(id) ON DELETE CASCADE
);

INSERT INTO pos_staff_stats_new (
    id, user_id, total_sales, total_orders, total_points,
    commission_earned, current_streak, last_sale, created_at, updated_at
)
SELECT
    s.id, s.user_id, s.total_sales, s.total_orders, s.total_points,
    s.commission_earned, s.current_streak, s.last_sale, s.created_at, s.updated_at
FROM pos_staff_stats s
WHERE EXISTS (SELECT 1 FROM pos_users WHERE id = s.user_id);

DROP TABLE pos_staff_stats;
ALTER TABLE pos_staff_stats_new RENAME TO pos_staff_stats;

-- -----------------------------------------------------------
-- 2c. pos_activity_logs (created in migration 0017)
--     Add: FK(user_id) → pos_users(id) ON DELETE CASCADE
-- -----------------------------------------------------------
CREATE TABLE pos_activity_logs_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    new_values TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES pos_users(id) ON DELETE CASCADE
);

INSERT INTO pos_activity_logs_new (
    id, user_id, action, entity_type, entity_id, new_values, created_at
)
SELECT
    l.id, l.user_id, l.action, l.entity_type, l.entity_id, l.new_values, l.created_at
FROM pos_activity_logs l
WHERE l.user_id IS NULL OR EXISTS (SELECT 1 FROM pos_users WHERE id = l.user_id);

DROP TABLE pos_activity_logs;
ALTER TABLE pos_activity_logs_new RENAME TO pos_activity_logs;

CREATE INDEX IF NOT EXISTS idx_pos_activity_logs_user ON pos_activity_logs(user_id, created_at);
