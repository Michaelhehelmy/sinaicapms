-- Baseline 0002_orders.sql: booking orders + order items + order states + customers + order payments.
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Generated verbatim from the canonical post-109 schema export (2026-09-23);
-- do NOT hand-edit DDL — the Stage-1c sqlite_master diff against canonical is the gate.
-- Tables: orders, order_items, order_state, order_state_lang, customers, order_discounts
PRAGMA defer_foreign_keys = ON;

CREATE TABLE "orders" (
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

CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'room_night',
  reference_id TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  total_price REAL NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, split_group INTEGER DEFAULT 1, course_number INTEGER DEFAULT 0, course_status TEXT DEFAULT 'pending'
  CHECK(course_status IN ('pending', 'served', 'completed')));

CREATE TABLE order_state (
    id TEXT PRIMARY KEY,
    color TEXT,
    logable INTEGER DEFAULT 0,
    shipped INTEGER DEFAULT 0,
    invoice INTEGER DEFAULT 0,
    paid INTEGER DEFAULT 0,
    deleted INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0
);

CREATE TABLE order_state_lang (
    order_state_id TEXT REFERENCES order_state(id) ON DELETE CASCADE,
    lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template TEXT,
    PRIMARY KEY (order_state_id, lang)
);

CREATE TABLE customers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
);

CREATE TABLE order_discounts (
  id                  TEXT PRIMARY KEY,
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id            TEXT NOT NULL REFERENCES pos_transactions(id) ON DELETE CASCADE,
  transaction_item_id TEXT REFERENCES pos_transaction_items(id) ON DELETE CASCADE,
  promotion_id        TEXT NOT NULL,
  promotion_name      TEXT NOT NULL,
  discount_type       TEXT NOT NULL CHECK (discount_type IN ('percentage','fixed','bogo')),
  discount_value      REAL NOT NULL,
  discount_amount     REAL NOT NULL,
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_tenant_email ON customers(tenant_id, email);
CREATE INDEX idx_customers_tenant_phone ON customers(tenant_id, phone);
CREATE INDEX idx_order_discounts_order  ON order_discounts(order_id);
CREATE INDEX idx_order_discounts_tenant ON order_discounts(tenant_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_split ON order_items(split_group);
CREATE INDEX idx_order_items_type ON order_items(type);
CREATE INDEX idx_orders_camp ON orders(camp_id);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_dates ON orders(check_in_date, check_out_date);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_reference ON orders(reference);
CREATE INDEX idx_orders_room ON orders(room_id);
CREATE INDEX idx_orders_state ON orders(order_state_id);
CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_tenant_date ON orders(tenant_id, created_at);
CREATE INDEX idx_orders_tenant_room_dates ON orders(tenant_id, room_id, check_in_date, check_out_date);
CREATE INDEX idx_orders_tenant_state ON orders(tenant_id, order_state_id);

-- Triggers
CREATE TRIGGER trg_orders_updated_at
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE orders SET updated_at = datetime('now') WHERE id = NEW.id;
END;
