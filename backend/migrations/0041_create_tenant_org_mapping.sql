-- Migration 0041: Create tenant ↔ POS organization mapping table
-- Bridges the dual multi-tenancy model:
--   Core tables use tenant_id TEXT (e.g., 'acaciacamp')
--   POS tables use organization_id INTEGER (e.g., 1)
-- This junction table provides FK-level mapping between the two.

-- ============================================================
-- 1. Create tenant_org_mapping junction table
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_org_mapping (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id     TEXT    NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL UNIQUE,
  created_at    TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (tenant_id)     REFERENCES tenants(id)           ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES pos_organizations(id) ON DELETE CASCADE
);

-- ============================================================
-- 2. Backfill existing tenants → organization_id = 1
--    Only insert if the organization actually exists (defensive).
-- ============================================================
INSERT OR IGNORE INTO tenant_org_mapping (tenant_id, organization_id)
SELECT t.id, 1
FROM   tenants t
WHERE  t.id != 'marketplace'
  AND  EXISTS (SELECT 1 FROM pos_organizations WHERE id = 1);

-- ============================================================
-- 3. Index for reverse lookups (org → tenant)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tenant_org_mapping_org
  ON tenant_org_mapping(organization_id);

-- ============================================================
-- 4. Convenience view: resolve tenant_id → organization_id
-- ============================================================
CREATE VIEW IF NOT EXISTS v_tenant_org AS
SELECT tenant_id, organization_id
FROM   tenant_org_mapping;
