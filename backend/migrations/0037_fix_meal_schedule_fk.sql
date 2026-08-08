-- Migration 0037: Fix meal_schedules FK (meal_id should reference meals, not pos_products)

-- SQLite doesn't support ALTER FOREIGN KEY, so recreate the table
CREATE TABLE IF NOT EXISTS meal_schedules_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  date TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'all',
  max_servings INTEGER DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO meal_schedules_new (id, tenant_id, camp_id, date, meal_id, package_type, max_servings, created_at)
SELECT id, tenant_id, camp_id, date, meal_id, package_type, max_servings, created_at
FROM meal_schedules;

DROP TABLE IF EXISTS meal_schedules;

ALTER TABLE meal_schedules_new RENAME TO meal_schedules;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant_date ON meal_schedules(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_camp_date ON meal_schedules(camp_id, date);
