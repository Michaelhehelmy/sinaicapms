-- Migration 0063: Rename camps → projects (Phase 6)
--
-- This migration renames the camps table to projects.
--
-- IMPORTANT: This is a SCHEMA-CHANGING migration. It must be run AFTER:
--   - Phase 1: project_meta table created (references camps(id))
--   - Phase 2: tenant columns added
--   - Phase 3: camp columns added
--   - Phase 4: slugs backfilled
--   - Phase 5: custom fields moved to project_meta
--
-- The rename is done via:
--   1. Create new projects table with correct schema
--   2. Copy all data from camps to projects
--   3. Drop camps table
--   4. Update foreign keys in project_meta to reference projects
--
-- This approach is safer than ALTER TABLE RENAME because it ensures
-- all constraints are correctly applied to the new table.

PRAGMA defer_foreign_keys = true;

-- ============================================
-- STEP 1: Create projects table with final schema
-- ============================================
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  project_type TEXT NOT NULL DEFAULT 'camp',
  status TEXT DEFAULT 'active',
  location TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  start_date TEXT,
  end_date TEXT,
  capacity INTEGER,
  description TEXT,
  gallery_images TEXT,
  meta_version INTEGER DEFAULT 1,
  deleted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME,
  UNIQUE(tenant_id, slug)
);

-- ============================================
-- STEP 2: Copy all data from camps to projects
-- ============================================
INSERT INTO projects (
  id, tenant_id, name, slug, project_type, status, location,
  latitude, longitude, start_date, end_date, capacity,
  description, gallery_images, meta_version, deleted_at
)
SELECT
  id, tenant_id, name, slug, project_type, status, location,
  latitude, longitude, start_date, end_date, capacity,
  description, gallery_images, meta_version, deleted_at
FROM camps;
-- NOTE: created_at/updated_at are intentionally NOT copied — this schema
-- lineage's camps table has neither column (ledger stops at 0060). The new
-- projects table supplies its own defaults (CURRENT_TIMESTAMP / NULL).

-- ============================================
-- STEP 3: Update project_meta foreign keys
-- ============================================
-- project_meta currently references camps(id)
-- We need to update it to reference projects(id)
-- Since the IDs are the same, we just need to update the FK definition

-- Drop the old FK constraint (SQLite doesn't support ALTER TABLE FK)
-- We'll recreate project_meta with the correct FK

-- Create temporary table with new FK
CREATE TABLE IF NOT EXISTS project_meta_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  meta_key TEXT NOT NULL,
  meta_value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- Copy data
INSERT INTO project_meta_new (id, project_id, meta_key, meta_value, sort_order)
SELECT id, project_id, meta_key, meta_value, sort_order
FROM project_meta;

-- Drop old table
DROP TABLE IF EXISTS project_meta;

-- Rename new table
ALTER TABLE project_meta_new RENAME TO project_meta;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_project_meta_project ON project_meta(project_id);
CREATE INDEX IF NOT EXISTS idx_project_meta_key ON project_meta(project_id, meta_key);

-- ============================================
-- STEP 4: Update project_tags foreign keys
-- ============================================
-- Same approach as project_meta

CREATE TABLE IF NOT EXISTS project_tags_new (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

INSERT INTO project_tags_new (project_id, tag_id)
SELECT project_id, tag_id FROM project_tags;

DROP TABLE IF EXISTS project_tags;
ALTER TABLE project_tags_new RENAME TO project_tags;

-- ============================================
-- STEP 5: Drop old camps table
-- ============================================
-- Verify no other tables reference camps(id)
-- (room_type_camps should already be handled or dropped)

-- Check if room_type_camps exists and drop if so
DROP TABLE IF EXISTS room_type_camps;

-- Drop the old camps table
DROP TABLE IF EXISTS camps;

-- ============================================
-- STEP 6: Create indexes on projects
-- ============================================
CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_type_status ON projects(tenant_id, project_type, status);
CREATE INDEX IF NOT EXISTS idx_projects_deleted ON projects(deleted_at);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_deleted ON projects(tenant_id, deleted_at);

PRAGMA defer_foreign_keys = false;

PRAGMA foreign_key_check;
