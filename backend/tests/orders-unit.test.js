import { describe, it, expect, vi, beforeEach } from 'vitest';
import ordersRoutes, { availabilityRoutes } from '../src/api/orders.js';
import { mountRouter } from './helpers/routerHarness.js';

// Signature-compatible shims: legacy handlers took (Request, env, tenantId).
// They now execute against the Hono sub-routers mounted by index.js.
let ordersApp;
let availabilityApp;

beforeEach(() => {
  ordersApp = mountRouter(ordersRoutes, { tenantId: 't1', basePath: '/api/orders' });
  availabilityApp = mountRouter(availabilityRoutes, { tenantId: 't1', basePath: '/api/availability' });
});

async function dispatch(app, req, env = {}) {
  const url = new URL(req.url);
  let body;
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method)) {
    try {
      body = JSON.stringify(await req.json());
    } catch {
      body = undefined;
    }
  }
  return app.request(url.pathname + url.search, {
    method: req.method,
    headers: req.headers,
    ...(body ? { body } : {}),
  }, env);
}

async function handleOrdersRoute(req, env = {}, _tenant = null) {
  return dispatch(ordersApp, req, env);
}

async function handleAvailability(req, env = {}, _tenant = null) {
  return dispatch(availabilityApp, req, env);
}

function makeDbMock() {
  const chain = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
    run: vi.fn().mockResolvedValue({ success: true }),
  };
  const db = {
    prepare: vi.fn().mockReturnValue(chain),
    // H1 fix: order creation runs the availability-guarded INSERT via DB.batch.
    // Default resolves as "one row inserted"; conflict tests override this.
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
  };
  return { db, chain };
}

function makeRequest(method, url, body = null, headers = {}) {
  const opts = { method, headers: new Headers({ ...headers }) };
  if (body) opts.body = JSON.stringify(body);
  return new Request(url, opts);
}

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

const TENANT = 't1';
const FUTURE_CHECKIN = '2030-08-01';
const FUTURE_CHECKOUT = '2030-08-05';

describe('handleOrdersRoute', () => {
  describe('GET /orders (list)', () => {
    it('returns paginated orders with default page/pageSize', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data).toBeDefined();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50);
      expect(body.hasMore).toBe(false);
      expect(body.limit).toBeUndefined();
      expect(body.offset).toBeUndefined();
    });

    it('applies status filter', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders?status=confirmed');
      await handleOrdersRoute(req, { DB: db }, TENANT);
      const calls = db.prepare.mock.calls.map(c => c[0]);
      expect(calls.some(c => c.includes('order_state_id = ?'))).toBe(true);
    });

    it('respects custom page and pageSize', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders?page=3&pageSize=10');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.page).toBe(3);
      expect(body.pageSize).toBe(10);
      expect(body.hasMore).toBe(false);
    });

    it('caps pageSize at 200', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders?pageSize=999');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.pageSize).toBe(200);
    });
  });

  describe('GET /orders/:id (detail)', () => {
    it('returns order detail when found', async () => {
      const order = { id: 'o1', check_in_date: '2025-07-01', room_name: 'Room A' };
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [order] });
      const req = makeRequest('GET', 'https://x.com/api/orders/o1');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.id).toBe('o1');
    });

    it('returns 404 when order not found', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders/notexist');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /orders/calculate-price', () => {
    it('returns 400 when params are missing', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 400 when only some params are present', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price?roomId=r1');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('returns 0 when room not found', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price?roomId=r1&checkIn=2026-08-01&checkOut=2026-08-03');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.totalPrice).toBe(0);
    });

    it('calculates price with base_price when no rate plan matches', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ base_price: '100' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price?roomId=r1&checkIn=2026-08-01&checkOut=2026-08-03');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.totalPrice).toBe(200);
    });

    it('uses matching rate plan when available', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ base_price: '100' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ price_per_night: '150', start_date: '2026-06-01', end_date: '2026-09-30', season: 'all' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price?roomId=r1&checkIn=2026-08-01&checkOut=2026-08-03');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.totalPrice).toBe(300);
    });

    it('skips winter rate in summer months', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ base_price: '100' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ price_per_night: '200', start_date: null, end_date: null, season: 'winter' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price?roomId=r1&checkIn=2026-08-01&checkOut=2026-08-03');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.totalPrice).toBe(200);
    });

    it('uses summer rate in summer months', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ base_price: '100' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ price_per_night: '200', start_date: null, end_date: null, season: 'summer' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price?roomId=r1&checkIn=2026-08-01&checkOut=2026-08-03');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.totalPrice).toBe(400);
    });

    it('returns 0 when product not found for room', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price?roomId=r1&checkIn=2026-08-01&checkOut=2026-08-03');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.totalPrice).toBe(0);
    });

    it('falls back to base price when rate plan dates exclude the stay', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ base_price: '100' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ price_per_night: '200', start_date: '2027-01-01', end_date: '2027-12-31', season: 'all' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price?roomId=r1&checkIn=2026-08-01&checkOut=2026-08-03');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.totalPrice).toBe(200);
    });

    it('skips summer rate in winter months', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ product_id: 'p1' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ base_price: '100' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ price_per_night: '200', start_date: null, end_date: null, season: 'summer' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price?roomId=r1&checkIn=2029-12-01&checkOut=2029-12-03');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.totalPrice).toBe(200);
    });
  });

  describe('GET /orders/status/:ref (public status)', () => {
    it('returns order status for valid ref', async () => {
      const order = { reference: 'ORD-ABC123', guest_name: 'John', state_name: 'Confirmed', room_name: 'Room A' };
      const { db, chain } = makeDbMock();
      chain.first.mockResolvedValue(order);
      const req = makeRequest('GET', 'https://x.com/api/orders/status/ORD-ABC123');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.reference).toBe('ORD-ABC123');
      expect(body.status).toBe('Confirmed');
    });

    it('returns 404 for unknown reference', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders/status/UNKNOWN');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(404);
    });

    it('returns error on DB exception', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('GET', 'https://x.com/api/orders/status/REF');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('POST /orders/bulk-delete', () => {
    it('returns 400 for empty ids', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/orders/bulk-delete', { ids: [] });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-array ids', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/orders/bulk-delete', { ids: 'invalid' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('deletes orders and frees rooms', async () => {
      const { db, chain } = makeDbMock();
      chain.all.mockResolvedValue({ results: [{ room_id: 'r1' }, { room_id: 'r2' }] });
      const req = makeRequest('POST', 'https://x.com/api/orders/bulk-delete', { ids: ['o1', 'o2'] });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deleted).toEqual(['o1', 'o2']);
    });

    it('skips room update when no rooms', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/orders/bulk-delete', { ids: ['o1'] });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(200);
    });

    it('cascades inbox_reads read-acks for deleted bookings (Phase 3)', async () => {
      const sqls = [];
      const { db } = makeDbMock();
      db.prepare.mockImplementation((sql) => {
        sqls.push(sql);
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [{ room_id: 'r1' }, { room_id: 'r2' }] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      });
      const req = makeRequest('POST', 'https://x.com/api/orders/bulk-delete', { ids: ['o1', 'o2'] });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(200);
      const cascadeSql = sqls.find((s) => s.includes('DELETE FROM inbox_reads'));
      expect(cascadeSql).toBeDefined();
      expect(cascadeSql).toContain("ref_type = 'booking'");
      expect(cascadeSql).toContain('IN (?,?)');
    });

    it('returns error on DB failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/orders/bulk-delete', { ids: ['o1'] });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /orders (create)', () => {
    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('POST', 'https://x.com/api/orders', { camp_id: '' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('returns 400 for past check-in date', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 5, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John', check_in_date: '2020-01-01', check_out_date: '2020-01-05'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('past');
    });

    it('returns 400 when check_out <= check_in', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 5, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John', check_in_date: '2026-08-10', check_out_date: '2026-08-05'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('returns 400 when check_in == check_out', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 5, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John', check_in_date: '2026-08-10', check_out_date: '2026-08-10'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('returns 400 when room capacity exceeded', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 2, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John', number_of_people: 5,
        check_in_date: '2026-09-10', check_out_date: '2026-09-15'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('capacity');
    });

    it('returns 400 when room not found', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => {
        const ch = { bind: vi.fn().mockReturnThis(), first: vi.fn(), all: vi.fn().mockResolvedValue({ results: [] }), run: vi.fn() };
        return ch;
      });
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John',
        check_in_date: '2026-08-10', check_out_date: '2026-08-15'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('returns 400 for overlapping booking', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'existing' }] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John',
        check_in_date: '2026-09-10', check_out_date: '2026-09-15'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('already booked');
    });

    it('creates order successfully', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John Doe',
        guest_email: 'john@test.com', guest_phone: '12345',
        check_in_date: '2026-09-10', check_out_date: '2026-09-15',
        total_amount: 500, amount_paid: 250, payment_method: 'cash',
        payment_status: 'partial', notes: 'Test'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.id).toBeDefined();
      expect(body.reference).toMatch(/^ORD-/);
    });

    it('sets payment_status to paid when order_state has paid=true', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.run.mockResolvedValue({}); }, // customer insert
        (ch) => {}, // H1 fix: guarded INSERT statement is prepared here but sent via db.batch
        (ch) => { ch.all.mockResolvedValue({ results: [{ paid: true }] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05',
        order_state_id: 'confirmed'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(db.batch.mock.calls[0][0]).toHaveLength(1);
      // prepare order: roomInfo, overlap, customer insert, guarded INSERT
      expect(db.prepare.mock.calls[3][0]).toContain('NOT EXISTS');
    });

    it('H1: returns 409 when the availability guard blocks the insert (lost race)', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); }, // advisory pre-check sees no conflict...
      ]);
      db.prepare.mockImplementation(fn);
      // ...but the atomic guard inside the INSERT finds one (changes === 0)
      db.batch.mockResolvedValue([{ meta: { changes: 0 } }]);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John',
        check_in_date: '2026-09-10', check_out_date: '2026-09-15'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('Room no longer available');
    });

    it('H1: guard predicate mirrors validateOrder (tenant + room + dates + not-cancelled)', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John',
        check_in_date: '2026-09-10', check_out_date: '2026-09-15'
      });
      await handleOrdersRoute(req, { DB: db }, TENANT);
      const sql = db.prepare.mock.calls.map((c) => c[0]).find((s) => s.includes('INSERT INTO orders'));
      expect(sql).toBeTruthy();
      expect(sql).toContain('WHERE NOT EXISTS');
      expect(sql).toContain("order_state_id != 'cancelled'");
      // Guard bindings follow the 15 insert values in validateOrder's order
      const insertStmt = db.batch.mock.calls[0][0][0];
      const binds = insertStmt.bind.mock.calls[0];
      expect(binds.slice(-4)).toEqual(['t1', 'r1', '2026-09-15', '2026-09-10']);
    });

    it('reuses existing customer by email on create', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'cust1' }] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John Doe',
        guest_email: 'john@test.com',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.customerId).toBe('cust1');
    });

    it('reuses existing customer by phone on create', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'cust2' }] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John Doe',
        guest_phone: '12345',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.customerId).toBe('cust2');
    });

    it('returns error on create failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('POST', 'https://x.com/api/orders', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'John',
        check_in_date: '2026-08-10', check_out_date: '2026-08-15'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /orders/:id (update)', () => {
    it('returns 400 for invalid schema', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', { guest_name: '' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('updates order successfully', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ room_id: 'r1', customer_id: 'cust1' }] }); },
        (ch) => { ch.run.mockResolvedValue({ success: true }); },
        (ch) => { ch.run.mockResolvedValue({ success: true }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'Jane Doe',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05',
        total_amount: 300
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('creates a new customer during update when none exists', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'Jane Doe',
        guest_email: 'jane@test.com',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('reuses existing customer by email during update', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'cust7' }] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'Jane',
        guest_email: 'jane@test.com',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('reuses existing customer by phone during update', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'cust9' }] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'Jane',
        guest_phone: '5551234',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('updates order without any customer contact info', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'Jane',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('sets payment_status to paid on update when order_state has paid=true', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ max_guests: 4, base_price: 100 }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ room_id: 'r1', customer_id: 'cust1' }] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ paid: true }] }); },
        (ch) => { ch.run.mockResolvedValue({}); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'Jane',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05',
        order_state_id: 'confirmed'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('returns 400 when update is missing check-in/check-out dates', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'Jane'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('returns 400 when update is missing camp/room/guest', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {});
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid date format on update', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'Jane',
        check_in_date: 'not-a-date', check_out_date: 'also-bad'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });

    it('returns error on update failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('PUT', 'https://x.com/api/orders/o1', {
        camp_id: 'c1', room_id: 'r1', guest_name: 'Jane',
        check_in_date: '2030-08-01', check_out_date: '2030-08-05'
      });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /orders/:id/status', () => {
    it('updates order status successfully', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o1', order_state_id: 'pending' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'confirmed', paid: 0 }); },
        (ch) => { ch.run.mockResolvedValue({ success: true }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o1/status', { status: 'confirmed' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.status).toBe('confirmed');
      expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining('order_state_id'));
    });

    it('returns 400 for invalid order status', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o1', order_state_id: 'pending' }); },
        (ch) => { ch.first.mockResolvedValue(null); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o1/status', { status: 'nonexistent_state' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Invalid order status');
    });

    it('returns 404 when order not found (tenant-scoped)', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue(null); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/unknown/status', { status: 'confirmed' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain('Order not found');
    });

    it('H6: syncs payment_status to paid when new state has paid=true', async () => {
      // Rewritten for the H6 state machine: 'paid' is not a reachable state
      // (seed states are pending/confirmed/checked_in/checked_out/cancelled),
      // so the payment-sync path is exercised via pending → confirmed
      // (order_state seed gives confirmed paid=1).
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o1', order_state_id: 'pending' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'confirmed', paid: 1 }); },
        (ch) => { ch.run.mockResolvedValue({ success: true }); },
        (ch) => { ch.run.mockResolvedValue({ success: true }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o1/status', { status: 'confirmed' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(db.prepare).toHaveBeenCalledTimes(4);
    });

    it('H6: allows the legal pending → cancelled transition', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o1', order_state_id: 'pending' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'cancelled', paid: 0 }); },
        (ch) => { ch.run.mockResolvedValue({ success: true }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o1/status', { status: 'cancelled' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('H6: allows confirmed → checked_in', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o2', order_state_id: 'confirmed' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'checked_in', paid: 0 }); },
        (ch) => { ch.run.mockResolvedValue({ success: true }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o2/status', { status: 'checked_in' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(200);
    });

    it('H6: rejects transitions out of terminal states (checked_out)', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o3', order_state_id: 'checked_out' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'pending', paid: 0 }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o3/status', { status: 'pending' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("Illegal status transition");
    });

    it('H6: rejects resurrecting a cancelled order', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o4', order_state_id: 'cancelled' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'confirmed', paid: 0 }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o4/status', { status: 'confirmed' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(409);
    });

    it('H6: rejects skipping ahead in the lifecycle (pending → checked_in)', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o5', order_state_id: 'pending' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'checked_in', paid: 0 }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o5/status', { status: 'checked_in' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(409);
    });

    it('H6: blocks orders with an unknown current status (fail closed)', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o6', order_state_id: 'corrupted_state' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'confirmed', paid: 0 }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o6/status', { status: 'confirmed' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain("'corrupted_state'");
    });

    it('returns 400 when status is missing', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o1/status', {});
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /orders/:id', () => {
    it('deletes order and sets room available when no other orders', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ room_id: 'r1' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('DELETE', 'https://x.com/api/orders/o1');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('does not set room available when other active orders exist', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [{ room_id: 'r1' }] }); },
        (ch) => { ch.all.mockResolvedValue({ results: [{ id: 'other' }] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('DELETE', 'https://x.com/api/orders/o1');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(200);
    });

    it('deletes order even when order not found in lookup', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.all.mockResolvedValue({ results: [] }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('DELETE', 'https://x.com/api/orders/o1');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(200);
    });

    it('cascades inbox_reads read-ack when deleting a booking (Phase 3)', async () => {
      const sqls = [];
      const { db } = makeDbMock();
      db.prepare.mockImplementation((sql) => {
        sqls.push(sql);
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue({ results: [] }),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      });
      const req = makeRequest('DELETE', 'https://x.com/api/orders/o1');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(200);
      const cascadeSql = sqls.find((s) => s.includes('DELETE FROM inbox_reads'));
      expect(cascadeSql).toBeDefined();
      expect(cascadeSql).toContain("ref_type = 'booking'");
    });

    it('returns error on delete failure', async () => {
      const { db } = makeDbMock();
      db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
      const req = makeRequest('DELETE', 'https://x.com/api/orders/o1');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(400);
    });
  });

  describe('Method not allowed', () => {
    it('returns 405 for unsupported method', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('PATCH', 'https://x.com/api/orders');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      expect(res.status).toBe(405);
    });
  });
});

describe('handleAvailability', () => {
  it('returns error when missing check_in/check_out', async () => {
    const { db } = makeDbMock();
    const req = makeRequest('GET', 'https://x.com/api/availability');
    const res = await handleAvailability(req, { DB: db }, TENANT);
    expect(res.status).toBe(400);
  });

  it('returns availability list without product_id', async () => {
    const rooms = [
      { id: 'r1', name: 'Room A', product_id: 'p1' },
      { id: 'r2', name: 'Room B', product_id: 'p1' },
      { id: 'r3', name: 'Room C', product_id: 'p2' },
    ];
    const { db, chain } = makeDbMock();
    chain.all.mockResolvedValue({ results: rooms });
    const req = makeRequest('GET', 'https://x.com/api/availability?checkIn=2026-08-10&checkOut=2026-08-15');
    const res = await handleAvailability(req, { DB: db }, TENANT);
    const body = await res.json();
    expect(body.availability).toHaveLength(2);
    expect(body.availability[0].availableCount).toBe(2);
    expect(body.availability[1].availableCount).toBe(1);
  });

  it('returns availability for specific product_id', async () => {
    const rooms = [{ id: 'r1', name: 'Room A', product_id: 'p1' }];
    const { db, chain } = makeDbMock();
    chain.all.mockResolvedValue({ results: rooms });
    const req = makeRequest('GET', 'https://x.com/api/availability?checkIn=2026-08-10&checkOut=2026-08-15&productId=p1');
    const res = await handleAvailability(req, { DB: db }, TENANT);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.availableCount).toBe(1);
  });

  it('returns not available when no rooms match product', async () => {
    const { db, chain } = makeDbMock();
    chain.all.mockResolvedValue({ results: [] });
    const req = makeRequest('GET', 'https://x.com/api/availability?checkIn=2026-08-10&checkOut=2026-08-15&productId=nonexist');
    const res = await handleAvailability(req, { DB: db }, TENANT);
    const body = await res.json();
    expect(body.available).toBe(false);
    expect(body.availableCount).toBe(0);
  });

  it('returns error on DB failure', async () => {
    const { db } = makeDbMock();
    db.prepare.mockImplementation(() => { throw new Error('DB fail'); });
    const req = makeRequest('GET', 'https://x.com/api/availability?checkIn=2026-08-10&checkOut=2026-08-15');
    const res = await handleAvailability(req, { DB: db }, TENANT);
    expect(res.status).toBe(400);
  });
});
