import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import barcodeRoutes from '../src/api/pos-barcode.js';

function mount(scope) {
  const scopeMiddleware = async (c, next) => {
    c.set('scope', scope);
    await next();
  };
  const app = new Hono();
  app.use('/api/pos/products/barcode/:code', scopeMiddleware);
  app.route('/api/pos/products/barcode', barcodeRoutes);
  return app;
}

function request(app, env, method, url) {
  return app.request(`http://localhost${url}`, { method }, env);
}

describe('pos-barcode', () => {
  it('looks up an active product by SKU', async () => {
    const app = mount({ tenantId: 'tee1', user: {} });
    const env = {
      DB: {
        prepare: vi.fn(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue({
            results: [{
              id: 'p1', sku: 'SKU1', name: 'Tent', description: 'D', selling_price: 100,
              cost_price: 50, category_id: 'c1', type: 'product', image_url: 'x.png',
              is_active: 1, stock_quantity: 5,
            }],
          }),
        })),
      },
    };
    const res = await request(app, env, 'GET', '/api/pos/products/barcode/SKU1');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.id).toBe('p1');
    expect(data.sellingPrice).toBe(100);
    expect(data.stockQuantity).toBe(5);
  });

  it('returns 404 when no matching product found', async () => {
    const app = mount({ tenantId: 'tee1', user: {} });
    const env = {
      DB: { prepare: vi.fn(() => ({ bind: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue({ results: [] }) })) },
    };
    const res = await request(app, env, 'GET', '/api/pos/products/barcode/NOPE');
    expect(res.status).toBe(404);
  });

  it('returns 400 when tenant not resolved', async () => {
    const app = mount({ tenantId: null, user: {} });
    const env = { DB: { prepare: vi.fn() } };
    const res = await request(app, env, 'GET', '/api/pos/products/barcode/X');
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    const app = mount({ tenantId: 'tee1', user: {} });
    const env = { DB: { prepare: vi.fn(() => { throw new Error('boom'); }) } };
    const res = await request(app, env, 'GET', '/api/pos/products/barcode/X');
    expect(res.status).toBe(500);
  });
});
