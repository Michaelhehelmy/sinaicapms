import { describe, it, expect, vi, beforeEach } from 'vitest';
import foliosRoutes from '../src/api/folios.js';
import { mountRouter } from './helpers/routerHarness.js';

const adminUser = { id: 'u_admin', userId: 'u_admin', role: 'admin', tenantId: 't1' };

function mount(tenantId = 't1', user = adminUser) {
  return mountRouter(foliosRoutes, { basePath: '/api/folios', tenantId, user });
}

// Generic chainable statement mock: prepare(sql) -> { bind(...).first/.all/.run }
function stmtMock({ first = undefined, all = { results: [] }, run = { meta: { changes: 1 } } } = {}) {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(first),
    all: vi.fn().mockResolvedValue(all),
    run: vi.fn().mockResolvedValue(run),
  };
}

describe('folios lifecycle (B.3 — 9 mission tests, exact numerics)', () => {
  let env;

  beforeEach(() => {
    env = { DB: null };
  });

  it('1 — POST / creates an open folio with guest_id derived from order customer_id', async () => {
    const orderRow = { customer_id: 'cust_42' };
    let insertedBind = null;
    const db = {
      batch: vi.fn(),
      prepare: vi.fn((sql) => {
        if (sql.includes('FROM orders')) {
          const s = stmtMock({ first: orderRow });
          s.bind = vi.fn((..._a) => s);
          return s;
        }
        const s = stmtMock();
        s.bind = vi.fn((...args) => { insertedBind = args; return s; });
        return s;
      }),
    };
    env.DB = db;
    const app = mount();
    const res = await app.request('http://localhost/api/folios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryOrderId: 'ord_1', notes: 'VIP' }),
    }, env);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.status).toBe('open');
    expect(body.guestId).toBe('cust_42');
    expect(body.totalAmount).toBe(0);
    // INSERT bind order: (id, tenant_id, guest_id, primary_order_id, notes)
    expect(insertedBind[1]).toBe('t1');
    expect(insertedBind[2]).toBe('cust_42');
    expect(insertedBind[3]).toBe('ord_1');
  });

  it('2 — GET / filters by status with exact counts (2 open, 1 settled)', async () => {
    const db = {
      prepare: vi.fn((sql) => {
        if (sql.includes('GROUP BY status')) {
          return stmtMock({ all: { results: [{ status: 'open', count: 2 }, { status: 'settled', count: 1 }] } });
        }
        if (sql.includes('SELECT COUNT(*)')) {
          return stmtMock({ first: { count: 2 } });
        }
        return stmtMock({ all: { results: [{ id: 'folio_a', status: 'open' }, { id: 'folio_b', status: 'open' }] } });
      }),
    };
    env.DB = db;
    const app = mount();
    const res = await app.request('http://localhost/api/folios?status=open&limit=10&offset=0', { method: 'GET' }, env);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.folios).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
    expect(body.counts).toEqual({ open: 2, settled: 1, voided: 0, total: 3 });
  });

  it('3 — GET /:id returns folio + 2 charges + 1 settlement with exact total 500', async () => {
    const folio = { id: 'folio_1', tenant_id: 't1', status: 'open', total_amount: 500 };
    const db = {
      prepare: vi.fn((sql) => {
        if (sql.includes('FROM folios WHERE')) return stmtMock({ first: folio });
        if (sql.includes('FROM folio_charges')) {
          return stmtMock({ all: { results: [
            { id: 'chg_1', total_price: 300, voided_at: null },
            { id: 'chg_2', total_price: 200, voided_at: null },
          ] } });
        }
        return stmtMock({ all: { results: [{ id: 'stl_1', amount: 500, method: 'split' }] } });
      }),
    };
    env.DB = db;
    const app = mount();
    const res = await app.request('http://localhost/api/folios/folio_1', { method: 'GET' }, env);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.folio.totalAmount).toBe(500);
    expect(body.charges).toHaveLength(2);
    expect(body.settlements).toHaveLength(1);
    expect(body.charges[0].totalPrice).toBe(300);
    expect(body.settlements[0].amount).toBe(500);
  });

  it('4 — POST /:id/charges computes total = qty*price (2x150=300) via batch, folio 200→500', async () => {
    const folio = { id: 'folio_1', tenant_id: 't1', status: 'open', total_amount: 200 };
    const batchSpy = vi.fn().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    let chargeBind = null;
    const db = {
      batch: batchSpy,
      prepare: vi.fn((sql) => {
        if (sql.includes('FROM folios WHERE')) return stmtMock({ first: folio });
        const s = stmtMock();
        s.bind = vi.fn((...args) => { if (sql.includes('INTO folio_charges')) chargeBind = args; return s; });
        return s;
      }),
    };
    env.DB = db;
    const app = mount();
    const res = await app.request('http://localhost/api/folios/folio_1/charges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'restaurant', description: 'Dinner', quantity: 2, unitPrice: 150 }),
    }, env);
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.totalPrice).toBe(300);
    expect(body.totalAmount).toBe(500);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toHaveLength(2);
    // charge INSERT bind tail: (description, quantity, unit_price, total_price)
    expect(chargeBind.slice(-4)).toEqual(['Dinner', 2, 150, 300]);
  });

  it('5 — POST /:id/charges 409 when folio not open; 400 on invalid source enum', async () => {
    const closedFolio = { id: 'folio_9', tenant_id: 't1', status: 'settled', total_amount: 500 };
    const openFolio = { id: 'folio_1', tenant_id: 't1', status: 'open', total_amount: 0 };
    const db = {
      batch: vi.fn(),
      prepare: vi.fn((sql) => {
        if (sql.includes('FROM folios WHERE')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn((..._a) => Promise.resolve(undefined)),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({}),
          };
        }
        return stmtMock();
      }),
    };
    // Custom first() routing by folio id via bind args
    db.prepare = vi.fn((sql) => {
      const s = { _args: [] };
      s.bind = vi.fn((...args) => { s._args = args; return s; });
      s.first = vi.fn(() => {
        if (!sql.includes('FROM folios WHERE')) return Promise.resolve(undefined);
        const id = s._args[1];
        if (id === 'folio_9') return Promise.resolve(closedFolio);
        return Promise.resolve(openFolio);
      });
      s.all = vi.fn().mockResolvedValue({ results: [] });
      s.run = vi.fn().mockResolvedValue({});
      return s;
    });
    env.DB = db;
    const app = mount();
    const r409 = await app.request('http://localhost/api/folios/folio_9/charges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'room', description: 'Night', quantity: 1, unitPrice: 100 }),
    }, env);
    expect(r409.status).toBe(409);
    const r400 = await app.request('http://localhost/api/folios/folio_1/charges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'minibar', description: 'Snack', quantity: 1, unitPrice: 10 }),
    }, env);
    expect(r400.status).toBe(400);
  });

  it('6 — DELETE charge soft-voids + recomputes total (500−200=300) via batch', async () => {
    const folio = { id: 'folio_1', tenant_id: 't1', status: 'open', total_amount: 500 };
    const charge = { id: 'chg_2', folio_id: 'folio_1', total_price: 200, voided_at: null };
    const batchSpy = vi.fn().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    const seenSql = [];
    const db = {
      batch: batchSpy,
      prepare: vi.fn((sql) => {
        seenSql.push(sql);
        if (sql.includes('FROM folios WHERE')) return stmtMock({ first: folio });
        if (sql.includes('FROM folio_charges WHERE')) return stmtMock({ first: charge });
        return stmtMock();
      }),
    };
    env.DB = db;
    const app = mount();
    const res = await app.request('http://localhost/api/folios/folio_1/charges/chg_2', { method: 'DELETE' }, env);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.totalAmount).toBe(300);
    expect(batchSpy).toHaveBeenCalledTimes(1);
    expect(batchSpy.mock.calls[0][0]).toHaveLength(2);
    expect(seenSql.join(' ')).not.toMatch(/DELETE\s+FROM/i);
  });

  it('7 — DELETE already-voided charge returns 409', async () => {
    const folio = { id: 'folio_1', tenant_id: 't1', status: 'open', total_amount: 300 };
    const charge = { id: 'chg_2', folio_id: 'folio_1', total_price: 200, voided_at: '2026-09-30T00:00:00Z' };
    const db = {
      batch: vi.fn(),
      prepare: vi.fn((sql) => {
        if (sql.includes('FROM folios WHERE')) return stmtMock({ first: folio });
        return stmtMock({ first: charge });
      }),
    };
    env.DB = db;
    const app = mount();
    const res = await app.request('http://localhost/api/folios/folio_1/charges/chg_2', { method: 'DELETE' }, env);
    expect(res.status).toBe(409);
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('8 — POST /:id/settle split 200+300=500 settles; mismatch 400; closed folio 409', async () => {
    const openFolio = { id: 'folio_1', tenant_id: 't1', status: 'open', total_amount: 500 };
    const closedFolio = { id: 'folio_9', tenant_id: 't1', status: 'settled', total_amount: 500 };
    const batchSpy = vi.fn().mockResolvedValue([{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);
    const db = {
      batch: batchSpy,
      prepare: vi.fn((sql) => {
        const s = { _args: [] };
        s.bind = vi.fn((...args) => { s._args = args; return s; });
        s.first = vi.fn(() => {
          if (!sql.includes('FROM folios WHERE')) return Promise.resolve(undefined);
          return Promise.resolve(s._args[1] === 'folio_9' ? closedFolio : openFolio);
        });
        s.all = vi.fn().mockResolvedValue({ results: [] });
        s.run = vi.fn().mockResolvedValue({});
        return s;
      }),
    };
    env.DB = db;
    const app = mount();
    const ok = await app.request('http://localhost/api/folios/folio_1/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500, method: 'split', amountCash: 200, amountCard: 300 }),
    }, env);
    const okBody = await ok.json();
    expect(ok.status).toBe(200);
    expect(okBody.success).toBe(true);
    expect(okBody.settlement.amountCash).toBe(200);
    expect(okBody.settlement.amountCard).toBe(300);
    expect(okBody.folio.status).toBe('settled');
    expect(batchSpy).toHaveBeenCalledTimes(1);

    const bad = await app.request('http://localhost/api/folios/folio_1/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500, method: 'split', amountCash: 100, amountCard: 100 }),
    }, env);
    expect(bad.status).toBe(400);

    const conflict = await app.request('http://localhost/api/folios/folio_9/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500, method: 'cash' }),
    }, env);
    expect(conflict.status).toBe(409);
  });

  it('9 — POST /:id/void admin-only flip (no DELETEs); cross-tenant reads 404', async () => {
    const folio = { id: 'folio_1', tenant_id: 't1', status: 'open', total_amount: 100 };
    const seenSql = [];
    const db = {
      batch: vi.fn(),
      prepare: vi.fn((sql) => {
        seenSql.push(sql);
        if (sql.includes('FROM folios WHERE')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(folio),
            all: vi.fn().mockResolvedValue({ results: [] }),
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          };
        }
        return stmtMock();
      }),
    };
    env.DB = db;
    // Admin void succeeds
    const app = mount('t1', adminUser);
    const ok = await app.request('http://localhost/api/folios/folio_1/void', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'duplicate' }),
    }, env);
    const okBody = await ok.json();
    expect(ok.status).toBe(200);
    expect(okBody.status).toBe('voided');
    expect(seenSql.join(' ')).not.toMatch(/DELETE\s+FROM/i);

    // Non-admin void is forbidden
    const staffApp = mount('t1', { id: 'u2', userId: 'u2', role: 'staff', tenantId: 't1' });
    const forbidden = await staffApp.request('http://localhost/api/folios/folio_1/void', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env);
    expect(forbidden.status).toBe(403);

    // Cross-tenant detail read is 404 (never 403)
    const xdb = {
      prepare: vi.fn(() => stmtMock({ first: null, all: { results: [] } })),
    };
    const xapp = mount('t_other', adminUser);
    const xres = await xapp.request('http://localhost/api/folios/folio_1', { method: 'GET' }, { DB: xdb });
    expect(xres.status).toBe(404);
  });
});
