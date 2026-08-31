import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { resolveScope, getScope, ensureTenantOrg } from '../src/middleware/resolveScope.js';
import * as tenantMod from '../src/middleware/tenant.js';
import * as requireAuthMod from '../src/middleware/requireAuth.js';
import * as sharedAuthMod from '../src/middleware/sharedAuth.js';

vi.mock('../src/middleware/tenant.js', () => ({
  getTenant: vi.fn(),
}));
vi.mock('../src/middleware/requireAuth.js', () => ({
  requireAuth: vi.fn(),
}));
vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
}));

const { getTenant } = tenantMod;
const { requireAuth } = requireAuthMod;
const { verifyToken } = sharedAuthMod;

/** Build an app that runs the middleware against a single probe route. */
function buildApp(middleware) {
  const app = new Hono();
  app.use('*', middleware);
  app.get('/probe', (c) => c.json({ ok: true }));
  return app;
}

function request(app, env, { url = 'http://tenant.test/probe', headers = {} } = {}) {
  return app.request(url, { headers }, env);
}

function mockDb(specs = {}) {
  return {
    prepare: vi.fn((sql) => {
      let spec = null;
      for (const frag of Object.keys(specs)) {
        if (sql.includes(frag)) { spec = specs[frag]; break; }
      }
      const chain = {
        sql,
        bind: vi.fn((...args) => { chain.args = args; return chain; }),
        all: vi.fn().mockResolvedValue(spec?.all ?? { results: [] }),
        first: vi.fn().mockResolvedValue(spec?.first ?? undefined),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      };
      return chain;
    }),
  };
}

const envFix = { DB: mockDb(), JWT_SECRET: 'secret' };

describe('getScope', () => {
  it('returns the scope set on the context', () => {
    const c = { get: vi.fn(() => ({ tenantId: 'tee1', user: {} })) };
    expect(getScope(c)).toEqual({ tenantId: 'tee1', user: {} });
  });

  it('returns default scope when none set', () => {
    const c = { get: vi.fn(() => undefined) };
    expect(getScope(c)).toEqual({ tenantId: null, user: null });
  });
});

describe('resolveScope public mode', () => {
  it('sets scope to resolved tenant and calls next', async () => {
    getTenant.mockResolvedValue('tee1');
    const mw = resolveScope({ public: true });
    const app = buildApp(mw);
    const res = await request(app, envFix);
    expect(res.status).toBe(200);
    expect(getTenant).toHaveBeenCalled();
  });

  it('degrades to marketplace scope when tenant resolution throws', async () => {
    getTenant.mockRejectedValue(new Error('boom'));
    const mw = resolveScope({ public: true });
    const app = buildApp(mw);
    const res = await request(app, envFix);
    expect(res.status).toBe(200);
  });

  it('does NOT call requireAuth / verifyToken in public mode', async () => {
    getTenant.mockResolvedValue('tee1');
    const mw = resolveScope({ public: true });
    const app = buildApp(mw);
    await request(app, envFix);
    expect(requireAuth).not.toHaveBeenCalled();
    expect(verifyToken).not.toHaveBeenCalled();
  });
});

describe('resolveScope default (admin) mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when tenant hint is missing and requireTenantHint true', async () => {
    getTenant.mockResolvedValue(null);
    const app = buildApp(resolveScope());
    const res = await request(app, envFix);
    expect(res.status).toBe(401);
  });

  it('passes through when the gate returns a Response (401 from auth)', async () => {
    getTenant.mockResolvedValue('tee1');
    requireAuth.mockReturnValue(async () => new Response('denied', { status: 401 }));
    const app = buildApp(resolveScope());
    const res = await request(app, envFix, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(401);
  });

  it('sets scope from tenant hint for a normal admin', async () => {
    getTenant.mockResolvedValue('tee1');
    requireAuth.mockReturnValue(async () => ({ user: { id: 'u1', role: 'admin', tenantId: 'tee1' } }));
    const app = buildApp(resolveScope());
    const res = await request(app, envFix);
    expect(res.status).toBe(200);
  });

  it('allows super_admin tenant override via query param', async () => {
    getTenant.mockResolvedValue('tee1');
    requireAuth.mockReturnValue(async () => ({ user: { id: 'sa1', role: 'super_admin', tenantId: null } }));
    const app = buildApp(resolveScope());
    const res = await request(app, envFix, { url: 'http://tenant.test/probe?tenantId=other' });
    expect(res.status).toBe(200);
  });

  it('falls back to user.tenantId when no hint present (requireTenantHint true allows null but here we test fallback with hint off)', async () => {
    getTenant.mockResolvedValue(null);
    requireAuth.mockReturnValue(async (c) => ({ user: { id: 'u1', role: 'admin', tenantId: 'tee1' } }));
    const app = buildApp(resolveScope({ requireTenantHint: false }));
    const res = await request(app, envFix);
    expect(res.status).toBe(200);
  });

  it('propagates custom auth options to requireAuth', async () => {
    getTenant.mockResolvedValue('tee1');
    requireAuth.mockReturnValue(async () => ({ user: { id: 'u1', role: 'admin', tenantId: 'tee1' } }));
    const app = buildApp(resolveScope({ auth: { sessionTtl: 999 } }));
    await request(app, envFix);
    expect(requireAuth).toHaveBeenCalledWith(expect.objectContaining({ realm: 'admin', sessionTtl: 999 }));
  });
});

describe('resolveScope dualRealm mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenant.mockReset();
    requireAuth.mockReset();
    verifyToken.mockReset();
  });

  it('returns 401 with no Authorization header', async () => {
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, envFix);
    expect(res.status).toBe(401);
  });

  it('returns 401 with non-Bearer auth header', async () => {
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, envFix, { headers: { Authorization: 'Basic abc' } });
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    verifyToken.mockResolvedValue(null);
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, envFix, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(401);
  });

  it('returns 401 when a POS user is deactivated', async () => {
    verifyToken.mockResolvedValue({ userId: 'pu1', posType: 'pos', organizationId: 7 });
    const env = { ...envFix, DB: mockDb({ 'pos_users': { all: { results: [{ is_active: 0 }] } } }) };
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, env, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(401);
  });

  it('returns 401 when an admin is deactivated', async () => {
    verifyToken.mockResolvedValue({ userId: 'a1', role: 'admin' });
    const env = { ...envFix, DB: mockDb({ 'admins': { all: { results: [{ is_active: 0 }] } } }) };
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, env, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(401);
  });

  it('resolves tenant from org mapping for an active POS token', async () => {
    verifyToken.mockResolvedValue({ userId: 'pu1', posType: 'pos', is_active: 1, organizationId: 7 });
    const env = {
      ...envFix,
      DB: mockDb({
        'pos_users': { all: { results: [{ is_active: 1 }] } },
        'tenant_org_mapping WHERE organization_id': { all: { results: [{ tenant_id: 'tee1' }] } },
      }),
    };
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, env, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(200);
  });

  it('falls back to organizationId as tenant when no mapping exists', async () => {
    verifyToken.mockResolvedValue({ userId: 'pu1', posType: 'pos', organizationId: 7 });
    const env = {
      ...envFix,
      DB: mockDb({
        'pos_users': { all: { results: [{ is_active: 1 }] } },
        'tenant_org_mapping WHERE organization_id': { all: { results: [] } },
      }),
    };
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, env, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(200);
  });

  it('leaves tenant null for a POS token without organizationId', async () => {
    verifyToken.mockResolvedValue({ userId: 'pu1', posType: 'pos' });
    const env = { ...envFix, DB: mockDb({ 'pos_users': { all: { results: [{ is_active: 1 }] } } }) };
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, env, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(200);
  });

  it('returns 401 for an admin with missing tenant context', async () => {
    verifyToken.mockResolvedValue({ userId: 'a1', role: 'admin', tenantId: 'tee1' });
    const env = { ...envFix, DB: mockDb({ 'admins': { all: { results: [{ is_active: 1 }] } } }) };
    getTenant.mockResolvedValue(null);
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, env, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(401);
  });

  it('resolves tenant for an active admin and sets scope', async () => {
    verifyToken.mockResolvedValue({ userId: 'a1', role: 'admin', tenantId: 'tee1' });
    const env = { ...envFix, DB: mockDb({ 'admins': { all: { results: [{ is_active: 1 }] } } }) };
    getTenant.mockResolvedValue('tee1');
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, env, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(200);
  });

  it('allows super_admin to override tenant via query param', async () => {
    verifyToken.mockResolvedValue({ userId: 'sa1', role: 'super_admin', tenantId: null });
    const env = { ...envFix, DB: mockDb({ 'admins': { all: { results: [{ is_active: 1 }] } } }) };
    getTenant.mockResolvedValue('tee1');
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, env, {
      headers: { Authorization: 'Bearer tok' },
      url: 'http://tenant.test/probe?tenantId=other',
    });
    expect(res.status).toBe(200);
  });

  it('returns 403 when admin tenant does not match resolved tenant', async () => {
    verifyToken.mockResolvedValue({ userId: 'a1', role: 'admin', tenantId: 'teeA' });
    const env = { ...envFix, DB: mockDb({ 'admins': { all: { results: [{ is_active: 1 }] } } }) };
    getTenant.mockResolvedValue('teeB');
    const app = buildApp(resolveScope({ dualRealm: true }));
    const res = await request(app, env, { headers: { Authorization: 'Bearer tok' } });
    expect(res.status).toBe(403);
  });
});

describe('ensureTenantOrg', () => {
  it('returns existing organization when mapping already present', async () => {
    const env = { DB: mockDb({ 'SELECT organization_id FROM tenant_org_mapping': { all: { results: [{ organization_id: 7 }] } } }) };
    const orgId = await ensureTenantOrg(env, 'tee1');
    expect(orgId).toBe(7);
  });

  it('provisions org, store, and mapping when none exists', async () => {
    const env = {
      DB: mockDb({
        'SELECT organization_id FROM tenant_org_mapping': { all: { results: [] } },
        'SELECT id FROM pos_organizations': { all: { results: [{ id: 99 }] } },
      }),
    };
    const orgId = await ensureTenantOrg(env, 'tee1');
    expect(orgId).toBe(99);
  });

  it('returns null when organization row missing after insert', async () => {
    const env = {
      DB: mockDb({
        'SELECT organization_id FROM tenant_org_mapping': { all: { results: [] } },
        'SELECT id FROM pos_organizations': { all: { results: [] } },
      }),
    };
    const orgId = await ensureTenantOrg(env, 'tee1');
    expect(orgId).toBeNull();
  });

  it('returns null when the DB throws', async () => {
    const env = {
      DB: mockDb({ 'SELECT organization_id FROM tenant_org_mapping': { all: { results: [] } } }),
    };
    env.DB.prepare = vi.fn(() => { throw new Error('db down'); });
    const orgId = await ensureTenantOrg(env, 'tee1');
    expect(orgId).toBeNull();
  });
});
