-- Migration 0099: Normalize marketplace_payouts.tenant_id / created_by to TEXT (A2)
--
-- 0090 created marketplace_payouts with:
--   tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE
--   created_by INTEGER
-- but tenants.id and admins.id are TEXT (UUID-style, see 0001 / 0028). The
-- INTEGER-declared columns let write-side values flow as text and make JOINs
-- against the TEXT PKs behave inconsistently (SQLite type-affinity quirk).
--
-- SQLite cannot ALTER a column type, so marketplace_payouts is rebuilt with
-- the create-copy-drop-rename table-swap pattern used by 0042 (pos_products),
-- 0059/0066 (orders), 0069 (audit_log), 0092 (orders/pos_transactions), and
-- 0093 (pos_customers): create New → copy → drop → rename, then recreate the
-- indexes that died with the drop.
--
-- Rebuild fidelity (0090 schema): all 12 columns copied verbatim; only the
-- two repaired columns change type (tenant_id → TEXT, created_by → TEXT).
-- The payout PK (id TEXT, DEFAULT lower(hex(randomblob(16)))) is unchanged,
-- so the child FK marketplace_payments.payout_id REFERENCES
-- marketplace_payouts(id) is auto-repointed by SQLite on RENAME and survives
-- the swap (same rename behavior as the 0066/0092 rebuilds).
--
-- No live triggers reference marketplace_payouts, so no trigger dance is
-- required. D1 does not honor PRAGMA foreign_keys; defer_foreign_keys is the
-- D1-compatible way to defer FK enforcement to the migration commit.

PRAGMA defer_foreign_keys = true;

-- ══════════════════════════════════════════════════════════════════════
-- 1. Rebuild marketplace_payouts with TEXT tenant_id / created_by
-- ══════════════════════════════════════════════════════════════════════
CREATE TABLE marketplace_payouts_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'EGP',
  method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (method IN ('bank_transfer','cash','paymob','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
  reference TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  paid_at TEXT,
  cancelled_at TEXT
);

-- Copy every existing payout row verbatim (id/tenant_id/created_by become
-- TEXT values matching the tenants.id/admins.id TEXT PKs). tenant_id is
-- NOT NULL with ON DELETE CASCADE so no orphaned rows can exist — copy all.
INSERT INTO marketplace_payouts_new (
  id, tenant_id, amount, currency, method, status, reference, notes,
  created_by, created_at, paid_at, cancelled_at
)
SELECT
  p.id, p.tenant_id, p.amount, p.currency, p.method, p.status, p.reference,
  p.notes, p.created_by, p.created_at, p.paid_at, p.cancelled_at
FROM marketplace_payouts p;

-- ══════════════════════════════════════════════════════════════════════
-- 2. Swap in the rebuilt table
-- ══════════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS marketplace_payouts;
ALTER TABLE marketplace_payouts_new RENAME TO marketplace_payouts;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Recreate the payout indexes (they died with the drop)
-- ══════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_tenant_status ON marketplace_payouts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_marketplace_payouts_status_created ON marketplace_payouts(status, created_at);

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;