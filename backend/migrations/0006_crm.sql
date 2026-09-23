-- Baseline 0006_crm.sql: CRM + inbox + feedback.
--
-- Squash of legacy migrations 0001-0099 (archived in backend/migrations/legacy/).
-- Generated verbatim from the canonical post-109 schema export (2026-09-23);
-- do NOT hand-edit DDL — the Stage-1c sqlite_master diff against canonical is the gate.
-- Tables: crm_leads, contacts, opportunities, tickets, ticket_comments, crm_tasks, time_entries, knowledge_articles, leads, inbox, inbox_reads, feedback
PRAGMA defer_foreign_keys = ON;

CREATE TABLE crm_leads (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  source TEXT,
  assigned_to TEXT,
  value REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE contacts (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'individual' CHECK(type IN ('individual', 'company')),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  industry TEXT,
  is_customer INTEGER DEFAULT 0,
  is_vendor INTEGER DEFAULT 0,
  is_lead INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id TEXT REFERENCES crm_leads(id),
  name TEXT NOT NULL,
  stage TEXT DEFAULT 'qualification' CHECK(stage IN ('qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
  amount REAL DEFAULT 0,
  probability INTEGER DEFAULT 0,
  expected_close_date TEXT,
  assigned_to TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE tickets (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id),
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'new' CHECK(status IN ('new', 'open', 'pending', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
  assigned_to TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE ticket_comments (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  internal INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE crm_tasks (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'done', 'blocked')),
  priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
  assignee_id TEXT,
  due_date TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE time_entries (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  hours REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE knowledge_articles (
  id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT,
  is_published INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  room_type_id TEXT,
  check_in TEXT,
  check_out TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, subject TEXT, message TEXT, source TEXT DEFAULT 'contact', status TEXT DEFAULT 'new', is_read INTEGER DEFAULT 0, read_at TEXT,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE inbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  title TEXT NOT NULL,
  message TEXT,
  severity TEXT DEFAULT 'info',
  is_read INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inbox_reads (
    tenant_id TEXT NOT NULL,
    ref_type TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    read_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (tenant_id, ref_type, ref_id)
);

CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
    author_type TEXT NOT NULL CHECK (author_type IN ('admin', 'pos', 'public')),
    author_id TEXT,
    author_name TEXT,
    author_email TEXT,
    role TEXT,
    category TEXT NOT NULL CHECK (category IN ('bug', 'missing', 'flow')),
    message TEXT NOT NULL,
    personal_view TEXT,
    page_url TEXT NOT NULL,
    user_agent TEXT,
    screenshot TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'archived')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT,
    resolved_by TEXT
);

-- Indexes
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_crm_leads_contact ON crm_leads(contact_id);
CREATE INDEX idx_crm_leads_status ON crm_leads(status);
CREATE INDEX idx_crm_leads_tenant ON crm_leads(tenant_id);
CREATE INDEX idx_crm_tasks_assignee ON crm_tasks(assignee_id);
CREATE INDEX idx_crm_tasks_status ON crm_tasks(status);
CREATE INDEX idx_crm_tasks_tenant ON crm_tasks(tenant_id);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
CREATE INDEX idx_feedback_status ON feedback(status, created_at DESC);
CREATE INDEX idx_feedback_tenant ON feedback(tenant_id);
CREATE INDEX idx_inbox_date ON inbox(created_at);
CREATE INDEX idx_inbox_reads_tenant ON inbox_reads(tenant_id);
CREATE INDEX idx_inbox_severity ON inbox(severity);
CREATE INDEX idx_inbox_tenant ON inbox(tenant_id);
CREATE INDEX idx_knowledge_articles_tenant ON knowledge_articles(tenant_id);
CREATE INDEX idx_leads_created_at ON leads(created_at);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_opportunities_stage ON opportunities(stage);
CREATE INDEX idx_opportunities_tenant ON opportunities(tenant_id);
CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX idx_time_entries_task ON time_entries(task_id);
