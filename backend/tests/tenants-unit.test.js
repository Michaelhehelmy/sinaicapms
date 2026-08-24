import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase 1: tenants.js no longer verifies tokens through api/auth.js#verifyJWT —
// the soft-elevation block calls sharedAuth#verifyToken directly.
vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
}));

import { handleTenants } from '../src/api/tenants.js';
import meRoutes from '../src/api/tenants.js';
import { verifyToken as verifyJWT } from '../src/middleware/sharedAuth.js';
import { mountRouter } from './helpers/routerHarness.js';

function makeReq(url, method = 'GET', body = null) {
  return {
    url,
    method,
    headers: { get: (name) => name === 'Authorization' ? null : null },
    json: () => Promise.resolve(body),
  };
}

function makeReqWithAuth(url, method = 'GET', body = null, token = 'valid-token') {
  return {
    url,
    method,
    headers: { get: (name) => name === 'Authorization' ? `Bearer ${token}` : null },
    json: () => Promise.resolve(body),
  };
}

function mockDb(methods = {}) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: methods._all ?? [] }),
      first: vi.fn().mockResolvedValue(methods._first ?? null),
      run: vi.fn().mockResolvedValue(methods._run ?? {}),
    })),
  };
}

const tenantId = 'tenant_1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleTenants', () => {
  describe('GET /api/tenants (list)', () => {
    it('returns active tenants for public users', async () => {
      const tenants = [{ id: 't1', name: 'Camp A' }];
      const db = mockDb({ _all: tenants });
      const res = await handleTenants(makeReq('http://localhost/api/tenants'), { DB: db, JWT_SECRET: 'secret' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toEqual(tenants);
    });

    it('returns all tenants for super_admin', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      const tenants = [{ id: 't1', name: 'Camp A' }, { id: 't2', name: 'Camp B' }];
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ is_active: 1 }] });
            return Promise.resolve({ results: tenants });
          }),
        })),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants'),
        { DB: db, JWT_SECRET: 'secret' }
      );
      const data = await res.json();
      expect(data.length).toBe(2);
    });

    it('applies search filter', async () => {
      const db = mockDb({ _all: [] });
      const res = await handleTenants(
        makeReq('http://localhost/api/tenants?search=sinai'),
        { DB: db }
      );
      expect(res.status).toBe(200);
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('LIKE'));
    });

    it('applies location filter', async () => {
      const db = mockDb({ _all: [] });
      await handleTenants(makeReq('http://localhost/api/tenants?location=cairo'), { DB: db });
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('location LIKE'));
    });

    it('applies capacity filter', async () => {
      const db = mockDb({ _all: [] });
      await handleTenants(makeReq('http://localhost/api/tenants?capacity=50'), { DB: db });
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('capacity >='));
    });

    it('applies activities filter', async () => {
      const db = mockDb({ _all: [] });
      await handleTenants(makeReq('http://localhost/api/tenants?activities=hiking'), { DB: db });
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('activities LIKE'));
    });

    it('applies status filter', async () => {
      const db = mockDb({ _all: [] });
      await handleTenants(makeReq('http://localhost/api/tenants?status=active'), { DB: db });
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('status = ?'));
    });

    it('excludes the root marketplace tenant from the public directory', async () => {
      // Simulate the DB honoring the WHERE filter (returns no marketplace row).
      const tenants = [{ id: 't1', name: 'Camp A' }, { id: 't2', name: 'Camp B' }];
      const db = mockDb({ _all: tenants });
      const res = await handleTenants(makeReq('http://localhost/api/tenants'), { DB: db, JWT_SECRET: 'secret' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.some((t) => t.id === 'marketplace')).toBe(false);
      // The SQL (not just the rows) must exclude the marketplace row.
      expect(db.prepare.mock.calls[0][0]).toContain("tenants.id != 'marketplace'");
    });

    it('excludes the root marketplace tenant from the super_admin directory', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ is_active: 1 }] }); // auth check
            return Promise.resolve({ results: [{ id: 't1', name: 'Camp A' }] });
          }),
        })),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants'),
        { DB: db, JWT_SECRET: 'secret' }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.some((t) => t.id === 'marketplace')).toBe(false);
      expect(db.prepare.mock.calls[1][0]).toContain("tenants.id != 'marketplace'");
    });
  });

  describe('GET /api/tenants/:id (detail)', () => {
    it('returns a tenant by ID', async () => {
      const tenant = { id: 't1', name: 'Camp A' };
      const db = mockDb({ _all: [tenant] });
      const res = await handleTenants(makeReq('http://localhost/api/tenants/t1'), { DB: db });
      const data = await res.json();
      expect(data.id).toBe('t1');
    });

    it('returns 404 when tenant not found', async () => {
      const db = mockDb({ _all: [] });
      const res = await handleTenants(makeReq('http://localhost/api/tenants/unknown'), { DB: db });
      expect(res.status).toBe(404);
    });

    it('still returns the marketplace tenant by id (root branding lookup)', async () => {
      const tenant = { id: 'marketplace', name: 'Sinai Camps' };
      const db = mockDb({ _all: [tenant] });
      const res = await handleTenants(makeReq('http://localhost/api/tenants/marketplace'), { DB: db });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.id).toBe('marketplace');
    });

    it('normalizes a leading www. on the lookup key (custom-domain match)', async () => {
      const tenant = { id: 'acacia', name: 'Acacia Camp', custom_domain: 'acaciacamp.com' };
      let bindArgs = null;
      const chain = {
        bind: vi.fn((...args) => { bindArgs = args; return chain; }),
        all: vi.fn().mockResolvedValue({ results: [tenant] }),
      };
      const db = { prepare: vi.fn(() => chain) };
      const res = await handleTenants(
        makeReq('http://localhost/api/tenants/www.acaciacamp.com'),
        { DB: db }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.id).toBe('acacia');
      expect(bindArgs).toEqual(['acaciacamp.com', 'acaciacamp.com', 'acaciacamp.com']);
    });

    it('H5: public lookup only matches ACTIVE tenants', async () => {
      const tenant = { id: 't1', name: 'Camp A' };
      let detailSql = null;
      const db = {
        prepare: vi.fn((sql) => {
          if (sql.includes('FROM tenants WHERE')) detailSql = sql;
          return {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [tenant] }),
          };
        }),
      };
      const res = await handleTenants(makeReq('http://localhost/api/tenants/t1'), { DB: db });
      expect(res.status).toBe(200);
      expect(detailSql).toContain("status = 'active'");
      // The OR group must be parenthesized or the AND would only bind to the
      // last condition (subdomain/custom_domain lookups would bypass it)
      expect(detailSql).toMatch(/\(id = \? OR subdomain = \? OR custom_domain = \?\) AND status = 'active'/);
    });

    it('H5: suspended tenants do not resolve for non-super-admin callers', async () => {
      // Simulates the DB filtering the row out (WHERE status = 'active')
      const db = mockDb({ _all: [] });
      const res = await handleTenants(makeReq('http://localhost/api/tenants/suspended-camp'), { DB: db });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('Tenant not found');
    });

    it('returns tenant by subdomain for super_admin', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      const tenant = { id: 't1', name: 'Camp A', subdomain: 'camp-a' };
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ is_active: 1 }] });
            return Promise.resolve({ results: [tenant] });
          }),
        })),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants/camp-a'),
        { DB: db, JWT_SECRET: 'secret' }
      );
      const data = await res.json();
      expect(data.id).toBe('t1');
    });
  });

  describe('POST /api/tenants (create)', () => {
    it('returns 403 for non-super-admin', async () => {
      const db = mockDb();
      const res = await handleTenants(
        makeReq('http://localhost/api/tenants', 'POST', { name: 'Camp', subdomain: 'camp', admin_password: 'pass1234' }),
        { DB: db }
      );
      expect(res.status).toBe(403);
    });

    it('returns 400 for missing admin_password', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ is_active: 1 }] }); // auth check
            return Promise.resolve({ results: [] }); // subdomain available
          }),
          run: vi.fn().mockResolvedValue({}),
        })),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', { name: 'Camp', subdomain: 'camp' }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Required');
    });

    it('creates tenant successfully', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ is_active: 1 }] }); // auth check
            return Promise.resolve({ results: [] }); // subdomain + custom_domain available
          }),
          run: vi.fn().mockResolvedValue({ success: true }),
        })),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', {
          name: 'Camp', subdomain: 'camp', admin_password: 'pass1234'
        }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.subdomain).toBe('camp');
    });

    it('returns 400 for invalid subdomain format', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx <= 2) return Promise.resolve({ results: [{ is_active: 1 }] });
            return Promise.resolve({ results: [] });
          }),
          run: vi.fn().mockResolvedValue({}),
        })),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', {
          name: 'Camp', subdomain: 'INVALID SUBDOMAIN!', admin_password: 'pass1234'
        }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('returns error when subdomain is taken', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx <= 2) return Promise.resolve({ results: [{ is_active: 1 }] });
            if (callIdx === 3) return Promise.resolve({ results: [{ id: 'existing' }] }); // subdomain taken
            return Promise.resolve({ results: [] });
          }),
          run: vi.fn().mockResolvedValue({}),
        })),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', {
          name: 'Camp', subdomain: 'taken', admin_password: 'pass1234'
        }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      const data = await res.json();
      expect(data.error).toContain('subdomain is already taken');
    });

    it('returns error when custom_domain is taken', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ is_active: 1 }] }); // auth check
            if (callIdx === 2) return Promise.resolve({ results: [] }); // subdomain OK
            if (callIdx === 3) return Promise.resolve({ results: [{ id: 'existing' }] }); // domain taken
            return Promise.resolve({ results: [] });
          }),
          run: vi.fn().mockResolvedValue({}),
        })),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', {
          name: 'Camp', subdomain: 'camp', custom_domain: 'taken.com', admin_password: 'pass1234'
        }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      const data = await res.json();
      expect(data.error).toContain('custom domain is already registered');
    });

    it('returns 400 for invalid Zod schema', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      const db = mockDb({ _all: [{ is_active: 1 }] });
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', { name: '' }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      expect(res.status).toBe(400);
    });

    it('creates tenant with explicit type', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      let callIdx = 0;
      let insertArgs = [];
      const db = {
        prepare: vi.fn((sql) => {
          const chain = {
            bind: vi.fn((...args) => {
              if (sql.includes('INSERT INTO tenants')) insertArgs = args;
              return chain;
            }),
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) return Promise.resolve({ results: [{ is_active: 1 }] }); // auth check
              return Promise.resolve({ results: [] }); // subdomain + custom_domain available
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
          return chain;
        }),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', {
          name: 'Supermarket', subdomain: 'market', type: 'supermarket', admin_password: 'pass1234'
        }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      expect(res.status).toBe(200);
      // INSERT columns: id, subdomain, custom_domain, name, type, ...
      expect(insertArgs[4]).toBe('supermarket');
    });

    it('defaults tenant type to camp when omitted', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      let callIdx = 0;
      let insertArgs = [];
      const db = {
        prepare: vi.fn((sql) => {
          const chain = {
            bind: vi.fn((...args) => {
              if (sql.includes('INSERT INTO tenants')) insertArgs = args;
              return chain;
            }),
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) return Promise.resolve({ results: [{ is_active: 1 }] }); // auth check
              return Promise.resolve({ results: [] }); // subdomain + custom_domain available
            }),
            run: vi.fn().mockResolvedValue({ success: true }),
          };
          return chain;
        }),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', {
          name: 'Camp', subdomain: 'camp2', admin_password: 'pass1234'
        }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      expect(res.status).toBe(200);
      expect(insertArgs[4]).toBe('camp');
    });

    it('rejects invalid tenant type with 400', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      const db = mockDb({ _all: [{ is_active: 1 }] });
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', {
          name: 'Camp', subdomain: 'camp3', type: 'hotel', admin_password: 'pass1234'
        }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      verifyJWT.mockResolvedValue({ role: 'super_admin', sub: 'sa1' });
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: [{ is_active: 1 }] }); // auth check
            return Promise.resolve({ results: [] }); // subdomain available — proceed to INSERT
          }),
          run: vi.fn().mockRejectedValue(new Error('DB fail')),
        })),
      };
      const res = await handleTenants(
        makeReqWithAuth('http://localhost/api/tenants', 'POST', {
          name: 'Camp', subdomain: 'camp', admin_password: 'pass1234'
        }),
        { DB: db, JWT_SECRET: 'secret' }
      );
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE / other methods', () => {
    it('returns 405 for DELETE method', async () => {
      const db = mockDb();
      const res = await handleTenants(
        makeReq('http://localhost/api/tenants', 'DELETE'),
        { DB: db }
      );
      expect(res.status).toBe(405);
    });
  });
});

describe('handleMe (meRoutes sub-router)', () => {
  describe('GET /api/me', () => {
    it('returns tenant data', async () => {
      const tenant = { id: 't1', name: 'Camp A', has_meals: 1 };
      const db = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: [tenant] }) }) }) };
      const app = mountRouter(meRoutes, { tenantId: 't1', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', { method: 'GET' }, { DB: db });
      const data = await res.json();
      expect(data.id).toBe('t1');
      expect(data.hasMeals).toBe(1);
    });

    it('returns 404 when tenant not found', async () => {
      const db = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: [] }) }) }) };
      const app = mountRouter(meRoutes, { tenantId: 'unknown', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', { method: 'GET' }, { DB: db });
      expect(res.status).toBe(404);
    });

    it('returns graceful 200 when no tenant context', async () => {
      const db = mockDb();
      const app = mountRouter(meRoutes, { tenantId: null, basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', { method: 'GET' }, { DB: db });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toContain('No tenant context');
    });
  });

  describe('PUT /api/me', () => {
    it('updates tenant data with COALESCE', async () => {
      const db = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }) }) };
      const app = mountRouter(meRoutes, { tenantId: 't1', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', {
        method: 'PUT',
        body: JSON.stringify({ name: 'Updated', primary_color: '#ff0000' }),
      }, { DB: db });
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('COALESCE'));
    });

    it('updates admin user when admin_id and fields provided', async () => {
      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      const app = mountRouter(meRoutes, { tenantId: 't1', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', {
        method: 'PUT',
        body: JSON.stringify({ admin_id: 'adm_1', admin_email: 'new@test.com', admin_password: 'newpass1234' }),
      }, { DB: db });
      const data = await res.json();
      expect(data.success).toBe(true);
      // Two prepare calls: one for tenant update, one for admin update
      expect(db.prepare).toHaveBeenCalledTimes(2);
    });

    it('updates admin without password', async () => {
      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({}),
          }),
        }),
      };
      const app = mountRouter(meRoutes, { tenantId: 't1', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', {
        method: 'PUT',
        body: JSON.stringify({ admin_id: 'adm_1', admin_email: 'new@test.com' }),
      }, { DB: db });
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid schema', async () => {
      const db = mockDb();
      const app = mountRouter(meRoutes, { tenantId: 't1', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', {
        method: 'PUT',
        body: JSON.stringify({ capacity: 'not-a-number' }),
      }, { DB: db });
      expect(res.status).toBe(400);
    });

    it('returns error on DB failure', async () => {
      const db = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          }),
        }),
      };
      const app = mountRouter(meRoutes, { tenantId: 't1', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', {
        method: 'PUT',
        body: JSON.stringify({ name: 'X' }),
      }, { DB: db });
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/me', () => {
    it('updates tenant data with COALESCE via PATCH', async () => {
      const db = { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }) }) };
      const app = mountRouter(meRoutes, { tenantId: 't1', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated', primary_color: '#ff0000' }),
      }, { DB: db });
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('COALESCE'));
    });

    it('returns 400 for invalid schema via PATCH', async () => {
      const db = mockDb();
      const app = mountRouter(meRoutes, { tenantId: 't1', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', {
        method: 'PATCH',
        body: JSON.stringify({ capacity: 'not-a-number' }),
      }, { DB: db });
      expect(res.status).toBe(400);
    });
  });

  describe('Method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      const db = mockDb();
      const app = mountRouter(meRoutes, { tenantId: 't1', basePath: '/api/me' });
      const res = await app.request('https://x.com/api/me', { method: 'DELETE' }, { DB: db });
      expect(res.status).toBe(405);
    });
  });
});
