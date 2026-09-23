/**
 * GET /api/orders/:id/payments (Admin Cash Desk v1 read side).
 *
 * Companions POST /:id/record-payment (record-payment.test.js): lists that
 * order's payment_records rows oldest-first as a BARE ARRAY (house shape —
 * same as sibling GET /:id/items in api/orders.js, NOT { payments }).
 *
 * Harness: mountRouter with injected scope (auth itself is the index.js
 * resolveScope mount gate — out of scope here, same as the record-payment
 * suite). Scope: report real failures as failures — never fake green.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ordersRoutes from '../src/api/orders.js';
import { mountRouter } from './helpers/routerHarness.js';

const ADMIN = { id: 'admin_1', role: 'admin' };
let app;

beforeEach(() => {
  app = mountRouter(ordersRoutes, {
    tenantId: 't1',
    user: ADMIN,
    basePath: '/api/orders',
  });
});

// Sequential-prepare mock: each prepare() call consumes the next step so
// tests can script order-lookup (first) then payments-list (all) in order.
function seqDb(steps = []) {
  const seen = [];
  const db = {
    prepare: vi.fn((sql) => {
      const ch = {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
      seen.push({ sql, ch });
      const step = steps[seen.length - 1];
      if (step) step(ch);
      return ch;
    }),
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
  };
  return { db, seen };
}

const payRow = (over = {}) => ({
  id: 'pay_1',
  tenant_id: 't1',
  order_id: 'ord_1',
  amount: 80,
  method: 'cash',
  amount_cash: 80,
  amount_card: 0,
  received_by: 'admin_1',
  approved_by: null,
  reference: null,
  notes: null,
  created_at: '2026-09-20T10:00:00.000Z',
  ...over,
});

function orderThenPayments(order, payments) {
  return [
    (ch) => ch.first.mockResolvedValue(order),
    (ch) => ch.all.mockResolvedValue({ results: payments }),
  ];
}

async function get(env, id) {
  return app.request(`/api/orders/${id}/payments`, { method: 'GET' }, env);
}

const sqls = (seen) => seen.map((s) => s.sql);
const binds = (seen, i) => seen[i].ch.bind.mock.calls[0];

describe('GET /api/orders/:id/payments', () => {
  it('lists the order records oldest-first as a bare camelCase array', async () => {
    const rows = [
      payRow({ id: 'pay_1', created_at: '2026-09-20T10:00:00.000Z', amount: 80 }),
      payRow({ id: 'pay_2', created_at: '2026-09-21T10:00:00.000Z', amount: 120, method: 'card', amount_cash: 0, amount_card: 120 }),
    ];
    const { db, seen } = seqDb(orderThenPayments({ id: 'ord_1' }, rows));
    const res = await get({ DB: db }, 'ord_1');
    expect(res.status).toBe(200);
    const body = await res.json();
    // House shape: bare array (sibling GET /:id/items precedent), NOT { payments }.
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    expect(body.map((p) => p.id)).toEqual(['pay_1', 'pay_2']);
    // House wire contract: jsonResponse camelCases keys (utils/response.js).
    expect(body[0]).toMatchObject({
      tenantId: 't1',
      orderId: 'ord_1',
      amount: 80,
      method: 'cash',
      amountCash: 80,
      amountCard: 0,
      receivedBy: 'admin_1',
      createdAt: '2026-09-20T10:00:00.000Z',
    });
    expect(body[1].amountCard).toBe(120);
    // Read path writes nothing.
    expect(sqls(seen).some((s) => /INSERT|UPDATE|DELETE/.test(s))).toBe(false);
    // Payments query is tenant-partitioned and oldest-first.
    const listIdx = sqls(seen).findIndex((s) => s.includes('FROM payment_records'));
    expect(listIdx).toBeGreaterThan(-1);
    expect(sqls(seen)[listIdx]).toMatch(/ORDER BY created_at ASC/);
    expect(binds(seen, listIdx)).toEqual(['t1', 'ord_1']);
  });

  it('returns an empty array when the order has no payments', async () => {
    const { db } = seqDb(orderThenPayments({ id: 'ord_1' }, []));
    const res = await get({ DB: db }, 'ord_1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns 404 for an unknown order id', async () => {
    const { db, seen } = seqDb([]); // default first() → null
    const res = await get({ DB: db }, 'ord_nope');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Order not found/);
    // No payments query runs when the order gate misses.
    expect(sqls(seen).some((s) => s.includes('FROM payment_records'))).toBe(false);
  });

  it('returns 404 for a foreign-tenant order (partition gate binds caller tenant)', async () => {
    // Same null lookup as an unknown id — the tenant partition makes a
    // foreign order invisible. Assert the gate binds the CALLER tenant so a
    // cross-tenant id can never leak rows.
    const { db, seen } = seqDb([]);
    const res = await get({ DB: db }, 'ord_other_tenant');
    expect(res.status).toBe(404);
    const gateIdx = sqls(seen).findIndex((s) => s.includes('FROM orders WHERE tenant_id'));
    expect(gateIdx).toBeGreaterThan(-1);
    expect(binds(seen, gateIdx)).toEqual(['t1', 'ord_other_tenant']);
  });

  it('returns 401 without tenant context (house mount gate precedent)', async () => {
    const noTenant = mountRouter(ordersRoutes, {
      tenantId: null,
      user: ADMIN,
      basePath: '/api/orders',
    });
    const { db } = seqDb([]);
    const res = await noTenant.request('/api/orders/ord_1/payments', { method: 'GET' }, { DB: db });
    expect(res.status).toBe(401);
  });
});
