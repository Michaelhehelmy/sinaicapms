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
    it('creates a tenant, admin, and POS org successfully', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/public/signup', VALID_SIGNUP);
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.tenantId).toContain('tenant_');
      expect(data.onboardingToken).toBeTruthy();
      expect(bcrypt.hash).toHaveBeenCalled();
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

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('POST', '/api/public/signup', VALID_SIGNUP);
      expect(res.status).toBe(500);
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
      expect(res.status).toBe(400);
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

    it('returns 400 when onboarding already completed', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({ results: [{ id: 't1', onboarding_status: 'completed' }] }),
        })),
      };
      env.DB = db;
      const res = await request('POST', '/api/onboarding/setup', { token: 'tok123' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for missing token', async () => {
      env.DB = { prepare: vi.fn() };
      const res = await request('POST', '/api/onboarding/setup', { location: 'Sinai' });
      expect(res.status).toBe(400);
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('DB fail'); }) };
      const res = await request('POST', '/api/onboarding/setup', { token: 'tok123' });
      expect(res.status).toBe(400);
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
      expect(res.status).toBe(400);
    });
  });
});
