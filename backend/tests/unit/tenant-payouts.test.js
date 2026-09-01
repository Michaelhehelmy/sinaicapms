/**
 * Tenant Payouts — GET /payouts (tenant-scoped) + admin /overview payoutSummary.
 *
 * Uses the same SQL-routing mock DB and mountRouter helper as other unit tests.
 */
import { describe, it, expect, vi } from 'vitest';
import financialsRouter from '../../src/api/financials';
import adminFinancialsRouter from '../../src/api/admin-financials';
import { mountRouter } from '../helpers/routerHarness';

// ── SQL-routing mock DB ─────────────────────────────────────────────────────

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
    batch: vi.fn(async () => []),
    statements: [],
  };
  function runHandler(sql, binds) {
    for (const h of handlers) {
      if (h.match.test(sql)) return h.result(binds);
    }
    return undefined;
  }
  db.on = (match, result) => {
    handlers.push({ match, result: typeof result === 'function' ? result : () => ({ results: result ?? [], meta: { changes: 1 } }) });
    return db;
  };
  return db;
}

const env = (db) => ({ DB: db });
const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });

// ── GET /payouts — tenant-scoped payout listing ─────────────────────────────

describe('Tenant Payouts — GET /payouts', () => {
  it('returns only the requesting tenant\'s payouts', async () => {
    const payoutsA = [
      { id: 'pa1', amount: 500, currency: 'EGP', method: 'bank_transfer', status: 'paid', reference: 'REF-A1', notes: null, created_at: '2026-09-01T10:00:00Z', paid_at: '2026-09-02T12:00:00Z', item_count: 2 },
      { id: 'pa2', amount: 300, currency: 'EGP', method: 'cash', status: 'pending', reference: null, notes: 'Partial', created_at: '2026-08-30T08:00:00Z', paid_at: null, item_count: 0 },
    ];
    const payoutsB = [
      { id: 'pb1', amount: 1000, currency: 'EGP', method: 'bank_transfer', status: 'paid', reference: 'REF-B1', notes: null, created_at: '2026-09-01T14:00:00Z', paid_at: '2026-09-03T09:00:00Z', item_count: 3 },
    ];

    const db = makeRoutingDb()
      .on(/FROM marketplace_payouts/, (binds) => {
        if (binds[0] === 'tenantA') return { results: payoutsA, meta: { changes: 0 } };
        if (binds[0] === 'tenantB') return { results: payoutsB, meta: { changes: 0 } };
        return { results: [], meta: { changes: 0 } };
      });

    const appA = mountRouter(financialsRouter, { tenantId: 'tenantA' });
    const resA = await appA.request(req('/payouts'), {}, env(db));
    const bodyA = await resA.json();

    expect(resA.status).toBe(200);
    expect(bodyA).toHaveLength(2);
    expect(bodyA[0].id).toBe('pa1');
    expect(bodyA[1].id).toBe('pa2');

    const appB = mountRouter(financialsRouter, { tenantId: 'tenantB' });
    const resB = await appB.request(req('/payouts'), {}, env(db));
    const bodyB = await resB.json();

    expect(resB.status).toBe(200);
    expect(bodyB).toHaveLength(1);
    expect(bodyB[0].id).toBe('pb1');
  });

  it('includes item_count for each payout', async () => {
    const payouts = [
      { id: 'pa1', amount: 500, currency: 'EGP', method: 'bank_transfer', status: 'paid', reference: 'REF-A1', notes: null, created_at: '2026-09-01T10:00:00Z', paid_at: '2026-09-02T12:00:00Z', item_count: 4 },
      { id: 'pa2', amount: 300, currency: 'EGP', method: 'cash', status: 'pending', reference: null, notes: null, created_at: '2026-08-30T08:00:00Z', paid_at: null, item_count: 0 },
    ];

    const db = makeRoutingDb()
      .on(/FROM marketplace_payouts/, payouts);

    const app = mountRouter(financialsRouter, { tenantId: 'tenantA' });
    const res = await app.request(req('/payouts'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body[0].itemCount).toBe(4);
    expect(body[1].itemCount).toBe(0);
  });

  it('returns empty array when tenant has no payouts', async () => {
    const db = makeRoutingDb()
      .on(/FROM marketplace_payouts/, []);

    const app = mountRouter(financialsRouter, { tenantId: 'tenantNew' });
    const res = await app.request(req('/payouts'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('returns 400 when tenantId is missing', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(financialsRouter, { tenantId: null });
    const res = await app.request(req('/payouts'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ── GET /overview — payoutSummary + per-tenant outstanding/paidOut ──────────

describe('Admin Financials — /overview payoutSummary', () => {
  it('returns payoutSummary totals and per-tenant outstanding/paidOut in marketplaceBreakdown', async () => {
    // Seed data:
    // mp1: tenant A, captured, no payout_id, net=900 → outstanding
    // mp2: tenant A, captured, payout_id='pa1', net=800 → NOT outstanding (has payout_id)
    // mp3: tenant A, settled, net=700 → paidOut

    const mpAgg = { total_gross: 2500, total_fees: 250, total_net: 2250 };

    const mpBreakdown = [
      {
        tenant_id: 'tA', tenant_name: 'Camp A',
        payment_count: 2, gross: 2500, fees: 250, net: 1700,
        outstanding: 900, paid_out: 700,
      },
    ];

    const outstandingAgg = { total_outstanding: 900, cnt: 1 };
    const paidOutAgg = { total_paid_out: 700 };

    const db = makeRoutingDb()
      .on(/FROM accounts WHERE is_active/, [{ cnt: 10 }])
      .on(/status = 'overdue'/, [{ cnt: 3 }])
      .on(/COUNT\(\*\) as cnt FROM invoices/, [{ cnt: 50 }])
      .on(/SUM\(total_amount\)/, [{ total: 5000 }])
      .on(/SUM\(amount\)/, [{ total: 4000 }])
      .on(/FROM tenants t/, [{ tenant_id: 'tA', tenant_name: 'Camp A', invoice_count: 5, total_revenue: 1000, total_collected: 800 }])
      .on(/total_outstanding/, [outstandingAgg])
      .on(/total_paid_out/, [paidOutAgg])
      .on(/SUM\(gross_amount\)/, [mpAgg])
      .on(/SUM\(mp\.gross_amount\)/, mpBreakdown);

    const app = mountRouter(adminFinancialsRouter);
    const res = await app.request(req('/overview'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);

    // Existing keys unchanged
    expect(body.totalGross).toBe(2500);
    expect(body.totalFees).toBe(250);
    expect(body.totalNet).toBe(2250);

    // New payoutSummary
    expect(body.payoutSummary).toBeDefined();
    expect(body.payoutSummary.totalOutstanding).toBe(900);
    expect(body.payoutSummary.totalPaidOut).toBe(700);

    // Per-tenant breakdown columns
    expect(body.marketplaceBreakdown).toHaveLength(1);
    const row = body.marketplaceBreakdown[0];
    expect(row.paymentCount).toBe(2);
    expect(row.gross).toBe(2500);
    expect(row.fees).toBe(250);
    expect(row.net).toBe(1700);
    expect(row.outstanding).toBe(900);
    expect(row.paidOut).toBe(700);
  });

  it('returns zero payoutSummary when no marketplace payments exist', async () => {
    const db = makeRoutingDb()
      .on(/FROM accounts WHERE is_active/, [{ cnt: 0 }])
      .on(/status = 'overdue'/, [{ cnt: 0 }])
      .on(/COUNT\(\*\) as cnt FROM invoices/, [{ cnt: 0 }])
      .on(/SUM\(total_amount\)/, [{ total: 0 }])
      .on(/SUM\(amount\)/, [{ total: 0 }])
      .on(/FROM tenants t/, [])
      .on(/total_outstanding/, [{ total_outstanding: 0, cnt: 0 }])
      .on(/total_paid_out/, [{ total_paid_out: 0 }])
      .on(/SUM\(gross_amount\)/, [{ total_gross: 0, total_fees: 0, total_net: 0 }])
      .on(/SUM\(mp\.gross_amount\)/, []);

    const app = mountRouter(adminFinancialsRouter);
    const res = await app.request(req('/overview'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.payoutSummary.totalOutstanding).toBe(0);
    expect(body.payoutSummary.totalPaidOut).toBe(0);
    expect(body.marketplaceBreakdown).toHaveLength(0);
  });
});
