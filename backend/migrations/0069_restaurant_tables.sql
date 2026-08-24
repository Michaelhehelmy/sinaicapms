-- Migration 0069: Restaurant pillar — floor tables, kitchen status, split groups
--
-- Four backward-compatible changes for the restaurant/dine-in operational model:
--
--   1. pos_tables — physical floor tables per tenant. `status` follows the
--      service lifecycle (available → occupied → cleaning → available; or
--      reserved ahead of arrival). Driven by the POS order flow (a dine-in
--      order flips its table to 'occupied') and PATCH /api/pos-tables/:id/status.
--
--   2. orders.table_id + orders.kitchen_status — the unified orders table
--      gains an optional table reference (SET NULL on table delete) and a
--      kitchen fulfillment state machine managed by
--      PATCH /api/orders/:id/kitchen-status:
--        pending → confirmed → preparing → ready → served
--        (any non-served state can also move to canceled; served is terminal)
--      ADD COLUMN ... DEFAULT 'pending' backfills existing rows to 'pending'.
--
--   3. pos_transactions.table_id + pos_transactions.kitchen_status — POS sales
--      need the same two columns: POST /api/pos/orders accepts an optional
--      table_id, stamps kitchen_status='confirmed' (POS = instant service),
--      and flips the referenced table to 'occupied' in the same batch. The
--      task spec only listed the `orders` columns, but these are REQUIRED for
--      the stated POS behavior (pos_transactions is the POS order table).
--
--   4. audit_log entity_type relaxation — the CHECK allowed only
--      ('tenant','project','admin'), which would make best-effort audit writes
--      for orders/tables silently no-op inside logAudit(). Rebuilt with
--      'order' and 'pos_table' added (table has no FKs/triggers referencing it;
--      rows are copied verbatim).

-- ============================================
-- 1. Floor tables
-- ============================================
CREATE TABLE IF NOT EXISTS pos_tables (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INTEGER DEFAULT 2,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'occupied', 'reserved', 'cleaning')),
  section TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pos_tables_tenant ON pos_tables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pos_tables_status ON pos_tables(tenant_id, status);

ALTER TABLE orders ADD COLUMN table_id TEXT REFERENCES pos_tables(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN kitchen_status TEXT DEFAULT 'pending' CHECK(kitchen_status IN ('pending', 'confirmed', 'preparing', 'ready', 'served'));
ALTER TABLE order_items ADD COLUMN split_group INTEGER DEFAULT 1;

-- ============================================
-- 2. POS transactions: same columns as orders
--    (required by the POS dine-in order flow)
-- ============================================
ALTER TABLE pos_transactions ADD COLUMN table_id TEXT REFERENCES pos_tables(id) ON DELETE SET NULL;
ALTER TABLE pos_transactions ADD COLUMN kitchen_status TEXT DEFAULT 'confirmed' CHECK(kitchen_status IN ('pending', 'confirmed', 'preparing', 'ready', 'served'));

-- ============================================
-- 3. Relax audit_log.entity_type so order/table
--    changes can actually be audited
-- ============================================
CREATE TABLE audit_log_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('tenant', 'project', 'admin', 'order', 'pos_table')),
  entity_id TEXT NOT NULL,
  old_values TEXT,
  new_values TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO audit_log_new (id, tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at)
  SELECT id, tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at FROM audit_log;
DROP TABLE audit_log;
ALTER TABLE audit_log_new RENAME TO audit_log;
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
