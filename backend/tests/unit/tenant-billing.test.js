/**
 * Tenant billing endpoint tests — subscription data, usage stats, auth required.
 */
import { describe, it, expect, vi } from 'vitest';
import { tenantBillingRoutes } from '../../src/api/tenant-billing';
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
const TENANT_HEADERS = { 'Content-Type': 'application/json', 'x-tenant-id': 't1' };
const req = (path, init = {}) =>
  new Request(`http://localhost${path}`, { headers: TENANT_HEADERS, ...init });

// ── GET / — returns subscription data ───────────────────────────────────────

describe('Tenant Billing', () => {
  it('GET / returns subscription + usage data', async () => {
    const db = makeRoutingDb()
      .on(/FROM tenant_subscriptions[\s\S]*LEFT JOIN subscription_plans[\s\S]*WHERE/, [
        { tenant_id: 't1', plan_id: 'plan_starter', plan_slug: 'starter', plan_name: 'Starter', status: 'active', price_monthly: 49, max_orders_monthly: 1000, max_pos_users: 5, bookings_limit: 1000, current_period_end: '2026-09-01', trial_ends_at: null, created_at: '2026-01-01' },
      ])
      .on(/SELECT COUNT\(\*\) as cnt FROM orders WHERE/, [
        { cnt: 42 },
      ])
      .on(/SELECT COUNT\(\*\) as cnt FROM pos_users WHERE/, [
        { cnt: 3 },
      ]);

    const app = mountRouter(tenantBillingRoutes, { tenantId: 't1' });
    const res = await app.request(req('/'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.subscription.plan).toBe('starter');
    expect(body.subscription.planLabel).toBe('Starter');
    expect(body.subscription.status).toBe('active');
    expect(body.subscription.bookingsLimit).toBe(1000);
    expect(body.usage.bookings).toBe(42);
    expect(body.usage.posUsers).toBe(3);
    expect(body.plans).toBeDefined();
    expect(body.plans.length).toBe(4);
  });

  it('GET / defaults to free plan when no subscription exists', async () => {
    const db = makeRoutingDb()
      .on(/FROM tenant_subscriptions[\s\S]*LEFT JOIN subscription_plans[\s\S]*WHERE/, null)
      .on(/SELECT COUNT\(\*\) as cnt FROM orders WHERE/, [
        { cnt: 5 },
      ])
      .on(/SELECT COUNT\(\*\) as cnt FROM pos_users WHERE/, [
        { cnt: 1 },
      ]);

    const app = mountRouter(tenantBillingRoutes, { tenantId: 't1' });
    const res = await app.request(req('/'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.subscription.plan).toBe('free');
    expect(body.subscription.planLabel).toBe('Free');
    expect(body.usage.bookings).toBe(5);
  });

  it('GET / returns 404 when no tenant context', async () => {
    const db = makeRoutingDb();
    const app = mountRouter(tenantBillingRoutes, { tenantId: null });
    const res = await app.request(req('/'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBe('Tenant not found');
  });
});
