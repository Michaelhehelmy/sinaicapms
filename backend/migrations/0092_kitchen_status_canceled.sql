-- Migration 0092: Allow 'canceled' as a terminal kitchen_status on orders + pos_transactions
--
-- The 0069 kitchen state machine was declared as:
--   pending → confirmed → preparing → ready → served
--   (any non-served state can also move to canceled; served is terminal)
-- but the CHECK constraints only allowed ('pending','confirmed','preparing','ready','served') —
-- PATCH /api/orders/:id/kitchen-status and the POS kitchen flow could never persist 'canceled'
-- ("CHECK constraint failed"). This migration relaxes both CHECKs to add 'canceled'.
--
-- SQLite cannot alter a CHECK constraint, so both tables are rebuilt with the
-- table-swap pattern already used by 0042 (pos_products), 0059/0066 (orders),
-- and 0069 (audit_log): create New → copy → drop → rename, then recreate the
-- indexes/triggers that died with the drops.
--
-- Rebuild fidelity (post-all-prior-migrations schema):
--   orders            = 0066 orders_v2 base + 0069 (table_id, kitchen_status)
--                       + 0075 (8 columns) + 0087 (4 columns)
--   pos_transactions  = 0014 rebuild + 0036 (amount_cash/card) + 0050 (idempotency_key)
--                       + 0069 (table_id, kitchen_status)
-- Child FKs (order_return, order_discounts, pos_transaction_items, ...) auto
-- re-point to the renamed tables, matching the 0066 rename behavior.

PRAGMA defer_foreign_keys = true;

-- ============================================
-- 1. Rebuild orders with 'canceled' added
-- ============================================

CREATE TABLE orders_new (
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
  table_id TEXT REFERENCES pos_tables(id) ON DELETE SET NULL,
  kitchen_status TEXT DEFAULT 'pending' CHECK(kitchen_status IN ('pending', 'confirmed', 'preparing', 'ready', 'served', 'canceled')),
  early_checkin INTEGER DEFAULT 0,
  late_checkout INTEGER DEFAULT 0,
  requested_checkin_time TEXT,
  requested_checkout_time TEXT,
  adult_count INTEGER DEFAULT 1,
  child_count INTEGER DEFAULT 0,
  extra_guest_charge REAL DEFAULT 0,
  split_count INTEGER DEFAULT 1,
  tip_amount REAL DEFAULT 0,
  tip_method TEXT,
  payment_intent_id TEXT,
  paymob_transaction_id TEXT,
  paymob_paid_at TEXT,
  verified_by TEXT
);

INSERT INTO orders_new (
  id, tenant_id, camp_id, room_id, customer_id, order_state_id,
  check_in_date, check_out_date, number_of_people, total_amount, amount_paid,
  payment_method, payment_status, reference, invoice_date, notes,
  created_at, updated_at,
  table_id, kitchen_status,
  early_checkin, late_checkout, requested_checkin_time, requested_checkout_time,
  adult_count, child_count, extra_guest_charge, split_count, tip_amount, tip_method,
  payment_intent_id, paymob_transaction_id, paymob_paid_at, verified_by
)
SELECT
  id, tenant_id, camp_id, room_id, customer_id, order_state_id,
  check_in_date, check_out_date, number_of_people, total_amount, amount_paid,
  payment_method, payment_status, reference, invoice_date, notes,
  created_at, updated_at,
  table_id, kitchen_status,
  early_checkin, late_checkout, requested_checkin_time, requested_checkout_time,
  adult_count, child_count, extra_guest_charge, split_count, tip_amount, tip_method,
  payment_intent_id, paymob_transaction_id, paymob_paid_at, verified_by
FROM orders;

DROP TABLE IF EXISTS orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_camp ON orders(camp_id);
CREATE INDEX IF NOT EXISTS idx_orders_room ON orders(room_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_state ON orders(order_state_id);
CREATE INDEX IF NOT EXISTS idx_orders_dates ON orders(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(reference);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_room_dates ON orders(tenant_id, room_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_state ON orders(tenant_id, order_state_id);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_date ON orders(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);

DROP TRIGGER IF EXISTS trg_orders_updated_at;
CREATE TRIGGER trg_orders_updated_at
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- ============================================
-- 2. Rebuild pos_transactions with 'canceled' added
-- ============================================

CREATE TABLE pos_transactions_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'tenant_1',
  organization_id INTEGER NOT NULL DEFAULT 1,
  store_id INTEGER NOT NULL DEFAULT 1,
  order_number TEXT UNIQUE NOT NULL,
  transaction_number TEXT,
  customer_id INTEGER,
  cashier_id TEXT NOT NULL,
  order_type TEXT DEFAULT 'sale',
  status TEXT DEFAULT 'pending',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10,2) DEFAULT 0,
  discount_type TEXT,
  discount_reason TEXT,
  tax_amount DECIMAL(10,2) DEFAULT 0,
  tax_rate REAL DEFAULT 0.1,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) DEFAULT 0,
  change_amount DECIMAL(10,2) DEFAULT 0,
  payment_method TEXT,
  points_earned INTEGER DEFAULT 0,
  points_redeemed INTEGER DEFAULT 0,
  payment_status TEXT DEFAULT 'pending',
  order_status TEXT DEFAULT 'completed',
  notes TEXT,
  receipt_url TEXT,
  void_reason TEXT,
  voided_by TEXT,
  voided_at DATETIME,
  refunded_amount DECIMAL(12,2) DEFAULT 0,
  refunded_at DATETIME,
  refunded_by TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  amount_cash REAL DEFAULT 0.0,
  amount_card REAL DEFAULT 0.0,
  idempotency_key TEXT,
  table_id TEXT REFERENCES pos_tables(id) ON DELETE SET NULL,
  kitchen_status TEXT DEFAULT 'confirmed' CHECK(kitchen_status IN ('pending', 'confirmed', 'preparing', 'ready', 'served', 'canceled')),
  FOREIGN KEY (organization_id) REFERENCES pos_organizations(id),
  FOREIGN KEY (store_id) REFERENCES pos_stores(id),
  FOREIGN KEY (customer_id) REFERENCES pos_customers(id)
);

INSERT INTO pos_transactions_new (
  id, tenant_id, organization_id, store_id, order_number, transaction_number,
  customer_id, cashier_id, order_type, status, subtotal, discount_amount,
  discount_type, discount_reason, tax_amount, tax_rate, total_amount,
  paid_amount, change_amount, payment_method, points_earned, points_redeemed,
  payment_status, order_status, notes, receipt_url, void_reason, voided_by,
  voided_at, refunded_amount, refunded_at, refunded_by, created_at, updated_at,
  amount_cash, amount_card, idempotency_key, table_id, kitchen_status
)
SELECT
  id, tenant_id, organization_id, store_id, order_number, transaction_number,
  customer_id, cashier_id, order_type, status, subtotal, discount_amount,
  discount_type, discount_reason, tax_amount, tax_rate, total_amount,
  paid_amount, change_amount, payment_method, points_earned, points_redeemed,
  payment_status, order_status, notes, receipt_url, void_reason, voided_by,
  voided_at, refunded_amount, refunded_at, refunded_by, created_at, updated_at,
  amount_cash, amount_card, idempotency_key, table_id, kitchen_status
FROM pos_transactions;

DROP TABLE IF EXISTS pos_transactions;
ALTER TABLE pos_transactions_new RENAME TO pos_transactions;

CREATE INDEX IF NOT EXISTS idx_orders_organization_store ON pos_transactions(organization_id, store_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON pos_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_cashier ON pos_transactions(cashier_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON pos_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON pos_transactions(status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON pos_transactions(order_number);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_cashier ON pos_transactions(cashier_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_customer ON pos_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_transactions_tenant_date ON pos_transactions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_tx_tenant_date ON pos_transactions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_pos_tx_status ON pos_transactions(status);
CREATE INDEX IF NOT EXISTS idx_pos_tx_kitchen ON pos_transactions(kitchen_status);
CREATE INDEX IF NOT EXISTS idx_pos_tx_type ON pos_transactions(order_type);
CREATE INDEX IF NOT EXISTS idx_pos_tx_staff ON pos_transactions(cashier_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_transactions_idempotency
  ON pos_transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;