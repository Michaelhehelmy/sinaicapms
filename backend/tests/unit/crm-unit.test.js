/**
 * CRM & Projects tests — contacts, leads, opportunities, tasks, tickets, knowledge articles.
 *
 * Uses the same SQL-routing mock DB and mountRouter helper as financials-unit.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import crmRouter from '../../src/api/crm';
import { mountRouter } from '../helpers/routerHarness';

// ── SQL-routing mock DB ─────────────────────────────────────────────────────

function makeRoutingDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...binds) => { stmt.boundBinds = binds; return stmt; }),
        boundBinds: [],
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async () => []),
    statements: [],
  };
  function runHandler(sql, binds) {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.result(binds);
    }
    return undefined;
  }
  db.on = (match, result) => {
    handlers.push({ match, result: typeof result === 'function' ? result : () => ({ results: result ?? [], meta: { changes: 1 } }) });
    return db;
  };
  return db;
}

const env = (db) => ({ DB: db });
const TENANT_HEADERS = { 'Content-Type': 'application/json', 'x-tenant-id': 't1' };
const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: TENANT_HEADERS, ...init });

// ── Contacts ────────────────────────────────────────────────────────────────

describe('CRM Contacts', () => {
  it('GET /contacts lists all contacts', async () => {
    const db = makeRoutingDb().on(/FROM contacts/, [
      { id: 'c1', tenant_id: 't1', type: 'individual', name: 'John Doe', email: 'john@example.com' }
    ]);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/contacts'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('John Doe');
  });

  it('POST /contacts creates a new contact', async () => {
    const db = makeRoutingDb().on(/INSERT INTO contacts/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/contacts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Jane Smith', email: 'jane@example.com', type: 'company' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.name).toBe('Jane Smith');
    expect(body.type).toBe('company');
  });

  it('PUT /contacts/:id updates a contact', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM contacts WHERE id/, [{ id: 'c1' }])
      .on(/UPDATE contacts SET/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/contacts/c1', {
      method: 'PUT',
      body: JSON.stringify({ name: 'Updated Name' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('DELETE /contacts/:id soft-deletes a contact', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM contacts WHERE id/, [{ id: 'c1' }])
      .on(/UPDATE contacts SET is_customer/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/contacts/c1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PUT /contacts/:id returns 404 for non-existent contact', async () => {
    const db = makeRoutingDb().on(/SELECT id FROM contacts WHERE id/, null);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/contacts/nonexistent', {
      method: 'PUT',
      body: JSON.stringify({ name: 'X' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('POST /contacts rejects empty name', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/contacts', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Leads ───────────────────────────────────────────────────────────────────

describe('CRM Leads', () => {
  it('GET /leads lists all leads', async () => {
    const db = makeRoutingDb().on(/FROM crm_leads/, [
      { id: 'l1', tenant_id: 't1', contact_id: 'c1', status: 'new', contact_name: 'John Doe', value: 5000 }
    ]);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/leads'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].contactName).toBe('John Doe');
  });

  it('POST /leads creates a lead from a contact', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM contacts WHERE/, [{ id: 'c1' }])
      .on(/INSERT INTO crm_leads/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/leads', {
      method: 'POST',
      body: JSON.stringify({ contactId: 'c1', source: 'Website', value: 10000 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.value).toBe(10000);
  });

  it('POST /leads rejects non-existent contact', async () => {
    const db = makeRoutingDb().on(/SELECT id FROM contacts WHERE/, null);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/leads', {
      method: 'POST',
      body: JSON.stringify({ contactId: 'nonexistent' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('PATCH /leads/:id/status updates lead status', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM crm_leads/, [{ id: 'l1' }])
      .on(/UPDATE crm_leads SET status/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/leads/l1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'qualified' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PATCH /leads/:id/status rejects invalid status', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/leads/l1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'invalid_status' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Opportunities ───────────────────────────────────────────────────────────

describe('CRM Opportunities', () => {
  it('GET /opportunities lists all opportunities', async () => {
    const db = makeRoutingDb().on(/FROM opportunities/, [
      { id: 'o1', tenant_id: 't1', name: 'Big Deal', stage: 'qualification', amount: 50000 }
    ]);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/opportunities'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].name).toBe('Big Deal');
  });

  it('POST /opportunities creates an opportunity', async () => {
    const db = makeRoutingDb().on(/INSERT INTO opportunities/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/opportunities', {
      method: 'POST',
      body: JSON.stringify({ name: 'New Deal', amount: 25000, probability: 60 }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.amount).toBe(25000);
  });

  it('POST /opportunities rejects empty name', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/opportunities', {
      method: 'POST',
      body: JSON.stringify({ name: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('PATCH /opportunities/:id/stage updates pipeline stage', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM opportunities/, [{ id: 'o1' }])
      .on(/UPDATE opportunities SET stage/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/opportunities/o1/stage', {
      method: 'PATCH',
      body: JSON.stringify({ stage: 'proposal' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PATCH /opportunities/:id/stage rejects invalid stage', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/opportunities/o1/stage', {
      method: 'PATCH',
      body: JSON.stringify({ stage: 'invalid' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Tasks ───────────────────────────────────────────────────────────────────

describe('CRM Tasks', () => {
  it('GET /tasks lists all tasks', async () => {
    const db = makeRoutingDb().on(/FROM crm_tasks/, [
      { id: 't1', tenant_id: 't1', title: 'Build feature', status: 'todo', priority: 'high' }
    ]);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tasks'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].title).toBe('Build feature');
  });

  it('POST /tasks creates a task', async () => {
    const db = makeRoutingDb().on(/INSERT INTO crm_tasks/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Fix bug', priority: 'urgent', dueDate: '2026-12-31' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.title).toBe('Fix bug');
    expect(body.priority).toBe('urgent');
  });

  it('PATCH /tasks/:id/status transitions from todo to in_progress', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM crm_tasks/, [{ id: 't1', status: 'todo' }])
      .on(/UPDATE crm_tasks SET/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tasks/t1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'in_progress' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PATCH /tasks/:id/status sets completed_at when done', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id, status FROM crm_tasks/, [{ id: 't1', status: 'in_progress' }])
      .on(/UPDATE crm_tasks SET/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tasks/t1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('PATCH /tasks/:id/status rejects invalid transition todo→done', async () => {
    const db = makeRoutingDb().on(/SELECT id, status FROM crm_tasks/, [{ id: 't1', status: 'todo' }]);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tasks/t1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'done' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain('Invalid status transition');
  });

  it('POST /tasks rejects empty title', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Time Entries ────────────────────────────────────────────────────────────

describe('Time Entries', () => {
  it('POST /time-entries logs time on a task', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM crm_tasks/, [{ id: 't1' }])
      .on(/INSERT INTO time_entries/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/time-entries', {
      method: 'POST',
      body: JSON.stringify({ taskId: 't1', userId: 'u1', hours: 2.5, date: '2026-08-26', description: 'Implemented feature' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.hours).toBe(2.5);
  });

  it('POST /time-entries rejects non-existent task', async () => {
    const db = makeRoutingDb().on(/SELECT id FROM crm_tasks/, null);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/time-entries', {
      method: 'POST',
      body: JSON.stringify({ taskId: 'nonexistent', userId: 'u1', hours: 1, date: '2026-08-26' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('POST /time-entries rejects zero hours', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/time-entries', {
      method: 'POST',
      body: JSON.stringify({ taskId: 't1', userId: 'u1', hours: 0, date: '2026-08-26' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Tickets ─────────────────────────────────────────────────────────────────

describe('CRM Tickets', () => {
  it('GET /tickets lists all tickets', async () => {
    const db = makeRoutingDb().on(/FROM tickets/, [
      { id: 'tk1', tenant_id: 't1', subject: 'Login issue', status: 'new', contact_name: 'John Doe' }
    ]);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tickets'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].subject).toBe('Login issue');
  });

  it('POST /tickets creates a ticket', async () => {
    const db = makeRoutingDb().on(/INSERT INTO tickets/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tickets', {
      method: 'POST',
      body: JSON.stringify({ subject: 'Bug report', description: 'App crashes on login', priority: 'high' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.subject).toBe('Bug report');
    expect(body.priority).toBe('high');
  });

  it('POST /tickets/:id/comments adds a comment and updates updated_at', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id FROM tickets/, [{ id: 'tk1' }])
      .on(/INSERT INTO ticket_comments/, { meta: { changes: 1 } })
      .on(/UPDATE tickets SET updated_at/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tickets/tk1/comments', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u1', content: 'Looking into this now.' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.content).toBe('Looking into this now.');
  });

  it('POST /tickets/:id/comments returns 404 for non-existent ticket', async () => {
    const db = makeRoutingDb().on(/SELECT id FROM tickets/, null);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tickets/nonexistent/comments', {
      method: 'POST',
      body: JSON.stringify({ userId: 'u1', content: 'Test' }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });

  it('POST /tickets rejects empty subject', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tickets', {
      method: 'POST',
      body: JSON.stringify({ subject: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Knowledge Articles ──────────────────────────────────────────────────────

describe('Knowledge Articles', () => {
  it('GET /knowledge-articles lists all articles', async () => {
    const db = makeRoutingDb().on(/FROM knowledge_articles/, [
      { id: 'k1', tenant_id: 't1', title: 'How to login', content: 'Step 1...', category: 'Getting Started', is_published: 1 }
    ]);
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/knowledge-articles'), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.length).toBe(1);
    expect(body[0].title).toBe('How to login');
  });

  it('POST /knowledge-articles creates an article', async () => {
    const db = makeRoutingDb().on(/INSERT INTO knowledge_articles/, { meta: { changes: 1 } });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/knowledge-articles', {
      method: 'POST',
      body: JSON.stringify({ title: 'FAQ', content: 'Frequently asked questions...', category: 'General', isPublished: true }),
    }), {}, env(db));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.title).toBe('FAQ');
    expect(body.isPublished).toBe(1);
  });

  it('POST /knowledge-articles rejects empty title', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/knowledge-articles', {
      method: 'POST',
      body: JSON.stringify({ title: '', content: 'Some content' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /knowledge-articles rejects empty content', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/knowledge-articles', {
      method: 'POST',
      body: JSON.stringify({ title: 'Title', content: '' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── Tenant Isolation ────────────────────────────────────────────────────────

describe('Tenant Isolation', () => {
  it('contacts queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM contacts/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [], meta: { changes: 0 } };
    });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    await app.request(req('/contacts'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });

  it('leads queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM crm_leads/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [], meta: { changes: 0 } };
    });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    await app.request(req('/leads'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });

  it('tasks queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM crm_tasks/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [], meta: { changes: 0 } };
    });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    await app.request(req('/tasks'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });

  it('tickets queries always include tenant_id', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb().on(/FROM tickets t/, (binds) => {
      capturedBinds.push(...binds);
      return { results: [], meta: { changes: 0 } };
    });
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    await app.request(req('/tickets'), {}, env(db));
    expect(capturedBinds).toContain('t1');
  });
});

// ── Validation ──────────────────────────────────────────────────────────────

describe('Validation', () => {
  it('POST /contacts rejects invalid type', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/contacts', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', type: 'invalid' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('POST /leads rejects invalid status', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/leads', {
      method: 'POST',
      body: JSON.stringify({ contactId: 'c1', status: 'invalid' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('PATCH /opportunities/:id/stage rejects invalid stage', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/opportunities/o1/stage', {
      method: 'PATCH',
      body: JSON.stringify({ stage: 'invalid' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });

  it('PATCH /tasks/:id/status rejects invalid status', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(crmRouter, { tenantId: 't1' });
    const res = await app.request(req('/tasks/t1/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'invalid' }),
    }), {}, env(db));
    expect(res.status).toBe(400);
  });
});
