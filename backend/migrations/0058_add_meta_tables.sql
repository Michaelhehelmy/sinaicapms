-- Migration 0058: Add meta tables for unified business/project schema (Phase 1)
--
-- This migration adds the WordPress-inspired EAV (Entity-Attribute-Value) pattern
-- for flexible custom fields on tenants and projects.
--
-- Tables added:
--   - tenant_meta: Key-value custom fields per business
--   - project_meta: Key-value custom fields per project
--   - tags: Flat, tenant-scoped taxonomy
--   - project_tags: Junction table for project-tag relationships
--   - audit_log: Lightweight revision trail for compliance/debugging
--
-- Design decisions:
--   - Auto-increment INTEGER PK (supports multi-value fields with sort_order)
--   - meta_value is TEXT (simple strings only, no JSON objects)
--   - Composite indexes for common query patterns
--   - ON DELETE CASCADE for meta tables (meta dies with parent)

PRAGMA defer_foreign_keys = true;

-- ============================================
-- TENANT META (custom fields per business)
-- ============================================
CREATE TABLE IF NOT EXISTS tenant_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meta_key TEXT NOT NULL,
  meta_value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_tenant_meta_tenant ON tenant_meta(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_meta_key ON tenant_meta(tenant_id, meta_key);

-- ============================================
-- PROJECT META (custom fields per project)
-- ============================================
CREATE TABLE IF NOT EXISTS project_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  meta_key TEXT NOT NULL,
  meta_value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_project_meta_project ON project_meta(project_id);
CREATE INDEX IF NOT EXISTS idx_project_meta_key ON project_meta(project_id, meta_key);

-- ============================================
-- TAGS (flat, tenant-scoped taxonomy)
-- ============================================
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE(tenant_id, slug)
);

-- ============================================
-- PROJECT TAGS (junction table)
-- ============================================
CREATE TABLE IF NOT EXISTS project_tags (
  project_id TEXT NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

-- ============================================
-- AUDIT LOG (lightweight revision trail)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('tenant', 'project', 'admin')),
  entity_id TEXT NOT NULL,
  old_values TEXT,  -- JSON snapshot before change
  new_values TEXT,  -- JSON snapshot after change
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
