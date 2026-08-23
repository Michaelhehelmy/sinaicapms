-- Migration 0065: Add remaining indexes (Phase 7)
--
-- This migration adds any indexes not already created in previous phases.
-- All indexes use IF NOT EXISTS to be idempotent.

PRAGMA defer_foreign_keys = true;

-- ============================================
-- TENANT META INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tenant_meta_tenant ON tenant_meta(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_meta_key ON tenant_meta(tenant_id, meta_key);

-- ============================================
-- PROJECT META INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_project_meta_project ON project_meta(project_id);
CREATE INDEX IF NOT EXISTS idx_project_meta_key ON project_meta(project_id, meta_key);

-- ============================================
-- PROJECTS INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_type_status ON projects(tenant_id, project_type, status);
CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_deleted ON projects(tenant_id, deleted_at);

-- ============================================
-- TENANTS INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tenants_deleted ON tenants(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tenants_business_type ON tenants(business_type);

-- ============================================
-- TAGS INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tags_tenant ON tags(tenant_id);

-- ============================================
-- AUDIT LOG INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
