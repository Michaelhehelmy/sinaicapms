-- Migration 0094: Index gaps verified against live D1 sqlite_master (2026-09-05 audits)
--
-- Two real gaps surfaced by the database + performance audits:
--   1. leave_balances(tenant_id, year)   — hr.js:326-330 filters/sorts by
--      tenant + year; without this index the worker scans the whole table.
--   2. pos_stores(organization_id)       — pos/index.js:585 ORDER-by-org store
--      lookup (order-create store fallback) scans pos_stores.
-- Both are IF EXISTS-disciplined per the migration-integrity gate (T10), and
-- both are additive (CREATE INDEX IF NOT EXISTS) — no data, FK, or trigger risk.

CREATE INDEX IF NOT EXISTS idx_leave_balances_tenant_year
  ON leave_balances(tenant_id, year);

CREATE INDEX IF NOT EXISTS idx_pos_stores_organization
  ON pos_stores(organization_id);