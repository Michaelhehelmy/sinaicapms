-- 0085: Type-aware cross-project connections
-- Adds the project_links table enabling cross-project connections where both
-- projects belong to the same tenant (e.g. a restaurant project linked to the
-- camp project it serves, or bundled camps in a package).
--
-- An ordered pair (project_id_a, project_id_b) is used so that direction +
-- link_type identify exactly one link (enforced by the UNIQUE constraint),
-- meaning project A -> B is a distinct link from B -> A when that is intentional.
-- The API layer MUST enforce that both projects belong to the SAME tenant_id.

CREATE TABLE IF NOT EXISTS project_links (
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
CREATE INDEX IF NOT EXISTS idx_project_links_tenant ON project_links(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_links_a ON project_links(project_id_a);
CREATE INDEX IF NOT EXISTS idx_project_links_b ON project_links(project_id_b);
