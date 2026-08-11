import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleOrdersRoute, handleAvailability } from '../src/api/orders.js';

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
    it('returns 0 when missing params', async () => {
      const { db } = makeDbMock();
      const req = makeRequest('GET', 'https://x.com/api/orders/calculate-price');
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.totalPrice).toBe(0);
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
        (ch) => { ch.run.mockResolvedValue({}); },
        (ch) => { ch.run.mockResolvedValue({}); },
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
        (ch) => { ch.first.mockResolvedValue({ id: 'o1' }); },
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
        (ch) => { ch.first.mockResolvedValue({ id: 'o1' }); },
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

    it('syncs payment_status to paid when state has paid=true', async () => {
      const { db } = makeDbMock();
      const fn = chainMock([
        (ch) => { ch.first.mockResolvedValue({ id: 'o1' }); },
        (ch) => { ch.first.mockResolvedValue({ id: 'paid', paid: 1 }); },
        (ch) => { ch.run.mockResolvedValue({ success: true }); },
        (ch) => { ch.run.mockResolvedValue({ success: true }); },
      ]);
      db.prepare.mockImplementation(fn);
      const req = makeRequest('PATCH', 'https://x.com/api/orders/o1/status', { status: 'paid' });
      const res = await handleOrdersRoute(req, { DB: db }, TENANT);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(db.prepare).toHaveBeenCalledTimes(4);
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
