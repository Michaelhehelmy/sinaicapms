-- Migration 0031: Add tenant_id to categories for tenant isolation
-- Categories were previously global, which caused cross-tenant data leaks.
-- This migration adds tenant_id and scopes all existing categories to NULL (global).

ALTER TABLE categories ADD COLUMN tenant_id TEXT;

-- Make all existing categories global (accessible to all tenants)
UPDATE categories SET tenant_id = NULL WHERE tenant_id IS NULL;

-- Create index for efficient tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_categories_tenant_id ON categories(tenant_id);
