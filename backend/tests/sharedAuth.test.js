import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  isValidEmail,
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  getUserById,
  authMiddleware,
  hasRolePermission,
  getAccessTtlSeconds,
  rehashIfNeeded,
} from '../src/middleware/sharedAuth.js';

vi.mock('@tsndr/cloudflare-worker-jwt', () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
    decode: vi.fn(),
  },
}));

import jwt from '@tsndr/cloudflare-worker-jwt';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeCtx({ auth = 'Bearer tok', env = { JWT_SECRET: 'secret' } } = {}) {
  return {
    req: { header: (name) => (name === 'Authorization' ? auth : null) },
    env,
    set: vi.fn(),
    json: vi.fn((body, status) => ({ status, body, ok: status < 400 })),
  };
}

function sha256Hex(plaintext) {
  return createHash('sha256').update(plaintext).digest('hex');
}

describe('sharedAuth', () => {
  describe('isValidEmail', () => {
    it('accepts valid emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('a.b+tag@sub.domain.co')).toBe(true);
    });

    it('rejects invalid emails', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
      expect(isValidEmail('user@')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });
  });

  describe('hashPassword', () => {
    it('returns a bcrypt hash', async () => {
      const hash = await hashPassword('mypassword');
      expect(hash).toMatch(/^\$2[aby]\$/);
    });

    it('different calls produce different hashes', async () => {
      const a = await hashPassword('mypassword');
      const b = await hashPassword('mypassword');
      expect(a).not.toBe(b);
    });
  });

  describe('verifyPassword', () => {
    it('verifies correct password against bcrypt hash', async () => {
      const hash = await hashPassword('mypassword');
      expect(await verifyPassword('mypassword', hash)).toBe(true);
    });

    it('rejects incorrect password against bcrypt hash', async () => {
      const hash = await hashPassword('mypassword');
      expect(await verifyPassword('wrongpassword', hash)).toBe(false);
    });

    it('returns false when no stored hash', async () => {
      expect(await verifyPassword('mypassword', null)).toBe(false);
      expect(await verifyPassword('mypassword', '')).toBe(false);
    });

    it('verifies legacy SHA-256 hash', async () => {
      expect(await verifyPassword('mypassword', `$sha256$${sha256Hex('mypassword')}`)).toBe(true);
    });

    it('rejects wrong password against legacy SHA-256 hash', async () => {
      expect(await verifyPassword('different', `$sha256$${sha256Hex('mypassword')}`)).toBe(false);
    });

    it('rejects SHA-256 hash with mismatched length', async () => {
      expect(await verifyPassword('mypassword', '$sha256$abc')).toBe(false);
    });
  });

  describe('generateToken', () => {
    it('signs an access token with default ttl', async () => {
      jwt.sign.mockResolvedValue('signed-jwt');
      const out = await generateToken({ sub: 'u1' }, 'secret');
      expect(out).toBe('signed-jwt');
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'u1', type: 'access' }),
        'secret',
        { algorithm: 'HS256' }
      );
    });

    it('signs a refresh token', async () => {
      jwt.sign.mockResolvedValue('signed-jwt');
      await generateToken({ sub: 'u1' }, 'secret', 'refresh');
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'refresh' }),
        'secret',
        { algorithm: 'HS256' }
      );
    });

    // ── Phase 5: token contract v2 (userType claims) ───────────
    it('derives userType "org" from the legacy posType claim', async () => {
      jwt.sign.mockResolvedValue('signed-jwt');
      await generateToken({ sub: 'u1', posType: 'pos' }, 'secret');
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ posType: 'pos', userType: 'org' }),
        'secret',
        { algorithm: 'HS256' }
      );
    });

    it('preserves an explicit userType claim and still emits legacy posType', async () => {
      jwt.sign.mockResolvedValue('signed-jwt');
      await generateToken({ sub: 'u1', posType: 'pos', userType: 'org' }, 'secret');
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ posType: 'pos', userType: 'org' }),
        'secret',
        { algorithm: 'HS256' }
      );
    });

    it('tags admin tokens as userType "platform" with no posType', async () => {
      jwt.sign.mockResolvedValue('signed-jwt');
      await generateToken({ sub: 'a1', role: 'admin' }, 'secret');
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload.userType).toBe('platform');
      expect(payload.posType).toBeUndefined();
    });
  });

  // ── Phase 5: env-configurable org access TTL ───────────────
  describe('getAccessTtlSeconds / POS_ACCESS_TTL_SECONDS', () => {
    const DAY = 24 * 60 * 60;

    it('defaults to 24h for org tokens when unset', () => {
      expect(getAccessTtlSeconds({}, { userType: 'org' })).toBe(DAY);
      expect(getAccessTtlSeconds({ POS_ACCESS_TTL_SECONDS: '' }, { posType: 'pos' })).toBe(DAY);
    });

    it('returns 24h for platform tokens regardless of config', () => {
      expect(getAccessTtlSeconds({ POS_ACCESS_TTL_SECONDS: '900' }, { userType: 'platform' })).toBe(DAY);
    });

    it('never shortens refresh tokens', () => {
      // generateToken applies the org TTL only to access tokens; refresh stays 7d.
      jwt.sign.mockResolvedValue('signed-jwt');
      return generateToken(
        { sub: 'u1', userType: 'org' },
        'secret',
        'refresh',
        { POS_ACCESS_TTL_SECONDS: '300' }
      ).then(() => {
        const payload = jwt.sign.mock.calls[0][0];
        expect(payload.exp - payload.iat).toBe(7 * DAY);
      });
    });

    it('applies the configured TTL to org access tokens via generateToken', async () => {
      jwt.sign.mockResolvedValue('signed-jwt');
      await generateToken(
        { sub: 'u1', userType: 'org' },
        'secret',
        'access',
        { POS_ACCESS_TTL_SECONDS: '900' }
      );
      const payload = jwt.sign.mock.calls[0][0];
      expect(payload.exp - payload.iat).toBe(900);
    });

    it('clamps below the 5-minute floor and above 24h', () => {
      expect(getAccessTtlSeconds({ POS_ACCESS_TTL_SECONDS: '10' }, { userType: 'org' })).toBe(5 * 60);
      expect(getAccessTtlSeconds({ POS_ACCESS_TTL_SECONDS: '99999999' }, { userType: 'org' })).toBe(DAY);
    });

    it('ignores invalid configured values (falls back to 24h)', () => {
      for (const bad of ['abc', '-500', '15.5', '0']) {
        expect(getAccessTtlSeconds({ POS_ACCESS_TTL_SECONDS: bad }, { userType: 'org' })).toBe(DAY);
      }
    });
  });

  describe('rehashIfNeeded table coverage (Phase 5)', () => {
    function mockEnv() {
      const run = vi.fn().mockResolvedValue({});
      const prepare = vi.fn().mockReturnValue({ bind: vi.fn().mockReturnThis(), run });
      return { env: { DB: { prepare } }, prepare, run };
    }

    it('upgrades pos_users rows when table option is passed', async () => {
      const { env, prepare, run } = mockEnv();
      const shaHash = '$sha256$' + sha256Hex('password123');
      const changed = await rehashIfNeeded('7', 'password123', shaHash, env, { table: 'pos_users' });
      expect(changed).toBe(true);
      expect(prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE pos_users'));
      expect(run).toHaveBeenCalled();
    });

    it('rejects unknown tables instead of silently updating the wrong store', async () => {
      const { env } = mockEnv();
      await expect(
        rehashIfNeeded('1', 'pw', '$sha256$abc', env, { table: 'sessions' })
      ).rejects.toThrow('unsupported user table');
    });
  });

  describe('verifyToken', () => {
    it('returns null when token or secret missing', async () => {
      expect(await verifyToken(null, 'secret')).toBeNull();
      expect(await verifyToken('tok', null)).toBeNull();
    });

    it('returns null when signature is invalid', async () => {
      jwt.verify.mockResolvedValue(false);
      expect(await verifyToken('tok', 'secret')).toBeNull();
    });

    it('returns null when decode yields no payload', async () => {
      jwt.verify.mockResolvedValue(true);
      jwt.decode.mockReturnValue({});
      expect(await verifyToken('tok', 'secret')).toBeNull();
    });

    it('returns null for expired token', async () => {
      jwt.verify.mockResolvedValue(true);
      jwt.decode.mockReturnValue({ payload: { exp: 1 } });
      expect(await verifyToken('tok', 'secret')).toBeNull();
    });

    it('returns payload for valid token', async () => {
      jwt.verify.mockResolvedValue(true);
      jwt.decode.mockReturnValue({ payload: { sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 } });
      const payload = await verifyToken('tok', 'secret');
      expect(payload).toEqual(expect.objectContaining({ sub: 'u1' }));
    });

    it('returns null when verify throws', async () => {
      jwt.verify.mockRejectedValue(new Error('bad'));
      expect(await verifyToken('tok', 'secret')).toBeNull();
    });
  });

  describe('getUserById', () => {
    it('returns the user row', async () => {
      const user = { id: 'u1', email: 'a@b.com' };
      const env = {
        DB: { prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue(user) }) }) },
      };
      expect(await getUserById('u1', env)).toEqual(user);
    });

    it('returns null on DB error', async () => {
      const env = { DB: { prepare: () => { throw new Error('DB boom'); } } };
      expect(await getUserById('u1', env)).toBeNull();
    });
  });

  describe('authMiddleware', () => {
    it('returns 401 when Authorization header missing', async () => {
      const c = makeCtx({ auth: null });
      const res = await authMiddleware(c, vi.fn());
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Unauthorized');
    });

    it('returns 401 when token is invalid', async () => {
      jwt.verify.mockResolvedValue(false);
      const c = makeCtx();
      const res = await authMiddleware(c, vi.fn());
      expect(res.status).toBe(401);
    });

    it('returns 401 when payload missing role claim', async () => {
      jwt.verify.mockResolvedValue(true);
      jwt.decode.mockReturnValue({ payload: { sub: 'u1' } });
      const c = makeCtx();
      const res = await authMiddleware(c, vi.fn());
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('role claim');
    });

    it('returns 403 for POS sessions', async () => {
      jwt.verify.mockResolvedValue(true);
      jwt.decode.mockReturnValue({ payload: { sub: 'u1', role: 'cashier', posType: 'pos' } });
      const c = makeCtx();
      const res = await authMiddleware(c, vi.fn());
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('POS');
    });

    it('returns 401 when account is deactivated', async () => {
      jwt.verify.mockResolvedValue(true);
      jwt.decode.mockReturnValue({ payload: { sub: 'u1', role: 'admin' } });
      const c = makeCtx();
      c.env.DB = {
        prepare: vi.fn().mockReturnValue({ bind: vi.fn().mockReturnValue({ first: vi.fn().mockResolvedValue({ id: 'u1', is_active: 0 }) }) }),
      };
      const res = await authMiddleware(c, vi.fn());
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('deactivated');
    });

    it('sets user and calls next on success', async () => {
      jwt.verify.mockResolvedValue(true);
      jwt.decode.mockReturnValue({ payload: { sub: 'u1', role: 'admin', tenantId: 't1' } });
      const next = vi.fn();
      const c = makeCtx();
      c.env.DB = {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({
              id: 'u1', email: 'a@b.com', first_name: 'Ann', last_name: null,
              role: 'admin', is_active: 1, tenant_id: 't1', last_login: null, created_at: null, updated_at: null,
            }),
          }),
        }),
      };
      await authMiddleware(c, next);
      expect(next).toHaveBeenCalled();
      expect(c.set).toHaveBeenCalledWith('user', expect.objectContaining({ id: 'u1', email: 'a@b.com', role: 'admin', tenantId: 't1' }));
    });

    it('throws when JWT_SECRET is missing', async () => {
      const c = makeCtx({ env: {} });
      await expect(authMiddleware(c, vi.fn())).rejects.toThrow('JWT_SECRET is not configured');
    });
  });

  describe('hasRolePermission', () => {
    it('allows super_admin to access admin routes', () => {
      expect(hasRolePermission('super_admin', 'admin')).toBe(true);
      expect(hasRolePermission('super_admin', 'super_admin')).toBe(true);
    });

    it('denies admin for super_admin routes', () => {
      expect(hasRolePermission('admin', 'super_admin')).toBe(false);
    });

    it('handles unknown roles with level 0', () => {
      expect(hasRolePermission('nobody', 'admin')).toBe(false);
      expect(hasRolePermission('nobody', 'nobody')).toBe(true);
      expect(hasRolePermission('admin', 'nobody')).toBe(true);
    });
  });
});
