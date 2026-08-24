import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenant } from '../src/middleware/tenant.js';

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

  it('H5: only matches ACTIVE tenants (status filter in SQL, binds unchanged)', async () => {
    let sql = null;
    let bindArgs = null;
    const chain = {
      bind: vi.fn((...args) => {
        bindArgs = args;
        return { all: vi.fn().mockResolvedValue({ results: [{ id: 't1' }] }) };
      }),
    };
    const db = {
      prepare: vi.fn((s) => {
        sql = s;
        return chain;
      }),
    };
    const req = makeRequest('http://camp1.sinaicamps.com/api/camps');
    const result = await getTenant(req, { DB: db });
    expect(result).toBe('t1');
    expect(sql).toContain("status = 'active'");
    expect(sql).toMatch(/\(id = \? OR subdomain = \? OR custom_domain = \?\) AND status = 'active'/);
    expect(bindArgs).toEqual(['camp1.sinaicamps.com', 'camp1.sinaicamps.com', 'camp1.sinaicamps.com']);
  });

  it('H5: returns null when the tenant is suspended (filtered out by status)', async () => {
    const db = mockDb([]);
    const req = makeRequest('http://suspended.sinaicamps.com/api/camps');
    const result = await getTenant(req, { DB: db });
    expect(result).toBeNull();
  });
});
