/**
 * Unit tests for the public reservation endpoint (backend/src/api/reservations.js).
 *
 * Covers the security/validation invariants that are testable through the real
 * router:
 *  - unknown/invalid tenant -> 404
 *  - overlapping dates (room occupied) -> 409 "Room no longer available"
 *  - unconfigured Paymob -> WhatsApp fallback envelope (no crash)
 *
 * The happy path ("returns paymobIntention.clientSecret + orderId") is enabled
 * and the Paymob service is mocked (no real network calls) — the original body-
 * consumption bug in reservations.js (reading `c.req.raw.text()` after
 * `c.req.json()`) was fixed by removing the dead read.
 */
import { describe, it, expect, vi } from 'vitest';
import { mountRouter } from '../helpers/routerHarness.js';
import reservationsRoutes from '../../src/api/reservations.js';

// Mock the Paymob service so the happy path never makes a real network call.
vi.mock('../../src/services/paymob.js', () => ({
  createPaymobIntention: vi.fn(async ({ orderRef }) => ({
    clientSecret: `secret_${orderRef}`,
    id: `int_${orderRef}`,
  })),
  verifyPaymobWebhookSignature: vi.fn(),
  extractPaymobTransaction: vi.fn(),
  buildHmacSignedString: vi.fn(),
}));

/**
 * SQL-routing mock DB (same pattern as tests/unit/ai-unit.test.js): prepared
 * statements record their SQL + binds and route results by SQL regex.
 */
function makeRoutingDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        bind: vi.fn((...binds) => { stmt.boundBinds = binds; return stmt; }),
        boundBinds: [],
        all: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { results: [], meta: { changes: 0 } }),
        first: vi.fn(async () => ((await runHandler(sql, stmt.boundBinds))?.results ?? [])[0] ?? null),
        run: vi.fn(async () => (await runHandler(sql, stmt.boundBinds)) ?? { meta: { changes: 1 } }),
      };
      db.statements.push(stmt);
      return stmt;
    }),
    batch: vi.fn(async () => [{ meta: { changes: 1 } }]),
    statements: [],
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

function validReservationBody(overrides = {}) {
  return {
    room_id: 'room_1',
    check_in_date: '2026-10-01',
    check_out_date: '2026-10-03',
    number_of_people: 2,
    guest_name: 'Jane Doe',
    guest_email: 'jane@example.com',
    ...overrides,
  };
}

function makeEnv(db, overrides = {}) {
  return { DB: db, ...overrides };
}

function mount(tenantId = 't1', basePath = '/') {
  return mountRouter(reservationsRoutes, { tenantId, basePath });
}

function post(app, env, body) {
  return app.request(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': 't1' },
      body: JSON.stringify(body),
    }),
    {},
    env,
  );
}

describe('GET /api/public/reservations (public reservation)', () => {
  it('returns 404 for an unknown/invalid tenant (no tenant scoped)', async () => {
    const db = makeRoutingDb();
    const app = mount(null); // "unknown tenant" -> getScope(c).tenantId is null
    const res = await post(app, makeEnv(db), validReservationBody());
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data.error).toBe('Tenant not found');
    expect(db.prepare).not.toHaveBeenCalled();
  });

  it('returns 409 when the advisory overlap check finds an existing booking', async () => {
    const db = makeRoutingDb()
      .on(/r\.max_guests[\s\S]*join projects camp/i, () => ({ results: [{ id: 'room_1', max_guests: 4, camp_id: 'camp_1' }] }))
      .on(/from orders[\s\S]*order_state_id != 'cancelled'/i, () => ({
        results: [{ id: 'existing_order' }],
      }));
    const app = mount('t1');
    const res = await post(app, makeEnv(db), validReservationBody());
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toContain('Room is not available for the selected dates');
    // No INSERT should run once the overlap guard trips.
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('returns 409 "Room no longer available" when the guarded INSERT loses the race', async () => {
    // The advisory overlap check returns empty (passes), but the race-safe
    // guarded INSERT reports 0 affected rows -> the authoritative race guard
    // rejects with "Room no longer available".
    const db = makeRoutingDb()
      .on(/r\.max_guests[\s\S]*join projects camp/i, () => ({ results: [{ id: 'room_1', max_guests: 4, camp_id: 'camp_1' }] }))
      .on(/from orders[\s\S]*order_state_id != 'cancelled'/i, () => ({ results: [] }))
      .on(/r\.product_id[\s\S]*join projects c/i, () => ({ results: [{ product_id: 'prod_1' }] }))
      .on(/from pos_products where id = \? and tenant_id/i, () => ({ results: [{ base_price: '100' }] }))
      .on(/from rate_plans_new/i, () => ({ results: [] }))
      .on(/from price_overrides/i, () => ({ results: [] }))
      .on(/from customers where tenant_id = \? and email/i, () => ({ results: [] }))
      .on(/from customers where tenant_id = \? and phone/i, () => ({ results: [] }))
      .on(/insert into customers/i, () => ({ meta: { changes: 1 } }));
    db.batch = vi.fn(async () => [{ meta: { changes: 0 } }]); // lost race

    const app = mount('t1');
    const res = await post(app, makeEnv(db, { PM_SECRET_KEY: 'sk', PM_BASE_URL: 'https://accept.paymob.com/api' }), validReservationBody());
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toContain('Room no longer available');
  });

  it('returns the WhatsApp fallback envelope when Paymob is not configured', async () => {
    const db = makeRoutingDb()
      .on(/r\.max_guests[\s\S]*join projects camp/i, () => ({ results: [{ id: 'room_1', max_guests: 4, camp_id: 'camp_1' }] }))
      .on(/from orders[\s\S]*order_state_id != 'cancelled'/i, () => ({ results: [] }))
      .on(/r\.product_id[\s\S]*join projects c/i, () => ({ results: [{ product_id: 'prod_1' }] }))
      .on(/from pos_products where id = \? and tenant_id/i, () => ({ results: [{ base_price: '100' }] }))
      .on(/from rate_plans_new/i, () => ({ results: [] }))
      .on(/from price_overrides/i, () => ({ results: [] }))
      .on(/from customers where tenant_id = \? and email/i, () => ({ results: [] }))
      .on(/from customers where tenant_id = \? and phone/i, () => ({ results: [] }))
      .on(/insert into customers/i, () => ({ meta: { changes: 1 } }));

    const app = mount('t1');
    // env deliberately omits PM_SECRET_KEY / PM_BASE_URL -> fallback path.
    const res = await post(app, makeEnv(db), validReservationBody());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.orderId).toBeTruthy();
    expect(data.paymobEnabled).toBe(false);
    expect(data.paymobIntention).toBeNull();
    expect(data.fallbackWhatsApp).toBe(true);
  });

  // Deferred until the source stops reading c.req.raw.text() after the body was
  // Happy path: Paymob configured, service mocked -> returns intent + orderId.
  it('returns paymobIntention.clientSecret + orderId when Paymob is configured', async () => {
    const db = makeRoutingDb()
      .on(/r\.max_guests[\s\S]*join projects camp/i, () => ({ results: [{ id: 'room_1', max_guests: 4, camp_id: 'camp_1' }] }))
      .on(/from orders[\s\S]*order_state_id != 'cancelled'/i, () => ({ results: [] }))
      .on(/r\.product_id[\s\S]*join projects c/i, () => ({ results: [{ product_id: 'prod_1' }] }))
      .on(/from pos_products where id = \? and tenant_id/i, () => ({ results: [{ base_price: '100' }] }))
      .on(/from rate_plans_new/i, () => ({ results: [] }))
      .on(/from price_overrides/i, () => ({ results: [] }))
      .on(/from customers where tenant_id = \? and email/i, () => ({ results: [] }))
      .on(/from customers where tenant_id = \? and phone/i, () => ({ results: [] }))
      .on(/insert into customers/i, () => ({ meta: { changes: 1 } }))
      .on(/update orders set payment_intent_id/i, () => ({ meta: { changes: 1 } }));

    const app = mount('t1');
    const env = makeEnv(db, { PM_ENABLED: 'true', PM_SECRET_KEY: 'sk', PM_BASE_URL: 'https://accept.paymob.com/api', PM_PUBLIC_KEY: 'pk' });
    const res = await post(app, env, validReservationBody());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.orderId).toBeTruthy();
    expect(data.reference).toMatch(/^ORD-[0-9A-Z]{6}$/);
    expect(data.paymobEnabled).toBe(true);
    expect(data.paymobIntention.clientSecret).toBeTruthy();
  });
});

describe('POST /api/public/reservations — idempotency', () => {
  /** Full routing DB pre-populated with the price/overlap/customer stubs needed
   *  to reach the guarded INSERT for the happy-path / lost-race branches. */
  function makeIdempotencyDb({ referenceSelect = () => ({ results: [] }), batchResult = null } = {}) {
    const db = makeRoutingDb()
      .on(/r\.max_guests[\s\S]*join projects camp/i, () => ({ results: [{ id: 'room_1', max_guests: 4, camp_id: 'camp_1' }] }))
      .on(/from orders[\s\S]*order_state_id != 'cancelled'/i, () => ({ results: [] }))
      .on(/r\.product_id[\s\S]*join projects c/i, () => ({ results: [{ product_id: 'prod_1' }] }))
      .on(/from pos_products where id = \? and tenant_id/i, () => ({ results: [{ base_price: '100' }] }))
      .on(/from rate_plans_new/i, () => ({ results: [] }))
      .on(/from price_overrides/i, () => ({ results: [] }))
      .on(/from customers where tenant_id = \? and email/i, () => ({ results: [] }))
      .on(/from customers where tenant_id = \? and phone/i, () => ({ results: [] }))
      .on(/insert into customers/i, () => ({ meta: { changes: 1 } }))
      .on(/from orders[\s\S]*reference/i, referenceSelect);
    if (batchResult !== null) db.batch = vi.fn(async () => [batchResult]);
    return db;
  }

  function postWithKey(app, env, key) {
    return post(app, env, validReservationBody({ idempotency_key: key }));
  }

  it('returns duplicate:false on a fresh create with an idempotency key', async () => {
    const db = makeIdempotencyDb();
    const app = mount('t1');
    const env = makeEnv(db); // Paymob disabled -> fallback envelope
    const res = await postWithKey(app, env, 'session-key-A');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.duplicate).toBe(false);
    expect(data.success).toBe(true);
    expect(data.orderId).toBeTruthy();
    // Deterministic reference derived from tenantId + key.
    expect(data.reference).toMatch(/^ORD-[0-9a-f]{40}$/);
  });

  it('returns the existing order (duplicate:true, same order id) on replay of the same idempotency key', async () => {
    const existing = { id: 'ord_existing', total_amount: 100, payment_status: 'awaiting_payment', payment_intent_id: 'int_123' };
    const db = makeIdempotencyDb({ referenceSelect: () => ({ results: [existing] }) });
    const app = mount('t1');
    const res = await postWithKey(app, makeEnv(db), 'session-key-A');
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.duplicate).toBe(true);
    expect(data.success).toBe(true);
    expect(data.orderId).toBe(existing.id);
    expect(data.order.id).toBe(existing.id);
    expect(data.order.reference).toBe(data.reference);
    // No INSERT / line-item batch should run on a replay.
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('replays the existing order when a concurrent identical submit loses the guarded-INSERT race (exactly one row)', async () => {
    // Model two concurrent POSTs with the same key landing before either
    // INSERT settles: request 1 inserts (batch changes:1); request 2's
    // pre-check SELECT returns nothing, its guarded INSERT loses the race
    // (changes:0), and the post-race SELECT finds the row -> returns duplicate.
    const existing = { id: 'ord_existing', total_amount: 100, payment_status: 'awaiting_payment', payment_intent_id: 'int_123' };

    // First request: no existing row yet; INSERT succeeds.
    const db1 = makeIdempotencyDb({ batchResult: { meta: { changes: 1 } } });
    let insertRan = 0;
    const spyInsert = vi.fn(async () => [{ meta: { changes: insertRan++ === 0 ? 1 : 0 } }]);
    db1.batch = spyInsert;
    const app1 = mount('t1');
    const res1 = await postWithKey(app1, makeEnv(db1), 'session-key-A');
    const data1 = await res1.json();
    expect(data1.duplicate).toBe(false);
    expect(spyInsert).toHaveBeenCalledTimes(1);

    // Second request: pre-check finds nothing (simulates the race window),
    // the guarded INSERT then reports 0 changes (already committed by #1),
    // and the follow-up SELECT locates the row -> duplicate.
    let referenceLookups = 0;
    const db2 = makeIdempotencyDb({
      referenceSelect: () => ({ results: referenceLookups++ === 0 ? [] : [existing] }),
      batchResult: { meta: { changes: 0 } },
    });
    const app2 = mount('t1');
    const res2 = await postWithKey(app2, makeEnv(db2), 'session-key-A');
    const data2 = await res2.json();
    expect(res2.status).toBe(200);
    expect(data2.duplicate).toBe(true);
    expect(data2.orderId).toBe(existing.id);
  });

  it('stays a hard 409 when only the room-overlap guard rejects (not a replay)', async () => {
    const db = makeIdempotencyDb({ batchResult: { meta: { changes: 0 } } });
    // Reference pre-check + post-race follow-up both find nothing -> genuine
    // room-unavailable conflict, NOT a duplicate.
    db.on(/from orders[\s\S]*reference/i, () => ({ results: [] }));
    const app = mount('t1');
    const res = await postWithKey(app, makeEnv(db), 'session-key-A');
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toContain('Room no longer available');
  });

  it('rejects an idempotency key longer than 64 chars with 400', async () => {
    const db = makeIdempotencyDb();
    const app = mount('t1');
    const res = await postWithKey(app, makeEnv(db), 'k'.repeat(65));
    expect(res.status).toBe(400);
    // No DB work should happen.
    expect(db.prepare).not.toHaveBeenCalled();
  });
});
