import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenant, tenantMiddleware } from '../src/middleware/tenant.js';

function mockDb(results = []) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results }),
      }),
    }),
  };
}

function makeRequest(url, headers = {}) {
  const headerMap = {};
  for (const [k, v] of Object.entries(headers)) headerMap[k.toLowerCase()] = v;
  return {
    url,
    headers: {
      get: (name) => headerMap[name.toLowerCase()] || null,
    },
  };
}

describe('getTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves tenant from query param tenant_id', async () => {
    const db = mockDb([{ id: 'tenant_1' }]);
    const req = makeRequest('http://localhost/api/camps?tenant_id=tenant_1');
    const result = await getTenant(req, { DB: db });
    expect(result).toBe('tenant_1');
  });

  it('resolves tenant from x-tenant-id header', async () => {
    const db = mockDb([{ id: 'tenant_2' }]);
    const req = makeRequest('http://localhost/api/camps', { 'x-tenant-id': 'tenant_2' });
    const result = await getTenant(req, { DB: db });
    expect(result).toBe('tenant_2');
  });

  it('resolves tenant from hostname', async () => {
    const db = mockDb([{ id: 'tenant_3' }]);
    const req = makeRequest('http://camp3.sinaicamps.com/api/camps');
    const result = await getTenant(req, { DB: db });
    expect(result).toBe('tenant_3');
  });

  it('returns null for localhost', async () => {
    const db = mockDb([]);
    const req = makeRequest('http://localhost/api/camps');
    const result = await getTenant(req, { DB: db });
    expect(result).toBeNull();
  });

  it('returns null for 127.0.0.1', async () => {
    const db = mockDb([]);
    const req = makeRequest('http://127.0.0.1/api/camps');
    const result = await getTenant(req, { DB: db });
    expect(result).toBeNull();
  });

  it('returns null for 127', async () => {
    const db = mockDb([]);
    const req = makeRequest('http://127/api/camps');
    const result = await getTenant(req, { DB: db });
    expect(result).toBeNull();
  });

  it('strips www. prefix from hostname', async () => {
    const db = mockDb([{ id: 'tenant_1' }]);
    const req = makeRequest('http://www.camp1.sinaicamps.com/api/camps');
    const result = await getTenant(req, { DB: db });
    expect(result).toBe('tenant_1');
  });

  it('returns null when tenant not found in DB', async () => {
    const db = mockDb([]);
    const req = makeRequest('http://unknown.sinaicamps.com/api/camps');
    const result = await getTenant(req, { DB: db });
    expect(result).toBeNull();
  });

  it('query param takes precedence over header and hostname', async () => {
    const db = mockDb([{ id: 'from_query' }]);
    const req = makeRequest('http://other.sinaicamps.com/api/camps?tenant_id=from_query', { 'x-tenant-id': 'from_header' });
    const result = await getTenant(req, { DB: db });
    expect(result).toBe('from_query');
  });

  it('header takes precedence over hostname', async () => {
    const db = mockDb([{ id: 'from_header' }]);
    const req = makeRequest('http://other.sinaicamps.com/api/camps', { 'x-tenant-id': 'from_header' });
    const result = await getTenant(req, { DB: db });
    expect(result).toBe('from_header');
  });
});

describe('tenantMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets tenantId and calls next when tenant found', async () => {
    const db = mockDb([{ id: 'tenant_1' }]);
    const c = {
      req: {
        raw: makeRequest('http://localhost/api/camps?tenant_id=tenant_1'),
        path: '/api/camps',
      },
      env: { DB: db },
      set: vi.fn(),
    };
    const next = vi.fn();
    await tenantMiddleware(c, next);
    expect(c.set).toHaveBeenCalledWith('tenantId', 'tenant_1');
    expect(next).toHaveBeenCalled();
  });

  it('returns 404 when tenant not found for non-public paths', async () => {
    const db = mockDb([]);
    const c = {
      req: {
        raw: makeRequest('http://localhost/api/camps'),
        path: '/api/camps',
      },
      env: { DB: db },
      json: vi.fn().mockImplementation((body, status) => ({ status, body })),
    };
    const next = vi.fn();
    await tenantMiddleware(c, next);
    expect(c.json).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('allows /api/tenants paths without tenant', async () => {
    const db = mockDb([]);
    const c = {
      req: {
        raw: makeRequest('http://localhost/api/tenants'),
        path: '/api/tenants',
      },
      env: { DB: db },
      set: vi.fn(),
    };
    const next = vi.fn();
    await tenantMiddleware(c, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows /api/auth paths without tenant', async () => {
    const db = mockDb([]);
    const c = {
      req: {
        raw: makeRequest('http://localhost/api/auth/login'),
        path: '/api/auth/login',
      },
      env: { DB: db },
      set: vi.fn(),
    };
    const next = vi.fn();
    await tenantMiddleware(c, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows /admin paths without tenant', async () => {
    const db = mockDb([]);
    const c = {
      req: {
        raw: makeRequest('http://localhost/admin'),
        path: '/admin',
      },
      env: { DB: db },
      set: vi.fn(),
    };
    const next = vi.fn();
    await tenantMiddleware(c, next);
    expect(next).toHaveBeenCalled();
  });
});
