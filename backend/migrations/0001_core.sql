-- Baseline 0001_core.sql: core tenant identity + projects + meta + audit.
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Generated verbatim from the canonical post-109 schema export (2026-09-23);
-- do NOT hand-edit DDL — the Stage-1c sqlite_master diff against canonical is the gate.
-- Tables: tenants, admins, projects, tenant_meta, project_meta, project_tags, tags, languages, audit_log, project_items, project_links
PRAGMA defer_foreign_keys = ON;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  subdomain TEXT UNIQUE,
  custom_domain TEXT UNIQUE,
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#4a7c4f',
  footer_text TEXT,
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, favicon_url TEXT, location TEXT, whatsapp_number TEXT, phone TEXT, email TEXT, description TEXT, hero_image_url TEXT, gallery_images TEXT, about_text TEXT, faq_items TEXT, reviews TEXT, map_embed_url TEXT, activities TEXT, capacity INTEGER DEFAULT 50, admin_passphrase TEXT DEFAULT 'sinaiadmin', hacker_passphrase TEXT DEFAULT 'hackeradmin', menu_config TEXT, currency TEXT DEFAULT 'USD', type TEXT NOT NULL DEFAULT 'camp' CHECK (type IN ('camp','supermarket','transportation','other')), business_type TEXT NOT NULL DEFAULT 'camp', latitude DECIMAL(10, 8), longitude DECIMAL(11, 8), deleted_at DATETIME, meta_version INTEGER DEFAULT 1, updated_at DATETIME, onboarding_token TEXT, onboarding_status TEXT DEFAULT 'completed');

CREATE TABLE admins (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('super_admin', 'admin')),
    first_name TEXT,
    last_name TEXT,
    is_active INTEGER DEFAULT 1,
    last_login TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT
, auto_login_token TEXT, auto_login_expires_at DATETIME);

CREATE TABLE projects (
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
  updated_at DATETIME, min_stay INTEGER DEFAULT 1, max_stay INTEGER, meal_plan_category_id TEXT,
  UNIQUE(tenant_id, slug)
);

CREATE TABLE tenant_meta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meta_key TEXT NOT NULL,
  meta_value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE "project_meta" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  meta_key TEXT NOT NULL,
  meta_value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE "project_tags" (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE(tenant_id, slug)
);

CREATE TABLE languages (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_default INTEGER DEFAULT 0
);

CREATE TABLE "audit_log" (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('tenant', 'project', 'admin', 'order', 'pos_table')),
  entity_id TEXT NOT NULL,
  old_values TEXT,
  new_values TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_items (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL DEFAULT 'product',
  name TEXT NOT NULL,
  description TEXT,
  base_price REAL DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  meta_data TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE project_links (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id_a TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_id_b TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL DEFAULT 'connection',
  meta_data TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  created_by TEXT
);

-- Indexes
CREATE INDEX idx_admins_auto_login ON admins(auto_login_token);
CREATE INDEX idx_admins_email ON admins(email);
CREATE INDEX idx_admins_role ON admins(role);
CREATE INDEX idx_admins_tenant ON admins(tenant_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX idx_project_items_project ON project_items(project_id, item_type);
CREATE INDEX idx_project_items_tenant ON project_items(tenant_id);
CREATE INDEX idx_project_links_a ON project_links(project_id_a);
CREATE INDEX idx_project_links_b ON project_links(project_id_b);
CREATE INDEX idx_project_links_tenant ON project_links(tenant_id);
CREATE INDEX idx_project_meta_key ON project_meta(project_id, meta_key);
CREATE INDEX idx_project_meta_project ON project_meta(project_id);
CREATE INDEX idx_projects_deleted ON projects(deleted_at);
CREATE INDEX idx_projects_meal_plan_category ON projects(meal_plan_category_id);
CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_projects_tenant ON projects(tenant_id);
CREATE INDEX idx_projects_tenant_deleted ON projects(tenant_id, deleted_at);
CREATE INDEX idx_projects_tenant_type_status ON projects(tenant_id, project_type, status);
CREATE INDEX idx_projects_type ON projects(project_type);
CREATE INDEX idx_tags_tenant ON tags(tenant_id);
CREATE INDEX idx_tenant_meta_key ON tenant_meta(tenant_id, meta_key);
CREATE INDEX idx_tenant_meta_tenant ON tenant_meta(tenant_id);
CREATE INDEX idx_tenants_business_type ON tenants(business_type);
CREATE INDEX idx_tenants_deleted ON tenants(deleted_at);
CREATE INDEX idx_tenants_domain ON tenants(custom_domain);
CREATE INDEX idx_tenants_onboarding ON tenants(onboarding_status);
CREATE INDEX idx_tenants_onboarding_token ON tenants(onboarding_token) WHERE onboarding_token IS NOT NULL;
CREATE INDEX idx_tenants_subdomain ON tenants(subdomain);
CREATE INDEX idx_tenants_type ON tenants(type);

-- Triggers
CREATE TRIGGER trg_projects_updated_at
  AFTER UPDATE ON projects
  FOR EACH ROW
  WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE projects SET updated_at = datetime('now') WHERE id = NEW.id;
END;

CREATE TRIGGER trg_tenants_updated_at
AFTER UPDATE ON tenants
FOR EACH ROW
WHEN NEW.updated_at IS NULL OR NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE tenants SET updated_at = datetime('now') WHERE id = NEW.id;
END;
