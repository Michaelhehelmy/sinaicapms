-- 0090: Marketplace payouts — tenant payout entity + linkage on ledger
-- WHAT: each row is one payout (bank transfer, cash, etc.) from marketplace → tenant.
-- WHO: created_by (admin id), tenant_id (recipient).
-- STATUS LIFECYCLE: pending → paid | failed | cancelled.
-- LINKAGE: marketplace_payments.payout_id ties settled payments to a payout batch.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Marketplace payouts
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS marketplace_payouts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'EGP',
  method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (method IN ('bank_transfer','cash','paymob','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  reference TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at TEXT,
  cancelled_at TEXT
);

-- ══════════════════════════════════════════════════════════════════════
-- 2. Payout indexes
-- ══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_tenant_status ON marketplace_payouts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_status_created ON marketplace_payouts(status, created_at);

-- ══════════════════════════════════════════════════════════════════════
-- 3. Linkage column on marketplace_payments
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE marketplace_payments ADD COLUMN payout_id TEXT REFERENCES marketplace_payouts(id);

-- ══════════════════════════════════════════════════════════════════════
-- 4. Index on linkage column
-- ══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_marketplace_payments_payout ON marketplace_payments(payout_id);
