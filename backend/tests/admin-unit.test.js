import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateToken } from '../src/middleware/sharedAuth.js';
import { handleAdminRoute } from '../src/api/admin.js';

const JWT_SECRET = 'test-secret-key-for-admin';

function makeDbMock() {
  const chain = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
  };
  const db = { prepare: vi.fn().mockReturnValue(chain) };
  return { db, chain };
}

function chainMock(fns) {
  let idx = 0;
  return () => {
    const ch = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
    };
    if (idx < fns.length) fns[idx](ch, idx);
    idx++;
    return ch;
  };
}

function makeRequest(method, url, body = null, headers = {}) {
  const h = new Headers({ ...headers });
  const opts = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function superAdminHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

let superAdminToken;

beforeEach(async () => {
  vi.clearAllMocks();
  superAdminToken = await generateToken(
    { sub: 'sa1', userId: 'sa1', email: 'super@test.com', role: 'super_admin', tenantId: null },
    JWT_SECRET,
    'access'
  );
});

function withActiveAdmin(db) {
  db.prepare.mockImplementation((sql) => {
    if (sql.includes('is_active') && sql.includes('WHERE')) {
      return {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
        first: vi.fn(),
        run: vi.fn(),
      };
    }
    return {
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: [] }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn(),
    };
  });
}

function withActiveAdminThenThrow(db) {
  db.prepare.mockImplementation((sql) => {
    if (sql.includes('is_active') && sql.includes('WHERE')) {
      return {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
        first: vi.fn(),
        run: vi.fn(),
      };
    }
    throw new Error('DB fail');
  });
}

describe('handleAdminRoute', () => {
  describe('Auth checks', () => {
    it('returns 401 without Authorization header', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/admin/stats');
      const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
      expect(res.status).toBe(401);
    });

    it('returns 403 when not super_admin', async () => {
      const userToken = await generateToken(
        { sub: 'a1', userId: 'a1', role: 'admin', tenantId: 't1' },
        JWT_SECRET, 'access'
      );
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/admin/stats', null, superAdminHeaders(userToken));
      const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
      expect(res.status).toBe(403);
    });

    it('returns 403 with invalid token', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/admin/stats', null, superAdminHeaders('bad-token'));
      const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
      expect(res.status).toBe(403);
    });

    it('returns 401 when super_admin is deactivated', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 0 }] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/admin/stats', null, superAdminHeaders(superAdminToken));
      const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
      expect(res.status).toBe(401);
    });

    it('returns 401 when activeCheck returns empty', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/admin/stats', null, superAdminHeaders(superAdminToken));
      const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /admin/stats', () => {
    it('returns stats successfully', async () => {
      const { db } = makeDbMock();
      const stats = { total_tenants: 5, total_camps: 10, total_rooms: 50, total_orders: 100, total_revenue: 5000, total_admins: 3 };
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [stats] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/admin/stats', null, superAdminHeaders(superAdminToken));
      const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
      const body = await res.json();
      expect(body.totalTenants).toBe(5);
      expect(body.totalRevenue).toBe(5000);
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
      ]);
      db.prepare.mockImplementation((sql) => {
        if (sql.includes('is_active')) {
          return fn();
        }
        throw new Error('DB fail');
      });
      const req = makeRequest('GET', 'https://x.com/api/admin/stats', null, superAdminHeaders(superAdminToken));
      const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
      expect(res.status).toBe(400);
    });
  });

  describe('Tenants CRUD', () => {
    describe('GET /admin/tenants', () => {
      it('returns paginated tenants envelope', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
          (ch) => { ch.all.mockResolvedValue({ results: [{ id: 't1', name: 'Sinai Camp', admin_email: 'a@b.com' }] }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('GET', 'https://x.com/api/admin/tenants', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.data[0].name).toBe('Sinai Camp');
        expect(body.data[0].adminEmail).toBe('a@b.com');
        expect(body.total).toBe(1);
        expect(body.page).toBe(1);
        expect(body.pageSize).toBe(50);
        expect(body.hasMore).toBe(false);
      });

      it('excludes the root marketplace tenant from the super-admin list', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.all.mockResolvedValue({ results: [{ total: 2 }] }); },
          (ch) => { ch.all.mockResolvedValue({ results: [{ id: 't1', name: 'Camp A' }, { id: 't2', name: 'Camp B' }] }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('GET', 'https://x.com/api/admin/tenants', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(res.status).toBe(200);
        expect(body.data.some((t) => t.id === 'marketplace')).toBe(false);
        expect(body.total).toBe(2);
        // Both the count and the list query must exclude the marketplace row.
        const countSql = db.prepare.mock.calls[1][0];
        const listSql = db.prepare.mock.calls[2][0];
        expect(countSql).toContain("id != 'marketplace'");
        expect(listSql).toContain("t.id != 'marketplace'");
      });

      it('returns error on DB failure', async () => {
        const { db } = makeDbMock();
        db.prepare.mockImplementation((sql) => {
          if (sql.includes('is_active') && sql.includes('WHERE')) {
            return {
              bind: vi.fn().mockReturnThis(),
              all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
              first: vi.fn(),
              run: vi.fn(),
            };
          }
          throw new Error('DB fail');
        });
        const req = makeRequest('GET', 'https://x.com/api/admin/tenants', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });
    });

    describe('PUT /admin/tenants/:id', () => {
      it('updates tenant successfully', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('PUT', 'https://x.com/api/admin/tenants/t1', { name: 'Updated Tenant' }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it('updates tenant with admin fields (existing admin with password)', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => {},
          (ch) => { ch.first.mockResolvedValue({ id: 'admin1' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PUT', 'https://x.com/api/admin/tenants/t1', {
          admin_email: 'new@camp.com', admin_password: 'newpass123',
          admin_first_name: 'New', admin_last_name: 'Admin'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(200);
      });

      it('updates tenant with admin fields (no password, existing admin)', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => {},
          (ch) => { ch.first.mockResolvedValue({ id: 'admin1' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PUT', 'https://x.com/api/admin/tenants/t1', {
          admin_email: 'new@camp.com'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(200);
      });

      it('creates admin when not existing but password provided', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => {},
          (ch) => { ch.first.mockResolvedValue(null); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PUT', 'https://x.com/api/admin/tenants/t1', {
          admin_email: 'new@camp.com', admin_password: 'pass1234'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(200);
      });

      it('returns 400 for invalid schema', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('PUT', 'https://x.com/api/admin/tenants/t1', { status: 123 }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });

      it('updates tenant type via PUT', async () => {
        const db = { prepare: vi.fn() };
        let updateArgs = null;
        db.prepare.mockImplementation((sql) => {
          if (sql.includes('is_active') && sql.includes('WHERE')) {
            return {
              bind: vi.fn().mockReturnThis(),
              all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
              first: vi.fn(),
              run: vi.fn(),
            };
          }
          if (sql.includes('UPDATE tenants')) {
            const chain = {
              bind: vi.fn((...args) => {
                updateArgs = args;
                return chain;
              }),
              all: vi.fn().mockResolvedValue({ results: [] }),
              first: vi.fn(),
              run: vi.fn().mockResolvedValue({ success: true }),
            };
            return chain;
          }
          return {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [] }),
            first: vi.fn().mockResolvedValue(null),
            run: vi.fn(),
          };
        });
        const req = makeRequest('PUT', 'https://x.com/api/admin/tenants/t1', { name: 'Market', type: 'supermarket' }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(200);
        // UPDATE binds: name, subdomain, type, custom_domain, ...
        expect(updateArgs[2]).toBe('supermarket');
      });

      it('rejects invalid tenant type via PUT', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('PUT', 'https://x.com/api/admin/tenants/t1', { type: 'hotel' }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });

      it('returns error on DB failure', async () => {
        const { db } = makeDbMock();
        withActiveAdminThenThrow(db);
        const req = makeRequest('PUT', 'https://x.com/api/admin/tenants/t1', { name: 'X' }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });
    });

    describe('PATCH /admin/tenants/:id', () => {
      it('updates tenant successfully via PATCH', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('PATCH', 'https://x.com/api/admin/tenants/t1', { name: 'Updated Tenant' }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it('returns 400 for invalid schema via PATCH', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('PATCH', 'https://x.com/api/admin/tenants/t1', { status: 123 }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });
    });

    describe('DELETE /admin/tenants/:id', () => {
      it('deletes tenant with cascade', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('DELETE', 'https://x.com/api/admin/tenants/t1', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it('returns error on DB failure', async () => {
        const { db } = makeDbMock();
        withActiveAdminThenThrow(db);
        const req = makeRequest('DELETE', 'https://x.com/api/admin/tenants/t1', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });
    });

    describe('POST /admin/tenants/bulk/:action', () => {
      it('returns 400 when tenantId is missing', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('POST', 'https://x.com/api/admin/tenants', { ids: ['t1'] }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });

      it('suspends tenants', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('POST', 'https://x.com/api/admin/tenants/bulk/suspend', { ids: ['t1', 't2'] }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.suspended).toEqual(['t1', 't2']);
      });

      it('activates tenants', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('POST', 'https://x.com/api/admin/tenants/bulk/activate', { ids: ['t1'] }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.activated).toEqual(['t1']);
      });

      it('deletes tenants in bulk', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('POST', 'https://x.com/api/admin/tenants/bulk/delete', { ids: ['t1'] }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.deleted).toEqual(['t1']);
      });

      it('returns 400 for invalid bulk action', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('POST', 'https://x.com/api/admin/tenants/bulk/invalid', { ids: ['t1'] }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });

      it('returns 400 for invalid schema', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('POST', 'https://x.com/api/admin/tenants/bulk/suspend', { ids: [] }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });

      it('returns error on DB failure', async () => {
        const { db } = makeDbMock();
        withActiveAdminThenThrow(db);
        const req = makeRequest('POST', 'https://x.com/api/admin/tenants/bulk/suspend', { ids: ['t1'] }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });
    });
  });

  describe('Admins CRUD', () => {
    describe('GET /admin/admins', () => {
      it('returns paginated admins envelope', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.all.mockResolvedValue({ results: [{ total: 1 }] }); },
          (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'a1', email: 'a@b.com' }] }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('GET', 'https://x.com/api/admin/admins', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.data[0].email).toBe('a@b.com');
        expect(body.total).toBe(1);
        expect(body.page).toBe(1);
        expect(body.pageSize).toBe(50);
        expect(body.hasMore).toBe(false);
      });

      it('returns error on DB failure', async () => {
        const { db } = makeDbMock();
        db.prepare.mockImplementation((sql) => {
          if (sql.includes('is_active') && sql.includes('WHERE')) {
            return {
              bind: vi.fn().mockReturnThis(),
              all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
              first: vi.fn(),
              run: vi.fn(),
            };
          }
          throw new Error('DB fail');
        });
        const req = makeRequest('GET', 'https://x.com/api/admin/admins', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });
    });

    describe('POST /admin/admins (create)', () => {
      it('creates new admin', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue(null); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('POST', 'https://x.com/api/admin/admins', {
          email: 'new@b.com', password: 'pass1234', role: 'admin'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.id).toBeDefined();
      });

      it('updates existing admin (not super_admin)', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue({ id: 'existing', role: 'admin' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('POST', 'https://x.com/api/admin/admins', {
          email: 'existing@b.com', password: 'pass1234', role: 'admin', tenantId: 't1'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
        expect(body.updated).toBe(true);
      });

      it('returns 403 when trying to modify super_admin', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue({ id: 'existing', role: 'super_admin' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('POST', 'https://x.com/api/admin/admins', {
          email: 'super@b.com', password: 'pass1234', role: 'super_admin'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(403);
      });

      it('returns 400 for invalid schema', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('POST', 'https://x.com/api/admin/admins', { email: '' }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });

      it('returns error on DB failure', async () => {
        const { db } = makeDbMock();
        withActiveAdminThenThrow(db);
        const req = makeRequest('POST', 'https://x.com/api/admin/admins', {
          email: 'a@b.com', password: 'pass1234', role: 'admin'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });
    });

    describe('DELETE /admin/admins/:id', () => {
      it('deletes admin successfully', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('DELETE', 'https://x.com/api/admin/admins/a1', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it('returns 400 when admin ID missing', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('DELETE', 'https://x.com/api/admin/admins', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });

      it('returns error on DB failure', async () => {
        const { db } = makeDbMock();
        withActiveAdminThenThrow(db);
        const req = makeRequest('DELETE', 'https://x.com/api/admin/admins/a1', null, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });
    });

    describe('PUT /admin/admins/:id (update)', () => {
      it('updates admin fields', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue({ id: 'a1', role: 'admin' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PUT', 'https://x.com/api/admin/admins/a1', {
          is_active: true, role: 'staff', first_name: 'New', last_name: 'Name'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it('returns 400 when admin ID missing', async () => {
        const { db } = makeDbMock();
        withActiveAdmin(db);
        const req = makeRequest('PUT', 'https://x.com/api/admin/admins', { role: 'admin' }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });

      it('returns 404 when admin not found', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue(null); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PUT', 'https://x.com/api/admin/admins/missing', {
          role: 'admin'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(404);
      });

      it('returns 403 when trying to update super_admin', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue({ id: 'sa1', role: 'super_admin' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PUT', 'https://x.com/api/admin/admins/sa1', {
          role: 'admin'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(403);
      });

      it('returns 400 when no fields to update', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue({ id: 'a1', role: 'admin' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PUT', 'https://x.com/api/admin/admins/a1', {}, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('No fields');
      });

      it('returns 400 for invalid schema', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue({ id: 'a1', role: 'admin' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PUT', 'https://x.com/api/admin/admins/a1', { is_active: 'notbool' }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });

      it('returns error on DB failure', async () => {
        const { db } = makeDbMock();
        withActiveAdminThenThrow(db);
        const req = makeRequest('PUT', 'https://x.com/api/admin/admins/a1', { role: 'admin' }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(400);
      });
    });
    describe('PATCH /admin/admins/:id (update)', () => {
      it('updates admin fields via PATCH', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue({ id: 'a1', role: 'admin' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PATCH', 'https://x.com/api/admin/admins/a1', {
          role: 'staff', first_name: 'New'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        const body = await res.json();
        expect(body.success).toBe(true);
      });

      it('returns 403 when trying to update super_admin via PATCH', async () => {
        const { db } = makeDbMock();
        const fn = chainMock([
          (ch) => { ch.all.mockResolvedValue({ results: [{ is_active: 1 }] }); },
          (ch) => { ch.first.mockResolvedValue({ id: 'sa1', role: 'super_admin' }); },
        ]);
        db.prepare.mockImplementation(fn);
        const req = makeRequest('PATCH', 'https://x.com/api/admin/admins/sa1', {
          role: 'admin'
        }, superAdminHeaders(superAdminToken));
        const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
        expect(res.status).toBe(403);
      });
    });
  });

  describe('Unknown endpoint', () => {
    it('returns 404', async () => {
      const { db } = makeDbMock();
      withActiveAdmin(db);
      const req = makeRequest('GET', 'https://x.com/api/admin/unknown', null, superAdminHeaders(superAdminToken));
      const res = await handleAdminRoute(req, { DB: db, JWT_SECRET });
      expect(res.status).toBe(404);
    });
  });
});
