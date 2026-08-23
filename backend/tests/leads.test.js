import { describe, it, expect, vi, beforeEach } from 'vitest';
import leadsRoutes from '../src/api/leads.js';
import { mountRouter } from './helpers/routerHarness.js';

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

const tenantId = 'tenant_1';

describe('leadsRoutes', () => {
  let env;
  let app;

  const request = (method, url, body = null) => {
    const opts = { method };
    if (body) opts.body = JSON.stringify(body);
    return app.request(url, opts, env);
  };

  beforeEach(() => {
    env = {};
    app = mountRouter(leadsRoutes, { tenantId, basePath: '/api/leads' });
  });

  describe('GET /api/leads', () => {
    it('returns leads with pagination', async () => {
      const leads = [{ id: 'lead_1', name: 'John' }];
      // Override: first call returns leads, second call returns count
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              if (callIdx === 1) return Promise.resolve({ results: leads });
              return Promise.resolve({ results: [{ total: 1 }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env.DB = db;

      const res = await request('GET', 'http://localhost/api/leads');
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
      env.DB = db;
      const res = await request('GET', 'http://localhost/api/leads?status=new');
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
      env.DB = db;
      const res = await request('GET', 'http://localhost/api/leads');
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to fetch leads');
    });
  });

  describe('POST /api/leads', () => {
    it('creates a lead successfully', async () => {
      const db = mockDb(null, [], {});
      env.DB = db;
      const res = await request('POST', 'http://localhost/api/leads', { name: 'Jane', email: 'jane@test.com', message: 'Hi' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toMatch(/^lead_/);
    });

    it('returns 400 for invalid input (missing name)', async () => {
      const db = mockDb();
      env.DB = db;
      const res = await request('POST', 'http://localhost/api/leads', { email: 'jane@test.com' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBeTruthy();
    });

    it('returns 400 for invalid email', async () => {
      const db = mockDb();
      env.DB = db;
      const res = await request('POST', 'http://localhost/api/leads', { name: 'Jane', email: 'not-an-email' });
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
      env.DB = db;
      const res = await request('POST', 'http://localhost/api/leads', { name: 'Jane', email: 'jane@test.com' });
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
      env.DB = db;
      const res = await request('PUT', 'http://localhost/api/leads/lead_1', { status: 'contacted' });
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
      env.DB = db;
      const res = await request('PUT', 'http://localhost/api/leads/lead_999', { status: 'new' });
      const data = await res.json();
      expect(res.status).toBe(404);
    });

    it('returns 400 for invalid status', async () => {
      const db = mockDb();
      env.DB = db;
      const res = await request('PUT', 'http://localhost/api/leads/lead_1', { status: 'invalid' });
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
      env.DB = db;
      const res = await request('PUT', 'http://localhost/api/leads/lead_1', { status: 'new' });
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
      env.DB = db;
      const res = await request('DELETE', 'http://localhost/api/leads/lead_1');
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
      env.DB = db;
      const res = await request('DELETE', 'http://localhost/api/leads/lead_999');
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
      env.DB = db;
      const res = await request('DELETE', 'http://localhost/api/leads/lead_1');
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to delete lead');
    });
  });

  describe('fallback', () => {
    it('returns 404 for unsupported methods', async () => {
      const db = mockDb();
      env.DB = db;
      const res = await request('PATCH', 'http://localhost/api/leads');
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Leads endpoint not found');
    });
  });
});
