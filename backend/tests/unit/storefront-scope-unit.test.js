/**
 * Wave 1 — F-A13-2: anonymous storefront cart/checkout scope gate.
 *
 * Drives the REAL index.js entrypoint with the REAL storefrontScope middleware
 * and real getTenant tenant resolution (rate limiting mocked for isolation).
 * The scope predicate itself is the unit under test:
 *
 *   STOREFRONT_CART_ENABLED == 'true'
 *     • non-GET /api/storefront/cart|checkout (non-admin) → PUBLIC scope — the
 *       audit found these returning 401 for anonymous shoppers; they must now
 *       reach the handler (201 with tenant header, 400 'Tenant ID required'
 *       without it).
 *     • /api/storefront/admin/* stays ADMIN-gated (401 for anonymous).
 *   flag absent/'false' (pre-Wave-1 behavior)
 *     • non-GET non-admin cart/checkout → ADMIN gated → 401 when anonymous.
 *     • GET reads remain public regardless of the flag.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/middleware/rateLimit.js', () => ({
  rateLimitMiddleware: vi.fn(() => async (c, next) => { await next(); }),
  policyLimiter: vi.fn(() => async (c, next) => { await next(); }),
}));

import app from '../../src/index.js';

// ── SQL-routing mock DB (mirrors storefront-unit.test.js) ───────────────────

function makeRoutingDb() {
  const handlers = [];
  const db = {
    prepare: vi.fn((sql) => {
      const stmt = {
        sql,
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

const TENANT_HEADERS = { 'Content-Type': 'application/json', 'x-tenant-id': 't1' };

function makeRequest(method, path, headers = {}, body = null) {
  const opts = { method, headers: { ...headers } };
  if (body !== null) opts.body = JSON.stringify(body);
  return new Request(`https://sinaicamps.com${path}`, opts);
}

function cartDb() {
  return makeRoutingDb()
    .on(/SELECT id, selling_price FROM pos_products/, [{ id: 'p1', selling_price: 25.0 }])
    .on(/SELECT id FROM carts WHERE session_id/, null)
    .on(/INSERT INTO carts/, { meta: { changes: 1 } })
    .on(/SELECT id, quantity FROM cart_items/, null)
    .on(/INSERT INTO cart_items/, { meta: { changes: 1 } });
}

function checkoutDb() {
  return makeRoutingDb()
    .on(/SELECT id FROM carts WHERE session_id/, [{ id: 'cart1' }])
    .on(/FROM cart_items ci/, [
      { product_id: 'p1', quantity: 2, unit_price: 50.0, total_price: 100.0, product_name: 'Tent' },
    ])
    .on(/INSERT INTO storefront_orders/, { meta: { changes: 1 } })
    .on(/INSERT INTO storefront_order_items/, { meta: { changes: 1 } });
}

function listDb() {
  return makeRoutingDb()
    .on(/SELECT COUNT.*FROM pos_products/, [{ total: 0 }])
    .on(/FROM pos_products WHERE tenant_id/, []);
}

const baseEnv = (db, extra = {}) => ({ DB: db, JWT_SECRET: 'test-secret', ENVIRONMENT: 'test', ...extra });

// Real getTenant resolves the x-tenant-id / hostname against the tenants table
// (id OR subdomain OR custom_domain, status='active') — the mock DB must answer
// that lookup or the tenant hint resolves to null and handlers 400. Only 't1'
// exists; any other lookup key (e.g. the sinaicamps.com hostname when no header
// is sent) resolves to no tenant, exactly like production.
function withTenant(db) {
  db.on(/SELECT id FROM tenants WHERE/, (binds) =>
    (binds && binds[0] === 't1')
      ? { results: [{ id: 't1' }], meta: { changes: 0 } }
      : { results: [], meta: { changes: 0 } }
  );
  return db;
}

describe('Wave 1 F-A13-2 storefront scope gate', () => {
  describe('STOREFRONT_CART_ENABLED=true', () => {
    it('anonymous POST /api/storefront/cart/items passes the public scope → 201', async () => {
      const env = baseEnv(withTenant(cartDb()), { STOREFRONT_CART_ENABLED: 'true' });
      const res = await app.fetch(
        makeRequest('POST', '/api/storefront/cart/items', TENANT_HEADERS, { productId: 'p1', quantity: 2, sessionId: 's1' }),
        env
      );
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.totalPrice).toBe(50.0);
    });

    it('anonymous cart POST without a tenant header reaches the handler → 400 Tenant ID required (NOT 401)', async () => {
      const env = baseEnv(withTenant(cartDb()), { STOREFRONT_CART_ENABLED: 'true' });
      const res = await app.fetch(
        makeRequest('POST', '/api/storefront/cart/items', { 'Content-Type': 'application/json' }, { productId: 'p1', quantity: 2, sessionId: 's1' }),
        env
      );
      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error || body.message).toMatch(/Tenant ID required/i);
    });

    it('anonymous POST /api/storefront/checkout passes the public scope → 201', async () => {
      const env = baseEnv(withTenant(checkoutDb()), { STOREFRONT_CART_ENABLED: 'true' });
      const res = await app.fetch(
        makeRequest('POST', '/api/storefront/checkout', TENANT_HEADERS, { sessionId: 's1' }),
        env
      );
      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.orderNumber).toMatch(/^ORD-[0-9A-Z]{6}$/);
    });

    it('/api/storefront/admin/* stays ADMIN-gated for anonymous callers', async () => {
      const env = baseEnv(withTenant(makeRoutingDb()), { STOREFRONT_CART_ENABLED: 'true' });
      const res = await app.fetch(
        makeRequest('GET', '/api/storefront/admin/products', TENANT_HEADERS),
        env
      );
      expect(res.status).toBe(401);
    });
  });

  describe('flag absent (pre-Wave-1 behavior)', () => {
    it('anonymous cart POST without flag → 401 (admin gate)', async () => {
      const env = baseEnv(withTenant(cartDb()));
      const res = await app.fetch(
        makeRequest('POST', '/api/storefront/cart/items', { 'Content-Type': 'application/json' }, { productId: 'p1', quantity: 2, sessionId: 's1' }),
        env
      );
      expect(res.status).toBe(401);
    });

    it('anonymous cart POST WITH tenant header but no flag → 401 (auth still enforced)', async () => {
      const env = baseEnv(withTenant(cartDb()));
      const res = await app.fetch(
        makeRequest('POST', '/api/storefront/cart/items', TENANT_HEADERS, { productId: 'p1', quantity: 2, sessionId: 's1' }),
        env
      );
      expect(res.status).toBe(401);
    });

    it('GET reads stay public with the flag absent → 200', async () => {
      const env = baseEnv(withTenant(listDb()));
      const res = await app.fetch(makeRequest('GET', '/api/storefront/products', TENANT_HEADERS), env);
      expect(res.status).toBe(200);
    });
  });
});