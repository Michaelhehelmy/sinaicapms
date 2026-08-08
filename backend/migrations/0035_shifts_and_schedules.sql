-- Migration 0035: POS Cashier Shifts & Meal Schedules

-- 1. POS Cashier Shifts Table
CREATE TABLE IF NOT EXISTS pos_shifts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  cashier_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed'
  opening_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closing_time DATETIME,
  opening_cash REAL NOT NULL DEFAULT 0.0,
  expected_closing_cash REAL NOT NULL DEFAULT 0.0,
  actual_closing_cash REAL,
  notes TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- 2. Meal Scheduling Table (Menu Planner)
CREATE TABLE IF NOT EXISTS meal_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT NOT NULL,
  date TEXT NOT NULL, -- 'YYYY-MM-DD'
  meal_id TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'all', -- 'all', 'full_board', 'half_board'
  max_servings INTEGER DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (camp_id) REFERENCES camps(id) ON DELETE CASCADE,
  FOREIGN KEY (meal_id) REFERENCES pos_products(id) ON DELETE CASCADE
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_shifts_tenant_cashier ON pos_shifts(tenant_id, cashier_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON pos_shifts(status);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant_date ON meal_schedules(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_camp_date ON meal_schedules(camp_id, date);
