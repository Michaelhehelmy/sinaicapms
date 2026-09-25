/**
 * P0 NULL-tenant admin impersonation — mission tests (audit fix 2026-09-24).
 *
 * Covers the Option A login close + token/refresh binding + migration 0117 +
 * tenant-delete cascade revoke:
 *
 *   T1  orphan role=admin login WITH a victim tenantId → 401 (exploit closed);
 *       password never verified; branch-2 NULL lookup is super_admin-gated.
 *   T2  exact-tenant admin login → 200; access+refresh claims carry the OWN
 *       tenant_id; branch-2 never runs.
 *   T3  super_admin login WITH tenant → 200 via branch-2; claim = requested.
 *   T4  super_admin login WITHOUT tenant → 200; claim = null; no tenantCheck.
 *   T5  tenanted admin login WITHOUT tenant → 401 (scope always required).
 *   T6  refresh for a tenant admin ignores a spoofed decoded.tenantId.
 *   T7  refresh for super_admin preserves decoded.tenantId.
 *   T8  migration 0117 (REAL file replay on better-sqlite3): deactivates only
 *       active role=admin NULL rows; idempotent.
 *   T9  tenant-delete (single + bulk) revokes admins in the SAME DB.batch.
 *
 * T10 (requireAuth top guard + lenient removal + SSE valid-token) lives in
 * backend/tests/requireAuth-null-tenant-p0.test.js (needs REAL token crypto,
 * while this file mocks sharedAuth).
 *
 * STEP-0 exploit evidence (pre-fix backend/src/api/auth.js:130-175):
 *   SQL :140  "SELECT ... FROM admins WHERE email = ? AND
 *              (tenant_id = ? OR tenant_id IS NULL) AND is_active = 1"
 *   claim :161 { sub, userId, tenantId: admin.tenant_id || tenantId, ... }
 *   tenantId source: request BODY only (tenantId + tenant_id alias) resolved
 *   via tenants lookup — no header/query source in the login path. An active
 *   orphan (role=admin, tenant_id NULL) + any victim tenantId ⇒ JWT scoped to
 *   the victim. Staging read-only census: 0 orphan rows (super_admin seed
 *   only); local: 15 active orphans (e2e-crud-admin-*). No login attempted
 *   (no password guessing). AUDIT-LOG GATE: 0 hits locally + 0 on staging.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAuthRoute } from '../src/api/auth.js';
import { handleAdminRoute } from '../src/api/admin.js';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
  verifyPassword: vi.fn(),
  rehashIfNeeded: vi.fn(),
  hashPassword: vi.fn(),
  isValidEmail: vi.fn(),
  generateToken: vi.fn(),
}));

vi.mock('../src/services/emailService.js', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(true),
}));

import { verifyToken, verifyPassword, generateToken } from '../src/middleware/sharedAuth.js';

const migrationsDir = join(import.meta.dirname, '../migrations');

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

function loginDb(steps) {
  const db = { prepare: vi.fn() };
  db.prepare.mockImplementation(chainMock(steps));
  return db;
}

function makeRequest(method, url, body = null, headers = {}) {
  const h = new Headers({ ...headers });
  const opts = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

const adminRow = (overrides = {}) => ({
  id: 'a1', email: 'a@b.com', password_hash: '$2b$12$hash',
  role: 'admin', tenant_id: 't1', first_name: 'A', last_name: 'B', is_active: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('P0 NULL-tenant admin impersonation — login/token/refresh/migration/cascade', () => {
  it('T1: orphan role=admin login WITH victim tenantId → 401, password never checked, branch-2 super_admin-gated', async () => {
    const db = loginDb([
      (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'victim' }] }); },
      (ch) => { ch.first.mockResolvedValue(null); }, // branch-1 exact miss (orphan tenant_id IS NULL)
      (ch) => { ch.first.mockResolvedValue(null); }, // branch-2 miss (role gate excludes role=admin)
    ]);
    verifyPassword.mockResolvedValue(true); // would pass — must never be reached
    const req = makeRequest('POST', 'https://x.com/api/auth/login', {
      email: 'orphan@test.com', password: 'OrphanPass123!', tenantId: 'victim',
    });
    const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
    expect(res.status).toBe(401);
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(generateToken).not.toHaveBeenCalled();
    const adminQueries = db.prepare.mock.calls.map((c) => c[0]).filter((s) => s.includes('FROM admins'));
    expect(adminQueries).toHaveLength(2);
    // Branch-1 is the exact match — the old OR-NULL arm is gone.
    expect(adminQueries[0]).toContain('email = ? AND tenant_id = ?');
    expect(adminQueries[0]).not.toContain('OR tenant_id IS NULL');
    // Branch-2 ignores the requested tenant but ONLY for super_admin.
    expect(adminQueries[1]).toContain('tenant_id IS NULL');
    expect(adminQueries[1]).toContain("role = 'super_admin'");
  });

  it('T2: exact-tenant admin login → 200 with OWN tenant_id in both claims; branch-2 never runs', async () => {
    const db = loginDb([
      (ch) => { ch.all.mockResolvedValue({ results: [{ id: 't1' }] }); },
      (ch) => { ch.first.mockResolvedValue(adminRow()); },
      (ch) => { ch.run.mockResolvedValue({}); },
    ]);
    verifyPassword.mockResolvedValue(true);
    generateToken.mockResolvedValue('jwt');
    const req = makeRequest('POST', 'https://x.com/api/auth/login', {
      email: 'a@b.com', password: 'pass1234', tenantId: 't1',
    });
    const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.tenantId).toBe('t1');
    expect(generateToken.mock.calls[0][0].tenantId).toBe('t1');
    expect(generateToken.mock.calls[0][2]).toBe('access');
    expect(generateToken.mock.calls[1][0].tenantId).toBe('t1');
    expect(generateToken.mock.calls[1][2]).toBe('refresh');
    expect(db.prepare.mock.calls.map((c) => c[0]).filter((s) => s.includes('FROM admins'))).toHaveLength(1);
  });

  it('T3: super_admin login WITH tenant → 200 via branch-2; claim = requested tenant', async () => {
    const db = loginDb([
      (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'victim' }] }); },
      (ch) => { ch.first.mockResolvedValue(null); }, // branch-1 miss: no tenanted row
      (ch) => { ch.first.mockResolvedValue(adminRow({ id: 'sa', role: 'super_admin', tenant_id: null })); },
      (ch) => { ch.run.mockResolvedValue({}); },
    ]);
    verifyPassword.mockResolvedValue(true);
    generateToken.mockResolvedValue('jwt');
    const req = makeRequest('POST', 'https://x.com/api/auth/login', {
      email: 'admin@sinaicamps.com', password: 'pass1234', tenantId: 'victim',
    });
    const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.role).toBe('super_admin');
    expect(body.user.tenantId).toBe('victim');
    expect(generateToken.mock.calls[0][0].tenantId).toBe('victim');
  });

  it('T4: super_admin login WITHOUT tenant → 200; claim = null; no tenantCheck prepare', async () => {
    const db = loginDb([
      (ch) => { ch.first.mockResolvedValue(adminRow({ id: 'sa', role: 'super_admin', tenant_id: null })); },
      (ch) => { ch.run.mockResolvedValue({}); },
    ]);
    verifyPassword.mockResolvedValue(true);
    generateToken.mockResolvedValue('jwt');
    const req = makeRequest('POST', 'https://x.com/api/auth/login', {
      email: 'admin@sinaicamps.com', password: 'pass1234',
    });
    const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.tenantId).toBeNull();
    expect(generateToken.mock.calls[0][0].tenantId).toBeNull();
    expect(db.prepare.mock.calls.map((c) => c[0]).some((s) => s.includes('FROM tenants'))).toBe(false);
  });

  it('T5: tenanted admin login WITHOUT tenant → 401 (scope always required)', async () => {
    const db = loginDb([
      (ch) => { ch.first.mockResolvedValue(null); }, // NULL branch only matches super_admin-gated rows
    ]);
    const req = makeRequest('POST', 'https://x.com/api/auth/login', {
      email: 'a@b.com', password: 'pass1234',
    });
    const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
    expect(res.status).toBe(401);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it('T6: refresh for a tenant admin ignores a spoofed decoded.tenantId', async () => {
    verifyToken.mockResolvedValue({ sub: 'a1', userId: 'a1', tenantId: 'evil', type: 'refresh' });
    generateToken.mockResolvedValue('new-jwt');
    const chain = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(adminRow()),
      all: vi.fn(),
      run: vi.fn(),
    };
    const db = { prepare: vi.fn().mockReturnValue(chain) };
    const req = makeRequest('POST', 'https://x.com/api/auth/refresh', { refreshToken: 'rt' });
    const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(generateToken.mock.calls[0][0].tenantId).toBe('t1');
    expect(generateToken.mock.calls[1][0].tenantId).toBe('t1');
    expect(body.user.tenantId).toBe('t1');
  });

  it('T7: refresh for super_admin preserves decoded.tenantId', async () => {
    verifyToken.mockResolvedValue({ sub: 'sa', userId: 'sa', tenantId: 't9', type: 'refresh' });
    generateToken.mockResolvedValue('new-jwt');
    const chain = {
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(adminRow({ id: 'sa', role: 'super_admin', tenant_id: null })),
      all: vi.fn(),
      run: vi.fn(),
    };
    const db = { prepare: vi.fn().mockReturnValue(chain) };
    const req = makeRequest('POST', 'https://x.com/api/auth/refresh', { refreshToken: 'rt' });
    const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(generateToken.mock.calls[0][0].tenantId).toBe('t9');
    expect(generateToken.mock.calls[1][0].tenantId).toBe('t9');
    expect(body.user.tenantId).toBe('t9');
  });

  it('T8: migration 0117 (REAL file) deactivates only active role=admin NULL rows; idempotent', async () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE admins (
      id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, role TEXT, is_active INTEGER
    );`);
    const insert = db.prepare('INSERT INTO admins VALUES (?, ?, ?, ?, ?)');
    insert.run('sa', null, 'admin@sinaicamps.com', 'super_admin', 1);
    insert.run('o1', null, 'orphan1@test.com', 'admin', 1);
    insert.run('o2', null, 'orphan2@test.com', 'admin', 1);
    insert.run('o3', null, 'orphan3@test.com', 'admin', 0);
    insert.run('m1', null, 'manager@test.com', 'manager', 1);
    insert.run('t1', 'acaciacamp', 'a@t.com', 'admin', 1);
    const file = readFileSync(join(migrationsDir, '0117_revoke_orphan_admins.sql'), 'utf8');
    const update = file.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--'));
    expect(update).toHaveLength(1);
    expect(update[0]).toContain("role = 'admin'");
    const first = db.prepare(update[0]).run();
    expect(first.changes).toBe(2);
    const state = Object.fromEntries(
      db.prepare('SELECT id, is_active FROM admins').all().map((r) => [r.id, r.is_active])
    );
    expect(state).toEqual({ sa: 1, o1: 0, o2: 0, o3: 0, m1: 1, t1: 1 });
    expect(db.prepare(update[0]).run().changes).toBe(0);
  });

  it('T9: tenant-delete (single + bulk) revokes admins in the SAME DB.batch transaction', async () => {
    verifyToken.mockResolvedValue({ sub: 'sa1', userId: 'sa1', role: 'super_admin', tenantId: null });
    const sqls = [];
    const db = {
      prepare: vi.fn().mockImplementation((sql) => {
        sqls.push(sql);
        if (sql.includes('SELECT is_active')) {
          return {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue({ results: [{ is_active: 1 }] }),
            first: vi.fn(), run: vi.fn(),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({}),
        };
      }),
      batch: vi.fn().mockResolvedValue([]),
    };
    const env = { DB: db, JWT_SECRET: 'secret' };
    // Single delete: 15 cascade + tenants row in ONE batch, admins revoke inside it.
    await handleAdminRoute(
      makeRequest('DELETE', 'https://x.com/api/admin/tenants/t1', null, { Authorization: 'Bearer sa' }),
      env
    );
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.batch.mock.calls[0][0]).toHaveLength(16);
    const adminDelIdx = sqls.findIndex((s) => s === 'DELETE FROM admins WHERE tenant_id = ?');
    expect(adminDelIdx).toBeGreaterThan(-1);
    // Bulk delete: per-tenant cascade (incl. admins revoke) + one tenants delete, still ONE batch.
    db.batch.mockClear();
    sqls.length = 0;
    const bulkRes = await handleAdminRoute(
      makeRequest('POST', 'https://x.com/api/admin/tenants/bulk/delete', { ids: ['t1', 't2'] }, { Authorization: 'Bearer sa' }),
      env
    );
    const bulkBody = await bulkRes.json();
    expect(bulkBody.success).toBe(true);
    expect(db.batch).toHaveBeenCalledTimes(1);
    expect(db.batch.mock.calls[0][0]).toHaveLength(2 * 15 + 1);
    expect(sqls.filter((s) => s === 'DELETE FROM admins WHERE tenant_id = ?')).toHaveLength(2);
  });
});
