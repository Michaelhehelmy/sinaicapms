import { describe, it, expect, vi, beforeEach } from 'vitest';
import plansRoutes from '../src/api/others.js';
import { mountRouter } from './helpers/routerHarness.js';

const tenantId = 'tenant_1';

function makeEnv(db) {
  return { DB: db };
}

describe('plansRoutes', () => {
  let env;
  let app;

  const request = (method, url, body = null) => {
    const opts = { method };
    if (body) opts.body = JSON.stringify(body);
    return app.request(url, opts, env);
  };

  beforeEach(() => {
    app = mountRouter(plansRoutes, { tenantId, basePath: '/api/plans' });
  });

  describe('GET /api/plans', () => {
    it('returns all plans for tenant', async () => {
      const plans = [{ id: 'pln_1', name: 'Plan 1' }];
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: plans }),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('GET', 'http://localhost/api/plans');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toEqual(plans);
    });
  });

  describe('GET /api/plans/:id', () => {
    it('returns a specific plan', async () => {
      const plan = { id: 'pln_1', name: 'Plan 1' };
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [plan] }),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('GET', 'http://localhost/api/plans/pln_1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toEqual(plan);
    });

    it('returns 404 when plan not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('GET', 'http://localhost/api/plans/pln_999');
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Plan not found');
    });
  });

  describe('POST /api/plans', () => {
    it('creates a plan successfully', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              // camp check
              return Promise.resolve({ results: [{ id: 'camp_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('POST', 'http://localhost/api/plans', { name: 'New Plan', camp_id: 'camp_1' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.id).toMatch(/^pln_/);
    });

    it('returns 400 for missing required fields', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('POST', 'http://localhost/api/plans', { description: 'no name' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toBeTruthy();
    });

    it('returns 404 when camp not found', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockResolvedValue({ results: [] }),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('POST', 'http://localhost/api/plans', { name: 'Plan', camp_id: 'camp_999' });
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Camp not found');
    });

    it('handles DB errors on insert', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              return Promise.resolve({ results: [{ id: 'camp_1' }] });
            }),
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('POST', 'http://localhost/api/plans', { name: 'Plan', camp_id: 'camp_1' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to create plan');
    });
  });

  describe('PUT /api/plans/:id', () => {
    it('updates a plan', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('PUT', 'http://localhost/api/plans/pln_1', { name: 'Updated Plan' });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('returns 400 for invalid input', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('PUT', 'http://localhost/api/plans/pln_1', { name: '' });
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
      env = makeEnv(db);
      const res = await request('PUT', 'http://localhost/api/plans/pln_1', { name: 'Updated' });
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to update plan');
    });
  });

  describe('DELETE /api/plans/:id', () => {
    it('deletes a plan', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('DELETE', 'http://localhost/api/plans/pln_1');
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('handles DB errors', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockRejectedValue(new Error('DB fail')),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('DELETE', 'http://localhost/api/plans/pln_1');
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error).toContain('Failed to delete plan');
    });
  });

  describe('method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      env = makeEnv(db);
      const res = await request('PATCH', 'http://localhost/api/plans');
      const data = await res.json();
      expect(res.status).toBe(405);
    });
  });
});
