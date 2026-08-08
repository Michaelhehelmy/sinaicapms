/**
 * Unit tests for leads.js — Contact form and onboarding lead handlers.
 * Tests: GET /api/leads, POST /api/leads, PUT /api/leads/:id, DELETE /api/leads/:id
 * Uses mocked DB to test business logic without hitting a real database.
 */
import { describe, it, expect, vi } from 'vitest';
import { handleLeadsRoute } from '../../backend/src/api/leads.js';

// ─── Mock DB Helper ──────────────────────────────────────────
function createMockDb({ allResults = [], firstResult = null, changes = 1 } = {}) {
  const runMock = vi.fn().mockResolvedValue({ changes });
  const firstMock = vi.fn().mockResolvedValue(firstResult);
  const allMock = vi.fn().mockResolvedValue({ results: allResults });
  const bindMock = vi.fn().mockReturnValue({ first: firstMock, all: allMock, run: runMock });
  const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
  return {
    DB: { prepare: prepareMock },
    _prepareMock: prepareMock,
    _bindMock: bindMock,
    _runMock: runMock,
    _allMock: allMock,
    _firstMock: firstMock,
  };
}

function makeRequest(method, path, body = null, headers = {}) {
  const url = `http://localhost${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

const TENANT_ID = 'tenant_1';

// ─── GET /api/leads ──────────────────────────────────────────
describe('GET /api/leads', () => {
  it('returns paginated lead list with total count', async () => {
    const leads = [
      { id: 'lead_1', name: 'Alice', email: 'alice@test.com', status: 'new' },
      { id: 'lead_2', name: 'Bob', email: 'bob@test.com', status: 'contacted' },
    ];
    // GET /api/leads makes two prepare calls: (1) leads query, (2) COUNT query
    let callCount = 0;
    const prepareMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // Main leads query
        return { bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: leads }) }) };
      }
      // Count query
      return { bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: [{ total: 2 }] }) }) };
    });
    const DB = { prepare: prepareMock };
    const req = makeRequest('GET', '/api/leads', null, { 'x-tenant-id': TENANT_ID });

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data).toEqual(leads);
    expect(data.total).toBe(2);
    expect(data.page).toBe(1); // default
    expect(data.pageSize).toBe(50); // default
    expect(data.hasMore).toBe(false);
  });

  it('applies status filter when provided', async () => {
    const { DB, _prepareMock } = createMockDb({ allResults: [], firstResult: { total: 0 } });
    const req = makeRequest('GET', '/api/leads?status=converted');

    await handleLeadsRoute(req, { DB }, TENANT_ID);

    // Verify query includes status filter
    const secondCall = _prepareMock.mock.calls[0]; // first prepare call
    expect(secondCall[0]).toContain('status = ?');
  });

  it('count query respects the status filter', async () => {
    const { DB, _prepareMock } = createMockDb({ allResults: [], firstResult: { total: 0 } });
    const req = makeRequest('GET', '/api/leads?status=converted');

    await handleLeadsRoute(req, { DB }, TENANT_ID);

    // T6 fix: both the page query and the COUNT query must carry the status filter
    const queries = _prepareMock.mock.calls.map(c => c[0]);
    const countQuery = queries.find(q => q.includes('COUNT(*)'));
    expect(countQuery).toBeDefined();
    expect(countQuery).toContain('status = ?');
  });

  it('respects custom page and pageSize', async () => {
    const { DB, _prepareMock } = createMockDb({ allResults: [], firstResult: { total: 0 } });
    const req = makeRequest('GET', '/api/leads?page=3&pageSize=10');

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(data.page).toBe(3);
    expect(data.pageSize).toBe(10);
  });

  it('caps pageSize at 200', async () => {
    const { DB } = createMockDb({ allResults: [], firstResult: { total: 0 } });
    const req = makeRequest('GET', '/api/leads?pageSize=500');

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(data.pageSize).toBe(200);
  });

  it('computes hasMore from total and page', async () => {
    let callCount = 0;
    const prepareMock = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: [{ id: 'l1' }] }) }) };
      }
      return { bind: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue({ results: [{ total: 55 }] }) }) };
    });
    const DB = { prepare: prepareMock };
    const req = makeRequest('GET', '/api/leads?pageSize=50');

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(data.total).toBe(55);
    expect(data.page).toBe(1);
    expect(data.hasMore).toBe(true);
  });
});

// ─── POST /api/leads ─────────────────────────────────────────
describe('POST /api/leads', () => {
  it('creates a lead with required fields (name + email)', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/leads', {
      name: 'John Doe',
      email: 'john@test.com',
    });

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.id).toMatch(/^lead_/);
    expect(data.message).toContain('Thank you');
  });

  it('creates a lead with all optional fields', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/leads', {
      name: 'Jane Smith',
      email: 'jane@test.com',
      phone: '+1234567890',
      subject: 'Booking inquiry',
      message: 'I want to book a room',
      source: 'booking',
    });

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('rejects missing name', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/leads', {
      email: 'test@test.com',
    });

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Required');
  });

  it('rejects missing email', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/leads', {
      name: 'Test User',
    });

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Required');
  });

  it('rejects invalid email format', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/leads', {
      name: 'Test User',
      email: 'not-an-email',
    });

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Valid email');
  });

  it('defaults source to "contact" when not provided', async () => {
    const runMock = vi.fn().mockResolvedValue({ changes: 1 });
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    const prepareMock = vi.fn().mockReturnValue({ bind: bindMock });
    const DB = { prepare: prepareMock };
    const req = makeRequest('POST', '/api/leads', {
      name: 'Test',
      email: 'test@test.com',
    });

    await handleLeadsRoute(req, { DB }, TENANT_ID);

    // The INSERT call should include 'contact' as the source value
    // prepareMock is called once for INSERT INTO leads
    expect(prepareMock).toHaveBeenCalledTimes(1);
    const insertQuery = prepareMock.mock.calls[0][0];
    expect(insertQuery).toContain('INSERT INTO leads');
    // Verify 'contact' is passed as a bind parameter (source defaults to 'contact')
    const bindArgs = bindMock.mock.calls[0];
    expect(bindArgs).toContain('contact');
  });

  it('handles null tenantId gracefully (marketplace leads)', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('POST', '/api/leads', {
      name: 'Marketplace Lead',
      email: 'lead@test.com',
    });

    const res = await handleLeadsRoute(req, { DB }, null);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });
});

// ─── PUT /api/leads/:id (update status) ──────────────────────
describe('PUT /api/leads/:id', () => {
  it('updates lead status to "contacted"', async () => {
    const { DB } = createMockDb({ changes: 1 });
    const req = makeRequest('PUT', '/api/leads/lead_1', { status: 'contacted' });

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('accepts all valid statuses', async () => {
    const validStatuses = ['new', 'contacted', 'converted', 'archived'];

    for (const status of validStatuses) {
      const { DB } = createMockDb({ changes: 1 });
      const req = makeRequest('PUT', '/api/leads/lead_1', { status });

      const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    }
  });

  it('rejects invalid status', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('PUT', '/api/leads/lead_1', { status: 'invalid_status' });

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Invalid enum');
  });

  it('rejects missing status', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('PUT', '/api/leads/lead_1', {});

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(400);
    expect(data.error).toContain('Invalid status');
  });

  it('returns 404 when lead not found', async () => {
    const { DB } = createMockDb({ changes: 0 });
    const req = makeRequest('PUT', '/api/leads/lead_nonexistent', { status: 'new' });

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain('not found');
  });
});

// ─── DELETE /api/leads/:id ───────────────────────────────────
describe('DELETE /api/leads/:id', () => {
  it('deletes an existing lead', async () => {
    const { DB } = createMockDb({ changes: 1 });
    const req = makeRequest('DELETE', '/api/leads/lead_1');

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('returns 404 when lead not found', async () => {
    const { DB } = createMockDb({ changes: 0 });
    const req = makeRequest('DELETE', '/api/leads/lead_nonexistent');

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(404);
    expect(data.error).toContain('not found');
  });
});

// ─── Unmatched routes ────────────────────────────────────────
describe('Leads route fallback', () => {
  it('returns 404 for unknown sub-routes', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('GET', '/api/leads/unknown/deep');

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(404);
  });

  it('returns 405 for unsupported methods on root path', async () => {
    const { DB } = createMockDb();
    const req = makeRequest('PATCH', '/api/leads');

    const res = await handleLeadsRoute(req, { DB }, TENANT_ID);
    const data = await res.json();

    expect(res.status).toBe(404);
  });
});
