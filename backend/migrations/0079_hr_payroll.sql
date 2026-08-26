-- 0079: HR & Payroll tables — employees, leave tracking, payroll runs, recruitment.

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  hire_date TEXT NOT NULL,
  termination_date TEXT,
  department TEXT,
  position TEXT,
  manager_id TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'terminated', 'on_leave')),
  salary_type TEXT DEFAULT 'monthly' CHECK(salary_type IN ('hourly', 'monthly', 'annual')),
  salary_amount REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  bank_account TEXT,
  tax_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, email)
);

CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  accrual_rate REAL DEFAULT 0,
  is_paid INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, name)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days REAL NOT NULL,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'canceled')),
  approved_by TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id),
  year INTEGER NOT NULL,
  total_days REAL DEFAULT 0,
  used_days REAL DEFAULT 0,
  remaining_days REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(employee_id, leave_type_id, year)
);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  run_date TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'processing', 'completed', 'posted')),
  total_gross REAL DEFAULT 0,
  total_deductions REAL DEFAULT 0,
  total_net REAL DEFAULT 0,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_lines (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  payroll_run_id TEXT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  gross_pay REAL NOT NULL DEFAULT 0,
  deductions REAL DEFAULT 0,
  net_pay REAL NOT NULL DEFAULT 0,
  bank_account TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_posts (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  department TEXT,
  location TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'closed', 'filled')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applicants (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_post_id TEXT NOT NULL REFERENCES job_posts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  resume_url TEXT,
  status TEXT DEFAULT 'applied' CHECK(status IN ('applied', 'screening', 'interview', 'offered', 'hired', 'rejected')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_tenant ON leave_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_balances_employee ON leave_balances(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_tenant ON payroll_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payroll_lines_run ON payroll_lines(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_job_posts_tenant ON job_posts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_applicants_tenant ON applicants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_applicants_job ON applicants(job_post_id);
