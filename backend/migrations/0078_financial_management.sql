-- Chart of Accounts
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id TEXT REFERENCES accounts(id),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(tenant_id, code)
);

-- Journals
CREATE TABLE IF NOT EXISTS journals (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('sales', 'purchase', 'cash', 'bank', 'general')),
  sequence_next INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Journal Entries
CREATE TABLE IF NOT EXISTS journal_entries (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  journal_id TEXT NOT NULL REFERENCES journals(id),
  date TEXT NOT NULL,
  description TEXT,
  reference TEXT,
  created_by TEXT,
  posted INTEGER DEFAULT 0,
  posted_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Entry Lines
CREATE TABLE IF NOT EXISTS entry_lines (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  entry_id TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  debit REAL DEFAULT 0,
  credit REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('sales', 'purchase')),
  contact_id TEXT,
  issue_date TEXT NOT NULL,
  due_date TEXT,
  total_amount REAL NOT NULL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'overdue', 'canceled')),
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Invoice Lines
CREATE TABLE IF NOT EXISTS invoice_lines (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id TEXT,
  description TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price REAL NOT NULL,
  tax_rate REAL DEFAULT 0,
  total_amount REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id TEXT REFERENCES invoices(id),
  amount REAL NOT NULL,
  payment_date TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('cash', 'card', 'bank_transfer', 'stripe', 'other')),
  reference TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
  created_by TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Tax Rates
CREATE TABLE IF NOT EXISTS tax_rates (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate REAL NOT NULL,
  jurisdiction TEXT,
  is_default INTEGER DEFAULT 0,
  valid_from TEXT,
  valid_to TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Exchange Rates
CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate REAL NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(from_currency, to_currency, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_tenant ON accounts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journals_tenant ON journals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant ON journal_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(date);
CREATE INDEX IF NOT EXISTS idx_entry_lines_entry ON entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_entry_lines_account ON entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tax_rates_tenant ON tax_rates(tenant_id);
