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
    camp_id: 'camp_1',
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
      .on(/r\.max_guests[\s\S]*join projects camp/i, () => ({ results: [{ id: 'room_1', max_guests: 4 }] }))
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
      .on(/r\.max_guests[\s\S]*join projects camp/i, () => ({ results: [{ id: 'room_1', max_guests: 4 }] }))
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
      .on(/r\.max_guests[\s\S]*join projects camp/i, () => ({ results: [{ id: 'room_1', max_guests: 4 }] }))
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
      .on(/r\.max_guests[\s\S]*join projects camp/i, () => ({ results: [{ id: 'room_1', max_guests: 4 }] }))
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
    expect(data.paymobEnabled).toBe(true);
    expect(data.paymobIntention.clientSecret).toBeTruthy();
  });
});
