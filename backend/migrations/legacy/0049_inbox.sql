-- Migration 0049: inbox read-tracking — unified leads + bookings inbox (Phase 4)
--
-- The unified inbox (GET /api/inbox) merges leads and bookings into one
-- tenant-scoped feed. Read state is tracked on each side:
--
--   * leads:      new columns is_read / read_at (in-table flags). Leads carry no
--                 external ref, so the flag lives on the row itself.
--   * bookings:   read state lives in inbox_reads, keyed by ref_type='booking'
--                 + ref_id=<orders.id>. Orders are referenced from many places
--                 and never gain inbox-specific columns; the side table keeps
--                 the orders schema untouched (same approach as rate_plans_new
--                 side tables in 0036).
--
-- Both sides are tenant-scoped: leads.tenant_id and the inbox_reads primary
-- key (tenant_id, ref_type, ref_id) prevent cross-tenant read-state leakage.
-- Plain ADD COLUMN + CREATE TABLE statements — batch-safe on fresh apply.

-- ============================================================
-- 1. leads — read tracking
-- ============================================================
ALTER TABLE leads ADD COLUMN is_read INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN read_at TEXT;

-- ============================================================
-- 2. inbox_reads — booking read acks (side table, tenant-scoped)
-- ============================================================
CREATE TABLE inbox_reads (
    tenant_id TEXT NOT NULL,
    ref_type TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    read_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, ref_type, ref_id)
);

CREATE INDEX idx_inbox_reads_tenant ON inbox_reads(tenant_id);
