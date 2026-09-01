/**
 * Unit tests for the Paymob webhook (backend/src/api/paymob-webhook.js).
 *
 * Locks the security-critical invariants:
 *  1. A valid HMAC + success:true callback marks the ORDER's payment_status
 *     'paid', scoped by the resolved order's own tenant_id.
 *  2. The paid UPDATE is tenant-scoped (WHERE reference AND tenant_id = the
 *     DB-resolved order's tenant) so a different tenant's row can never be
 *     flipped by this callback.
 *  3. A tampered / bad signature returns 401 and performs NO database write.
 *  4. Missing PM_HMAC_SECRET or PM_ENABLED !== 'true' returns 503.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { buildHmacSignedString } from '../../src/services/paymob.js';
import { handlePaymobWebhook } from '../../src/api/paymob-webhook.js';

const HMAC_SECRET = 'test-paymob-hmac-secret';
const ORDER_REF = 'ORD-ABC123';
const TXN_ID = 123456;

function realisticTransaction(orderRef = ORDER_REF) {
  return {
    amount_cents: '20000',
    created_at: '2026-09-01T12:00:00',
    currency: 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: TXN_ID,
    integration_id: 111111,
    is_3d_secure: true,
    is_auth_successful: true,
    is_capture: false,
    is_divided: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    merchant_id: 222222,
    order: {
      id: 333333,
      items: [
        { name: `Order ${orderRef}`, description: `Camping reservation — orderRef:${orderRef}`, amount: 20000, quantity: 1 },
      ],
    },
    owner: 444444,
    pending: false,
    source_data: { type: 'card', pan: 'xxxx' },
    success: true,
  };
}

function signBody(bodyObj) {
  const canonical = buildHmacSignedString(bodyObj);
  return createHmac('sha512', HMAC_SECRET).update(canonical).digest('hex');
}

/** Build a full realistic signed callback body (transaction fields top-level). */
function buildSignedBody({ success = true, pending = false, orderRef = ORDER_REF } = {}) {
  const txn = realisticTransaction(orderRef);
  const bodyObj = { ...txn, success, pending };
  const hmac = signBody(bodyObj);
  return JSON.stringify({ ...bodyObj, hmac });
}

function buildWebhookRequest(rawBody) {
  return new Request('http://localhost/api/public/paymob/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawBody,
  });
}

/**
 * SQL-routing mock DB (same pattern as tests/unit/ai-unit.test.js): each
 * prepared statement records its SQL + bound binds so tests can assert both
 * which statements ran and what they were scoped by.
 */
function makeRoutingDb() {
  const statements = [];
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        sql: sql,
        sqlStmt: sql,
        bind: vi.fn((...binds) => { stmt.boundBinds = binds; return stmt; }),
        boundBinds: undefined,
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async () => []),
    statements,
  };
  function runHandler(sql, binds) {
    for (const h of handlers) if (h.match.test(sql)) return h.result(binds);
    return undefined;
  }
  db.on = (match, result) => {
    handlers.push({ match, result: typeof result === 'function' ? result : () => result });
    return db;
  };
  return db;
}

function orderRow(overrides = {}) {
  return {
    id: 'ord_1',
    tenant_id: 'tenant-a',
    camp_id: 'camp_1',
    room_id: 'room_1',
    reference: ORDER_REF,
    total_amount: 200,
    check_in_date: '2026-10-01',
    check_out_date: '2026-10-03',
    payment_status: 'awaiting_payment',
    ...overrides,
  };
}

function buildEnv(db, overrides = {}) {
  return {
    PM_ENABLED: 'true',
    PM_HMAC_SECRET: HMAC_SECRET,
    ENVIRONMENT: 'test',
    DB: db,
    ...overrides,
  };
}

/** All prepared statements whose SQL matches a pattern. */
function stmtsMatching(db, pattern) {
  return db.statements.filter((s) => pattern.test(s.sqlStmt ?? ''));
}

describe('handlePaymobWebhook', () => {
  it('marks the order paid for its own tenant on a valid signed success callback', async () => {
    const db = makeRoutingDb()
      .on(/FROM orders WHERE reference = \?/, { results: [orderRow()] })
      .on(/UPDATE orders SET[\s\S]*payment_status = 'paid'/, { meta: { changes: 1 } })
      .on(/UPDATE orders SET order_state_id = 'confirmed'/, { meta: { changes: 1 } })
      .on(/UPDATE rooms_new SET room_status = 'reserved'/, { meta: { changes: 1 } });

    const env = buildEnv(db);
    const res = await handlePaymobWebhook(buildWebhookRequest(buildSignedBody()), env);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ received: true });

    const paid = stmtsMatching(db, /payment_status = 'paid'/);
    expect(paid.length).toBe(1);
    // Tenant-scoped WHERE: transaction_id, orderRef, resolved tenant_id.
    expect(paid[0].boundBinds).toEqual([String(TXN_ID), ORDER_REF, 'tenant-a']);
    expect(paid[0].sqlStmt).toMatch(/AND tenant_id = \?/);
  });

  it('scopes every write to the DB-resolved order tenant (cross-tenant prevention)', async () => {
    // The handler derives the tenant from the DB row it resolved and scopes the
    // paid UPDATE by that tenant — so a different tenant's order can never be
    // flipped by this callback; writes are never keyed by reference/id alone.
    const db = makeRoutingDb()
      .on(/FROM orders WHERE reference = \?/, { results: [orderRow({ tenant_id: 'tenant-a' })] })
      .on(/UPDATE orders SET[\s\S]*payment_status = 'paid'/, { meta: { changes: 1 } })
      .on(/UPDATE orders SET order_state_id = 'confirmed'/, { meta: { changes: 0 } });

    const env = buildEnv(db);
    const res = await handlePaymobWebhook(buildWebhookRequest(buildSignedBody()), env);
    expect(res.status).toBe(200);

    const paid = stmtsMatching(db, /payment_status = 'paid'/);
    expect(paid.length).toBe(1);
    expect(paid[0].boundBinds[2]).toBe('tenant-a');
    expect(paid[0].sqlStmt).toMatch(/AND tenant_id = \?/);
  });

  it('does NOT update any order when the signature is tampered (401, no db write)', async () => {
    const db = makeRoutingDb();
    const bodyObj = JSON.parse(buildSignedBody());
    bodyObj.amount_cents = '99999'; // tamper a signed field
    const rawBody = JSON.stringify(bodyObj);

    const env = buildEnv(db);
    const res = await handlePaymobWebhook(buildWebhookRequest(rawBody), env);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain('Invalid webhook signature');
    const writes = db.statements.filter((s) => /UPDATE|INSERT/i.test(s.sqlStmt ?? ''));
    expect(writes).toHaveLength(0);
  });

  it('returns 401 without a DB write when the hmac field is missing', async () => {
    const db = makeRoutingDb();
    const bodyObj = JSON.parse(buildSignedBody());
    delete bodyObj.hmac;
    const env = buildEnv(db);

    const res = await handlePaymobWebhook(buildWebhookRequest(JSON.stringify(bodyObj)), env);
    const data = await res.json();

    expect(res.status).toBe(401);
    expect(data.error).toContain('Invalid webhook signature');
    const writes = db.statements.filter((s) => /UPDATE|INSERT/i.test(s.sqlStmt ?? ''));
    expect(writes).toHaveLength(0);
  });

  it('returns 503 when PM_HMAC_SECRET is missing', async () => {
    const db = makeRoutingDb();
    const env = buildEnv(db, { PM_HMAC_SECRET: undefined });
    const res = await handlePaymobWebhook(buildWebhookRequest(buildSignedBody()), env);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toContain('Webhook not configured');
    const writes = db.statements.filter((s) => /UPDATE|INSERT/i.test(s.sqlStmt ?? ''));
    expect(writes).toHaveLength(0);
  });

  it('returns 503 when PM_ENABLED is not true', async () => {
    const db = makeRoutingDb();
    const env = buildEnv(db, { PM_ENABLED: 'false' });
    const res = await handlePaymobWebhook(buildWebhookRequest(buildSignedBody()), env);
    const data = await res.json();

    expect(res.status).toBe(503);
    expect(data.error).toContain('Webhook not configured');
    const writes = db.statements.filter((s) => /UPDATE|INSERT/i.test(s.sqlStmt ?? ''));
    expect(writes).toHaveLength(0);
  });

  it('inserts a marketplace_payments ledger row on a valid signed success callback', async () => {
    const db = makeRoutingDb()
      .on(/FROM orders WHERE reference = \?/, { results: [orderRow()] })
      .on(/UPDATE orders SET[\s\S]*payment_status = 'paid'/, { meta: { changes: 1 } })
      .on(/UPDATE orders SET order_state_id = 'confirmed'/, { meta: { changes: 1 } })
      .on(/UPDATE rooms_new SET room_status = 'reserved'/, { meta: { changes: 1 } })
      .on(/INSERT INTO marketplace_payments/, { meta: { changes: 1 } });

    const env = buildEnv(db);
    const res = await handlePaymobWebhook(buildWebhookRequest(buildSignedBody()), env);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ received: true });

    const ledger = stmtsMatching(db, /INSERT INTO marketplace_payments/);
    expect(ledger.length).toBe(1);
    // tenant_id is DB-resolved, fee=0 (marketplaceFeePct defaults 0 in test env),
    // gross=orderRow().total_amount (200), net=200, currency='EGP'.
    expect(ledger[0].boundBinds).toEqual([
      'ord_1',         // order_id
      'tenant-a',      // tenant_id (scoped to resolved order)
      ORDER_REF,       // order_reference
      200,             // gross_amount
      0,               // marketplace_fee (marketplaceFeePct = 0)
      200,             // net_amount
      'EGP',           // currency
      String(TXN_ID),  // paymob_transaction_id
      null,            // paymob_intention_id (not in test fixture)
      ORDER_REF,       // WHERE order_reference = ? (idempotency guard)
    ]);
    expect(ledger[0].sqlStmt).toMatch(/WHERE NOT EXISTS/);
  });

  it('does not mark paid for a non-success (pending) callback even with valid signature', async () => {
    const db = makeRoutingDb()
      .on(/FROM orders WHERE reference = \?/, { results: [orderRow()] });
    const env = buildEnv(db);

    const res = await handlePaymobWebhook(
      buildWebhookRequest(buildSignedBody({ success: false, pending: true })),
      env,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toEqual({ received: true });
    expect(stmtsMatching(db, /payment_status = 'paid'/).length).toBe(0);
  });
});
