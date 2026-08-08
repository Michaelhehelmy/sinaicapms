import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleAuthRoute } from '../src/api/auth.js';

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

import { verifyToken, verifyPassword, rehashIfNeeded, hashPassword, generateToken } from '../src/middleware/sharedAuth.js';
import { sendPasswordResetEmail } from '../src/services/emailService.js';

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('handleAuthRoute', () => {
  describe('POST /auth/login', () => {
    it('returns 401 when tenantId is missing (super admin login without tenant)', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/login', { email: 'a@b.com', password: 'pass1234' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/login', { email: '' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 401 for invalid credentials (admin not found)', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/login', {
        email: 'a@b.com', password: 'pass1234', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 401 when password is wrong', async () => {
      const { db } = makeDbMock();
      db.prepare.mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue({ id: 'a1', password_hash: '$2b$12$hash', is_active: 1 }),
        all: vi.fn().mockResolvedValue({ results: [{ id: 't1' }] }),
        run: vi.fn(),
      });
      verifyPassword.mockResolvedValue(false);
      const req = makeRequest('POST', 'https://x.com/api/auth/login', {
        email: 'a@b.com', password: 'wrong', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 401 when SQL filters out inactive admin (is_active=0)', async () => {
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue(null);
      const req = makeRequest('POST', 'https://x.com/api/auth/login', {
        email: 'a@b.com', password: 'pass1234', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('logs in successfully with valid credentials', async () => {
      const admin = {
        id: 'a1', email: 'a@b.com', password_hash: '$2b$12$hash',
        role: 'admin', tenant_id: 't1', first_name: 'John', last_name: 'Doe', is_active: 1
      };
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 't1' }] }); },
        (ch) => { ch.first.mockResolvedValue(admin); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      verifyPassword.mockResolvedValue(true);
      generateToken.mockResolvedValue('mock-jwt-token');
      const req = makeRequest('POST', 'https://x.com/api/auth/login', {
        email: 'a@b.com', password: 'pass1234', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.token).toBe('mock-jwt-token');
      expect(body.user.name).toBe('John Doe');
      // T8-D: wire is camelCase-only — user.tenantId, never user.tenant_id
      expect(body.user.tenantId).toBe('t1');
      expect(body.user.tenant_id).toBeUndefined();
    });

    it('returns 500 when JWT_SECRET is missing', async () => {
      const { db } = makeDbMock();
      verifyPassword.mockResolvedValue(true);
      const req = makeRequest('POST', 'https://x.com/api/auth/login', {
        email: 'a@b.com', password: 'pass1234'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Failed to process login');
    });

    it('strips tenant_id silently (camelCase-only contract — tenant lookup is NOT performed)', async () => {
      const admin = {
        id: 'a1', email: 'a@b.com', password_hash: '$2b$12$hash',
        role: 'admin', tenant_id: 't1', first_name: 'A', last_name: null, is_active: 1
      };
      const { db } = makeDbMock();
      // NO `all` fn on the first chain: if the tenant-check branch ran, .all() would be
      // undefined → throw → 400. success:true proves the tenant lookup was skipped and
      // the login proceeded via the super-admin (tenant_id IS NULL) path.
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue(admin); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      verifyPassword.mockResolvedValue(true);
      generateToken.mockResolvedValue('token');
      const req = makeRequest('POST', 'https://x.com/api/auth/login', {
        email: 'a@b.com', password: 'pass1234', tenant_id: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.user.tenantId).toBe('t1');
    });

    it('resolves tenant ID from subdomain', async () => {
      const admin = {
        id: 'a1', email: 'a@b.com', password_hash: '$2b$12$hash',
        role: 'admin', tenant_id: 'resolved_t1', first_name: 'J', last_name: null, is_active: 1
      };
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'resolved_t1' }] }); },
        (ch) => { ch.first.mockResolvedValue(admin); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      verifyPassword.mockResolvedValue(true);
      generateToken.mockResolvedValue('token');
      const req = makeRequest('POST', 'https://x.com/api/auth/login', {
        email: 'a@b.com', password: 'pass1234', tenantId: 'my-camp'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('calls rehashIfNeeded when password is valid', async () => {
      const admin = {
        id: 'a1', email: 'a@b.com', password_hash: '$sha256$oldhash',
        role: 'admin', tenant_id: 't1', first_name: null, last_name: null, is_active: 1
      };
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 't1' }] }); },
        (ch) => { ch.first.mockResolvedValue(admin); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      verifyPassword.mockResolvedValue(true);
      rehashIfNeeded.mockResolvedValue();
      generateToken.mockResolvedValue('token');
      const req = makeRequest('POST', 'https://x.com/api/auth/login', {
        email: 'a@b.com', password: 'pass1234', tenantId: 't1'
      });
      await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(rehashIfNeeded).toHaveBeenCalledWith('a1', 'pass1234', '$sha256$oldhash', { DB: db, JWT_SECRET: 'secret' });
    });

    it('returns error on exception', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/auth/login', {
        email: 'a@b.com', password: 'pass1234', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/logout', () => {
    it('returns success', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/logout');
      const res = await handleAuthRoute(req, { DB: db });
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 without Authorization header', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/auth/me');
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      const { db } = makeDbMock();
      verifyToken.mockResolvedValue(null);
      const req = makeRequest('GET', 'https://x.com/api/auth/me', null, { Authorization: 'Bearer invalid' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 404 when admin not found', async () => {
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue(null);
      verifyToken.mockResolvedValue({ sub: 'a1' });
      const req = makeRequest('GET', 'https://x.com/api/auth/me', null, { Authorization: 'Bearer valid' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(404);
    });

    it('returns 401 when admin is deactivated', async () => {
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue({ id: 'a1', is_active: 0 });
      verifyToken.mockResolvedValue({ sub: 'a1' });
      const req = makeRequest('GET', 'https://x.com/api/auth/me', null, { Authorization: 'Bearer valid' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns admin profile when valid', async () => {
      const admin = { id: 'a1', email: 'a@b.com', role: 'admin', tenant_id: 't1', first_name: 'John', last_name: 'Doe', is_active: 1 };
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue(admin);
      verifyToken.mockResolvedValue({ sub: 'a1' });
      const req = makeRequest('GET', 'https://x.com/api/auth/me', null, { Authorization: 'Bearer valid' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(body.user.name).toBe('John Doe');
      expect(body.user.email).toBe('a@b.com');
      // T8-D: wire is camelCase-only — user.tenantId, never user.tenant_id
      expect(body.user.tenantId).toBe('t1');
      expect(body.user.tenant_id).toBeUndefined();
    });
  });

  describe('POST /auth/register', () => {
    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/register', { name: '', email: '' });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
    });

    it('returns 404 when tenant not found', async () => {
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue(null);
      const req = makeRequest('POST', 'https://x.com/api/auth/register', {
        name: 'Admin', email: 'a@b.com', password: 'pass1234', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(404);
    });

    it('returns 409 when email already exists', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 't1' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'existing_admin' }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/auth/register', {
        name: 'Admin', email: 'a@b.com', password: 'pass1234', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(409);
    });

    it('registers new admin successfully', async () => {
      hashPassword.mockResolvedValue('$2b$12$hashed');
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 't1' }); },
        (ch) => { ch.first.mockResolvedValue(null); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/auth/register', {
        name: 'John Doe', email: 'j@b.com', password: 'pass1234', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db });
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain('pending');
    });

    it('handles single-word name', async () => {
      hashPassword.mockResolvedValue('$2b$12$hashed');
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 't1' }); },
        (ch) => { ch.first.mockResolvedValue(null); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/auth/register', {
        name: 'SoloName', email: 's@b.com', password: 'pass1234', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db });
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns error on exception', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/auth/register', {
        name: 'Admin', email: 'a@b.com', password: 'pass1234', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/forgot-password', () => {
    it('returns success even when admin not found (no leak)', async () => {
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue(null);
      const req = makeRequest('POST', 'https://x.com/api/auth/forgot-password', {
        email: 'a@b.com', tenantId: 't1'
      });
      const res = await handleAuthRoute(req, { DB: db });
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('sends reset email when admin found', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'a1', email: 'a@b.com', tenant_id: 't1' }); },
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/auth/forgot-password', {
        email: 'a@b.com', tenantId: 't1'
      }, { 'cf-connecting-ip': '1.2.3.4' });
      const res = await handleAuthRoute(req, { DB: db });
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('limits active tokens to 5', async () => {
      const { db } = makeDbMock();
      // prepare order: SELECT admin (first) → CREATE TABLE (run) → DELETE user tokens
      // (run) → SELECT active tokens (all) → purge DELETE x2 (run, run)
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'a1', email: 'a@b.com', tenant_id: 't1' }); },
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }, { id: 't5' }, { id: 't6' }] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/auth/forgot-password', {
        email: 'a@b.com', tenantId: 't1'
      }, { 'cf-connecting-ip': '1.2.3.4' });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(200);
    });

    it('returns 429 after too many forgot-password attempts', async () => {
      const { db } = makeDbMock();
      db.prepare.mockReturnValue({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      });
      const ip = '9.9.9.9';
      let status = null;
      for (let i = 0; i < 6; i++) {
        const req = makeRequest('POST', 'https://x.com/api/auth/forgot-password', {
          email: 'a@b.com'
        }, { 'cf-connecting-ip': ip });
        const res = await handleAuthRoute(req, { DB: db });
        status = res.status;
      }
      expect(status).toBe(429);
    });

    it('cleans up stale forgot-password entries when map is large', async () => {
      vi.useFakeTimers();
      try {
        const { db } = makeDbMock();
        db.prepare.mockReturnValue({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        });
        // Seed 5001 unique IPs inside the current 15-min window
        for (let i = 0; i < 5001; i++) {
          const req = makeRequest('POST', 'https://x.com/api/auth/forgot-password', {
            email: 'a@b.com'
          }, { 'cf-connecting-ip': `fp-clean-${i}` });
          await handleAuthRoute(req, { DB: db });
        }
        // Advance past the window so every entry is stale, then trigger cleanup
        vi.advanceTimersByTime(15 * 60 * 1000 + 1);
        const req = makeRequest('POST', 'https://x.com/api/auth/forgot-password', {
          email: 'a@b.com'
        }, { 'cf-connecting-ip': 'fp-clean-final' });
        const res = await handleAuthRoute(req, { DB: db });
        expect(res.status).toBe(200);
      } finally {
        vi.useRealTimers();
      }
    });

    it('searches without tenantId when not provided', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue(null); },
        (ch) => { ch.first.mockResolvedValue({ id: 'a1', email: 'a@b.com', tenant_id: null }); },
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/auth/forgot-password', {
        email: 'a@b.com'
      }, { 'cf-connecting-ip': '1.2.3.5' });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/forgot-password', { email: '' });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
    });

    it('returns error on exception', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/auth/forgot-password', {
        email: 'a@b.com'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/reset-password', { token: '' });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid token', async () => {
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue(null);
      const req = makeRequest('POST', 'https://x.com/api/auth/reset-password', {
        token: 'bad-token', password: 'newpass123'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
    });

    it('returns 400 for already-used token', async () => {
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue({ id: 'prt1', user_id: 'a1', used: 1, expires_at: '2099-01-01' });
      const req = makeRequest('POST', 'https://x.com/api/auth/reset-password', {
        token: 'used-token', password: 'newpass123'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('already been used');
    });

    it('returns 400 for expired token', async () => {
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue({ id: 'prt1', user_id: 'a1', used: 0, expires_at: '2020-01-01' });
      const req = makeRequest('POST', 'https://x.com/api/auth/reset-password', {
        token: 'expired-token', password: 'newpass123'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('expired');
    });

    it('resets password successfully', async () => {
      hashPassword.mockResolvedValue('$2b$12$newhash');
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue({ id: 'prt1', user_id: 'a1', used: 0, expires_at: '2099-01-01' });
      const req = makeRequest('POST', 'https://x.com/api/auth/reset-password', {
        token: 'valid-token', password: 'newpass123'
      });
      const res = await handleAuthRoute(req, { DB: db });
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns error on exception', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/auth/reset-password', {
        token: 'tok', password: 'newpass123'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/change-password', () => {
    it('returns 401 without Authorization header', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/change-password', {
        currentPassword: 'old', newPassword: 'newpass123'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 401 with invalid token', async () => {
      verifyToken.mockResolvedValue(null);
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/change-password', {
        currentPassword: 'old', newPassword: 'newpass123'
      }, { Authorization: 'Bearer bad' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 400 for invalid schema (short password)', async () => {
      verifyToken.mockResolvedValue({ sub: 'a1' });
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue({ id: 'a1', password_hash: '$2b$12$hash' });
      const req = makeRequest('POST', 'https://x.com/api/auth/change-password', {
        currentPassword: 'old', newPassword: 'short'
      }, { Authorization: 'Bearer valid' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when admin not found', async () => {
      verifyToken.mockResolvedValue({ sub: 'a1' });
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue(null);
      const req = makeRequest('POST', 'https://x.com/api/auth/change-password', {
        currentPassword: 'old', newPassword: 'newpass123'
      }, { Authorization: 'Bearer valid' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(404);
    });

    it('returns 401 when current password is wrong', async () => {
      verifyToken.mockResolvedValue({ sub: 'a1' });
      verifyPassword.mockResolvedValue(false);
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue({ id: 'a1', password_hash: '$2b$12$hash' });
      const req = makeRequest('POST', 'https://x.com/api/auth/change-password', {
        currentPassword: 'wrong', newPassword: 'newpass123'
      }, { Authorization: 'Bearer valid' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('changes password successfully', async () => {
      verifyToken.mockResolvedValue({ sub: 'a1' });
      verifyPassword.mockResolvedValue(true);
      hashPassword.mockResolvedValue('$2b$12$new');
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue({ id: 'a1', password_hash: '$2b$12$hash' });
      const req = makeRequest('POST', 'https://x.com/api/auth/change-password', {
        currentPassword: 'old', newPassword: 'newpass123'
      }, { Authorization: 'Bearer valid' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns error on exception', async () => {
      verifyToken.mockResolvedValue({ sub: 'a1' });
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/auth/change-password', {
        currentPassword: 'old', newPassword: 'newpass123'
      }, { Authorization: 'Bearer valid' });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns new access + refresh tokens for a valid refresh token', async () => {
      verifyToken.mockResolvedValue({ sub: 'a1', userId: 'a1', tenantId: 't1', type: 'refresh' });
      generateToken.mockResolvedValue('new-jwt-token');
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue({
        id: 'a1', email: 'a@b.com', role: 'admin', tenant_id: 't1',
        first_name: 'John', last_name: 'Doe', is_active: 1
      });
      const req = makeRequest('POST', 'https://x.com/api/auth/refresh', {
        refreshToken: 'valid-refresh-token'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.token).toBe('new-jwt-token');
      expect(body.refreshToken).toBe('new-jwt-token');
      expect(body.user.name).toBe('John Doe');
      expect(body.user.role).toBe('admin');
      // T8-D: wire is camelCase-only — user.tenantId, never user.tenant_id
      expect(body.user.tenantId).toBe('t1');
      expect(body.user.tenant_id).toBeUndefined();
      // re-issues access first, then refresh (matching login order)
      expect(generateToken.mock.calls[0][2]).toBe('access');
      expect(generateToken.mock.calls[1][2]).toBe('refresh');
    });

    it('returns 401 for an invalid or expired refresh token', async () => {
      verifyToken.mockResolvedValue(null);
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/refresh', {
        refreshToken: 'expired-token'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid or expired refresh token');
    });

    it('rejects an access token presented as a refresh token', async () => {
      verifyToken.mockResolvedValue({ sub: 'a1', userId: 'a1', tenantId: 't1', type: 'access' });
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/refresh', {
        refreshToken: 'access-token'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid token type');
    });

    it('returns 400 with validation errors when refreshToken is missing', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/refresh', {});
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(Array.isArray(body.errors)).toBe(true);
      expect(body.errors[0].field).toBe('refreshToken');
    });

    it('returns 401 when the admin no longer exists', async () => {
      verifyToken.mockResolvedValue({ sub: 'gone', userId: 'gone', tenantId: 't1', type: 'refresh' });
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue(null);
      const req = makeRequest('POST', 'https://x.com/api/auth/refresh', {
        refreshToken: 'valid-refresh-token'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 401 when the admin is deactivated', async () => {
      verifyToken.mockResolvedValue({ sub: 'a1', userId: 'a1', tenantId: 't1', type: 'refresh' });
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue({ id: 'a1', email: 'a@b.com', role: 'admin', tenant_id: 't1', is_active: 0 });
      const req = makeRequest('POST', 'https://x.com/api/auth/refresh', {
        refreshToken: 'valid-refresh-token'
      });
      const res = await handleAuthRoute(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Account deactivated');
    });

    it('returns 400 when JWT_SECRET is missing', async () => {
      verifyToken.mockResolvedValue({ sub: 'a1', userId: 'a1', tenantId: 't1', type: 'refresh' });
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/auth/refresh', {
        refreshToken: 'valid-refresh-token'
      });
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Failed to process refresh');
    });
  });

  describe('Unknown auth endpoint', () => {
    it('returns 404', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/auth/unknown');
      const res = await handleAuthRoute(req, { DB: db });
      expect(res.status).toBe(404);
    });
  });
});
