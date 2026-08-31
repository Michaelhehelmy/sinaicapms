import { describe, it, expect, vi, beforeEach } from 'vitest';
import inventoryRoutes from '../src/api/inventory.js';
import { mountRouter } from './helpers/routerHarness.js';

function mockDb(overrides = {}) {
  const db = {
    batch: overrides.batch || vi.fn().mockResolvedValue([
      { meta: { changes: 1 } },
      { meta: { changes: 1 } },
    ]),
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        bind: vi.fn((...args) => (chain.args = args, chain)),
        all: vi.fn().mockResolvedValue({ results: overrides.all || [] }),
        first: vi.fn().mockResolvedValue(overrides.first ?? undefined),
      };
      return chain;
    }),
  };
  return db;
}

const superAdmin = { id: 'adm1', role: 'super_admin' };

function mount(scope = { user: superAdmin, tenantId: 'tee1' }) {
  return mountRouter(inventoryRoutes, { basePath: '/api/inventory', ...scope });
}

describe('inventory', () => {
  let env;

  beforeEach(() => {
    env = { DB: null };
  });

  describe('GET /low-stock', () => {
    it('returns empty page when tenant has no POS org', async () => {
      env.DB = mockDb({ all: [] });
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/low-stock', { method: 'GET' }, env);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.hasMore).toBe(false);
    });

    it('returns low-stock items with count', async () => {
      let call = 0;
      const db = {
        prepare: vi.fn(() => {
          const chain = {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn(() => {
              call++;
              if (call === 1) return Promise.resolve({ results: [{ organization_id: 'org1' }] }); // org mapping
              if (call === 2) return Promise.resolve({ results: [{ count: 5 }] }); // count query
              return Promise.resolve({ results: [{ id: 'p1', name: 'Tent', stock_quantity: 0, min_stock_level: 10, unit: 'pcs' }] });
            }),
          };
          return chain;
        }),
      };
      env.DB = db;
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/low-stock', { method: 'GET' }, env);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.total).toBe(5);
      expect(body.data[0].status).toBe('out'); // stock 0
      expect(body.data[0].category).toBeNull();
    });

    it('marks item as low when stock > 0', async () => {
      let call = 0;
      const db = {
        prepare: vi.fn(() => {
          const chain = {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn(() => {
              call++;
              if (call === 1) return Promise.resolve({ results: [{ organization_id: 'org1' }] });
              if (call === 2) return Promise.resolve({ results: [{ count: 1 }] });
              return Promise.resolve({ results: [{ id: 'p1', name: 'Towel', stock_quantity: 5, min_stock_level: 10, unit: 'pcs' }] });
            }),
          };
          return chain;
        }),
      };
      env.DB = db;
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/low-stock', { method: 'GET' }, env);
      const body = await res.json();
      expect(body.data[0].status).toBe('low');
    });

    it('returns 500 on DB error', async () => {
      env.DB = { prepare: vi.fn(() => { throw new Error('db down'); }) };
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/low-stock', { method: 'GET' }, env);
      expect(res.status).toBe(500);
    });
  });

  describe('GET /adjustments', () => {
    it('lists inventory adjustments', async () => {
      env.DB = mockDb({ all: [{ id: 'adj1', product_name: 'Tent', adjustment: 5 }] });
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/adjustments', { method: 'GET' }, env);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body[0].productName).toBe('Tent');
    });
  });

  describe('POST /adjustments', () => {
    it('creates an adjustment and updates stock', async () => {
      let call = 0;
      const db = {
        batch: vi.fn().mockResolvedValue([
          { meta: { changes: 1 } },
          { meta: { changes: 1 } },
        ]),
        prepare: vi.fn(() => {
          const chain = {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn(() => {
              call++;
              // product lookup, then re-read after update
              return Promise.resolve(call === 1 ? { id: 'p1', stock_quantity: 10 } : { stock_quantity: 15 });
            }),
          };
          return chain;
        }),
      };
      env.DB = db;
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: 'p1', adjustment: 5, reason: 'restock' }),
      }, env);
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.newStock).toBe(15);
    });

    it('returns 400 when product_id or adjustment missing', async () => {
      env.DB = mockDb();
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjustment: 5 }),
      }, env);
      expect(res.status).toBe(400);
    });

    it('returns 404 when product not found', async () => {
      const db = {
        batch: vi.fn(),
        prepare: vi.fn(() => ({ bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(undefined) })),
      };
      env.DB = db;
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: 'nope', adjustment: 5 }),
      }, env);
      expect(res.status).toBe(404);
    });

    it('returns 400 when adjustment would cause negative stock', async () => {
      const db = {
        batch: vi.fn().mockResolvedValue([
          { meta: { changes: 1 } },
          { meta: { changes: 0 } },
        ]),
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ id: 'p1', stock_quantity: 2 }),
        })),
      };
      env.DB = db;
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: 'p1', adjustment: -10 }),
      }, env);
      expect(res.status).toBe(400);
    });
  });

  describe('GET /reorder-suggestions', () => {
    it('returns reorder suggestions', async () => {
      env.DB = mockDb({ all: [{ id: 'p1', name: 'Water', stock_quantity: 2, suggested_order_qty: 8 }] });
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/reorder-suggestions', { method: 'GET' }, env);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.suggestions[0].suggestedOrderQty).toBe(8);
    });
  });

  describe('method/route guards', () => {
    it('returns 405 for DELETE', async () => {
      env.DB = mockDb();
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/low-stock', { method: 'DELETE' }, env);
      expect(res.status).toBe(405);
    });

    it('returns 404 for unknown path', async () => {
      env.DB = mockDb();
      const app = mount();
      const res = await app.request('http://localhost/api/inventory/bogus', { method: 'GET' }, env);
      expect(res.status).toBe(404);
    });
  });
});
