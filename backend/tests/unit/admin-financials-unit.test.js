/**
 * Admin Financials — cross-tenant overview + public-payments ledger.
 *
 * Uses the same SQL-routing mock DB and mountRouter helper as other unit tests.
 */
import { describe, it, expect, vi } from 'vitest';
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

// ── GET /overview ───────────────────────────────────────────────────────────

describe('Admin Financials — /overview', () => {
  it('returns all overview keys including marketplacePayments aggregates', async () => {
    const db = makeRoutingDb()
      .on(/FROM accounts/, [{ cnt: 10 }])
      .on(/status = 'overdue'/, [{ cnt: 3 }])
      .on(/COUNT\(\*\) as cnt FROM invoices/, [{ cnt: 50 }])
      .on(/SUM\(total_amount\)/, [{ total: 5000 }])
      .on(/SUM\(amount\)/, [{ total: 4000 }])
      .on(/FROM tenants t/, [{ tenant_id: 't1', tenant_name: 'Camp A', invoice_count: 5, total_revenue: 1000, total_collected: 800 }])
      .on(/SUM\(gross_amount\)/, [{ total_gross: 3000, total_fees: 300, total_net: 2700 }])
      .on(/SUM\(mp\.gross_amount\)/, [{ tenant_id: 't1', tenant_name: 'Camp A', payment_count: 5, gross: 3000, fees: 300, net: 2700 }]);

    const app = mountRouter(adminFinancialsRouter);
    const res = await app.request(req('/overview'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalAccounts).toBe(10);
    expect(body.totalInvoices).toBe(50);
    expect(body.totalRevenue).toBe(5000);
    expect(body.totalCollected).toBe(4000);
    expect(body.overdueCount).toBe(3);
    expect(body.tenantBreakdown).toHaveLength(1);
    // marketplacePayments keys
    expect(body.totalGross).toBe(3000);
    expect(body.totalFees).toBe(300);
    expect(body.totalNet).toBe(2700);
    expect(body.marketplaceBreakdown).toHaveLength(1);
    expect(body.marketplaceBreakdown[0].paymentCount).toBe(5);
    expect(body.marketplaceBreakdown[0].gross).toBe(3000);
  });
});

// ── GET /public-payments ────────────────────────────────────────────────────

describe('Admin Financials — /public-payments', () => {
  it('returns paginated marketplace payments with tenant and order context', async () => {
    const mockRows = [
      {
        id: 'mp1', order_id: 'o1', tenant_id: 't1', order_reference: 'REF-001',
        channel: 'marketplace', gross_amount: 1000, marketplace_fee: 100, net_amount: 900,
        currency: 'EGP', payment_status: 'captured', captured_at: '2026-09-01T10:00:00Z',
        tenant_name: 'Camp A', check_in_date: '2026-09-10', check_out_date: '2026-09-15', customer_id: 'c1',
      },
    ];

    const db = makeRoutingDb()
      .on(/COUNT\(\*\) as cnt FROM marketplace_payments/, [{ cnt: 1 }])
      .on(/SELECT mp\.\*, t\.name as tenant_name/, () => ({ results: mockRows, meta: { changes: 0 } }));

    const app = mountRouter(adminFinancialsRouter);
    const res = await app.request(req('/public-payments'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(50);
    expect(body.hasMore).toBe(false);
    expect(body.data[0].id).toBe('mp1');
    expect(body.data[0].tenantName).toBe('Camp A');
    expect(body.data[0].checkInDate).toBe('2026-09-10');
  });

  it('applies tenantId, status, and channel filters', async () => {
    const capturedBinds = [];
    const db = makeRoutingDb()
      .on(/COUNT\(\*\) as cnt FROM marketplace_payments/, (binds) => {
        capturedBinds.push(...binds);
        return { results: [{ cnt: 0 }], meta: { changes: 0 } };
      })
      .on(/SELECT mp\.\*/, () => ({ results: [], meta: { changes: 0 } }));

    const app = mountRouter(adminFinancialsRouter);
    await app.request(req('/public-payments?tenantId=t2&status=settled&channel=pos'), {}, env(db));

    expect(capturedBinds).toContain('t2');
    expect(capturedBinds).toContain('settled');
    expect(capturedBinds).toContain('pos');
  });

  it('defaults to empty results when no rows exist', async () => {
    const db = makeRoutingDb()
      .on(/COUNT\(\*\) as cnt FROM marketplace_payments/, [{ cnt: 0 }])
      .on(/SELECT mp\.\*/, () => ({ results: [], meta: { changes: 0 } }));

    const app = mountRouter(adminFinancialsRouter);
    const res = await app.request(req('/public-payments'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(0);
    expect(body.total).toBe(0);
    expect(body.hasMore).toBe(false);
  });
});
