import { describe, it, expect, vi, beforeEach } from 'vitest';
import auditRoutes, { logAudit } from '../src/api/audit.js';
import { mountRouter } from './helpers/routerHarness.js';

function mockDb({ auditRows = [], total = 0 } = {}) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn((...args) => {
        const sql = args.length ? args : undefined; // no-op
        return Promise.resolve({ results: auditRows });
      }),
      run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1, last_row_id: 1 } }),
    })),
  };
}

const superAdmin = { id: 'adm1', role: 'super_admin', email: 'root@x.com' };

async function buildApp({ user = superAdmin, tenantId = 'tee1' } = {}) {
  return mountRouter(auditRoutes, { basePath: '/api/audit', user, tenantId });
}

describe('auditRoutes GET /', () => {
  let app;
  let env;

  const get = (url, scope = {}) => {
    app = mountRouter(auditRoutes, { basePath: '/api/audit', ...scope });
    return app.request(`http://localhost${url}`, { method: 'GET' }, env);
  };

  beforeEach(() => {
    env = {};
  });

  it('lists audit entries with pagination envelope', async () => {
    env.DB = mockDb({
      auditRows: [{ id: 'a1', action: 'create', entity_type: 'tenant', entity_id: 'e1' }],
    });
    const res = await get('/api/audit', { user: superAdmin, tenantId: 'tee1' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0].entityType).toBe('tenant');
    expect(body.total).toBe(0);
    expect(body.page).toBe(1);
  });

  it('returns 401 when tenant context missing', async () => {
    env.DB = mockDb();
    const res = await get('/api/audit', { user: superAdmin, tenantId: null });
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid entity_type filter', async () => {
    env.DB = mockDb();
    const res = await get('/api/audit?entity_type=bogus', { user: superAdmin, tenantId: 'tee1' });
    expect(res.status).toBe(400);
  });

  it('accepts valid entity_type and entity_id filters', async () => {
    env.DB = mockDb({ auditRows: [{ id: 'a2', entity_type: 'project', entity_id: 'p1' }] });
    const res = await get('/api/audit?entity_type=project&entity_id=p1', { user: superAdmin, tenantId: 'tee1' });
    expect(res.status).toBe(200);
    expect(env.DB.prepare).toHaveBeenCalled();
  });

  it('accepts legacy limit/offset aliases', async () => {
    env.DB = mockDb({ auditRows: [{ id: 'a3' }] });
    const res = await get('/api/audit?limit=25&offset=0', { user: superAdmin, tenantId: 'tee1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pageSize).toBe(25);
  });

  it('computes page from offset when page absent', async () => {
    env.DB = mockDb({ auditRows: [{ id: 'a4' }] });
    const res = await get('/api/audit?offset=100', { user: superAdmin, tenantId: 'tee1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.page).toBe(3); // floor(100/50)+1 = 3
  });

  it('filters by action', async () => {
    env.DB = mockDb({ auditRows: [{ id: 'a5', action: 'update' }] });
    const res = await get('/api/audit?action=update', { user: superAdmin, tenantId: 'tee1' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].action).toBe('update');
  });
});

describe('auditRoutes POST /', () => {
  let app;
  let env;
  const post = (url, body, scope = { user: superAdmin, tenantId: 'tee1' }) => {
    app = mountRouter(auditRoutes, { basePath: '/api/audit', ...scope });
    return app.request(`http://localhost${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, env);
  };

  beforeEach(() => {
    env = { DB: null };
  });

  it('creates an audit entry with defaults', async () => {
    env.DB = mockDb();
    const res = await post('/api/audit', {
      action: 'create', entity_type: 'tenant', entity_id: 'e1',
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toContain('audit_');
  });

  it('returns 401 when no scope user', async () => {
    env.DB = mockDb();
    const res = await post('/api/audit', { action: 'create', entity_type: 'tenant', entity_id: 'e1' }, { user: null, tenantId: 'tee1' });
    expect(res.status).toBe(401);
  });

  it('returns 400 for missing action', async () => {
    env.DB = mockDb();
    const res = await post('/api/audit', { entity_type: 'tenant', entity_id: 'e1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing entity_type', async () => {
    env.DB = mockDb();
    const res = await post('/api/audit', { action: 'create', entity_id: 'e1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid action', async () => {
    env.DB = mockDb();
    const res = await post('/api/audit', { action: 'nuke', entity_type: 'tenant', entity_id: 'e1' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when tenant context required but absent', async () => {
    env.DB = mockDb();
    const res = await post('/api/audit', { action: 'create', entity_type: 'tenant', entity_id: 'e1' }, { user: superAdmin, tenantId: null });
    expect(res.status).toBe(400);
  });

  it('returns 403 when non-super_admin audits another tenant', async () => {
    const tenantAdmin = { id: 'adm2', role: 'admin', email: 'a@b.com' };
    env.DB = mockDb();
    const res = await post('/api/audit', {
      action: 'create', entity_type: 'tenant', entity_id: 'e1', tenant_id: 'OTHER',
    }, { user: tenantAdmin, tenantId: 'tee1' });
    expect(res.status).toBe(403);
  });

  it('returns 405 for unsupported method', async () => {
    env.DB = mockDb();
    const res = await post('/api/audit/delete', { action: 'create' });
    expect(res.status).toBe(405);
  });
});

describe('logAudit', () => {
  it('returns the generated id on success', async () => {
    let bound;
    const DB = {
      prepare: vi.fn(() => {
        const chain = {
          bind: vi.fn((...args) => { bound = args; return chain; }),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
        return chain;
      }),
    };
    const id = await logAudit(DB, {
      tenantId: 'tee1', userId: 'u1', action: 'create', entityType: 'project', entityId: 'p1',
      oldValues: { a: 1 }, newValues: { b: 2 },
    });
    expect(id).toContain('audit_');
    expect(DB.prepare).toHaveBeenCalled();
    // new_values JSON stringified
    expect(bound).toContain(JSON.stringify({ b: 2 }));
  });

  it('serializes string values as-is (not JSON)', async () => {
    let bound;
    const DB = {
      prepare: vi.fn(() => {
        const chain = {
          bind: vi.fn((...args) => { bound = args; return chain; }),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
        return chain;
      }),
    };
    await logAudit(DB, {
      tenantId: 'tee1', userId: 'u1', action: 'update', entityType: 'admin', entityId: 'a1',
      oldValues: 'plain-string', newValues: null,
    });
    expect(bound).toContain('plain-string');
    expect(bound).toContain(null);
  });

  it('returns null when required fields are missing', async () => {
    const DB = { prepare: vi.fn() };
    const id = await logAudit(DB, { tenantId: '', userId: '', action: 'create', entityType: 'tenant', entityId: '' });
    expect(id).toBeNull();
    expect(DB.prepare).not.toHaveBeenCalled();
  });

  it('returns null (best-effort) when DB write throws', async () => {
    const DB = { prepare: vi.fn(() => { throw new Error('db down'); }) };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await logAudit(DB, {
      tenantId: 'tee1', userId: 'u1', action: 'create', entityType: 'tenant', entityId: 'e1',
    });
    expect(id).toBeNull();
    consoleSpy.mockRestore();
  });
});
