-- Migration 0124: guest folios (folios + folio_charges + folio_settlements).
--
-- WHAT: creates three folio tables for per-guest charge accumulation and
-- cash/card/split settlement, with tenant/status and folio/posted_at indexes.
-- Forward-only; no down-migration. No KV writes (free-plan quota).

CREATE TABLE IF NOT EXISTS folios (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  guest_id          TEXT,
  primary_order_id  TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'settled', 'voided')),
  opened_at         TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at         TEXT,
  total_amount      REAL NOT NULL DEFAULT 0,
  settled_by        TEXT,
  settle_method     TEXT,
  notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_folios_tenant_status
  ON folios(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_folios_guest
  ON folios(guest_id, status);
CREATE INDEX IF NOT EXISTS idx_folios_order
  ON folios(primary_order_id);

CREATE TABLE IF NOT EXISTS folio_charges (
  id            TEXT PRIMARY KEY,
  folio_id      TEXT NOT NULL REFERENCES folios(id) ON DELETE CASCADE,
  tenant_id     TEXT NOT NULL,
  project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
  source        TEXT NOT NULL
                CHECK (source IN ('room', 'restaurant', 'spa', 'shop', 'other')),
  reference_id  TEXT,
  description   TEXT NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    REAL NOT NULL DEFAULT 0,
  total_price   REAL NOT NULL DEFAULT 0,
  posted_at     TEXT NOT NULL DEFAULT (datetime('now')),
  voided_at     TEXT,
  voided_by     TEXT
);
CREATE INDEX IF NOT EXISTS idx_folio_charges_folio
  ON folio_charges(folio_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_folio_charges_project
  ON folio_charges(project_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_folio_charges_tenant
  ON folio_charges(tenant_id, posted_at DESC);

CREATE TABLE IF NOT EXISTS folio_settlements (
  id           TEXT PRIMARY KEY,
  folio_id     TEXT NOT NULL REFERENCES folios(id) ON DELETE CASCADE,
  tenant_id    TEXT NOT NULL,
  amount       REAL NOT NULL CHECK (amount > 0),
  method       TEXT NOT NULL CHECK (method IN ('cash', 'card', 'split')),
  amount_cash  REAL NOT NULL DEFAULT 0,
  amount_card  REAL NOT NULL DEFAULT 0,
  received_by  TEXT NOT NULL,
  approved_by  TEXT,
  reference    TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (ABS((amount_cash + amount_card) - amount) <= 0.01)
);
CREATE INDEX IF NOT EXISTS idx_folio_settlements_folio
  ON folio_settlements(folio_id);
