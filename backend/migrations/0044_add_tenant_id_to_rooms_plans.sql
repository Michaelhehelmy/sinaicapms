-- Migration 0044: Add tenant_id to rooms_new and plans_new
-- Both tables were created in migration 0028 without tenant scoping.
-- Adding tenant_id enables direct tenant isolation without JOIN through camps.
-- Default tenant_id: 'acaciacamp' for all existing rows.

-- ============================================================
-- 1. rooms_new — Add tenant_id
-- ============================================================

ALTER TABLE rooms_new ADD COLUMN tenant_id TEXT;

UPDATE rooms_new SET tenant_id = 'acaciacamp';

CREATE INDEX IF NOT EXISTS idx_rooms_new_tenant_id ON rooms_new(tenant_id);

-- ============================================================
-- 2. plans_new — Add tenant_id
-- ============================================================

ALTER TABLE plans_new ADD COLUMN tenant_id TEXT;

UPDATE plans_new SET tenant_id = 'acaciacamp';

CREATE INDEX IF NOT EXISTS idx_plans_new_tenant_id ON plans_new(tenant_id);
