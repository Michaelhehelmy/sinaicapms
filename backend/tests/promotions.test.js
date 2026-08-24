/**
 * Promotions Engine tests — CRUD + cart application.
 *
 * Mounts src/api/promotions.js through helpers/routerHarness.js exactly as
 * index.js does, with a SQL-routing chain mock (same pattern as pos-unit).
 */
import { describe, it, expect, vi } from 'vitest';
import promotionsRoutes from '../src/api/promotions';
import { mountRouter } from './helpers/routerHarness';

// ── SQL-routing mock DB ─────────────────────────────────────────────────────

function makeRoutingDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...binds) => {
          stmt.boundBinds = binds;
          return stmt;
        }),
        boundBinds: [],
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async () => []),
    statements: [],
  };
  // Handlers may return a full result object ({ results?, meta? }) or nothing
  // (undefined) to accept the statement with caller-appropriate defaults.
  function runHandler(sql, binds) {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.result(binds);
    }
    return undefined;
  }
  db.on = (match, result) => {
    handlers.push({ match, result: typeof result === 'function' ? result : () => ({ results: result ?? [], meta: { changes: 1 } }) });
    return db;
  };
  return db;
}

const env = (db) => ({ DB: db });
const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });

// ── GET / ───────────────────────────────────────────────────────────────────

describe('GET /api/promotions', () => {
  it('lists active-only rows for public visitors', async () => {
    const db = makeRoutingDb().on(/FROM promotions/, [{ id: 'p1', name: 'Happy Hour', is_active: 1 }]);
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: null });
    const res = await app.request(req('/'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body[0].id).toBe('p1');
    expect(body[0].isActive).toBe(true); // camelCase on the wire
    // Active filter present and tenant-scoped
    expect(db.prepare.mock.calls[0][0]).toContain('is_active = 1');
    expect(db.prepare.mock.calls[0][0]).toContain('tenant_id = ?');
    expect(db.statements[0].boundBinds).toEqual(['t1']);
  });

  it('omits inactive rows even with includeInactive when unauthenticated', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: null });
    await app.request(req('/?includeInactive=1'), {}, env(db));
    expect(db.prepare.mock.calls[0][0]).toContain('is_active = 1');
  });

  it('honors includeInactive=1 for authed admins', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { userId: 'a1', role: 'admin' } });
    await app.request(req('/?includeInactive=1'), {}, env(db));
    expect(db.prepare.mock.calls[0][0]).not.toContain('is_active = 1');
  });
});

// ── POST / ──────────────────────────────────────────────────────────────────

describe('POST /api/promotions', () => {
  const validBody = { name: 'Summer Sale', type: 'percentage', value: 15 };

  it('creates a promotion and returns its id', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(req('/', { method: 'POST', body: JSON.stringify(validBody) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.id).toMatch(/^promo_/);
    const insertStmt = db.statements[0];
    expect(insertStmt.boundBinds).toContain('t1');
    expect(insertStmt.boundBinds).toContain('Summer Sale');
    expect(insertStmt.boundBinds).toContain('percentage');
  });

  it('accepts camelCase wire keys via toSnake normalization', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(
      req('/', {
        method: 'POST',
        body: JSON.stringify({ name: 'BOGO Tuesdays', type: 'bogo', appliesTo: 'product', appliesToId: 'coke-1', minPurchase: 5 }),
      }),
      {},
      env(db)
    );
    expect(res.status).toBe(200);
    expect(db.statements[0].boundBinds).toContain('product');
    expect(db.statements[0].boundBinds).toContain('coke-1');
  });

  it('rejects percentage values above 100', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(
      req('/', { method: 'POST', body: JSON.stringify({ name: 'Bad', type: 'percentage', value: 150 }) }),
      {},
      env(db)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(JSON.stringify(body.errors)).toContain('100');
  });

  it('requires appliesToId when appliesTo targets a product/category', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(
      req('/', { method: 'POST', body: JSON.stringify({ name: 'X', type: 'fixed', value: 5, appliesTo: 'category' }) }),
      {},
      env(db)
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body.errors)).toContain('appliesToId');
  });

  it('returns field errors for invalid payloads', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(req('/', { method: 'POST', body: JSON.stringify({ type: 'nope' }) }), {}, env(db));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.some((e) => e.field === 'name')).toBe(true);
  });

  it('rejects malformed window dates', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(
      req('/', { method: 'POST', body: JSON.stringify({ name: 'X', type: 'fixed', startDate: 'tomorrow' }) }),
      {},
      env(db)
    );
    expect(res.status).toBe(400);
  });
});

// ── PUT /:id ───────────────────────────────────────────────────────────────

describe('PUT /api/promotions/:id', () => {
  it('updates owned promotions with tenant scoping', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(req('/promo_1', { method: 'PUT', body: JSON.stringify({ value: 25 }) }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.prepare.mock.calls[0][0]).toContain('tenant_id = ?');
    expect(db.statements[0].boundBinds).toEqual([25, 'promo_1', 't1']);
  });

  it('deactivates via isActive boolean flag', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    await app.request(req('/promo_1', { method: 'PUT', body: JSON.stringify({ isActive: false }) }), {}, env(db));
    expect(db.prepare.mock.calls[0][0]).toContain('is_active = ?');
    expect(db.statements[0].boundBinds).toContain(0);
  });

  it('returns 404 when nothing changed (foreign/unknown id)', async () => {
    const db = makeRoutingDb();
    db.on(/UPDATE promotions/, () => ({ meta: { changes: 0 } }));
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(req('/promo_ghost', { method: 'PUT', body: JSON.stringify({ value: 10 }) }), {}, env(db));
    expect(res.status).toBe(404);
  });

  it('returns 400 for an empty update payload', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(req('/promo_1', { method: 'PUT', body: '{}' }), {}, env(db));
    expect(res.status).toBe(400);
  });
});

// ── DELETE /:id ────────────────────────────────────────────────────────────

describe('DELETE /api/promotions/:id', () => {
  it('deletes owned promotions', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(req('/promo_1', { method: 'DELETE' }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.statements[0].boundBinds).toEqual(['promo_1', 't1']);
  });

  it('returns 404 for foreign or unknown ids', async () => {
    const db = makeRoutingDb();
    db.on(/DELETE FROM promotions/, () => ({ meta: { changes: 0 } }));
    const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: { role: 'admin' } });
    const res = await app.request(req('/promo_ghost', { method: 'DELETE' }), {}, env(db));
    expect(res.status).toBe(404);
  });
});

// ── POST /apply — discount math ─────────────────────────────────────────────

describe('POST /api/promotions/apply', () => {
  // Fixed "today" so day_of_week / date-window filters are deterministic.
  // 2026-08-24 is a Monday → getUTCDay() === 1.
  const FIXED_NOW = new Date('2026-08-24T12:00:00Z').getTime();

  function applyEnv(promos = [], products = []) {
    const db = makeRoutingDb();
    db.on(/FROM pos_products/, products);
    db.on(/FROM promotions/, promos);
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    return { db, restore: () => vi.useRealTimers() };
  }

  async function apply(items, promos, products) {
    const { db, restore } = applyEnv(promos, products);
    try {
      const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: null });
      const res = await app.request(req('/apply', { method: 'POST', body: JSON.stringify({ items }) }), {}, env(db));
      return { status: res.status, body: await res.json(), db };
    } finally {
      restore();
    }
  }

  it('applies a percentage discount per line item', async () => {
    const promos = [{ id: 'p_pct', name: '10% off', type: 'percentage', value: 10, applies_to: 'all', min_purchase: 0 }];
    const { status, body } = await apply(
      [{ productId: 'coke', quantity: 2, unitPrice: 10 }],
      promos,
      []
    );

    expect(status).toBe(200);
    expect(body.subtotal).toBe(20);
    expect(body.items[0].discount).toBe(2); // 10% of $10 × 2 units
    expect(body.items[0].finalPrice).toBe(18);
    expect(body.totalDiscount).toBe(2);
    expect(body.total).toBe(18);
    expect(body.items[0].promotionId).toBe('p_pct');
  });

  it('caps fixed discounts at the unit price', async () => {
    const promos = [{ id: 'p_fix', name: '$15 off', type: 'fixed', value: 15, applies_to: 'all' }];
    const { body } = await apply([{ productId: 'tea', quantity: 3, unitPrice: 10 }], promos, []);

    expect(body.items[0].discount).toBe(30); // min(15, 10) × 3 units
    expect(body.total).toBe(0);
  });

  it('computes bogo as floor(quantity/2) free units', async () => {
    const promos = [{ id: 'p_bogo', name: 'BOGO', type: 'bogo', value: 0, applies_to: 'all' }];
    const { body } = await apply([{ productId: 'soda', quantity: 5, unitPrice: 4 }], promos, []);

    expect(body.items[0].discount).toBe(8); // 2 free × $4
    expect(body.items[0].finalPrice).toBe(12);
  });

  it('skips promotions whose day_of_week does not match today (UTC)', async () => {
    const promos = [
      { id: 'p_sun', name: 'Sunday only', type: 'percentage', value: 50, applies_to: 'all', day_of_week: 0 },
      { id: 'p_mon', name: 'Monday only', type: 'percentage', value: 20, applies_to: 'all', day_of_week: 1 },
    ];
    const { body } = await apply([{ productId: 'coke', quantity: 1, unitPrice: 10 }], promos, []);

    expect(body.items[0].promotionId).toBe('p_mon'); // Monday wins; Sunday skipped
    expect(body.items[0].discount).toBe(2);
  });

  it('skips promotions outside their start/end window', async () => {
    const promos = [
      { id: 'p_future', name: 'Not yet', type: 'percentage', value: 90, applies_to: 'all', start_date: '2026-09-01' },
      { id: 'p_past', name: 'Expired', type: 'percentage', value: 80, applies_to: 'all', end_date: '2026-07-01' },
    ];
    const { body } = await apply([{ productId: 'coke', quantity: 1, unitPrice: 10 }], promos, []);
    expect(body.totalDiscount).toBe(0);
  });

  it('skips promotions below the min_purchase threshold', async () => {
    const promos = [{ id: 'p_min', name: 'Big spender', type: 'percentage', value: 30, applies_to: 'all', min_purchase: 100 }];
    const { body } = await apply([{ productId: 'coke', quantity: 1, unitPrice: 10 }], promos, []);
    expect(body.totalDiscount).toBe(0);
  });

  it('honors product-scoped targeting', async () => {
    const promos = [{ id: 'p_prod', name: 'Coke deal', type: 'percentage', value: 50, applies_to: 'product', applies_to_id: 'coke' }];
    const { body } = await apply(
      [
        { productId: 'coke', quantity: 1, unitPrice: 10 },
        { productId: 'pepsi', quantity: 1, unitPrice: 10 },
      ],
      promos,
      []
    );
    expect(body.items[0].discount).toBe(5);
    expect(body.items[1].discount).toBe(0);
    expect(body.totalDiscount).toBe(5);
  });

  it('matches category targeting via pos_products lookup', async () => {
    const promos = [{ id: 'p_cat', name: 'Drinks deal', type: 'percentage', value: 25, applies_to: 'category', applies_to_id: 'cat_drinks' }];
    const products = [{ id: 'coke', category_id: 'cat_drinks' }, { id: 'chips', category_id: 'cat_snacks' }];
    const { body } = await apply(
      [
        { productId: 'coke', quantity: 2, unitPrice: 10 },
        { productId: 'chips', quantity: 1, unitPrice: 10 },
      ],
      promos,
      products
    );
    expect(body.items[0].discount).toBe(5);
    expect(body.items[1].discount).toBe(0);
  });

  it('takes the best promotion when several apply to one item', async () => {
    const promos = [
      { id: 'p_small', name: '5%', type: 'percentage', value: 5, applies_to: 'all' },
      { id: 'p_big', name: '20%', type: 'percentage', value: 20, applies_to: 'all' },
    ];
    const { body } = await apply([{ productId: 'coke', quantity: 1, unitPrice: 10 }], promos, []);
    expect(body.items[0].promotionId).toBe('p_big');
    expect(body.items[0].discount).toBe(2);
  });

  it('aggregates across multiple items and rounds to 2 decimals', async () => {
    const promos = [{ id: 'p_pct', name: '33%', type: 'percentage', value: 33, applies_to: 'all' }];
    const { body } = await apply(
      [
        { productId: 'a', quantity: 1, unitPrice: 9.99 },
        { productId: 'b', quantity: 2, unitPrice: 4.5 },
      ],
      promos,
      []
    );
    // 9.99×0.33 = 3.2967 → 3.3 ; 4.5×2×0.33 = 2.97 ; total 18.99 − 6.27
    expect(body.items[0].discount).toBe(3.3);
    expect(body.items[1].discount).toBe(2.97);
    expect(body.totalDiscount).toBe(6.27);
    expect(body.total).toBe(12.72);
  });

  it('validates the payload shape', async () => {
    const { db, restore } = applyEnv();
    try {
      const app = mountRouter(promotionsRoutes, { tenantId: 't1', user: null });
      const res = await app.request(req('/apply', { method: 'POST', body: JSON.stringify({ items: [] }) }), {}, env(db));
      expect(res.status).toBe(400);

      const res2 = await app.request(
        req('/apply', { method: 'POST', body: JSON.stringify({ items: [{ quantity: -1, unitPrice: 1 }] }) }),
        {},
        env(db)
      );
      expect(res2.status).toBe(400);
    } finally {
      restore();
    }
  });
});
