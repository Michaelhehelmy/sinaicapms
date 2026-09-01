-- 0089: Marketplace payments ledger
-- Payment isolation / origination tracking for the marketplace.
-- WHAT the payment is for: order_reference.
-- WHERE it came from: tenant_id, channel (marketplace vs pos).
-- HOW it splits: gross_amount → marketplace_fee → net_amount.
-- Tracks Paymob identifiers and settlement lifecycle (captured → settled / refunded / failed).

-- ══════════════════════════════════════════════════════════════════════
-- 1. Marketplace payments ledger
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplace_payments (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_reference TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'marketplace' CHECK(channel IN ('marketplace','pos')),
  gross_amount REAL NOT NULL DEFAULT 0,
  marketplace_fee REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EGP',
  paymob_transaction_id TEXT,
  paymob_intention_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'captured' CHECK(payment_status IN ('captured','settled','refunded','failed')),
  captured_at TEXT DEFAULT (datetime('now')),
  settled_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ══════════════════════════════════════════════════════════════════════
-- 2. Indexes
-- ══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_tenant ON marketplace_payments(tenant_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_order ON marketplace_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_status ON marketplace_payments(payment_status, captured_at);
