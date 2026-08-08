import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePlansRoute } from '../src/api/others.js';

function makeReq(url, method = 'GET', body = null) {
  return {
    url,
    method,
    headers: { get: () => null },
    json: () => Promise.resolve(body),
  };
}

const tenantId = 'tenant_1';

describe('handlePlansRoute', () => {
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
      const res = await handlePlansRoute(makeReq('http://localhost/api/plans'), { DB: db }, tenantId);
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
      const res = await handlePlansRoute(makeReq('http://localhost/api/plans/pln_1'), { DB: db }, tenantId);
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
      const res = await handlePlansRoute(makeReq('http://localhost/api/plans/pln_999'), { DB: db }, tenantId);
      const data = await res.json();
      expect(res.status).toBe(404);
      expect(data.error).toContain('Plan not found');
    });
  });

  describe('POST /api/plans', () => {
    it('creates a plan successfully', async () => {
      let callIdx = 0;
      const db = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({
            all: vi.fn().mockImplementation(() => {
              callIdx++;
              // camp check
              return Promise.resolve({ results: [{ id: 'camp_1' }] });
            }),
            run: vi.fn().mockResolvedValue({}),
          })),
        })),
      };
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans', 'POST', { name: 'New Plan', camp_id: 'camp_1' }),
        { DB: db }, tenantId
      );
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
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans', 'POST', { description: 'no name' }),
        { DB: db }, tenantId
      );
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
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans', 'POST', { name: 'Plan', camp_id: 'camp_999' }),
        { DB: db }, tenantId
      );
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
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans', 'POST', { name: 'Plan', camp_id: 'camp_1' }),
        { DB: db }, tenantId
      );
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
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans/pln_1', 'PUT', { name: 'Updated Plan' }),
        { DB: db }, tenantId
      );
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
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans/pln_1', 'PUT', { name: '' }),
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
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans/pln_1', 'PUT', { name: 'Updated' }),
        { DB: db }, tenantId
      );
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
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans/pln_1', 'DELETE'),
        { DB: db }, tenantId
      );
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
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans/pln_1', 'DELETE'),
        { DB: db }, tenantId
      );
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
      const res = await handlePlansRoute(
        makeReq('http://localhost/api/plans', 'PATCH'),
        { DB: db }, tenantId
      );
      const data = await res.json();
      expect(res.status).toBe(405);
    });
  });
});
