import { describe, it, expect, vi } from 'vitest';
import { handleProductsRoute } from '../src/api/camps.js';

function makeDbMock() {
  const chain = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
  };
  const db = { prepare: vi.fn().mockReturnValue(chain) };
  return { db, chain };
}

function makeRequest(method, url, body = null, headers = {}) {
  const opts = { method, headers: new Headers({ ...headers }) };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

// Multi-call DB mock: returns products for call 0, product_camps rows for call 1+.
function makeSequencedDb(productResults, campResults) {
  let callIdx = 0;
  const chains = [];
  const db = {
    prepare: vi.fn(() => {
      const ch = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn(),
        first: vi.fn(),
        run: vi.fn(),
      };
      if (callIdx === 0) {
        ch.all.mockResolvedValue({ results: productResults });
      } else {
        ch.all.mockResolvedValue({ results: campResults });
      }
      chains.push(ch);
      callIdx++;
      return ch;
    }),
    chains,
  };
  return { db };
}

// Fixture: 9 products for tenant 'acaciacamp' (mirrors production counts).
const acaciaProducts = Array.from({ length: 9 }, (_, i) => ({
  id: `acacia-prod-${i + 1}`,
  tenant_id: 'acaciacamp',
  category_id: i % 2 === 0 ? 1 : null,
  sku: `AC-${i + 1}00`,
  name: `Acacia Product ${i + 1}`,
  description: `Description ${i + 1}`,
  short_description: `Short ${i + 1}`,
  base_price: 100 + i * 50,
  capacity: 2 + (i % 3),
  image_url: i === 0 ? '' : `https://img.acacia/${i + 1}.jpg`,
  images: JSON.stringify([`https://img.acacia/${i + 1}.jpg`]),
  is_active: 1,
  created_at: '2026-01-01 00:00:00',
  updated_at: '2026-01-01 00:00:00',
}));

describe('handleProductsRoute GET (unified pos_products)', () => {
  it('returns tenant-scoped pos_products rows (9 for acaciacamp)', async () => {
    const { db } = makeSequencedDb(acaciaProducts, []);
    const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/products');
    const res = await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    const body = await res.json();

    expect(body).toHaveLength(9);
    expect(body[0].id).toBe('acacia-prod-1');
    expect(body[0].tenantId).toBe('acaciacamp');
    expect(body[0].basePrice).toBe(100);
    expect(body[0].capacity).toBe(2);
    expect(body[0].isActive).toBe(1);
    expect(body[8].name).toBe('Acacia Product 9');

    const sql = db.prepare.mock.calls[0][0];
    expect(sql).toContain('FROM pos_products');
    expect(sql).toContain('WHERE p.tenant_id = ?');
    expect(sql).toContain('p.deleted_at IS NULL');
  });

  it('binds the tenant id for tenant-scoped queries', async () => {
    const { db } = makeSequencedDb(acaciaProducts, []);
    const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/products');
    await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    expect(db.chains[0].bind).toHaveBeenCalledWith('acaciacamp');
  });

  it('returns all products across tenants when tenantId is marketplace', async () => {
    const allProducts = [
      ...acaciaProducts,
      { id: 'mtn-prod-1', tenant_id: 'mtn', sku: 'MT-100', name: 'Mountain Product', base_price: 300, capacity: 4, image_url: '', images: '[]', is_active: 1 },
      { id: 'mtn-prod-2', tenant_id: 'mtn', sku: 'MT-200', name: 'Mountain Product 2', base_price: 400, capacity: 2, image_url: 'https://img.mtn/2.jpg', images: '[]', is_active: 1 },
    ];
    const { db } = makeSequencedDb(allProducts, []);
    const req = makeRequest('GET', 'https://sinaicamps.com/api/products');
    const res = await handleProductsRoute(req, { DB: db }, 'marketplace');
    const body = await res.json();

    expect(body).toHaveLength(11);
    const tenants = new Set(body.map(p => p.tenantId));
    expect(tenants).toEqual(new Set(['acaciacamp', 'mtn']));

    const sql = db.prepare.mock.calls[0][0];
    expect(sql).toContain('FROM pos_products');
    expect(sql).not.toContain('WHERE p.tenant_id');
    expect(sql).toContain('p.deleted_at IS NULL');
  });

  it('treats empty-string and null tenantId as marketplace (cross-tenant)', async () => {
    for (const tid of ['', null]) {
      const { db } = makeSequencedDb(acaciaProducts, []);
      const req = makeRequest('GET', 'https://sinaicamps.com/api/products');
      await handleProductsRoute(req, { DB: db }, tid);
      const sql = db.prepare.mock.calls[0][0];
      expect(sql).not.toContain('WHERE p.tenant_id');
    }
  });

  it('excludes soft-deleted rows via the WHERE clause', async () => {
    const { db } = makeSequencedDb(acaciaProducts, []);
    const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/products');
    await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    const sql = db.prepare.mock.calls[0][0];
    expect(sql).toContain('p.deleted_at IS NULL');
  });

  it('populates campIds from pos_products.camp_id (source of truth since 0053)', async () => {
    const products = [
      { id: 'acacia-prod-1', tenant_id: 'acaciacamp', sku: 'A1', name: 'P1', base_price: 100, capacity: 2, image_url: '', images: '[]', is_active: 1, camp_id: 'c1' },
      { id: 'acacia-prod-2', tenant_id: 'acaciacamp', sku: 'A2', name: 'P2', base_price: 200, capacity: 2, image_url: '', images: '[]', is_active: 1, camp_id: 'c2' },
      { id: 'acacia-prod-3', tenant_id: 'acaciacamp', sku: 'A3', name: 'P3', base_price: 300, capacity: 2, image_url: '', images: '[]', is_active: 1, camp_id: null },
    ];
    const { db } = makeSequencedDb(products, []);
    const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/products');
    const res = await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    const body = await res.json();

    expect(body[0].campIds).toEqual(['c1']);
    expect(body[1].campIds).toEqual(['c2']);
    expect(body[2].campIds).toEqual([]);

    // No junction query — camp membership is read straight from pos_products.camp_id.
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });

  it('falls back image_url to the first element of images JSON', async () => {
    const products = [
      { id: 'p1', tenant_id: 'acaciacamp', sku: 'S1', name: 'No image_url', base_price: 100, capacity: 2, image_url: '', images: JSON.stringify(['https://fallback/a.jpg', 'https://fallback/b.jpg']), is_active: 1 },
      { id: 'p2', tenant_id: 'acaciacamp', sku: 'S2', name: 'Null images', base_price: 200, capacity: 2, image_url: null, images: null, is_active: 1 },
      { id: 'p3', tenant_id: 'acaciacamp', sku: 'S3', name: 'Empty images', base_price: 300, capacity: 2, image_url: '', images: JSON.stringify([]), is_active: 1 },
      { id: 'p4', tenant_id: 'acaciacamp', sku: 'S4', name: 'Keeps image_url', base_price: 400, capacity: 2, image_url: 'https://kept/x.jpg', images: JSON.stringify(['https://ignored/y.jpg']), is_active: 1 },
    ];
    const { db } = makeSequencedDb(products, []);
    const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/products');
    const res = await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    const body = await res.json();

    expect(body[0].imageUrl).toBe('https://fallback/a.jpg');
    expect(body[1].imageUrl).toBeNull();
    expect(body[2].imageUrl).toBeNull();
    expect(body[3].imageUrl).toBe('https://kept/x.jpg');
  });

  it('never queries the legacy products table', async () => {
    const { db } = makeSequencedDb(acaciaProducts, []);
    const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/products');
    await handleProductsRoute(req, { DB: db }, 'acaciacamp');

    const sqls = db.prepare.mock.calls.map(c => c[0]);
    expect(sqls.length).toBeGreaterThan(0);
    for (const sql of sqls) {
      expect(sql).not.toMatch(/\bFROM products\b/);
      expect(sql).not.toContain('product_lang');
      expect(sql).not.toContain('product_camps_new');
    }
  });

  it('returns an empty array when there are no products', async () => {
    const { db } = makeSequencedDb([], []);
    const req = makeRequest('GET', 'https://acacia.sinaicamps.com/api/products');
    const res = await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    const body = await res.json();
    expect(body).toEqual([]);
    // No junction query when there are no products.
    expect(db.prepare).toHaveBeenCalledTimes(1);
  });
});

// ─── Write path: POST/PUT/DELETE must target pos_products + product_camps ─────
describe('handleProductsRoute POST/PUT/DELETE (write path → pos_products)', () => {
  it('POST writes pos_products (with camp_id) and product_camps (never legacy products)', async () => {
    const { db } = makeDbMock();
    const req = makeRequest('POST', 'https://acacia.sinaicamps.com/api/products', {
      name: 'Product', basePrice: 100, capacity: 2, campIds: ['c1', 'c2']
    });
    const res = await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const sqls = db.prepare.mock.calls.map(c => c[0]);
    // Call 0 = resolve the tenant's single camp; call 1 = tenant_org_mapping lookup;
    // call 2 = pos_products INSERT (writes camp_id); call 3 = product_camps junction.
    expect(sqls[0]).toContain('FROM camps WHERE tenant_id = ? LIMIT 1');
    expect(sqls[1]).toContain('tenant_org_mapping');
    expect(sqls[2]).toContain('INTO pos_products');
    expect(sqls[2]).toContain('name');
    expect(sqls[2]).toContain('selling_price');
    expect(sqls[2]).toContain("'room'");
    expect(sqls[2]).toContain('camp_id');
    expect(sqls[3]).toContain('INTO product_camps');
    for (const sql of sqls) {
      expect(sql).not.toMatch(/\bINTO\s+products\b/);
      expect(sql).not.toMatch(/\bproducts\s+SET\b/);
      expect(sql).not.toContain('product_camps_new');
      expect(sql).not.toContain('product_lang');
    }
  });

  it('POST without campIds writes pos_products only', async () => {
    const { db } = makeDbMock();
    const req = makeRequest('POST', 'https://acacia.sinaicamps.com/api/products', {
      name: 'Product', basePrice: 100
    });
    const res = await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const sqls = db.prepare.mock.calls.map(c => c[0]);
    expect(sqls).toHaveLength(3);
    expect(sqls[0]).toContain('FROM camps WHERE tenant_id = ? LIMIT 1');
    expect(sqls[1]).toContain('tenant_org_mapping');
    expect(sqls[2]).toContain('INTO pos_products');
    expect(sqls[2]).not.toMatch(/\bINTO\s+products\b/);
    expect(sqls[2]).not.toContain('product_camps_new');
    expect(sqls[2]).not.toContain('product_lang');
  });

  it('PUT updates pos_products and rebuilds product_camps (never legacy)', async () => {
    const { db } = makeDbMock();
    const req = makeRequest('PUT', 'https://acacia.sinaicamps.com/api/products/p1', {
      name: 'Updated', basePrice: 150, campIds: ['c1']
    });
    const res = await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const sqls = db.prepare.mock.calls.map(c => c[0]);
    expect(sqls[0]).toContain('UPDATE pos_products');
    expect(sqls[0]).toContain('COALESCE(?, name)');
    expect(sqls[1]).toContain('DELETE FROM product_camps');
    expect(sqls[2]).toContain('INTO product_camps');
    for (const sql of sqls) {
      expect(sql).not.toMatch(/\bproducts\s+SET\b/);
      expect(sql).not.toMatch(/\bINTO\s+products\b/);
      expect(sql).not.toContain('product_camps_new');
      expect(sql).not.toContain('product_lang');
    }
  });

  it('PUT with empty campIds clears the junction without re-inserting', async () => {
    const { db } = makeDbMock();
    const req = makeRequest('PUT', 'https://acacia.sinaicamps.com/api/products/p1', {
      name: 'Updated', campIds: []
    });
    const res = await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const sqls = db.prepare.mock.calls.map(c => c[0]);
    expect(sqls[1]).toContain('DELETE FROM product_camps');
    expect(sqls).toHaveLength(2);
    for (const sql of sqls) {
      expect(sql).not.toMatch(/\bproducts\s+SET\b/);
      expect(sql).not.toContain('product_camps_new');
      expect(sql).not.toContain('product_lang');
    }
  });

  it('DELETE removes product_camps + pos_products (never legacy)', async () => {
    const { db } = makeDbMock();
    let callIdx = 0;
    db.prepare.mockImplementation(() => {
      const ch = {
        bind: vi.fn().mockReturnThis(),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      callIdx++;
      return ch;
    });
    const req = makeRequest('DELETE', 'https://acacia.sinaicamps.com/api/products/p1');
    const res = await handleProductsRoute(req, { DB: db }, 'acaciacamp');
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const sqls = db.prepare.mock.calls.map(c => c[0]);
    expect(sqls.some(s => s.includes('DELETE FROM product_camps'))).toBe(true);
    expect(sqls.some(s => s.includes('DELETE FROM pos_products'))).toBe(true);
    for (const sql of sqls) {
      expect(sql).not.toMatch(/\bDELETE FROM products\b/);
      expect(sql).not.toContain('product_camps_new');
      expect(sql).not.toContain('product_lang');
    }
  });
});
