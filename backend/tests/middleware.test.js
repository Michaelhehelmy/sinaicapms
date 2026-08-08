import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hasRolePermission,
  extractToken,
  rehashIfNeeded,
  getUserById,
  USER_ROLES,
  ROLE_HIERARCHY,
} from '../src/middleware/sharedAuth.js';

// ─── hasRolePermission ─────────────────────────────────────
describe('hasRolePermission', () => {
  it('super_admin has admin-level permissions', () => {
    expect(hasRolePermission('super_admin', 'admin')).toBe(true);
  });

  it('super_admin has super_admin-level permissions', () => {
    expect(hasRolePermission('super_admin', 'super_admin')).toBe(true);
  });

  it('admin does NOT have super_admin-level permissions', () => {
    expect(hasRolePermission('admin', 'super_admin')).toBe(false);
  });

  it('admin has admin-level permissions', () => {
    expect(hasRolePermission('admin', 'admin')).toBe(true);
  });

  it('unknown role has no permissions', () => {
    expect(hasRolePermission('unknown', 'admin')).toBe(false);
  });

  it('returns false for unknown required role', () => {
    expect(hasRolePermission('admin', 'unknown')).toBe(true);
  });
});

// ─── USER_ROLES & ROLE_HIERARCHY ───────────────────────────
describe('USER_ROLES', () => {
  it('defines SUPER_ADMIN and ADMIN', () => {
    expect(USER_ROLES.SUPER_ADMIN).toBe('super_admin');
    expect(USER_ROLES.ADMIN).toBe('admin');
  });
});

describe('ROLE_HIERARCHY', () => {
  it('super_admin has higher level than admin', () => {
    expect(ROLE_HIERARCHY[USER_ROLES.SUPER_ADMIN]).toBeGreaterThan(ROLE_HIERARCHY[USER_ROLES.ADMIN]);
  });
});

// ─── extractToken ──────────────────────────────────────────
describe('extractToken', () => {
  it('extracts token from Bearer header', () => {
    const req = { headers: { get: (name) => name === 'Authorization' ? 'Bearer my-token-123' : null } };
    expect(extractToken(req)).toBe('my-token-123');
  });

  it('returns null when no Authorization header', () => {
    const req = { headers: { get: () => null } };
    expect(extractToken(req)).toBeNull();
  });

  it('returns null when header does not start with Bearer', () => {
    const req = { headers: { get: () => 'Basic abc123' } };
    expect(extractToken(req)).toBeNull();
  });

  it('returns null for empty header', () => {
    const req = { headers: { get: () => '' } };
    expect(extractToken(req)).toBeNull();
  });
});

// ─── rehashIfNeeded ────────────────────────────────────────
describe('rehashIfNeeded', () => {
  it('rehashes SHA-256 password to bcrypt', async () => {
    const mockRun = vi.fn().mockResolvedValue({});
    const mockBind = vi.fn().mockReturnValue({ run: mockRun });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    const env = { DB: { prepare: mockPrepare } };

    // SHA-256 hash of "password123"
    const shaHash = '$sha256$' + 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f';
    await rehashIfNeeded('admin_1', 'password123', shaHash, env);

    expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE admins'));
    expect(mockRun).toHaveBeenCalled();
  });

  it('does nothing for bcrypt passwords', async () => {
    const mockPrepare = vi.fn();
    const env = { DB: { prepare: mockPrepare } };

    await rehashIfNeeded('admin_1', 'password', '$2b$12$abcdefghijklmnopqrstuuABCDE', env);

    expect(mockPrepare).not.toHaveBeenCalled();
  });

  it('does nothing for empty/null hash', async () => {
    const mockPrepare = vi.fn();
    const env = { DB: { prepare: mockPrepare } };

    await rehashIfNeeded('admin_1', 'password', '', env);
    await rehashIfNeeded('admin_1', 'password', null, env);

    expect(mockPrepare).not.toHaveBeenCalled();
  });
});

// ─── getUserById ───────────────────────────────────────────
describe('getUserById', () => {
  it('returns user when found', async () => {
    const user = { id: 'admin_1', email: 'admin@test.com' };
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(user),
          }),
        }),
      },
    };
    const result = await getUserById('admin_1', env);
    expect(result).toEqual(user);
  });

  it('returns null when not found', async () => {
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
        }),
      },
    };
    const result = await getUserById('admin_999', env);
    expect(result).toBeNull();
  });

  it('returns null on DB error', async () => {
    const env = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockRejectedValue(new Error('DB fail')),
          }),
        }),
      },
    };
    const result = await getUserById('admin_1', env);
    expect(result).toBeNull();
  });
});

// ─── authMiddleware (Hono context) ────────────────────────
describe('authMiddleware', () => {
  let authMiddleware;

  beforeEach(async () => {
    const mod = await import('../src/middleware/sharedAuth.js');
    authMiddleware = mod.authMiddleware;
  });

  function makeHonoContext(headers = {}) {
    const headerMap = {};
    for (const [k, v] of Object.entries(headers)) {
      headerMap[k.toLowerCase()] = v;
    }
    return {
      req: {
        header: (name) => headerMap[name.toLowerCase()] || null,
      },
      env: {
        JWT_SECRET: 'test-secret',
        DB: {
          prepare: vi.fn().mockReturnValue({
            bind: vi.fn().mockReturnValue({
              first: vi.fn().mockResolvedValue({
                id: 'admin_1', email: 'admin@test.com',
                first_name: 'Admin', last_name: 'User',
                role: 'admin', is_active: 1, tenant_id: 't1',
                last_login: null, created_at: '2026-01-01',
              }),
            }),
          }),
        },
      },
      json: vi.fn().mockImplementation((body, status) => {
        return { status, body, ok: status >= 200 && status < 300 };
      }),
      set: vi.fn(),
    };
  }

  it('returns 401 when no Authorization header', async () => {
    const c = makeHonoContext({});
    const next = vi.fn();
    const res = await authMiddleware(c, next);
    expect(res.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for invalid token', async () => {
    const c = makeHonoContext({ authorization: 'Bearer invalid-token' });
    const next = vi.fn();
    const res = await authMiddleware(c, next);
    expect(res.status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when token has no role', async () => {
    // Import to generate a real token without role
    const { generateToken } = await import('../src/middleware/sharedAuth.js');
    const token = await generateToken({ sub: 'admin_1', userId: 'admin_1' }, 'test-secret');
    const c = makeHonoContext({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    const res = await authMiddleware(c, next);
    expect(res.status).toBe(401);
  });

  it('returns 401 when user is deactivated', async () => {
    const { generateToken } = await import('../src/middleware/sharedAuth.js');
    const token = await generateToken(
      { sub: 'admin_1', userId: 'admin_1', role: 'admin', tenantId: 't1' },
      'test-secret'
    );
    const c = makeHonoContext({ authorization: `Bearer ${token}` });
    // Override DB to return deactivated user
    c.env.DB.prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({
          id: 'admin_1', email: 'admin@test.com',
          first_name: 'Admin', last_name: 'User',
          role: 'admin', is_active: 0, tenant_id: 't1',
        }),
      }),
    });
    const next = vi.fn();
    const res = await authMiddleware(c, next);
    expect(res.status).toBe(401);
  });

  it('returns 401 when user not found in DB', async () => {
    const { generateToken } = await import('../src/middleware/sharedAuth.js');
    const token = await generateToken(
      { sub: 'admin_999', userId: 'admin_999', role: 'admin', tenantId: 't1' },
      'test-secret'
    );
    const c = makeHonoContext({ authorization: `Bearer ${token}` });
    c.env.DB.prepare = vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(null),
      }),
    });
    const next = vi.fn();
    const res = await authMiddleware(c, next);
    expect(res.status).toBe(401);
  });

  it('calls next and sets user on valid token', async () => {
    const { generateToken } = await import('../src/middleware/sharedAuth.js');
    const token = await generateToken(
      { sub: 'admin_1', userId: 'admin_1', role: 'admin', tenantId: 't1' },
      'test-secret'
    );
    const c = makeHonoContext({ authorization: `Bearer ${token}` });
    const next = vi.fn();
    await authMiddleware(c, next);
    expect(next).toHaveBeenCalled();
    expect(c.set).toHaveBeenCalledWith('user', expect.objectContaining({
      id: 'admin_1',
      role: 'admin',
    }));
  });
});
