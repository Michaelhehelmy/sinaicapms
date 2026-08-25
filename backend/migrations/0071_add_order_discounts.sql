-- Migration 0071: Order discounts — audit trail for the Supermarket Promotion Engine
--
-- Records every promotion applied to an order (or individual line item) so the
-- POS receipt and order history can show exactly which promotions were used and
-- how much each saved.  Row-level (transaction_item_id) discounts track per-
-- item promos; when transaction_item_id is NULL the row represents an order-
-- level discount (e.g. "10% off your entire order").

CREATE TABLE IF NOT EXISTS order_discounts (
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

CREATE INDEX IF NOT EXISTS idx_order_discounts_order  ON order_discounts(order_id);
CREATE INDEX IF NOT EXISTS idx_order_discounts_tenant ON order_discounts(tenant_id);
