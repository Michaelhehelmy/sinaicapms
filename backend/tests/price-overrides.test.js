import { describe, it, expect, vi, beforeAll } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { handlePriceOverridesRoute } from '../src/api/priceOverrides.js';
import { handleOrdersRoute } from '../src/api/orders.js';

const MIGRATION_SQL = readFileSync(
  join(import.meta.dirname, '../migrations/0048_price_overrides.sql'),
  'utf8'
);

// Thin D1-compatible wrapper over better-sqlite3 so the handlers can run
// against a real in-memory DB (real upsert / DELETE / join semantics).
function makeD1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind(...args) {
          return {
            async all() {
              return { results: stmt.all(...args) };
            },
            async first() {
              return stmt.get(...args) ?? null;
            },
            async run() {
              stmt.run(...args);
              return { success: true };
            },
          };
        },
      };
    },
  };
}

function makeRequest(method, url, body = null, headers = {}) {
  const opts = { method, headers: new Headers({ ...headers }) };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

function createTestDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO tenants (id, name) VALUES ('t1', 'Tenant One');
    INSERT INTO tenants (id, name) VALUES ('t2', 'Tenant Two');

    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id),
      selling_price REAL NOT NULL DEFAULT 0,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      organization_id INTEGER NOT NULL DEFAULT 1
    );
    INSERT INTO pos_products (id, tenant_id, selling_price, sku, name, organization_id) VALUES ('p1', 't1', 100, 'SKU-P1', 'P1', 1);
    INSERT INTO pos_products (id, tenant_id, selling_price, sku, name, organization_id) VALUES ('p2', 't2', 200, 'SKU-P2', 'P2', 1);
  `);
  db.exec(MIGRATION_SQL);
  return db;
}

describe('Migration 0048 — price_overrides table', () => {
  it('creates the price_overrides table with the expected columns', () => {
    const db = new Database(':memory:');
    db.exec(MIGRATION_SQL);
    const cols = db.prepare(`PRAGMA table_info(price_overrides)`).all().map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['id', 'product_id', 'date', 'price', 'created_at', 'updated_at']));
    const price = db.prepare(`PRAGMA table_info(price_overrides)`).all().find((c) => c.name === 'price');
    expect(price.notnull).toBe(1);
    const date = db.prepare(`PRAGMA table_info(price_overrides)`).all().find((c) => c.name === 'date');
    expect(date.notnull).toBe(1);
  });

  it('enforces UNIQUE(product_id, date) and exposes the product+date index', () => {
    const db = new Database(':memory:');
    db.exec(MIGRATION_SQL);
    db.prepare(`INSERT INTO price_overrides (product_id, date, price) VALUES (?, ?, ?)`).run('p1', '2026-08-01', 150);
    expect(() =>
      db.prepare(`INSERT INTO price_overrides (product_id, date, price) VALUES (?, ?, ?)`).run('p1', '2026-08-01', 200)
    ).toThrow();
    const indexes = db.prepare(`PRAGMA index_list('price_overrides')`).all().map((i) => i.name);
    expect(indexes).toEqual(expect.arrayContaining(['sqlite_autoindex_price_overrides_1', 'idx_price_overrides_product_date']));
  });
});

describe('calculatePriceOnServer — price-override precedence', () => {
  const TENANT = 't1';

  function chainMock(fns) {
    let idx = 0;
    return () => {
      const ch = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(),
        all: vi.fn(),
        run: vi.fn(),
      };
      if (idx < fns.length) fns[idx](ch, idx);
      idx++;
      return ch;
    };
  }

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

  function calcWith({ base = '100', rates = [], overrides = [] } = {}) {
    const { db } = makeDbMock();
    const fn = chainMock([
      (ch) => { ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: [{ base_price: base }] }); },
      (ch) => { ch.all.mockResolvedValue({ results: rates }); },
      (ch) => { ch.all.mockResolvedValue({ results: overrides }); },
    ]);
    db.prepare.mockImplementation(fn);
    return db;
  }

  const calcUrl = 'https://x.com/api/orders/calculate-price?roomId=r1&checkIn=2026-08-01&checkOut=2026-08-03';
  const SUMMER_RATE = { price_per_night: '150', start_date: '2026-06-01', end_date: '2026-09-30', season: 'all' };

  it('uses the override price instead of the rate plan for the overridden night', async () => {
    const db = calcWith({ rates: [SUMMER_RATE], overrides: [{ date: '2026-08-02', price: 500 }] });
    const res = await handleOrdersRoute(makeRequest('GET', calcUrl), { DB: db }, TENANT);
    const body = await res.json();
    expect(body.totalPrice).toBe(650); // night 1 rate 150 + night 2 override 500
  });

  it('ignores overrides outside the stay range', async () => {
    const db = calcWith({ rates: [SUMMER_RATE], overrides: [{ date: '2026-08-05', price: 500 }] });
    const res = await handleOrdersRoute(makeRequest('GET', calcUrl), { DB: db }, TENANT);
    const body = await res.json();
    expect(body.totalPrice).toBe(300); // both nights fall back to rate 150
  });

  it('ignores an override on the (exclusive) checkout day', async () => {
    const db = calcWith({ rates: [SUMMER_RATE], overrides: [{ date: '2026-08-03', price: 500 }] });
    const res = await handleOrdersRoute(makeRequest('GET', calcUrl), { DB: db }, TENANT);
    const body = await res.json();
    expect(body.totalPrice).toBe(300);
  });

  it('mixes override and base price when no rate plan matches', async () => {
    const db = calcWith({ rates: [], overrides: [{ date: '2026-08-01', price: 500 }] });
    const res = await handleOrdersRoute(makeRequest('GET', calcUrl), { DB: db }, TENANT);
    const body = await res.json();
    expect(body.totalPrice).toBe(600); // night 1 override 500 + night 2 base 100
  });

  it('falls back to base price for nights with no override and no rate plan', async () => {
    const db = calcWith({ rates: [], overrides: [{ date: '2026-08-05', price: 500 }] });
    const res = await handleOrdersRoute(makeRequest('GET', calcUrl), { DB: db }, TENANT);
    const body = await res.json();
    expect(body.totalPrice).toBe(200); // both nights base 100
  });
});

describe('handlePriceOverridesRoute — CRUD', () => {
  let db;
  let env;

  beforeAll(() => {
    db = createTestDb();
    env = { DB: makeD1(db) };
  });

  const PUT_URL = 'https://x.com/api/price-overrides';

  describe('PUT (bulk upsert)', () => {
    it('inserts new overrides and returns them in camelCase', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p1', overrides: [{ date: '2026-08-01', price: 500 }, { date: '2026-08-02', price: 450 }] }),
        env, 't1'
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.productId).toBe('p1');
      expect(body.count).toBe(2);

      const rows = db.prepare('SELECT product_id, date, price FROM price_overrides WHERE product_id = ? ORDER BY date').all('p1');
      expect(rows).toEqual([
        { product_id: 'p1', date: '2026-08-01', price: 500 },
        { product_id: 'p1', date: '2026-08-02', price: 450 },
      ]);
    });

    it('updates an existing date in place (no duplicate row)', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p1', overrides: [{ date: '2026-08-01', price: 600 }] }),
        env, 't1'
      );
      expect(res.status).toBe(200);
      const rows = db.prepare('SELECT date, price FROM price_overrides WHERE product_id = ? AND date = ?').all('p1', '2026-08-01');
      expect(rows).toHaveLength(1);
      expect(rows[0].price).toBe(600);
    });

    it('deletes a date when price is null', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p1', overrides: [{ date: '2026-08-01', price: null }] }),
        env, 't1'
      );
      expect(res.status).toBe(200);
      const rows = db.prepare('SELECT date FROM price_overrides WHERE product_id = ? AND date = ?').all('p1', '2026-08-01');
      expect(rows).toHaveLength(0);
    });

    it('deletes a date when price is omitted', async () => {
      db.prepare('INSERT INTO price_overrides (product_id, date, price) VALUES (?, ?, ?)').run('p1', '2026-08-09', 300);
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p1', overrides: [{ date: '2026-08-09' }] }),
        env, 't1'
      );
      expect(res.status).toBe(200);
      const rows = db.prepare('SELECT date FROM price_overrides WHERE product_id = ? AND date = ?').all('p1', '2026-08-09');
      expect(rows).toHaveLength(0);
    });

    it('rejects a malformed date', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p1', overrides: [{ date: '2026-08-1', price: 500 }] }),
        env, 't1'
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('rejects an impossible calendar date (2026-13-01)', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p1', overrides: [{ date: '2026-13-01', price: 500 }] }),
        env, 't1'
      );
      expect(res.status).toBe(400);
    });

    it('rejects a negative price', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p1', overrides: [{ date: '2026-08-05', price: -10 }] }),
        env, 't1'
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('price');
    });

    it('rejects a non-integer price', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p1', overrides: [{ date: '2026-08-05', price: 10.5 }] }),
        env, 't1'
      );
      expect(res.status).toBe(400);
    });

    it('rejects missing productId', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { overrides: [{ date: '2026-08-05', price: 500 }] }),
        env, 't1'
      );
      expect(res.status).toBe(400);
    });

    it('rejects overrides that is not an array', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p1', overrides: 'nope' }),
        env, 't1'
      );
      expect(res.status).toBe(400);
    });

    it('rejects a product owned by another tenant (404)', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('PUT', PUT_URL, { productId: 'p2', overrides: [{ date: '2026-08-05', price: 500 }] }),
        env, 't1'
      );
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('Product not found');
      // Nothing written for tenant 2's product by tenant 1.
      const rows = db.prepare('SELECT date FROM price_overrides WHERE product_id = ?').all('p2');
      expect(rows).toHaveLength(0);
    });
  });

  describe('GET (tenant-scoped list)', () => {
    it('requires productId', async () => {
      const res = await handlePriceOverridesRoute(makeRequest('GET', 'https://x.com/api/price-overrides'), env, 't1');
      expect(res.status).toBe(400);
    });

    it('returns only this tenant\'s overrides with camelCase keys', async () => {
      db.prepare('INSERT INTO price_overrides (product_id, date, price) VALUES (?, ?, ?)').run('p1', '2026-08-20', 700);
      db.prepare('INSERT INTO price_overrides (product_id, date, price) VALUES (?, ?, ?)').run('p2', '2026-08-20', 999);
      const res = await handlePriceOverridesRoute(
        makeRequest('GET', 'https://x.com/api/price-overrides?productId=p1'),
        env, 't1'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      // p1 has overrides from earlier PUT tests (08-02) plus this 08-20 row;
      // p2's 08-20 row must NOT leak across tenants.
      expect(body.overrides.map((o) => o.date).sort()).toEqual(['2026-08-02', '2026-08-20']);
      expect(body.overrides).toHaveLength(2);
      const o = body.overrides.find((r) => r.date === '2026-08-20');
      expect(Object.keys(o).sort()).toEqual(['date', 'id', 'price', 'productId', 'updatedAt']);
      expect(o.productId).toBe('p1');
      expect(o.price).toBe(700);
      expect(typeof o.id).toBe('number');
    });

    it('respects from/to date filters', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('GET', 'https://x.com/api/price-overrides?productId=p1&from=2026-08-02&to=2026-08-19'),
        env, 't1'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      // p1 has overrides on 08-02 (450) and 08-20 (700); 08-02 is inside the window.
      expect(body.overrides.map((o) => o.date).sort()).toEqual(['2026-08-02']);
    });

    it('rejects an invalid from/to date', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('GET', 'https://x.com/api/price-overrides?productId=p1&from=bad'),
        env, 't1'
      );
      expect(res.status).toBe(400);
    });

    it('returns an empty list for a product not owned by the tenant', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('GET', 'https://x.com/api/price-overrides?productId=p2'),
        env, 't1'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.overrides).toEqual([]);
    });
  });

  describe('DELETE (single override)', () => {
    it('deletes an existing override', async () => {
      db.prepare('INSERT INTO price_overrides (product_id, date, price) VALUES (?, ?, ?)').run('p1', '2026-08-25', 888);
      const res = await handlePriceOverridesRoute(
        makeRequest('DELETE', 'https://x.com/api/price-overrides?productId=p1&date=2026-08-25'),
        env, 't1'
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const rows = db.prepare('SELECT date FROM price_overrides WHERE product_id = ? AND date = ?').all('p1', '2026-08-25');
      expect(rows).toHaveLength(0);
    });

    it('requires productId and date', async () => {
      const res1 = await handlePriceOverridesRoute(makeRequest('DELETE', 'https://x.com/api/price-overrides?date=2026-08-25'), env, 't1');
      expect(res1.status).toBe(400);
      const res2 = await handlePriceOverridesRoute(makeRequest('DELETE', 'https://x.com/api/price-overrides?productId=p1'), env, 't1');
      expect(res2.status).toBe(400);
    });

    it('rejects an invalid date', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('DELETE', 'https://x.com/api/price-overrides?productId=p1&date=2026-08-25x'),
        env, 't1'
      );
      expect(res.status).toBe(400);
    });

    it('rejects a product owned by another tenant (404)', async () => {
      const res = await handlePriceOverridesRoute(
        makeRequest('DELETE', 'https://x.com/api/price-overrides?productId=p2&date=2026-08-25'),
        env, 't1'
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Method not allowed', () => {
    it('returns 405 for POST', async () => {
      const res = await handlePriceOverridesRoute(makeRequest('POST', 'https://x.com/api/price-overrides', {}), env, 't1');
      expect(res.status).toBe(405);
    });
  });
});
