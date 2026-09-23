-- Migration 0110: Phase-3.5 Admin Cash Desk v1 — payment_records ledger.
--
-- WHAT: offline payment recording table for booking orders. One row per
-- cash-desk collection (cash, card, or a cash+card split in a single call).
-- The online Paymob flow is untouched: it writes orders.amount_paid /
-- payment_status directly (+ the marketplace_payments ledger) and MUST NEVER
-- write here (see POST /api/orders/:id/record-payment, backend/src/api/orders.js).
--
-- RECON GROUND TRUTH: /tmp/opencode/p35-recon.md §§1-2,6 (task
-- tenant-arch-p35a-recon, 2026-09-23).
--   - orders has NO balance column — balance is derived as
--     total_amount − amount_paid (recon §1.1); no balance column here either.
--   - orders.payment_status / payment_method are free-form TEXT with no CHECK
--     (recon §1.1); THIS table is stricter: method is CHECK-constrained to the
--     canonical POS enum cash|card|split (routes/pos/index.js:24; recon §2).
--     Recon confirms no extras exist on the POS side — bank_transfer/paymob
--     belong to the financials/payouts domains and are deliberately excluded.
--   - Tenant scoping: every row carries tenant_id TEXT NOT NULL (orders are
--     partitioned by tenant_id; the record-payment handler always binds it).
--   - Numbering: filesystem head was 0108_add_meals_project_id.sql; 0109 is
--     RESERVED-but-absent (02-proposed-design.md:256 — destructive camp-column
--     drops, must not be consumed by P35). 0110 skips that slot; a missing
--     0109 file simply means nothing runs in that slot (D1 applies in
--     lexicographic order). P35-D (gate) must re-verify at commit time that no
--     0109 file has landed meanwhile.
--
-- IDEMPOTENCY: the handler accepts an optional client-supplied `id`
-- (idempotency key): a repeat POST with the same id returns the existing row
-- instead of double-inserting. The PRIMARY KEY on id is the backstop.
--
-- ROLLBACK SAFETY (hard rule 7): additive-only migration. Rollback = DROP
-- TABLE IF EXISTS payment_records (plus its two indexes, dropped implicitly).
-- No existing table is altered, rebuilt, or backfilled, so committed state of
-- every other table is unchanged by this file.

CREATE TABLE IF NOT EXISTS payment_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount REAL NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'split')),
  -- Split legs (POS pattern: routes/pos/index.js:540-552). Single-method
  -- payments store the full amount in their own leg and 0 in the other, so
  -- receipts can always render cash/card legs uniformly.
  amount_cash REAL NOT NULL DEFAULT 0 CHECK (amount_cash >= 0),
  amount_card REAL NOT NULL DEFAULT 0 CHECK (amount_card >= 0),
  -- cash-desk accountability: who collected (admin token id) + optional
  -- supervisor sign-off. Every record also writes an audit_log row via
  -- logAudit() (best-effort, never fails the payment response).
  received_by TEXT NOT NULL,
  approved_by TEXT,
  reference TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- Split legs must sum to the recorded amount ±0.01 (same tolerance as the
  -- POS split check). Single-method rows satisfy this via the leg convention
  -- above (amount in one leg, 0 in the other).
  CHECK (ABS((amount_cash + amount_card) - amount) <= 0.01)
);

CREATE INDEX IF NOT EXISTS idx_payment_records_tenant ON payment_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payment_records_order ON payment_records(order_id);
