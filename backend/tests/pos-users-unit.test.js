import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateToken } from '../src/middleware/sharedAuth.js';
import { handlePosUsersRoute, ensureTenantOrg } from '../src/api/pos-users.js';

const JWT_SECRET = 'test-secret-key-for-pos-users';

// ─── Scaffolding (admin-unit.test.js idioms, renamed) ───────

function makeRequest(method, url, body = null, headers = {}) {
  const h = new Headers({ ...headers });
  const opts = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * DB mock that dispatches on SQL substrings. Every prepared statement is
 * recorded in db.calls (with its bind args) so tests can assert on the exact
 * SQL + binds. Defaults match the D1 API shape:
 *   all()   -> { results: [...] }   (default empty array)
 *   first() -> row | null           (default null)
 *   run()   -> { success: true }    (override to { meta: { last_row_id } })
 */
function makeDb(handlers = {}) {
  const db = {
    calls: [],
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        bind: vi.fn((...args) => {
          chain.bindArgs = args;
          return chain;
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      for (const [sub, setup] of Object.entries(handlers)) {
        if (sql.includes(sub)) setup(chain, sql);
      }
      db.calls.push(chain);
      return chain;
    }),
  };
  return db;
}

function findBy(db, sub) {
  return db.calls.find((c) => c.sql.includes(sub));
}

function bindArgsOf(db, sub) {
  const chain = findBy(db, sub);
  return chain ? chain.bindArgs : undefined;
}

// Common pre-condition: tenant_org_mapping resolves to organization_id 7.
const mappingOk = {
  'SELECT organization_id FROM tenant_org_mapping': (ch) =>
    ch.all.mockResolvedValue({ results: [{ organization_id: 7 }] }),
};

let superAdminToken;
let adminToken;
let posToken;
let cashierToken;
let adminNoTenantToken;

beforeEach(async () => {
  vi.clearAllMocks();
  superAdminToken = await generateToken(
    { sub: 'sa1', userId: 'sa1', email: 'super@test.com', role: 'super_admin', tenantId: null },
    JWT_SECRET,
    'access'
  );
  adminToken = await generateToken(
    { sub: 'a1', userId: 'a1', email: 'admin@test.com', role: 'admin', tenantId: 'acaciacamp' },
    JWT_SECRET,
    'access'
  );
  posToken = await generateToken(
    { sub: 'p1', userId: 'p1', email: 'pos@test.com', role: 'admin', posType: 'pos' },
    JWT_SECRET,
    'access'
  );
  cashierToken = await generateToken(
    { sub: 'c1', userId: 'c1', email: 'cash@test.com', role: 'cashier', tenantId: 'acaciacamp' },
    JWT_SECRET,
    'access'
  );
  adminNoTenantToken = await generateToken(
    { sub: 'a2', userId: 'a2', email: 'admin2@test.com', role: 'admin', tenantId: null },
    JWT_SECRET,
    'access'
  );
});

describe('handlePosUsersRoute', () => {
  describe('Auth checks', () => {
    it('returns 403 for POS session tokens', async () => {
      const db = makeDb();
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, bearer(posToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(403);
      expect(db.calls.length).toBe(0);
    });

    it('returns 403 for non-admin roles (cashier)', async () => {
      const db = makeDb();
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, bearer(cashierToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(403);
      expect(db.calls.length).toBe(0);
    });

    it('returns 401 without an Authorization header', async () => {
      const db = makeDb();
      const req = makeRequest('GET', 'https://x.com/api/pos-users');
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(401);
    });

    it('returns 401 for a non-Bearer Authorization header', async () => {
      const db = makeDb();
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, {
        Authorization: 'Basic abc123',
      });
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(401);
    });

    it('returns 401 for a garbage token', async () => {
      const db = makeDb();
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, bearer('not-a-jwt'));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(401);
      expect(db.calls.length).toBe(0);
    });
  });

  describe('Scope resolution', () => {
    it('super_admin without ?tenantId= falls back to the host-resolved arg', async () => {
      const db = makeDb({
        ...mappingOk,
        'COUNT(*)': (ch) => ch.all.mockResolvedValue({ results: [{ total: 0 }] }),
        'LEFT JOIN tenants': (ch) => ch.all.mockResolvedValue({ results: [] }),
      });
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, bearer(superAdminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      expect(bindArgsOf(db, 'SELECT organization_id FROM tenant_org_mapping')[0]).toBe('acaciacamp');
    });

    it('super_admin ?tenantId= query param wins over the host arg', async () => {
      const db = makeDb({
        ...mappingOk,
        'COUNT(*)': (ch) => ch.all.mockResolvedValue({ results: [{ total: 0 }] }),
        'LEFT JOIN tenants': (ch) => ch.all.mockResolvedValue({ results: [] }),
      });
      const req = makeRequest('GET', 'https://x.com/api/pos-users?tenantId=acaciacamp', null, bearer(superAdminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'marketplace');
      expect(res.status).toBe(200);
      const args = bindArgsOf(db, 'SELECT organization_id FROM tenant_org_mapping');
      expect(args[0]).toBe('acaciacamp');
      expect(args[0]).not.toBe('marketplace');
    });

    it('super_admin without ?tenantId= and without an arg -> 400', async () => {
      const db = makeDb();
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, bearer(superAdminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, null);
      expect(res.status).toBe(400);
      expect(db.calls.length).toBe(0);
    });

    it('admin is hard-scoped to decoded.tenantId and ignores ?tenantId=', async () => {
      const db = makeDb({
        ...mappingOk,
        'COUNT(*)': (ch) => ch.all.mockResolvedValue({ results: [{ total: 0 }] }),
        'SELECT pu.id': (ch) => ch.all.mockResolvedValue({ results: [] }),
      });
      const req = makeRequest('GET', 'https://x.com/api/pos-users?tenantId=other', null, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'ignored-arg');
      expect(res.status).toBe(200);
      const args = bindArgsOf(db, 'SELECT organization_id FROM tenant_org_mapping');
      expect(args[0]).toBe('acaciacamp');
      expect(args[0]).not.toBe('other');
    });

    it('admin with missing decoded.tenantId -> 403', async () => {
      const db = makeDb();
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, bearer(adminNoTenantToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(403);
      expect(db.calls.length).toBe(0);
    });
  });

  describe('GET /api/pos-users (list)', () => {
    const listRows = [
      {
        id: 1, username: 'u1', email: 'u1@test.com', first_name: 'Uno', role: 'cashier',
        organization_id: 7, tenant_id: 'acaciacamp',
      },
      {
        id: 2, username: 'u2', email: 'u2@test.com', first_name: 'Due', role: 'manager',
        organization_id: 7, tenant_id: 'acaciacamp',
      },
    ];

    it('returns the pagination envelope with camelCase rows and never password_hash', async () => {
      const db = makeDb({
        ...mappingOk,
        'COUNT(*)': (ch) => ch.all.mockResolvedValue({ results: [{ total: 2 }] }),
        'SELECT pu.id': (ch) => ch.all.mockResolvedValue({ results: listRows }),
      });
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50);
      expect(body.hasMore).toBe(false);
      expect(body.data[0].firstName).toBe('Uno');
      expect(body.data[0].tenantId).toBe('acaciacamp');
      expect(JSON.stringify(body)).not.toContain('password');
    });

    it('scopes to organization_id and applies role = ? when ?role= is present', async () => {
      const db = makeDb({
        ...mappingOk,
        'COUNT(*)': (ch) => ch.all.mockResolvedValue({ results: [{ total: 1 }] }),
        'SELECT pu.id': (ch) => ch.all.mockResolvedValue({ results: [listRows[0]] }),
      });
      const req = makeRequest('GET', 'https://x.com/api/pos-users?role=cashier', null, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const countSql = findBy(db, 'COUNT(*)').sql;
      expect(countSql).toContain('pu.organization_id = ?');
      expect(countSql).toContain('pu.role = ?');
      expect(bindArgsOf(db, 'COUNT(*)')).toContain('cashier');
      expect(findBy(db, 'SELECT pu.id').sql).toContain('pu.role = ?');
    });

    it('applies LIKE search conditions when ?search= is present', async () => {
      const db = makeDb({
        ...mappingOk,
        'COUNT(*)': (ch) => ch.all.mockResolvedValue({ results: [{ total: 1 }] }),
        'SELECT pu.id': (ch) => ch.all.mockResolvedValue({ results: [listRows[0]] }),
      });
      const req = makeRequest('GET', 'https://x.com/api/pos-users?search=sam', null, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      expect(findBy(db, 'COUNT(*)').sql).toContain('LIKE ?');
      expect(bindArgsOf(db, 'COUNT(*)')).toContain('%sam%');
      expect(findBy(db, 'SELECT pu.id').sql).toContain('LIKE ?');
    });

    it('super_admin list joins tenants to expose tenant_name', async () => {
      const db = makeDb({
        ...mappingOk,
        'COUNT(*)': (ch) => ch.all.mockResolvedValue({ results: [{ total: 1 }] }),
        'LEFT JOIN tenants': (ch) => ch.all.mockResolvedValue({
          results: [{ id: 1, username: 'u1', tenant_name: 'Acacia Camp' }],
        }),
      });
      const req = makeRequest('GET', 'https://x.com/api/pos-users?tenantId=acaciacamp', null, bearer(superAdminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data[0].tenantName).toBe('Acacia Camp');
      expect(findBy(db, 'LEFT JOIN tenants').sql).toContain('LEFT JOIN tenants');
    });
  });

  describe('POST /api/pos-users (create)', () => {
    it('creates a user: omits id from INSERT, hashes password, returns numeric last_row_id', async () => {
      const db = makeDb({
        ...mappingOk,
        'WHERE email = ? OR username = ?': (ch) => ch.all.mockResolvedValue({ results: [] }),
        'INSERT INTO pos_users': (ch) => ch.run.mockResolvedValue({ meta: { last_row_id: 99 } }),
        'SELECT id, username': (ch) => ch.first.mockResolvedValue({
          id: 99, username: 'cashier1', email: 'cashier1@test.com',
          first_name: 'Cash', last_name: 'Ier', role: 'cashier',
        }),
      });
      const req = makeRequest('POST', 'https://x.com/api/pos-users', {
        email: 'cashier1@test.com',
        password: 'password123',
        firstName: 'Cash',
        lastName: 'Ier',
        role: 'cashier',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBe(99);
      expect(body.firstName).toBe('Cash');

      const insert = findBy(db, 'INSERT INTO pos_users');
      // id is INTEGER PRIMARY KEY AUTOINCREMENT — the INSERT must not carry an id column.
      expect(insert.sql).toMatch(/INSERT INTO pos_users\s*\(\s*organization_id/);
      expect(insert.sql).not.toMatch(/INSERT INTO pos_users\s*\(\s*id\s*,/);
      expect(insert.sql).toContain('password_hash');
      expect(insert.sql).toContain('organization_id');
      expect(insert.sql).toContain('tenant_id');

      const args = insert.bindArgs;
      expect(args[0]).toBe(7);             // organization_id
      expect(args[1]).toBe('acaciacamp');  // tenant_id
      expect(args[2]).toBe('cashier1@test.com'); // username falls back to the full email
      expect(args[3]).toBe('cashier1@test.com');
      expect(args[4]).toMatch(/^\$2/);     // bcrypt hash of the password
      expect(args[5]).toBe('Cash');
      expect(args[6]).toBe('Ier');
      expect(args[8]).toBe('cashier');

      // Row re-fetch after INSERT used first()
      expect(findBy(db, 'SELECT id, username').first).toHaveBeenCalled();
    });

    it('returns 400 with errors[].field when firstName is missing', async () => {
      const db = makeDb(mappingOk);
      const req = makeRequest('POST', 'https://x.com/api/pos-users', {
        email: 'x@test.com', password: 'password123', lastName: 'Ier',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.errors[0].field).toBe('firstName');
    });

    it('returns 400 when password is shorter than 8 characters', async () => {
      const db = makeDb(mappingOk);
      const req = makeRequest('POST', 'https://x.com/api/pos-users', {
        email: 'x@test.com', password: 'short', firstName: 'F', lastName: 'L',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.errors[0].field).toBe('password');
    });

    it('returns 409 when the email already exists', async () => {
      const db = makeDb({
        ...mappingOk,
        'WHERE email = ? OR username = ?': (ch) => ch.all.mockResolvedValue({ results: [{ id: 5 }] }),
      });
      const req = makeRequest('POST', 'https://x.com/api/pos-users', {
        email: 'dup@test.com', password: 'password123', firstName: 'F', lastName: 'L',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('Email or username already exists');
    });

    it('returns 409 when the username already exists (email differs)', async () => {
      const db = makeDb({
        ...mappingOk,
        'WHERE email = ? OR username = ?': (ch) => ch.all.mockResolvedValue({ results: [{ id: 5 }] }),
      });
      const req = makeRequest('POST', 'https://x.com/api/pos-users', {
        email: 'other@test.com', username: 'takenuser', password: 'password123',
        firstName: 'F', lastName: 'L',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toBe('Email or username already exists');
    });

    it('returns 400 for an invalid role', async () => {
      const db = makeDb(mappingOk);
      const req = makeRequest('POST', 'https://x.com/api/pos-users', {
        email: 'x@test.com', password: 'password123', firstName: 'F', lastName: 'L', role: 'owner',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.errors[0].field).toBe('role');
    });

    it('uses an explicit username and defaults role to cashier', async () => {
      const db = makeDb({
        ...mappingOk,
        'WHERE email = ? OR username = ?': (ch) => ch.all.mockResolvedValue({ results: [] }),
        'INSERT INTO pos_users': (ch) => ch.run.mockResolvedValue({ meta: { last_row_id: 100 } }),
      });
      const req = makeRequest('POST', 'https://x.com/api/pos-users', {
        email: 'z@test.com', username: 'explicituser', password: 'password123',
        firstName: 'F', lastName: 'L',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(100);
      const args = findBy(db, 'INSERT INTO pos_users').bindArgs;
      expect(args[2]).toBe('explicituser');
      expect(args[8]).toBe('cashier');
      // No row re-fetch when the row select is mocked to null
      expect(body.username).toBeUndefined();
    });

    it('handles create when run() returns no meta (id -> null)', async () => {
      const db = makeDb({
        ...mappingOk,
        'WHERE email = ? OR username = ?': (ch) => ch.all.mockResolvedValue({ results: [] }),
        'INSERT INTO pos_users': (ch) => ch.run.mockResolvedValue({ success: true }),
      });
      const req = makeRequest('POST', 'https://x.com/api/pos-users', {
        email: 'nometa@test.com', password: 'password123', firstName: 'F', lastName: 'L',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBeNull();
    });

    it('returns 400 when the DB throws during create', async () => {
      const db = makeDb({
        ...mappingOk,
        'WHERE email = ? OR username = ?': (ch) => ch.all.mockRejectedValue(new Error('DB fail')),
      });
      const req = makeRequest('POST', 'https://x.com/api/pos-users', {
        email: 'boom@test.com', password: 'password123', firstName: 'F', lastName: 'L',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Failed to create user');
    });
  });

  describe('PATCH /api/pos-users/:id (update)', () => {
    const existsOk = {
      'AND deleted_at IS NULL': (ch) => ch.all.mockResolvedValue({ results: [{ id: 5 }] }),
    };

    it('updates only the provided fields and coerces is_active to 1/0', async () => {
      const db = makeDb({
        ...mappingOk,
        ...existsOk,
        'UPDATE pos_users SET': (ch) => ch.run.mockResolvedValue({ success: true }),
      });
      const req = makeRequest('PATCH', 'https://x.com/api/pos-users/5', {
        role: 'manager', isActive: true, firstName: 'Renamed',
      }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBe('5');
      // PATCH_FIELD_MAP order: first_name, role, is_active; then userId + organizationId
      expect(bindArgsOf(db, 'UPDATE pos_users SET')).toEqual(['Renamed', 'manager', 1, '5', 7]);
    });

    it('returns 404 when the user does not exist in this organization', async () => {
      const db = makeDb({
        ...mappingOk,
        'AND deleted_at IS NULL': (ch) => ch.all.mockResolvedValue({ results: [] }),
      });
      const req = makeRequest('PATCH', 'https://x.com/api/pos-users/404', { role: 'manager' }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('User not found');
      // Case 21: another org's id is unreachable because the WHERE pins organization_id.
      expect(findBy(db, 'AND deleted_at IS NULL').sql).toContain('organization_id = ?');
      expect(findBy(db, 'AND deleted_at IS NULL').bindArgs).toEqual(['404', 7]);
    });

    it('returns 400 when no fields are provided', async () => {
      const db = makeDb({ ...mappingOk, ...existsOk });
      const req = makeRequest('PATCH', 'https://x.com/api/pos-users/5', {}, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('No fields to update');
    });

    it('returns 400 for an invalid role value', async () => {
      const db = makeDb({ ...mappingOk, ...existsOk });
      const req = makeRequest('PATCH', 'https://x.com/api/pos-users/5', { role: 'owner' }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.errors[0].field).toBe('role');
    });

    it('returns 409 when changing to an email/username owned by another user', async () => {
      const db = makeDb({
        ...mappingOk,
        ...existsOk,
        '(email = ? OR username = ?) AND id != ?': (ch) => ch.all.mockResolvedValue({ results: [{ id: 9 }] }),
      });
      const req = makeRequest('PATCH', 'https://x.com/api/pos-users/5', { email: 'taken@test.com' }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('Email or username already exists');
    });

    it('returns 400 when the DB throws during update', async () => {
      const db = makeDb({
        ...mappingOk,
        'AND deleted_at IS NULL': (ch) => ch.all.mockRejectedValue(new Error('DB fail')),
      });
      const req = makeRequest('PATCH', 'https://x.com/api/pos-users/5', { role: 'manager' }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Failed to update user');
    });
  });

  describe('DELETE /api/pos-users/:id (soft delete)', () => {
    it('soft-deletes: sets deleted_at, is_active = 0, status = inactive', async () => {
      const db = makeDb({
        ...mappingOk,
        'AND deleted_at IS NULL': (ch) => ch.all.mockResolvedValue({ results: [{ id: 5 }] }),
        'SET deleted_at = datetime': (ch) => ch.run.mockResolvedValue({ success: true }),
      });
      const req = makeRequest('DELETE', 'https://x.com/api/pos-users/5', null, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBe('5');
      const update = findBy(db, 'SET deleted_at = datetime');
      expect(update.sql).toContain("deleted_at = datetime('now')");
      expect(update.sql).toContain('is_active = 0');
      expect(update.sql).toContain("status = 'inactive'");
      expect(update.bindArgs).toEqual(['5', 7]);
    });

    it('returns 404 for a missing user', async () => {
      const db = makeDb({
        ...mappingOk,
        'AND deleted_at IS NULL': (ch) => ch.all.mockResolvedValue({ results: [] }),
      });
      const req = makeRequest('DELETE', 'https://x.com/api/pos-users/404', null, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('User not found');
    });

    it('returns 400 when the DB throws during delete', async () => {
      const db = makeDb({
        ...mappingOk,
        'AND deleted_at IS NULL': (ch) => ch.all.mockResolvedValue({ results: [{ id: 5 }] }),
        'SET deleted_at = datetime': (ch) => ch.run.mockRejectedValue(new Error('DB fail')),
      });
      const req = makeRequest('DELETE', 'https://x.com/api/pos-users/5', null, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Failed to delete user');
    });
  });

  describe('POST /api/pos-users/:id/reset-password', () => {
    it('re-hashes the new password and updates password_hash', async () => {
      const db = makeDb({
        ...mappingOk,
        'AND deleted_at IS NULL': (ch) => ch.all.mockResolvedValue({ results: [{ id: 5 }] }),
        'SET password_hash = ?': (ch) => ch.run.mockResolvedValue({ success: true }),
      });
      const req = makeRequest('POST', 'https://x.com/api/pos-users/5/reset-password', { password: 'newpass123' }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBe('5');
      const update = findBy(db, 'SET password_hash = ?');
      expect(update.sql).toContain('password_hash = ?');
      expect(update.bindArgs[0]).toMatch(/^\$2/);
      expect(update.bindArgs[1]).toBe('5');
      expect(update.bindArgs[2]).toBe(7);
    });

    it('returns 404 for a missing user', async () => {
      const db = makeDb({
        ...mappingOk,
        'AND deleted_at IS NULL': (ch) => ch.all.mockResolvedValue({ results: [] }),
      });
      const req = makeRequest('POST', 'https://x.com/api/pos-users/404/reset-password', { password: 'newpass123' }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('User not found');
    });

    it('returns 400 for a password shorter than 8 characters without touching pos_users', async () => {
      const db = makeDb(mappingOk);
      const req = makeRequest('POST', 'https://x.com/api/pos-users/5/reset-password', { password: 'short' }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.errors[0].field).toBe('password');
      // Only the tenant_org_mapping lookup ran; no pos_users query.
      expect(findBy(db, 'SELECT id FROM pos_users')).toBeUndefined();
    });

    it('returns 400 when the DB throws during reset', async () => {
      const db = makeDb({
        ...mappingOk,
        'AND deleted_at IS NULL': (ch) => ch.all.mockRejectedValue(new Error('DB fail')),
      });
      const req = makeRequest('POST', 'https://x.com/api/pos-users/5/reset-password', { password: 'newpass123' }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe('Failed to reset password');
    });
  });

  describe('Provisioning & routing fallbacks', () => {
    it('auto-provisions org, store, and mapping when the tenant has none, then returns 200', async () => {
      const db = makeDb({
        'SELECT organization_id FROM tenant_org_mapping': (ch) => ch.all.mockResolvedValue({ results: [] }),
        'SELECT id FROM pos_organizations': (ch) => ch.all.mockResolvedValue({ results: [{ id: 77 }] }),
        'COUNT(*)': (ch) => ch.all.mockResolvedValue({ results: [{ total: 0 }] }),
        'SELECT pu.id': (ch) => ch.all.mockResolvedValue({ results: [] }),
      });
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      // Chained idempotent inserts happened before the list query.
      expect(findBy(db, 'INSERT OR IGNORE INTO pos_organizations')).toBeTruthy();
      expect(findBy(db, 'INSERT OR IGNORE INTO pos_stores')).toBeTruthy();
      expect(findBy(db, 'INSERT OR IGNORE INTO tenant_org_mapping')).toBeTruthy();
      // List query scoped to the newly provisioned organization id 77.
      expect(bindArgsOf(db, 'COUNT(*)')[0]).toBe(77);
    });

    it('returns 409 when the tenant has no mapping and provisioning yields no organization', async () => {
      const db = makeDb({
        'SELECT organization_id FROM tenant_org_mapping': (ch) => ch.all.mockResolvedValue({ results: [] }),
        'INSERT OR IGNORE INTO pos_organizations': (ch) => ch.run.mockResolvedValue({ success: true }),
        'SELECT id FROM pos_organizations': (ch) => ch.all.mockResolvedValue({ results: [] }),
      });
      const req = makeRequest('GET', 'https://x.com/api/pos-users', null, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('Tenant is not provisioned for POS');
    });

    it('returns 405 for an unsupported method/path combination', async () => {
      const db = makeDb(mappingOk);
      const req = makeRequest('PUT', 'https://x.com/api/pos-users/5', { role: 'manager' }, bearer(adminToken));
      const res = await handlePosUsersRoute(req, { DB: db, JWT_SECRET }, 'acaciacamp');
      expect(res.status).toBe(405);
      expect((await res.json()).error).toBe('Method not allowed');
    });
  });
});

describe('ensureTenantOrg', () => {
  it('returns the existing organization when a mapping already exists', async () => {
    const db = makeDb({
      'SELECT organization_id FROM tenant_org_mapping': (ch) => ch.all.mockResolvedValue({ results: [{ organization_id: 7 }] }),
    });
    const orgId = await ensureTenantOrg({ DB: db }, 'acaciacamp');
    expect(orgId).toBe(7);
    expect(db.calls.filter((c) => c.sql.includes('INSERT')).length).toBe(0);
  });

  it('provisions organization, store, and mapping when none exists (idempotent)', async () => {
    const db = makeDb({
      'SELECT organization_id FROM tenant_org_mapping': (ch) => ch.all.mockResolvedValue({ results: [] }),
      'SELECT id FROM pos_organizations': (ch) => ch.all.mockResolvedValue({ results: [{ id: 77 }] }),
    });
    const orgId = await ensureTenantOrg({ DB: db }, 'acaciacamp');
    expect(orgId).toBe(77);
    const orgInsert = findBy(db, 'INSERT OR IGNORE INTO pos_organizations');
    expect(orgInsert.bindArgs).toEqual(['acaciacamp', 'org_acaciacamp']);
    const storeInsert = findBy(db, 'INSERT OR IGNORE INTO pos_stores');
    expect(storeInsert.bindArgs[0]).toBe(77);
    expect(storeInsert.bindArgs[1]).toBe('acaciacamp Store');
    expect(storeInsert.bindArgs[2]).toBe('ST_acaciacamp');
    const mappingInsert = findBy(db, 'INSERT OR IGNORE INTO tenant_org_mapping');
    expect(mappingInsert.bindArgs).toEqual(['acaciacamp', 77]);
  });

  it('returns null when the DB throws', async () => {
    const db = makeDb({
      'SELECT organization_id FROM tenant_org_mapping': (ch) => ch.all.mockRejectedValue(new Error('KV fail')),
    });
    const orgId = await ensureTenantOrg({ DB: db }, 'acaciacamp');
    expect(orgId).toBeNull();
  });
});
