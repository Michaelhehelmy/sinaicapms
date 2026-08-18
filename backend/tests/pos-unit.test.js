import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
}));
vi.mock('../src/utils/response.js', () => ({
  jsonResponse: (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }),
  errorResponse: (msg, status = 400) => new Response(JSON.stringify({ success: false, error: msg }), { status, headers: { 'Content-Type': 'application/json' } }),
}));

import { verifyToken, verifyPassword, generateToken } from '../src/middleware/sharedAuth.js';

function chainDb(resultsOrFn) {
  const allFn = typeof resultsOrFn === 'function'
    ? resultsOrFn
    : () => Promise.resolve({ results: resultsOrFn });
  return {
    bind: vi.fn().mockReturnValue({
      all: vi.fn().mockImplementation(allFn),
      first: vi.fn().mockImplementation(() =>
        typeof resultsOrFn === 'function'
          ? resultsOrFn().then(r => r.results[0] || null)
          : Promise.resolve(resultsOrFn[0] || null)
      ),
      run: vi.fn().mockResolvedValue({}),
    }),
  };
}

function makeDb(prepareFn) {
  return {
    prepare: vi.fn().mockImplementation(prepareFn || (() => chainDb([]))),
    batch: vi.fn().mockResolvedValue([]),
  };
}

function makeStepDb(steps) {
  let callIdx = 0;
  return makeDb(() => {
    const step = steps[callIdx] || chainDb([]);
    callIdx++;
    return typeof step === 'function' ? step() : step;
  });
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' };
}

// Mirrors the dashboard handler's DST-correct computation of the UTC instant
// of `dateStr 00:00:00` in the given IANA timezone (format in the target tz).
function zonedLocalMidnightUtc(dateStr, timezone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const offsetMs = (inst) => {
    const parts = Object.fromEntries(dtf.formatToParts(inst).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(
      +parts.year, +parts.month - 1, +parts.day,
      +parts.hour, +parts.minute, +parts.second
    );
    return asUtc - inst.getTime();
  };
  const naive = new Date(`${dateStr}T00:00:00Z`);
  const start = naive.getTime() - offsetMs(naive);
  const end = start - (offsetMs(new Date(start)) - offsetMs(naive));
  return new Date(end).toISOString().slice(0, 19).replace('T', ' ');
}

describe('POS Routes', () => {
  let posApp;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('../src/routes/pos/index.js');
    posApp = mod.default;
  });

  describe('POST /auth/login', () => {
    it('returns 400 when identifier missing', async () => {
      const db = makeDb(() => chainDb([]));
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: 'pass' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when password missing', async () => {
      const db = makeDb(() => chainDb([]));
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'user@test.com' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 401 for invalid credentials', async () => {
      const db = makeDb(() => chainDb([]));
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'user@test.com', password: 'wrong' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 403 for inactive account', async () => {
      const db = makeDb(() => chainDb([{ is_active: 0 }]));
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'user@test.com', password: 'pass' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(403);
    });

    it('returns 401 for wrong password', async () => {
      verifyPassword.mockResolvedValue(false);
      const db = makeDb(() => chainDb([{ id: 'u1', is_active: 1, password_hash: '$2b$12$hash' }]));
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'user@test.com', password: 'wrong' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns taxRate from pos_organizations when org row exists', async () => {
      verifyPassword.mockResolvedValue(true);
      generateToken.mockResolvedValue('pos-jwt-token');
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ id: 'u1', organization_id: 't1', store_id: 1, username: 'cashier1', email: 'c@test.com', first_name: 'John', last_name: 'Doe', password_hash: '$2b$12$hash', role: 'cashier', is_active: 1 }]);
        if (callIdx === 2) return chainDb([{ tenant_id: 't9' }]);
        if (callIdx === 3) return chainDb([{ tax_rate: '0.15' }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'cashier1', password: 'pass' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.user.taxRate).toBe(0.15);
    });

    it('returns 200 with token on valid login', async () => {
      verifyPassword.mockResolvedValue(true);
      generateToken.mockResolvedValue('pos-jwt-token');
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ id: 'u1', organization_id: 't1', store_id: 1, username: 'cashier1', email: 'c@test.com', first_name: 'John', last_name: 'Doe', password_hash: '$2b$12$hash', role: 'cashier', is_active: 1 }]);
        if (callIdx === 2) return chainDb([{ tenant_id: 't9' }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'cashier1', password: 'pass' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.token).toBe('pos-jwt-token');
      expect(body.user.username).toBe('cashier1');
      expect(generateToken).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't9', storeId: 1 }), 'secret');
    });

    it('falls back to organization_id when tenant mapping lookup fails', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      verifyPassword.mockResolvedValue(true);
      generateToken.mockResolvedValue('pos-jwt-token');
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ id: 'u1', organization_id: '42', store_id: 1, username: 'cashier1', email: 'c@test.com', first_name: 'John', last_name: 'Doe', password_hash: '$2b$12$hash', role: 'cashier', is_active: 1 }]);
        if (callIdx === 2) throw new Error('no such table: tenant_org_mapping');
        return chainDb([]);
      });
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'cashier1', password: 'pass' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(warnSpy).toHaveBeenCalled();
      expect(generateToken).toHaveBeenCalledWith(expect.objectContaining({ tenantId: '42', storeId: 1 }), 'secret');
      warnSpy.mockRestore();
    });

    it('returns 500 on exception', async () => {
      const db = makeDb(() => { throw new Error('DB fail'); });
      const req = new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'user@test.com', password: 'pass' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });
  });

  describe('POS auth middleware', () => {
    it('returns 401 without Authorization header on protected routes', async () => {
      const req = new Request('http://localhost/products');
      const res = await posApp.fetch(req, { DB: { prepare: vi.fn() }, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for invalid POS token', async () => {
      verifyToken.mockResolvedValue(null);
      const req = new Request('http://localhost/products', {
        headers: { Authorization: 'Bearer invalid' },
      });
      const res = await posApp.fetch(req, { DB: { prepare: vi.fn() }, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 401 for non-POS token', async () => {
      verifyToken.mockResolvedValue({ role: 'admin', posType: undefined });
      const req = new Request('http://localhost/products', {
        headers: { Authorization: 'Bearer admin-token' },
      });
      const res = await posApp.fetch(req, { DB: { prepare: vi.fn() }, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });

    it('returns 401 when user is inactive/deleted', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const db = makeDb(() => chainDb([]));
      const req = new Request('http://localhost/products', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /products', () => {
    it('returns products for authenticated POS user', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const products = [{ id: 'p1', name: 'Coffee' }];
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        return chainDb(products);
      });
      const req = new Request('http://localhost/products', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(200);
    });

    it('returns 500 when product fetch fails', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        throw new Error('DB fail');
      });
      const req = new Request('http://localhost/products', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /orders', () => {
    it('returns orders for authenticated POS user', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const orders = [{ id: 'o1', order_number: 'ORD-1' }];
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        return chainDb(orders);
      });
      const req = new Request('http://localhost/orders', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(200);
    });

    it('returns 500 when order list fails', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        throw new Error('DB fail');
      });
      const req = new Request('http://localhost/orders', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /orders/:id', () => {
    it('returns 404 when order not found', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/orders/o1', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(404);
    });

    it('returns order detail with items when found', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        if (callIdx === 2) return chainDb([{ id: 'o1', order_number: 'ORD-1' }]);
        return chainDb([{ id: 'ti1', product_id: 'p1', quantity: 2 }]);
      });
      const req = new Request('http://localhost/orders/o1', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.id).toBe('o1');
      expect(body.items).toHaveLength(1);
    });

    it('returns 500 when order detail fails', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        throw new Error('DB fail');
      });
      const req = new Request('http://localhost/orders/o1', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /dashboard', () => {
    it('returns dashboard stats', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', organizationId: 5, role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx === 1) return chainDb([{ is_active: 1 }]);
        if (callIdx === 2) return chainDb([]);
        return chainDb([{ revenue: 100, count: 5 }]);
      });
      const req = new Request('http://localhost/dashboard', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.todayRevenue).toBe(100);
      expect(body.todayOrders).toBe(5);
      const sqls = db.prepare.mock.calls.map(([sql]) => sql);
      const revenueSql = sqls.find((sql) => sql.includes('COALESCE(SUM(total_amount)'));
      expect(revenueSql).toContain('date(created_at) = ?');
      const orderSql = sqls.find((sql) => sql.includes('COUNT(*) AS count') && sql.includes('pos_transactions'));
      expect(orderSql).toContain('date(created_at) = ?');
    });

    it('uses the org-local day boundary when the org has a timezone', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', organizationId: 5, role: 'cashier' });
      let callIdx = 0;
      const binds = [];
      const db = makeDb(() => {
        callIdx++;
        if (callIdx === 1) return chainDb([{ is_active: 1 }]);
        if (callIdx === 2) return chainDb([{ timezone: 'Africa/Cairo' }]);
        const chain = chainDb([{ revenue: 100, count: 5 }]);
        const chainBind = chain.bind;
        chain.bind = vi.fn((...args) => {
          binds.push(args);
          return chainBind(...args);
        });
        return chain;
      });
      const req = new Request('http://localhost/dashboard', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(200);
      const sqls = db.prepare.mock.calls.map(([sql]) => sql);
      const revenueSql = sqls.find((sql) => sql.includes('COALESCE(SUM(total_amount)'));
      expect(revenueSql).toContain('created_at >= ? AND created_at < ?');
      expect(revenueSql).not.toContain('date(created_at) = ?');
      const orderSql = sqls.find((sql) => sql.includes('COUNT(*) AS count') && sql.includes('pos_transactions'));
      expect(orderSql).toContain('created_at >= ? AND created_at < ?');

      const localDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const [y, m, d] = localDate.split('-');
      const nextDate = new Date(Date.UTC(+y, +m - 1, +d + 1)).toISOString().slice(0, 10);
      const expectedStart = zonedLocalMidnightUtc(localDate, 'Africa/Cairo');
      const expectedEnd = zonedLocalMidnightUtc(nextDate, 'Africa/Cairo');

      const [revenueBinds, orderBinds] = binds;
      expect(revenueBinds).toEqual(['t1', expectedStart, expectedEnd]);
      expect(orderBinds).toEqual(['t1', expectedStart, expectedEnd]);
      expect(revenueBinds[1]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
      expect(revenueBinds[2]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('falls back to UTC date filtering when the org timezone is missing', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', organizationId: 5, role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx === 1) return chainDb([{ is_active: 1 }]);
        if (callIdx === 2) return chainDb([]);
        return chainDb([{ revenue: 100, count: 5 }]);
      });
      const req = new Request('http://localhost/dashboard', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(200);
      const sqls = db.prepare.mock.calls.map(([sql]) => sql);
      const revenueSql = sqls.find((sql) => sql.includes('COALESCE(SUM(total_amount)'));
      expect(revenueSql).toContain('date(created_at) = ?');
      const orderSql = sqls.find((sql) => sql.includes('COUNT(*) AS count') && sql.includes('pos_transactions'));
      expect(orderSql).toContain('date(created_at) = ?');
    });

    it('falls back to UTC date filtering when the org timezone is invalid', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', organizationId: 5, role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx === 1) return chainDb([{ is_active: 1 }]);
        if (callIdx === 2) return chainDb([{ timezone: 'Not/AReal_Zone' }]);
        return chainDb([{ revenue: 100, count: 5 }]);
      });
      const req = new Request('http://localhost/dashboard', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(200);
      const sqls = db.prepare.mock.calls.map(([sql]) => sql);
      const revenueSql = sqls.find((sql) => sql.includes('COALESCE(SUM(total_amount)'));
      expect(revenueSql).toContain('date(created_at) = ?');
      const orderSql = sqls.find((sql) => sql.includes('COUNT(*) AS count') && sql.includes('pos_transactions'));
      expect(orderSql).toContain('date(created_at) = ?');
    });

    it('returns 500 when dashboard fails', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        throw new Error('DB fail');
      });
      const req = new Request('http://localhost/dashboard', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /orders', () => {
    it('returns 400 for empty items', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-array items', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: 'invalid' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when a product in the order is not found', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for zero quantity WITHOUT executing a batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 0 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toContain('Invalid quantity for Coffee');
      expect(db.batch).not.toHaveBeenCalled();
    });

    it('returns 400 for negative quantity WITHOUT executing a batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: -2 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
      expect(db.batch).not.toHaveBeenCalled();
    });

    it('returns 400 for fractional quantity WITHOUT executing a batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1.5 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
      expect(db.batch).not.toHaveBeenCalled();
    });

    it('returns 400 for non-numeric quantity WITHOUT executing a batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 'abc' }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
      expect(db.batch).not.toHaveBeenCalled();
    });

    it('returns 400 for missing quantity WITHOUT executing a batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1' }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
      expect(db.batch).not.toHaveBeenCalled();
    });

    it('returns 400 for quantity above 9999 WITHOUT executing a batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 10000 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
      expect(db.batch).not.toHaveBeenCalled();
    });

    it('returns 400 for non-finite product selling_price WITHOUT executing a batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: 'not-a-number', name: 'Coffee' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
      expect(db.batch).not.toHaveBeenCalled();
    });

    it('returns 400 for negative product selling_price WITHOUT executing a batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '-5', name: 'Coffee' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
      expect(db.batch).not.toHaveBeenCalled();
    });

    it('accepts a valid integer quantity and stores the exact quantity', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 3 }], paymentMethod: 'cash' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.order.items[0].quantity).toBe(3);
      expect(db.batch).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when ingredient stock is insufficient', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([{ ingredient_id: 'i1', quantity: 10 }]),
        chainDb([{ id: 'i1', name: 'Milk', stock_quantity: '5' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'cash' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toContain('Insufficient stock');
    });

    it('returns 400 when split payment sum does not match total', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'split', amountCash: 1, amountCard: 1 }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 400 on split mismatch WITHOUT deducting stock (validate before mutate)', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([{ ingredient_id: 'i1', quantity: 1 }]),
        chainDb([{ id: 'i1', name: 'Milk', stock_quantity: '50' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'split', amountCash: 1, amountCard: 1 }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
      expect(db.batch).not.toHaveBeenCalled();
      const updateCalls = db.prepare.mock.calls.filter(([sql]) => String(sql).includes('UPDATE pos_products SET stock_quantity'));
      expect(updateCalls).toHaveLength(0);
      expect(db.prepare).toHaveBeenCalledTimes(3);
    });

    it('commits stock deduction, transaction, and items in a single atomic batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([
          { ingredient_id: 'i1', quantity: 1 },
          { ingredient_id: 'i2', quantity: 1 },
        ]),
        chainDb([{ id: 'i1', name: 'Milk', stock_quantity: '50' }]),
        chainDb([{ id: 'i2', name: 'Sugar', stock_quantity: '50' }]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'cash', notes: 'table 4' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);

      const updateSqls = db.prepare.mock.calls.filter(([sql]) => String(sql).includes('UPDATE pos_products SET stock_quantity'));
      const txnSqls = db.prepare.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO pos_transactions'));
      const itemSqls = db.prepare.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO pos_transaction_items'));
      expect(updateSqls).toHaveLength(2);
      expect(txnSqls).toHaveLength(1);
      expect(itemSqls).toHaveLength(1);

      expect(db.batch).toHaveBeenCalledTimes(1);
      const statements = db.batch.mock.calls[0][0];
      expect(statements).toHaveLength(4);
      expect(statements.every((s) => s && typeof s.run === 'function')).toBe(true);
    });

    it('creates an order with cash payment and recipe stock deduction', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([
          { ingredient_id: 'i1', quantity: 1 },
          { ingredient_id: 'missing', quantity: 1 },
        ]),
        chainDb([{ id: 'i1', name: 'Milk', stock_quantity: '50' }]),
        chainDb([]),
        chainDb([]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'cash', notes: 'table 4' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.order.totalAmount).toBe(23);
      expect(body.order.paymentMethod).toBe('cash');
      expect(body.order.items).toHaveLength(1);
    });

    it('skips cross-tenant ingredients (not found) and never deducts their stock', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([{ ingredient_id: 'i1', quantity: 1 }]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'cash' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.order.totalAmount).toBe(23);

      const updateCalls = db.prepare.mock.calls.filter(([sql]) => String(sql).includes('UPDATE pos_products SET stock_quantity'));
      expect(updateCalls).toHaveLength(0);

      const recipeIdx = db.prepare.mock.calls.findIndex(([sql]) => String(sql).includes('FROM pos_recipe_ingredients'));
      expect(recipeIdx).toBeGreaterThan(-1);
      expect(String(db.prepare.mock.calls[recipeIdx][0])).toContain('AND tenant_id = ?');
      expect(db.prepare.mock.results[recipeIdx].value.bind.mock.calls[0]).toEqual(['p1', '1']);

      const stockIdx = db.prepare.mock.calls.findIndex(([sql]) => String(sql).includes('SELECT id, name, stock_quantity FROM pos_products'));
      expect(stockIdx).toBeGreaterThan(-1);
      expect(String(db.prepare.mock.calls[stockIdx][0])).toContain('AND organization_id = ?');
      expect(db.prepare.mock.results[stockIdx].value.bind.mock.calls[0]).toEqual(['i1', 1]);
    });

    it('applies org tax_rate from pos_organizations to the order total', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.order.subtotal).toBe(10);
      expect(body.order.taxAmount).toBe(1.5);
      expect(body.order.totalAmount).toBe(11.5);

      const taxIdx = db.prepare.mock.calls.findIndex(([sql]) => String(sql).includes('SELECT tax_rate FROM pos_organizations'));
      expect(taxIdx).toBeGreaterThan(-1);
      const taxBind = db.prepare.mock.results[taxIdx].value.bind.mock.calls[0];
      expect(taxBind[0]).toBe(1);
    });

    it('creates an order with card payment', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([]),
        chainDb([]),
        chainDb([]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'card' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.order.paymentMethod).toBe('card');
      expect(body.order.amountCard).toBe(11);
    });

    it('creates an order with matching split payment', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([]),
        chainDb([]),
        chainDb([]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'split', amountCash: 5.5, amountCard: 5.5 }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.order.paymentMethod).toBe('split');
      expect(body.order.amountCash).toBe(5.5);
      expect(body.order.amountCard).toBe(5.5);
    });

    it('creates order for slug tenantId using organizationId from authenticated posUser', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.order.status).toBe('completed');
      const insertIdx = db.prepare.mock.calls.findIndex(([sql]) => String(sql).includes('INSERT INTO pos_transactions'));
      expect(insertIdx).toBeGreaterThan(-1);
      const bindArgs = db.prepare.mock.results[insertIdx].value.bind.mock.calls[0];
      expect(bindArgs[2]).toBe(1);
    });

    it('binds the cashier storeId to the pos_transactions INSERT', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', organizationId: 1, storeId: 3, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(200);
      const insertIdx = db.prepare.mock.calls.findIndex(([sql]) => String(sql).includes('INSERT INTO pos_transactions'));
      expect(insertIdx).toBeGreaterThan(-1);
      const sql = String(db.prepare.mock.calls[insertIdx][0]);
      expect(sql).toContain('store_id');
      const bindArgs = db.prepare.mock.results[insertIdx].value.bind.mock.calls[0];
      expect(bindArgs[2]).toBe(1);
      expect(bindArgs[3]).toBe(3);
    });

    it('falls back to storeId 1 when the posUser token has no storeId', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(200);
      const insertIdx = db.prepare.mock.calls.findIndex(([sql]) => String(sql).includes('INSERT INTO pos_transactions'));
      expect(insertIdx).toBeGreaterThan(-1);
      const bindArgs = db.prepare.mock.results[insertIdx].value.bind.mock.calls[0];
      expect(bindArgs[3]).toBe(1);
    });

    it('returns 500 when order creation fails', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([]),
        () => { throw new Error('DB fail'); },
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }] }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });

    it('compensates and returns 400 when a stock deduction races to zero (batch meta.changes === 0)', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, storeId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([
          { ingredient_id: 'i1', quantity: 1 },
          { ingredient_id: 'i2', quantity: 1 },
        ]),
        chainDb([{ id: 'i1', name: 'Milk', stock_quantity: '50' }]),
        chainDb([{ id: 'i2', name: 'Sugar', stock_quantity: '50' }]),
      ]);
      // First batch call: order creation — second deduction (i2) affected 0 rows
      db.batch.mockResolvedValueOnce([
        { meta: { changes: 1 } },  // i1 deduction succeeded
        { meta: { changes: 0 } },  // i2 deduction raced to zero
        { meta: { changes: 1 } },  // INSERT pos_transactions
        { meta: { changes: 1 } },  // INSERT pos_transaction_items
      ]);
      // Second batch call: compensation (add back i1 stock, delete items, delete order)
      db.batch.mockResolvedValueOnce([]);

      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'cash' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toContain('Insufficient stock');
      // Batch called twice: once for the order, once for compensation
      expect(db.batch).toHaveBeenCalledTimes(2);
      // Compensation batch contains: stock add-back for i1, delete items, delete order
      const compStatements = db.batch.mock.calls[1][0];
      expect(compStatements.length).toBe(3);
      // Verify the compensation prepare calls include stock add-back and order cleanup
      const allSqls = db.prepare.mock.calls.map(([sql]) => String(sql));
      expect(allSqls.some((sql) => sql.includes('stock_quantity = stock_quantity + ?'))).toBe(true);
      expect(allSqls.some((sql) => sql.includes('DELETE FROM pos_transaction_items'))).toBe(true);
      expect(allSqls.some((sql) => sql.includes('DELETE FROM pos_transactions'))).toBe(true);
    });

    it('still returns 400 when compensation batch rejects (.catch swallows error)', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, storeId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([
          { ingredient_id: 'i1', quantity: 1 },
        ]),
        chainDb([{ id: 'i1', name: 'Milk', stock_quantity: '50' }]),
      ]);
      db.batch.mockResolvedValueOnce([
        { meta: { changes: 0 } },  // deduction raced to zero
        { meta: { changes: 1 } },  // INSERT pos_transactions
        { meta: { changes: 1 } },  // INSERT pos_transaction_items
      ]);
      db.batch.mockRejectedValueOnce(new Error('compensation batch failed'));
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 500 when batch throws a non-idempotency error (re-throws)', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, storeId: 1, role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([]),
      ]);
      db.batch.mockRejectedValue(new Error('D1 internal error'));
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });

    it('proceeds to success when batch results are valid but no deductions were made (empty deductionIndexes)', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, storeId: 1, role: 'cashier' });
      // Product has no recipe ingredients → stockDeductions is empty → deductionIndexes is empty
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([{ tax_rate: '0.15' }]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      // Only the order-creation batch — no compensation batch
      expect(db.batch).toHaveBeenCalledTimes(1);
    });

    it('returns the same order for a repeated idempotency key WITHOUT re-running the batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });

      // First post: creates the order (idempotency pre-check finds nothing)
      const db1 = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([]),
        chainDb([]),
      ]);
      const req1 = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash', idempotencyKey: 'key-A' }),
      });
      const res1 = await posApp.fetch(req1, { DB: db1, JWT_SECRET: 'secret' });
      const body1 = await res1.json();
      expect(res1.status).toBe(200);
      expect(body1.success).toBe(true);
      expect(body1.deduplicated).toBeUndefined();
      expect(db1.batch).toHaveBeenCalledTimes(1);

      // Second post with the same key: returns the stored order, no insert
      const db2 = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: body1.order.id, order_number: body1.order.orderNumber, subtotal: 10, tax_amount: 1, total_amount: 11, payment_method: 'cash', amount_cash: 11, amount_card: 0, status: 'completed', created_at: '2026-08-08 10:00:00' }]),
        chainDb([{ id: 'ti1', product_id: 'p1', quantity: 1, unit_price: 10, total_amount: 10, product_name: 'Coffee', sku: 'COF' }]),
      ]);
      const req2 = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash', idempotencyKey: 'key-A' }),
      });
      const res2 = await posApp.fetch(req2, { DB: db2, JWT_SECRET: 'secret' });
      const body2 = await res2.json();
      expect(res2.status).toBe(200);
      expect(body2.success).toBe(true);
      expect(body2.deduplicated).toBe(true);
      expect(body2.order.id).toBe(body1.order.id);
      expect(body2.order.orderNumber).toBe(body1.order.orderNumber);
      expect(body2.order.totalAmount).toBe(11);
      expect(body2.order.items[0].productName).toBe('Coffee');
      expect(db2.batch).not.toHaveBeenCalled();
    });

    it('creates two distinct orders for different idempotency keys', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });

      const postOrder = async (key) => {
        const db = makeStepDb([
          chainDb([{ is_active: 1 }]),
          chainDb([]),
          chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
          chainDb([]),
          chainDb([]),
        ]);
        const req = new Request('http://localhost/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
          body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash', idempotencyKey: key }),
        });
        const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
        return res.json();
      };

      const bodyA = await postOrder('key-A');
      const bodyB = await postOrder('key-B');
      expect(bodyA.success).toBe(true);
      expect(bodyB.success).toBe(true);
      expect(bodyA.order.id).not.toBe(bodyB.order.id);
    });

    it('returns the existing order when a unique-constraint race hits the batch', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
      const existingRow = { id: 'ord_A', order_number: 'ORD-A', subtotal: 10, tax_amount: 1, total_amount: 11, payment_method: 'cash', amount_cash: 11, amount_card: 0, status: 'completed', created_at: '2026-08-08 10:00:00' };
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([]),
        chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]),
        chainDb([]),
        chainDb([]),
        chainDb([]), // store lookup (cashier token has no storeId -> org's first store)
        chainDb([]),
        chainDb([]),
        chainDb([existingRow]),
        chainDb([{ id: 'ti1', product_id: 'p1', quantity: 1, unit_price: 10, total_amount: 10, product_name: 'Coffee', sku: 'COF' }]),
      ]);
      db.batch.mockImplementation(() =>
        Promise.reject(new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: pos_transactions.idempotency_key'))
      );
      const req = new Request('http://localhost/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash', idempotencyKey: 'key-A' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.deduplicated).toBe(true);
      expect(body.order.id).toBe('ord_A');
    });
  });

  describe('POST /shifts/open', () => {
    it('returns 400 for negative opening cash', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ openingCash: -10 }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when active shift already exists', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        if (callIdx === 2) return chainDb([{ id: 'existing_shift' }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ openingCash: 100 }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('opens a shift successfully', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ openingCash: 100, notes: 'morning' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.shift.status).toBe('open');
      expect(body.shift.openingCash).toBe(100);
    });

    it('returns 500 when opening shift fails', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        () => { throw new Error('DB fail'); },
      ]);
      const req = new Request('http://localhost/shifts/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ openingCash: 100 }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });
  });

  describe('POST /shifts/close', () => {
    it('returns 400 when closing cash is NaN', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/shifts/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ actualClosingCash: 'not-a-number' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when no active shift found', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/shifts/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ actualClosingCash: 200 }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(400);
    });

    it('closes an active shift successfully', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 's1', opening_cash: 100 }]),
        chainDb([{ total_cash: 50 }]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/shifts/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ actualClosingCash: 150, notes: 'done' }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.shift.status).toBe('closed');
      expect(body.shift.expectedClosingCash).toBe(150);
      expect(body.shift.discrepancy).toBe(0);
    });

    it('reports discrepancy when closing cash differs from expected', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 's1', opening_cash: 100 }]),
        chainDb([{ total_cash: 50 }]),
        chainDb([]),
      ]);
      const req = new Request('http://localhost/shifts/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ actualClosingCash: 160 }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.shift.discrepancy).toBe(10);
    });

    it('returns 500 when closing shift fails', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        () => { throw new Error('DB fail'); },
      ]);
      const req = new Request('http://localhost/shifts/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
        body: JSON.stringify({ actualClosingCash: 150 }),
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /shifts/active', () => {
    it('returns active: false when no active shift', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      let callIdx = 0;
      const db = makeDb(() => {
        callIdx++;
        if (callIdx <= 1) return chainDb([{ is_active: 1 }]);
        return chainDb([]);
      });
      const req = new Request('http://localhost/shifts/active', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(body.active).toBe(false);
    });

    it('returns active: true with shift when one is open', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        chainDb([{ id: 's1', status: 'open', opening_cash: 100 }]),
      ]);
      const req = new Request('http://localhost/shifts/active', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      const body = await res.json();
      expect(body.active).toBe(true);
      expect(body.shift.id).toBe('s1');
    });

    it('returns 500 when active shift check fails', async () => {
      verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: 't1', role: 'cashier' });
      const db = makeStepDb([
        chainDb([{ is_active: 1 }]),
        () => { throw new Error('DB fail'); },
      ]);
      const req = new Request('http://localhost/shifts/active', {
        headers: { Authorization: 'Bearer pos-token' },
      });
      const res = await posApp.fetch(req, { DB: db, JWT_SECRET: 'secret' });
      expect(res.status).toBe(500);
    });
  });
});
