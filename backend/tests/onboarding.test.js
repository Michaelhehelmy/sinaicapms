import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import onboardingRoutes from '../src/api/onboarding.js';
import { mountRouter } from './helpers/routerHarness.js';

// Mock bcryptjs to avoid slow real hashing
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed_password') },
  hash: vi.fn().mockResolvedValue('hashed_password'),
  compare: vi.fn(),
}));

const VALID_SIGNUP = {
  name: 'Acacia Camp',
  subdomain: 'acacia',
  business_type: 'camp',
  email: 'owner@acacia.com',
  password: 'secret123',
  first_name: 'John',
  last_name: 'Doe',
};

function mockDb(handlers = {}) {
  const db = {
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
    calls: [],
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        bindArgs: undefined,
        bind: vi.fn((...args) => {
          chain.bindArgs = args;
          return chain;
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
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

describe('onboardingRoutes', () => {
  let app;
  let env;

  const request = (method, url, body = null) => {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return app.request(`http://localhost${url}`, opts, env);
  };

  beforeEach(() => {
    env = {};
    app = mountRouter(onboardingRoutes, { basePath: '/api' });
  });

  // ─── POST /api/public/signup ────────────────────────────────
  describe('POST /api/public/signup', () => {
    it('creates tenant + admin + POS org/store + mapping in ONE atomic batch', async () => {
      const batchStmts = [];
      const runCalls = [];
      const db = {
        batch: vi.fn(async (stmts) => {
          batchStmts.push(...stmts);
          return stmts.map(() => ({ meta: { changes: 1 } }));
        }),
        prepare: vi.fn((sql) => {
          const chain = {
            sql,
            bindArgs: undefined,
            bind: vi.fn((...args) => {
              chain.bindArgs = args;
              return chain;
            }),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn(() => {
              runCalls.push(sql);
              return Promise.resolve({ success: true, meta: { changes: 1 } });
            }),
          };
          db.calls.push(chain);
          return chain;
        }),
        calls: [],
      };
      env.DB = db;
      const res = await request('POST', '/api/public/signup', VALID_SIGNUP);
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.tenantId).toContain('tenant_');
      expect(data.onboardingToken).toBeTruthy();
      expect(bcrypt.hash).toHaveBeenCalled();

      // All provisioning is ONE atomic batch — no sequential INSERTs.
      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(batchStmts).toHaveLength(5);
      expect(runCalls).toHaveLength(0);

      const orgStmt = batchStmts.find((s) => s.sql.includes('INSERT INTO pos_organizations'));
      const storeStmt = batchStmts.find((s) => s.sql.includes('INSERT INTO pos_stores'));
      const mappingStmt = batchStmts.find((s) => s.sql.includes('INSERT INTO tenant_org_mapping'));

      // Org INSERT uses the CORRECT provisioning shape: no tenant_id column,
      // no manual id (auto-increments), UNIQUE slug must be present.
      expect(orgStmt).toBeTruthy();
      expect(orgStmt.sql).toContain('pos_organizations (name, slug, created_at, updated_at)');
      expect(orgStmt.sql).not.toContain('tenant_id');
      expect(orgStmt.sql).not.toMatch(/INSERT INTO pos_organizations \(id/);
      const expectedSlug = ('org_' + data.tenantId).replace(/[^a-zA-Z0-9_]/g, '_');
      expect(orgStmt.bindArgs[1]).toBe(expectedSlug);

      // Store + mapping resolve the org id via slug subquery INSIDE the batch.
      expect(storeStmt.sql).toContain('SELECT id FROM pos_organizations WHERE slug = ?');
      expect(storeStmt.bindArgs[0]).toBe(expectedSlug);
      expect(storeStmt.bindArgs[2]).toBe('ST_' + data.tenantId);
      expect(mappingStmt.sql).toContain('VALUES (?, (SELECT id FROM pos_organizations WHERE slug = ?))');
      expect(mappingStmt.bindArgs).toEqual([data.tenantId, expectedSlug]);

      // Admin row must start INACTIVE (is_active is an inline literal, not a bind).
      const adminStmt = batchStmts.find((s) => s.sql.includes('INSERT INTO admins'));
      expect(adminStmt.sql).toMatch(/is_active,[\s\S]*VALUES \([\s\S]*0,/);
    });

    it('returns 400 for missing name', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/public/signup', { ...VALID_SIGNUP, name: '' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid email', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/public/signup', { ...VALID_SIGNUP, email: 'not-an-email' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for short password', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/public/signup', { ...VALID_SIGNUP, password: 'abc' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for short subdomain', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/public/signup', { ...VALID_SIGNUP, subdomain: 'ab' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid subdomain format', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/public/signup', { ...VALID_SIGNUP, subdomain: 'BAD NAME!' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when subdomain is taken', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [{ id: 'existing' }] }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/public/signup', VALID_SIGNUP);
      expect(res.status).toBe(400);
    });

    it('returns 400 when email is taken', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(() => {
            callIdx++;
            // subdomain query returns empty, email query returns existing
            return Promise.resolve({ results: callIdx === 1 ? [] : [{ id: 'existing_admin' }] });
          }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/public/signup', VALID_SIGNUP);
      expect(res.status).toBe(400);
    });

    it('retry with the same subdomain returns the existing 400 and performs no writes', async () => {
      let runCount = 0;
      const db = {
        batch: vi.fn().mockResolvedValue([]),
        prepare: vi.fn((sql) => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [{ id: 'existing' }] }),
          run: vi.fn(() => {
            runCount++;
            return Promise.resolve({ success: true, meta: { changes: 1 } });
          }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/public/signup', VALID_SIGNUP);
      expect(res.status).toBe(400);
      // No provisioning ran — no new tenant/admin/org rows can be orphaned.
      expect(db.batch).not.toHaveBeenCalled();
      expect(runCount).toBe(0);
    });

    it('a forced POS org failure 500s with a detail and leaves NO orphan rows (batch atomicity)', async () => {
      const batchStmts = [];
      const db = {
        batch: vi.fn(async (stmts) => {
          batchStmts.push(...stmts);
          // Mirror the real schema-drift class of bug: the org INSERT fails.
          throw new Error('no such column: tenant_id');
        }),
        prepare: vi.fn((sql) => {
          const chain = {
            sql,
            bindArgs: undefined,
            bind: vi.fn((...args) => {
              chain.bindArgs = args;
              return chain;
            }),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
          };
          db.calls.push(chain);
          return chain;
        }),
        calls: [],
      };
      env.DB = db;
      const res = await request('POST', '/api/public/signup', VALID_SIGNUP);
      const data = await res.json();
      expect(res.status).toBe(500);
      expect(data.success).toBe(false);
      // Catch no longer swallows the real error — detail carries it.
      expect(data.detail).toContain('no such column');

      // Every write (tenant + admin + org + store + mapping) lives inside the
      // single batch. Nothing was run outside it, so a batch rejection rolls
      // them all back together — no orphan tenant/admin rows can persist.
      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(batchStmts).toHaveLength(5);
      const runSqls = db.calls.filter((c) => c.run.mock.calls.length > 0).map((c) => c.sql);
      expect(runSqls).toHaveLength(0);
    });

    it('returns 500 with a detail on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('POST', '/api/public/signup', VALID_SIGNUP);
      const data = await res.json();
      expect(res.status).toBe(500);
      expect(data.detail).toBe('DB fail');
    });
  });

  // ─── GET /api/onboarding/status/:token ──────────────────────
  describe('GET /api/onboarding/status/:token', () => {
    it('returns onboarding status for valid token', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{
              id: 't1', name: 'Acacia', subdomain: 'acacia', email: 'a@b.com',
              status: 'pending_setup', onboarding_status: 'pending_setup',
              location: 'Sinai', phone: '123', description: 'A camp',
              primary_color: '#4a7c4f', capacity: 50, currency: 'EGP',
            }],
          }),
        })),
      };
      env.DB = db;
      const res = await request('GET', '/api/onboarding/status/token123');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.setupComplete).toBe(false);
      expect(data.profile.location).toBe('Sinai');
    });

    it('returns setup_complete true when onboarding completed', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{ id: 't1', onboarding_status: 'completed' }],
          }),
        })),
      };
      env.DB = db;
      const res = await request('GET', '/api/onboarding/status/token123');
      const data = await res.json();
      expect(data.setupComplete).toBe(true);
    });

    it('returns 404 for invalid token', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await request('GET', '/api/onboarding/status/invalid');
      expect(res.status).toBe(404);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('GET', '/api/onboarding/status/token123');
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /api/onboarding/setup ─────────────────────────────
  describe('POST /api/onboarding/setup', () => {
    it('completes onboarding with profile data', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(() =>
            callIdx++ < 1
              ? Promise.resolve({ results: [{ id: 't1', onboarding_status: 'pending_setup' }] })
              : Promise.resolve({ results: [] })
          ),
          run: vi.fn().mockResolvedValue({ success: true }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/onboarding/setup', {
        token: 'tok123',
        location: 'Sinai',
        phone: '123456',
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.autoLoginToken).toBeTruthy();
      expect(data.siteUrl).toBe('https://t1.sinaicamps.com');
    });

    it('returns 404 for invalid token', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/onboarding/setup', { token: 'invalid' });
      expect(res.status).toBe(404);
    });

    it('returns 410 when onboarding already completed (U-004: re-use is gone, not bad-request)', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [{ id: 't1', onboarding_status: 'completed' }] }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/onboarding/setup', { token: 'tok123' });
      const data = await res.json();
      expect(res.status).toBe(410);
      expect(data.error).toBe('Onboarding already completed.');
    });

    it('returns 400 for missing token', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/onboarding/setup', { location: 'Sinai' });
      expect(res.status).toBe(400);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('POST', '/api/onboarding/setup', { token: 'tok123' });
      expect(res.status).toBe(500);
    });
  });

  // ─── POST /api/onboarding/tenant ────────────────────────────
  describe('POST /api/onboarding/tenant', () => {
    it('partially updates tenant profile', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn(() =>
            callIdx++ < 1
              ? Promise.resolve({ results: [{ id: 't1' }] })
              : Promise.resolve({ results: [] })
          ),
          run: vi.fn().mockResolvedValue({ success: true }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/onboarding/tenant', {
        token: 'tok123',
        description: 'Updated description',
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.tenantId).toBe('t1');
    });

    it('returns 400 for missing token', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/onboarding/tenant', { description: 'X' });
      expect(res.status).toBe(400);
    });

    it('returns 404 for invalid token', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/onboarding/tenant', { token: 'invalid' });
      expect(res.status).toBe(404);
    });

    it('returns 200 with no updates when all fields empty', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [{ id: 't1' }] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/onboarding/tenant', { token: 'tok123', description: '' });
      expect(res.status).toBe(200);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('POST', '/api/onboarding/tenant', { token: 'tok123' });
      expect(res.status).toBe(500);
    });
  });

  // ─── U-004 token expiry + single-use burn ───────────────────────
  describe('U-004 onboarding token expiry + single-use burn', () => {
    it('fresh token (future expiry) → 200', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{
              id: 't1', name: 'Acacia', subdomain: 'acacia', email: 'a@b.com',
              status: 'pending_setup', onboarding_status: 'pending_setup',
              onboarding_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              location: 'Sinai', phone: '123', description: 'A camp',
              primary_color: '#4a7c4f', capacity: 50, currency: 'EGP',
            }],
          }),
        })),
      };
      env.DB = db;
      const res = await request('GET', '/api/onboarding/status/fresh-token');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.setupComplete).toBe(false);
    });

    it('past-expiry token → 410 "Onboarding link expired. Contact support."', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{
              id: 't1', name: 'Acacia', subdomain: 'acacia', email: 'a@b.com',
              status: 'pending_setup', onboarding_status: 'pending_setup',
              onboarding_token_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
              location: null, phone: null, description: null,
              primary_color: '#4a7c4f', capacity: 50, currency: 'EGP',
            }],
          }),
        })),
      };
      env.DB = db;
      const res = await request('GET', '/api/onboarding/status/stale-token');
      const data = await res.json();
      expect(res.status).toBe(410);
      expect(data.error).toBe('Onboarding link expired. Contact support.');
    });

    it('post-completion re-use → 410 "Onboarding already completed."', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{
              id: 't1',
              onboarding_status: 'completed',
              onboarding_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            }],
          }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/onboarding/setup', { token: 'used-token' });
      const data = await res.json();
      expect(res.status).toBe(410);
      expect(data.error).toBe('Onboarding already completed.');
    });
  });
});
