import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLeadsRoute } from '../src/api/leads.js';

function mockDb(firstResult = null, allResults = [], runResult = {}) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(firstResult),
        all: vi.fn().mockResolvedValue({ results: allResults }),
        run: vi.fn().mockResolvedValue(runResult),
      })),
    })),
  };
}

function makeReq(url, method = 'GET', body = null) {
  return {
    url,
    method,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

const tenantId = 'tenant_1';

describe('handleLeadsRoute', () => {
  describe('GET /api/leads', () => {
    it('returns leads with pagination', async () => {
      const leads = [{ id: 'lead_1', name: 'John' }];
      const db = mockDb(null, leads);
      const countDb = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [{ total: 1 }] }),
          })),
        })),
      };
      // Override: first call returns leads, second call returns count
      let callIdx = 0;
      db.prepare = vi.fn(() => ({
        bind: vi.fn(() => ({
          all: vi.fn().mockImplementation(() => {
            callIdx++;
            if (callIdx === 1) return Promise.resolve({ results: leads });
            return Promise.resolve({ results: [{ total: 1 }] });
          }),
          run: vi.fn().mockResolvedValue({}),
        })),
      }));

      const res = await handleLeadsRoute(makeReq('http://localhost/api/leads'), { DB: db }, tenantId);
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.data).toEqual(leads);
      expect(data.total).toBe(1);
    });

    it('filters by status', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) return Promise.resolve({ results: [] });
              return Promise.resolve({ results: [{ total: 0 }] });
            }),
          })),
        })),
      };
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads?status=new'), { DB: db }, tenantId
      );
      expect(res.status).toBe(200);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const res = await handleLeadsRoute(makeReq('http://localhost/api/leads'), { DB: db }, tenantId);
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to fetch leads');
    });
  });

  describe('POST /api/leads', () => {
    it('creates a lead successfully', async () => {
      const db = mockDb(null, [], {});
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads', 'POST', { name: 'Jane', email: 'jane@test.com', message: 'Hi' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toMatch(/^lead_/);
    });

    it('returns 400 for invalid input (missing name)', async () => {
      const db = mockDb();
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads', 'POST', { email: 'jane@test.com' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBeTruthy();
    });

    it('returns 400 for invalid email', async () => {
      const db = mockDb();
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads', 'POST', { name: 'Jane', email: 'not-an-email' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('handles DB errors on insert', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads', 'POST', { name: 'Jane', email: 'jane@test.com' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to submit lead');
    });
  });

  describe('PUT /api/leads/:id', () => {
    it('updates lead status', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ changes: 1 }),
          })),
        })),
      };
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads/lead_1', 'PUT', { status: 'contacted' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when lead not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ changes: 0 }),
          })),
        })),
      };
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads/lead_999', 'PUT', { status: 'new' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid status', async () => {
      const db = mockDb();
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads/lead_1', 'PUT', { status: 'invalid' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads/lead_1', 'PUT', { status: 'new' }),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to update lead');
    });
  });

  describe('DELETE /api/leads/:id', () => {
    it('deletes a lead', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ changes: 1 }),
          })),
        })),
      };
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads/lead_1', 'DELETE'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 404 when lead not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ changes: 0 }),
          })),
        })),
      };
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads/lead_999', 'DELETE'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(404);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads/lead_1', 'DELETE'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to delete lead');
    });
  });

  describe('fallback', () => {
    it('returns 404 for unsupported methods', async () => {
      const db = mockDb();
      const res = await handleLeadsRoute(
        makeReq('http://localhost/api/leads', 'PATCH'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Leads endpoint not found');
    });
  });
});
