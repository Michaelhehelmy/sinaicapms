import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
  rehashIfNeeded: vi.fn(),
}));

import ordersRoutes from '../src/api/orders.js';
import posRouter from '../src/routes/pos/index.js';
import { verifyToken } from '../src/middleware/sharedAuth.js';
import { mountRouter } from './helpers/routerHarness.js';

/**
 * Folio B.4 auto-post (commit 4): check-in opens a folio + posts per-night
 * room charges; POS folio_id appends restaurant charges in the txn batch;
 * checkout is gated on unsettled folios. 5 mission tests, exact numerics.
 *
 * Conventions: real jsonResponse (camelCase bodies); SQL-routing DB mocks in
 * the folios.test.js style (never step-indexed); no KV/D1/remote contact.
 */

function mockDb(route) {
  // route(sql, args) -> { first } and/or { all }. Every prepare/bind/first/
  // all/run is recorded; prepared statements carry _sql so batch membership
  // ("same batch" assertions) can be inspected.
  const seen = [];
  const bound = [];
  const db = {
    batch: vi.fn().mockResolvedValue([{ meta: { changes: 1 } }]),
    prepare: vi.fn((sql) => {
      seen.push(sql);
      const st = { _sql: sql };
      st.bind = vi.fn((...args) => { bound.push({ sql, args }); return st; });
      st.first = vi.fn(async () => {
        const last = bound[bound.length - 1];
        const r = route(sql, last ? last.args : []);
        const v = r && 'first' in r ? r.first : null;
        return typeof v === 'function' ? v() : v;
      });
      st.all = vi.fn(async () => {
        const last = bound[bound.length - 1];
        const r = route(sql, last ? last.args : []);
        const rows = r && 'all' in r ? r.all : [];
        return { results: typeof rows === 'function' ? rows() : rows };
      });
      st.run = vi.fn(async () => ({ success: true, meta: { changes: 1 } }));
      return st;
    }),
  };
  return { db, seen, bound };
}

function ordersApp() {
  return mountRouter(ordersRoutes, { tenantId: 't1', basePath: '/api/orders' });
}

const jsonPost = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const jsonPatch = (body) => ({
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('folios auto-post B.4 (5 mission tests, exact numerics)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1 — PATCH /:id/checkin opens a folio + posts per-night room charges summing to the order total (2x200=400)', async () => {
    const orderRow = {
      id: 'o1', room_id: 'room-1', camp_id: 'camp-1', customer_id: 'cust_1',
      project_id: 'proj_1', check_in_date: '2030-08-01', check_out_date: '2030-08-03',
      total_amount: 400,
    };
    const { db, seen, bound } = mockDb((sql) => {
      if (sql.includes('FROM orders WHERE tenant_id')) return { first: orderRow };
      if (sql.includes('JOIN projects')) return { first: { id: 'room-1' } };
      if (sql.includes('FROM folios WHERE')) return { first: null };
      return {};
    });
    const app = ordersApp();
    const res = await app.request(
      'http://localhost/api/orders/o1/checkin',
      jsonPatch({ room_id: 'room-1' }),
      { DB: db }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.roomId).toBe('room-1');
    expect(body.folioId).toMatch(/^folio_/);

    // One atomic batch: order flip + room flip + folio INSERT + 2 charges + bump.
    expect(db.batch).toHaveBeenCalledTimes(1);
    const stmts = db.batch.mock.calls[0][0];
    expect(stmts).toHaveLength(6);
    const batchSql = stmts.map((s) => s._sql).join(' ');
    expect(batchSql).toContain('UPDATE orders SET');
    expect(batchSql).toContain("UPDATE rooms_new SET status = 'occupied'");
    expect(batchSql).toContain('INTO folios');
    expect(batchSql).toContain('INTO folio_charges');
    expect(batchSql).toContain('UPDATE folios SET total_amount');

    // Folio INSERT binds: (id, tenant_id, guest_id, primary_order_id, notes).
    const folioIns = bound.find((b) => b.sql.includes('INTO folios'));
    expect(folioIns.args[1]).toBe('t1');
    expect(folioIns.args[2]).toBe('cust_1');
    expect(folioIns.args[3]).toBe('o1');

    // Room charges: 2 nights x 200 = 400, order project, room source.
    // Bind order: (id, folio_id, tenant_id, project_id, reference_id, description, unit_price, total_price).
    const charges = bound.filter((b) => b.sql.includes('INTO folio_charges'));
    expect(charges).toHaveLength(2);
    for (const ch of charges) {
      expect(ch.sql).toContain(`'room'`);
      expect(ch.args[1]).toBe(body.folioId);
      expect(ch.args[2]).toBe('t1');
      expect(ch.args[3]).toBe('proj_1');
      expect(ch.args[4]).toBe('o1');
    }
    expect(charges[0].args[5]).toBe('Room charge 2030-08-01');
    expect(charges[1].args[5]).toBe('Room charge 2030-08-02');
    expect([charges[0].args[7], charges[1].args[7]]).toEqual([200, 200]);

    // Header bump equals the room total exactly.
    const bump = bound.find((b) => b.sql.includes('UPDATE folios SET total_amount'));
    expect(bump.args[0]).toBe(400);
    expect(bump.args[1]).toBe('t1');
    expect(seen.join(' ')).not.toMatch(/DELETE\s+FROM/i);
  });

  it('2 — POST /pos/orders with folioId appends restaurant charges + bumps the folio in the same txn batch', async () => {
    verifyToken.mockResolvedValue({
      userId: 'u1', posType: 'pos', tenantId: 't1',
      organizationId: 7, storeId: 5, projectId: 'proj_pos', role: 'cashier',
    });
    const folioRow = { id: 'folio_1', status: 'open', total_amount: 50 };
    const productRow = { id: 'p1', selling_price: 100, name: 'Burger', category_id: 'cat-1' };
    const { db, seen, bound } = mockDb((sql) => {
      if (sql.includes('FROM pos_users WHERE id = ?')) {
        const scopeRow = { is_active: 1, project_id: null, store_project: null, default_project: null };
        return { first: scopeRow, all: [scopeRow] };
      }
      if (sql.includes('FROM pos_products') && sql.includes('WHERE id IN')) return { all: [productRow] };
      if (sql.includes('FROM promotions')) return { all: [] };
      if (sql.includes('FROM folios WHERE')) return { first: folioRow };
      if (sql.includes('FROM pos_organizations')) return { all: [{ tax_rate: 0 }] };
      if (sql.includes('FROM pos_recipe_ingredients')) return { all: [] };
      if (sql.includes('min_stock_level')) return { all: [] };
      return {};
    });
    const req = new Request('http://localhost/orders', {
      ...jsonPost({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'cash', folioId: 'folio_1' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
    });
    const res = await posRouter.fetch(req, { DB: db, JWT_SECRET: 'secret' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.order.totalAmount).toBe(200);

    // Folio validated tenant-scoped before any write.
    expect(seen.some((s) => s.includes('FROM folios WHERE') && s.includes('tenant_id = ?'))).toBe(true);

    // Same commit batch carries the txn INSERT, the folio charge, and the bump.
    expect(db.batch).toHaveBeenCalledTimes(1);
    const batchSql = db.batch.mock.calls[0][0].map((s) => s._sql).join(' ');
    expect(batchSql).toContain('INSERT INTO pos_transactions');
    expect(batchSql).toContain('INTO folio_charges');
    expect(batchSql).toContain('UPDATE folios SET total_amount');

    // Restaurant charge: 2x100=200, POS project, refs the POS order id.
    // Bind order: (id, folio_id, tenant_id, project_id, reference_id, description, quantity, unit_price, total_price).
    const charges = bound.filter((b) => b.sql.includes('INTO folio_charges'));
    expect(charges).toHaveLength(1);
    expect(charges[0].sql).toContain(`'restaurant'`);
    expect(charges[0].args[1]).toBe('folio_1');
    expect(charges[0].args[2]).toBe('t1');
    expect(charges[0].args[3]).toBe('proj_pos');
    expect(charges[0].args[4]).toBe(body.order.id);
    expect(charges[0].args[5]).toBe('Burger');
    expect(charges[0].args[6]).toBe(2);
    expect(charges[0].args[7]).toBe(100);
    expect(charges[0].args[8]).toBe(200);

    // Bump equals Σ charges exactly (200); folio 50 → 250 by construction.
    const bump = bound.find((b) => b.sql.includes('UPDATE folios SET total_amount'));
    expect(bump.args[0]).toBe(200);
    expect(bump.args[1]).toBe('t1');
    expect(bump.args[2]).toBe('folio_1');
  });

  it('3 — PATCH /:id/checkout with an unsettled folio returns 400 and writes nothing', async () => {
    const { db, seen } = mockDb((sql) => {
      if (sql.includes('FROM orders WHERE tenant_id')) return { first: { id: 'o1', room_id: 'room-1' } };
      if (sql.includes('FROM folios WHERE')) return { first: { id: 'folio_1', total_amount: 250 } };
      return {};
    });
    const app = ordersApp();
    const res = await app.request(
      'http://localhost/api/orders/o1/checkout',
      jsonPatch({}),
      { DB: db }
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('Settle the folio before checking out');
    // Blocked checkout leaves order + room fully unchanged.
    expect(db.batch).not.toHaveBeenCalled();
    expect(seen.join(' ')).not.toContain('UPDATE rooms_new');
    expect(seen.join(' ')).not.toContain('UPDATE orders SET');
  });

  it('4 — PATCH /:id/checkout with a settled folio returns 200 (gate only sees open folios)', async () => {
    const { db, seen } = mockDb((sql) => {
      if (sql.includes('FROM orders WHERE tenant_id')) return { first: { id: 'o1', room_id: 'room-1' } };
      // Settled folios never match: the gate query carries the open-only predicate.
      if (sql.includes('FROM folios WHERE')) return { first: null };
      return {};
    });
    const app = ordersApp();
    const res = await app.request(
      'http://localhost/api/orders/o1/checkout',
      jsonPatch({}),
      { DB: db }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(seen.some((s) => s.includes('FROM folios WHERE') && s.includes(`status = 'open'`))).toBe(true);
  });

  it('5 — PATCH /:id/checkout with no folio returns 200 and frees the room (legacy path intact)', async () => {
    const { db, seen } = mockDb((sql) => {
      if (sql.includes('FROM orders WHERE tenant_id')) return { first: { id: 'o1', room_id: 'room-1' } };
      if (sql.includes('FROM folios WHERE')) return { first: null };
      return {};
    });
    const app = ordersApp();
    const res = await app.request(
      'http://localhost/api/orders/o1/checkout',
      jsonPatch({}),
      { DB: db }
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.extraCharge).toBe(0);
    // Legacy side effect preserved: the room is freed.
    expect(seen.some((s) => s.includes("UPDATE rooms_new SET status = 'available'"))).toBe(true);
  });
});
