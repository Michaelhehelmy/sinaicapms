/**
 * Unit tests for tenant.js — Tenant resolution (getTenant lookup logic).
 * Uses mocked DB and Request objects.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTenant } from '../../backend/src/middleware/tenant.js';

// ─── Mock Helpers ────────────────────────────────────────────
function createMockDb(results = []) {
  const allMock = vi.fn().mockResolvedValue({ results });
  const bindMock = vi.fn().mockReturnValue({ all: allMock });
  const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
  return {
    DB: { prepare: prepareMock },
    _prepareMock: prepareMock,
    _bindMock: bindMock,
    _allMock: allMock,
  };
}

function createRequest(hostname, headers = {}, searchParams = '') {
  const url = `http://${hostname}/api/camps${searchParams}`;
  return new Request(url, {
    headers: {
      'Host': hostname,
      ...headers,
    },
  });
}

// ─── getTenant ───────────────────────────────────────────────
describe('getTenant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves tenant from x-tenant-id header', async () => {
    const { DB, _allMock } = createMockDb([{ id: 'tenant_abc' }]);
    const req = createRequest('localhost', { 'x-tenant-id': 'tenant_abc' });

    const tenantId = await getTenant(req, { DB });

    expect(tenantId).toBe('tenant_abc');
  });

  it('resolves tenant from query parameter tenant_id', async () => {
    const { DB } = createMockDb([{ id: 'tenant_xyz' }]);
    const req = createRequest('localhost', {}, '?tenant_id=tenant_xyz');

    const tenantId = await getTenant(req, { DB });

    expect(tenantId).toBe('tenant_xyz');
  });

  it('resolves tenant from hostname/subdomain', async () => {
    const { DB } = createMockDb([{ id: 'tenant_sub' }]);
    const req = createRequest('tenant_sub.sinaicamps.com');

    const tenantId = await getTenant(req, { DB });

    expect(tenantId).toBe('tenant_sub');
  });

  it('strips www. prefix from hostname before lookup', async () => {
    const { DB, _bindMock } = createMockDb([{ id: 'tenant_www' }]);
    // www.example.com → lookupKey should be "example.com" (www. stripped)
    const req = createRequest('www.example.com');

    const tenantId = await getTenant(req, { DB });

    expect(tenantId).toBe('tenant_www');
    // Verify the lookup key had www. stripped — it should be 'example.com', not 'www.example.com'
    const bindArgs = _bindMock.mock.calls[0];
    expect(bindArgs[0]).toBe('example.com');
  });

  it('returns null for localhost', async () => {
    const { DB } = createMockDb([{ id: 'tenant_local' }]);
    const req = createRequest('localhost');

    const tenantId = await getTenant(req, { DB });

    expect(tenantId).toBeNull();
  });

  it('returns null for 127.0.0.1', async () => {
    const { DB } = createMockDb([{ id: 'tenant_loopback' }]);
    const req = createRequest('127.0.0.1');

    const tenantId = await getTenant(req, { DB });

    expect(tenantId).toBeNull();
  });

  it('returns null when no tenant is found in DB', async () => {
    const { DB } = createMockDb([]); // empty results
    const req = createRequest('unknown.sinaicamps.com');

    const tenantId = await getTenant(req, { DB });

    expect(tenantId).toBeNull();
  });

  it('returns null when no query param, header, or valid hostname', async () => {
    const { DB } = createMockDb([]);
    // Use localhost hostname which returns null early in getTenant
    const req = createRequest('localhost');

    const tenantId = await getTenant(req, { DB });

    expect(tenantId).toBeNull();
  });

  it('queries DB with exact match (id, subdomain, custom_domain) on active tenants', async () => {
    const { DB, _prepareMock, _bindMock } = createMockDb([{ id: 'tenant_exact' }]);
    const req = createRequest('tenant_exact.sinaicamps.com', { 'x-tenant-id': 'tenant_exact' });

    await getTenant(req, { DB });

    // Verify the query uses exact match. H5 fix: the OR group is parenthesized
    // and restricted to status='active', so suspended tenants never resolve.
    const query = _prepareMock.mock.calls[0][0];
    expect(query).toContain('WHERE (id = ?');
    expect(query).toContain('subdomain = ?');
    expect(query).toContain('custom_domain = ?');
    expect(query).toContain("AND status = 'active'");
    expect(query).not.toContain('LIKE');
  });
});
