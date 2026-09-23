-- 0086: project_items — type-aware per-project operation inventory
-- Adds a generic per-project typed-inventory spine used by non-camp
-- project types (transportation → vehicles, supermarket → products,
-- restaurant → menu items).
--
-- item_type discriminates vehicle / product / menu_item etc., so a
-- project's project_type determines which item_type(s) it manages.
-- meta_data is a JSON string for type-specific extra fields.

CREATE TABLE IF NOT EXISTS project_items (
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

CREATE INDEX IF NOT EXISTS idx_project_items_tenant ON project_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_items_project ON project_items(project_id, item_type);
