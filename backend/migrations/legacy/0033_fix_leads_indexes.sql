-- Migration 0033: Fix leads table indexes after failed 0032 migration
-- Migration 0032 failed because it tried to CREATE INDEX on a column that didn't exist yet.
-- The ALTER TABLE ADD COLUMN statements may or may not have succeeded.
-- This migration safely creates the indexes using IF NOT EXISTS (idempotent).

-- These indexes are safe to run multiple times
CREATE INDEX IF NOT EXISTS idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
