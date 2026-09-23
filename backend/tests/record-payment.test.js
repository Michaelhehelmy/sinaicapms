/**
 * POST /api/orders/:id/record-payment (P35-B Admin Cash Desk v1).
 *
 * Recon ground truth: /tmp/opencode/p35-recon.md §§1-3 (paid =
 * orders.payment_status='paid'; NO partial state exists — partials keep the
 * current status; NO overpayment guard exists yet — this endpoint adds it;
 * POS method enum cash|card|split with ±0.01 split tolerance; audit via
 * logAudit best-effort). Never touches Paymob.
 *
 * Harness: mountRouter with injected scope (auth itself is the index.js
 * resolveScope mount gate — out of scope here, same as the tip/split suites),
 * sequential-prepare DB mocks in the orders-unit chainMock shape. Scope:
 * report real failures as failures — never fake green.
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

function makeRequest(method, url, body = null) {
  const opts = { method, headers: new Headers({ 'Content-Type': 'application/json' }) };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

// Sequential-prepare mock that records every SQL string + bind chain so tests
// can assert WHAT was written (INSERT payment / UPDATE orders / audit row).
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

const orderRow = (over = {}) => ({
  id: 'ord_1',
  total_amount: 200,
  amount_paid: 0,
  payment_status: 'pending',
  ...over,
});

async function post(env, id, body) {
  const req = makeRequest('POST', `https://x.com/api/orders/${id}/record-payment`, body);
  const url = new URL(req.url);
  return app.request(url.pathname, { method: 'POST', headers: req.headers, body: JSON.stringify(body) }, env);
}

const sqls = (seen) => seen.map((s) => s.sql);
const binds = (seen, i) => seen[i].ch.bind.mock.calls[0];

describe('POST /api/orders/:id/record-payment (P35-B)', () => {
  it('flips status to paid on full payment', async () => {
    const { db, seen } = seqDb([(ch) => ch.first.mockResolvedValue(orderRow())]);
    const res = await post({ DB: db }, 'ord_1', { amount: 200, method: 'cash' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // House wire contract: jsonResponse camelCases keys (utils/response.js).
    expect(body.order.paymentStatus).toBe('paid');
    expect(body.order.amountPaid).toBe(200);
    expect(body.order.balance).toBe(0);
    expect(body.payment.method).toBe('cash');
    expect(body.payment.amountCash).toBe(200);
    expect(body.payment.amountCard).toBe(0);
    expect(body.payment.receivedBy).toBe('admin_1');
    // Payment row inserted + orders flipped to paid.
    expect(sqls(seen).some((s) => s.includes('INSERT INTO payment_records'))).toBe(true);
    const updIdx = sqls(seen).findIndex((s) => s.startsWith('UPDATE orders SET amount_paid'));
    expect(updIdx).toBeGreaterThan(-1);
    expect(binds(seen, updIdx)).toEqual([200, 'paid', 'cash', 't1', 'ord_1']);
  });

  it('partial payment keeps pending status with derived balance math', async () => {
    const { db, seen } = seqDb([(ch) => ch.first.mockResolvedValue(orderRow())]);
    const res = await post({ DB: db }, 'ord_1', { amount: 80, method: 'card' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Recon §1.4: no partial state exists — status stays as-is.
    expect(body.order.paymentStatus).toBe('pending');
    expect(body.order.amountPaid).toBe(80);
    expect(body.order.balance).toBe(120);
    const updIdx = sqls(seen).findIndex((s) => s.startsWith('UPDATE orders SET amount_paid'));
    expect(binds(seen, updIdx)).toEqual([80, 'pending', 'card', 't1', 'ord_1']);
  });

  it('completes a partially-paid order to paid', async () => {
    const { db } = seqDb([
      (ch) => ch.first.mockResolvedValue(orderRow({ amount_paid: 150 })),
    ]);
    const res = await post({ DB: db }, 'ord_1', { amount: 50, method: 'cash' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.order.paymentStatus).toBe('paid');
    expect(body.order.amountPaid).toBe(200);
    expect(body.order.balance).toBe(0);
  });

  it('rejects overpayment with 400 and writes nothing', async () => {
    const { db, seen } = seqDb([
      (ch) => ch.first.mockResolvedValue(orderRow({ amount_paid: 150 })),
    ]);
    const res = await post({ DB: db }, 'ord_1', { amount: 100, method: 'cash' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/verpayment/);
    expect(sqls(seen).some((s) => s.includes('INSERT INTO payment_records'))).toBe(false);
    expect(sqls(seen).some((s) => s.startsWith('UPDATE orders'))).toBe(false);
    expect(sqls(seen).some((s) => s.includes('audit_log'))).toBe(false);
  });

  it('records cash+card split legs in one call', async () => {
    const { db, seen } = seqDb([(ch) => ch.first.mockResolvedValue(orderRow())]);
    const res = await post({ DB: db }, 'ord_1', {
      amount: 100,
      method: 'split',
      amount_cash: 60,
      amount_card: 40,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.payment.method).toBe('split');
    expect(body.payment.amountCash).toBe(60);
    expect(body.payment.amountCard).toBe(40);
    // Partial split keeps pending + balance.
    expect(body.order.paymentStatus).toBe('pending');
    expect(body.order.balance).toBe(100);
    const insIdx = sqls(seen).findIndex((s) => s.includes('INSERT INTO payment_records'));
    expect(binds(seen, insIdx)).toEqual([
      expect.any(String),
      't1',
      'ord_1',
      100,
      'split',
      60,
      40,
      'admin_1',
      null,
      null,
      null,
    ]);
  });

  it('rejects split legs that do not sum to amount (±0.01)', async () => {
    const { db, seen } = seqDb([]);
    const res = await post({ DB: db }, 'ord_1', {
      amount: 100,
      method: 'split',
      amount_cash: 60,
      amount_card: 30,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Split payment sum/);
    expect(seen.length).toBe(0); // rejected before any DB touch
  });

  it('writes an audit row with who/when on every record', async () => {
    const { db, seen } = seqDb(
      [(ch) => ch.first.mockResolvedValue(orderRow())],
      // idempotency lookup skipped (no id key) — steps: order, insert, update, audit
    );
    const res = await post(
      { DB: db },
      'ord_1',
      { amount: 200, method: 'cash', approved_by: 'mgr_9', reference: 'RCPT-1', notes: 'desk' }
    );
    expect(res.status).toBe(200);
    const auditIdx = sqls(seen).findIndex((s) => s.includes('INSERT INTO audit_log'));
    expect(auditIdx).toBeGreaterThan(-1);
    const args = binds(seen, auditIdx);
    // logAudit binds (id, tenantId, userId, action, entityType, entityId, old, new).
    expect(args[1]).toBe('t1');
    expect(args[2]).toBe('admin_1');
    expect(args[3]).toBe('create');
    expect(args[4]).toBe('order');
    expect(args[5]).toBe('ord_1');
    const oldVals = JSON.parse(args[6]);
    const newVals = JSON.parse(args[7]);
    expect(oldVals).toEqual({ amount_paid: 0, payment_status: 'pending' });
    expect(newVals.received_by).toBe('admin_1');
    expect(newVals.approved_by).toBe('mgr_9');
    expect(newVals.payment_status).toBe('paid');
    expect(typeof newVals.recorded_at).toBe('string');
  });

  it('dedupes repeat POSTs with the same idempotency key', async () => {
    const stored = {
      id: 'desk_key_1',
      tenant_id: 't1',
      order_id: 'ord_1',
      amount: 50,
      method: 'cash',
    };
    const { db, seen } = seqDb([
      (ch) => ch.first.mockResolvedValue(orderRow()),
      (ch) => ch.first.mockResolvedValue(stored),
    ]);
    const res = await post({ DB: db }, 'ord_1', {
      id: 'desk_key_1',
      amount: 50,
      method: 'cash',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deduplicated).toBe(true);
    // Dedup path returns the stored DB row through the camelCase wire contract.
    expect(body.payment).toEqual({
      id: 'desk_key_1',
      tenantId: 't1',
      orderId: 'ord_1',
      amount: 50,
      method: 'cash',
    });
    expect(sqls(seen).some((s) => s.includes('INSERT INTO payment_records'))).toBe(false);
  });

  it('returns 404 for missing or other-tenant orders', async () => {
    const { db } = seqDb([]); // default first() → null
    const res = await post({ DB: db }, 'ord_nope', { amount: 10, method: 'cash' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for non-positive amounts and unknown methods', async () => {
    const { db } = seqDb([]);
    for (const bad of [
      { amount: 0, method: 'cash' },
      { amount: -5, method: 'card' },
      { amount: 10, method: 'paymob' },
      { amount: 10, method: 'bank_transfer' },
    ]) {
      const res = await post({ DB: db }, 'ord_1', bad);
      expect(res.status).toBe(400);
    }
  });

  it('returns 401 without tenant context (house mount gate precedent)', async () => {
    const noTenant = mountRouter(ordersRoutes, {
      tenantId: null,
      user: ADMIN,
      basePath: '/api/orders',
    });
    const { db } = seqDb([]);
    const reqBody = JSON.stringify({ amount: 10, method: 'cash' });
    const res = await noTenant.request('/api/orders/ord_1/record-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: reqBody,
    }, { DB: db });
    expect(res.status).toBe(401);
  });
});
