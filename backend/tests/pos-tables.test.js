import { describe, it, expect, vi, beforeEach } from 'vitest';

// POS router authenticates through sharedAuth's verifyToken — mock it so tests
// can inject token payloads directly (same idiom as pos-unit.test.js).
vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
  rehashIfNeeded: vi.fn(),
}));

import { verifyToken } from '../src/middleware/sharedAuth.js';
import posTablesRoutes from '../src/api/pos-tables.js';
import ordersRoutes from '../src/api/orders.js';
import { mountRouter } from './helpers/routerHarness.js';

const TENANT = 'tenant_1';

// ─── DB stubs ──────────────────────────────────────────────────

/**
 * Dispatch-on-SQL-substring DB mock (pos-users-unit.test.js idiom). Every
 * prepared statement is recorded in db.calls so tests can assert on exact
 * SQL + binds. Handlers keyed by substring configure the chain per statement;
 * unmatched statements get a benign default chain.
 */
function makeDb(handlers = {}) {
  const db = {
    calls: [],
    batch: vi.fn().mockResolvedValue([]),
    prepare: vi.fn((sql) => {
      const chain = {
        sql,
        bind: vi.fn((...args) => {
          chain.bindArgs = args;
          return chain;
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 1 } }),
      };
      for (const [sub, setup] of Object.entries(handlers)) {
        if (sql.includes(sub)) setup(chain, sql);
      }
      db.calls.push(chain);
      return chain;
    }),
  };
  return db;
}

function findBy(db, sub) {
  return db.calls.find((c) => c.sql.includes(sub));
}

function bindArgsOf(db, sub) {
  const chain = findBy(db, sub);
  return chain ? chain.bindArgs : undefined;
}

// Step-indexed stub for the POS order flow (pos-unit.test.js idioms): each
// prepare() consumes the next step; exhausted steps resolve empty. The sql of
// every statement is recorded (on both the outer chain and the object returned
// by bind(), since batch statements ARE the bound objects).
function chainDb(resultsOrFn) {
  const allFn =
    typeof resultsOrFn === 'function'
      ? resultsOrFn
      : () => Promise.resolve({ results: resultsOrFn });
  const state = { sql: undefined, bindArgs: undefined };
  const inner = {
    all: vi.fn().mockImplementation(allFn),
    first: vi.fn().mockImplementation(() =>
      typeof resultsOrFn === 'function'
        ? resultsOrFn().then((r) => r.results[0] || null)
        : Promise.resolve(resultsOrFn[0] || null)
    ),
    run: vi.fn().mockResolvedValue({}),
  };
  Object.defineProperty(inner, 'sql', { get: () => state.sql });
  const chain = {
    bind: vi.fn((...args) => {
      state.bindArgs = args;
      return inner;
    }),
  };
  Object.defineProperty(chain, 'sql', {
    get: () => state.sql,
    set: (v) => { state.sql = v; },
  });
  return chain;
}

function makeStepDb(steps) {
  return {
    batch: vi.fn().mockResolvedValue([]),
    prepare: vi
      .fn()
      .mockImplementation((sql) => {
        const step = steps.shift() || chainDb([]);
        step.sql = sql;
        return step;
      }),
  };
}

// ─── pos-tables router ─────────────────────────────────────────

describe('pos-tables routes (/api/pos-tables)', () => {
  const adminUser = { id: 'u_admin', role: 'admin' };

  function makeApp(user = adminUser) {
    return mountRouter(posTablesRoutes, {
      tenantId: TENANT,
      user,
      basePath: '/api/pos-tables',
    });
  }

  describe('GET /', () => {
    it('groups tables by section with unassigned tables LAST and reports total', async () => {
      // Rows arrive pre-sorted by the DB (section IS NULL, section, name):
      // Indoor < Patio alphabetically, null section renders last.
      const db = makeDb({
        'FROM pos_tables': (ch) =>
          ch.all.mockResolvedValue({
            results: [
              { id: 'tbl_1', tenant_id: TENANT, name: 'A1', capacity: 2, status: 'available', section: 'Indoor', created_at: '2026-08-01 10:00:00' },
              { id: 'tbl_2', tenant_id: TENANT, name: 'P1', capacity: 4, status: 'occupied', section: 'Patio', created_at: '2026-08-01 10:05:00' },
              { id: 'tbl_3', tenant_id: TENANT, name: 'Bar', capacity: 1, status: 'reserved', section: null, created_at: '2026-08-01 10:10:00' },
            ],
          }),
      });
      const res = await makeApp().request('/api/pos-tables', { method: 'GET' }, { DB: db });
      expect(res.status).toBe(200);
      const body = await res.json();
      // List envelopes carry no success flag (Phase 3/T6 convention) — only
      // errors are enveloped with success:false.
      expect(body.total).toBe(3);
      expect(body.sections.map((s) => s.section)).toEqual(['Indoor', 'Patio', null]);
      expect(body.sections[0].tables[0]).toEqual({
        id: 'tbl_1',
        tenantId: TENANT,
        name: 'A1',
        capacity: 2,
        status: 'available',
        section: 'Indoor',
        createdAt: '2026-08-01 10:00:00',
      });
      // Query is hard-scoped to the caller's tenant.
      expect(bindArgsOf(db, 'FROM pos_tables')).toEqual([TENANT]);
    });

    it('returns an empty sections array when the tenant has no tables', async () => {
      const app = makeApp();
      const res = await app.request('/api/pos-tables', { method: 'GET' }, { DB: makeDb() });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ sections: [], total: 0 });
    });

    it('maps DB failures to a client error envelope', async () => {
      const db = makeDb({
        'FROM pos_tables': (ch) => ch.all.mockRejectedValue(new Error('DB fail')),
      });
      const app = makeApp();
      const res = await app.request('/api/pos-tables', { method: 'GET' }, { DB: db });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toContain('Failed to fetch tables');
    });
  });

  describe('POST /', () => {
    it('creates a table as admin and applies defaults + trimming', async () => {
      const db = makeDb();
      const app = makeApp();
      // Drive through app.request with env so handlers see the DB:
      const res2 = await app.request(
        '/api/pos-tables',
        { method: 'POST', body: JSON.stringify({ name: '  Window  ', section: 'Patio' }) },
        { DB: db }
      );
      expect(res2.status).toBe(201);
      const body = await res2.json();
      expect(body.success).toBe(true);
      expect(body.id).toMatch(/^tbl_[0-9a-f-]{12}$/); // uuid slice may contain hyphens

      const insertBinds = bindArgsOf(db, 'INSERT INTO pos_tables');
      expect(insertBinds[0]).toBe(body.id);
      expect(insertBinds[1]).toBe(TENANT);
      expect(insertBinds[2]).toBe('Window'); // trimmed
      expect(insertBinds[3]).toBe(2); // default capacity
      expect(insertBinds[4]).toBe('available'); // default status
      expect(insertBinds[5]).toBe('Patio');

      // Audit trail records the create (best-effort, entityType pos_table).
      // logAudit bind order: id, tenant_id, user_id, action, entity_type, entity_id, …
      const auditChain = findBy(db, 'INSERT INTO audit_log');
      expect(auditChain).toBeDefined();
      expect(auditChain.bindArgs[4]).toBe('pos_table');
    });

    it('rejects managers and cashiers with 403 (admin-only mutations)', async () => {
      for (const role of ['manager', 'cashier']) {
        const app = makeApp({ id: 'u_x', role });
        const res = await app.request(
          '/api/pos-tables',
          { method: 'POST', body: JSON.stringify({ name: 'T1' }) },
          {}
        );
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error).toContain('admin role required');
      }
    });

    it('returns 401 without an authenticated user or tenant context', async () => {
      const noUser = makeApp(null);
      const resNoUser = await noUser.request(
        '/api/pos-tables',
        { method: 'POST', body: JSON.stringify({ name: 'T1' }) },
        {}
      );
      expect(resNoUser.status).toBe(401);

      const noTenant = mountRouter(posTablesRoutes, { tenantId: null, user: adminUser, basePath: '/api/pos-tables' });
      const resNoTenant = await noTenant.request(
        '/api/pos-tables',
        { method: 'POST', body: JSON.stringify({ name: 'T1' }) },
        {}
      );
      expect(resNoTenant.status).toBe(401);
    });

    it('validates the payload (missing name / bad capacity / unknown status → 400 + errors[])', async () => {
      const app = makeApp();
      for (const payload of [{}, { name: 'X', capacity: 0 }, { name: 'X', status: 'broken' }]) {
        const res = await app.request(
          '/api/pos-tables',
          { method: 'POST', body: JSON.stringify(payload) },
          {}
        );
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(Array.isArray(body.errors)).toBe(true);
        expect(body.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe('PUT /:id', () => {
    it('performs a partial COALESCE update (absent fields bind NULL)', async () => {
      const db = makeDb();
      const app = makeApp();
      const res = await app.request(
        '/api/pos-tables/tbl_1',
        { method: 'PUT', body: JSON.stringify({ status: 'cleaning' }) },
        { DB: db }
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({ success: true });

      const binds = bindArgsOf(db, 'UPDATE pos_tables SET');
      expect(binds).toEqual([null, null, 'cleaning', null, TENANT, 'tbl_1']);
    });

    it('returns 404 when the update matched zero rows', async () => {
      const db = makeDb({
        'UPDATE pos_tables': (ch) => ch.run.mockResolvedValue({ success: true, meta: { changes: 0 } }),
      });
      const app = makeApp();
      const res = await app.request(
        '/api/pos-tables/tbl_missing',
        { method: 'PUT', body: JSON.stringify({ name: 'New' }) },
        { DB: db }
      );
      expect(res.status).toBe(404);
      expect((await res.json()).error).toContain('Table not found');
    });

    it('validates field constraints (empty name, out-of-range capacity, bad status)', async () => {
      const app = makeApp();
      for (const payload of [{ name: '' }, { capacity: 1000 }, { status: 'ghost' }]) {
        const res = await app.request(
          '/api/pos-tables/tbl_1',
          { method: 'PUT', body: JSON.stringify(payload) },
          {}
        );
        expect(res.status).toBe(400);
      }
    });
  });

  describe('PATCH /:id/status', () => {
    it.each(['available', 'occupied', 'reserved', 'cleaning'])('accepts %s and echoes { id, status }', async (status) => {
      const db = makeDb();
      const app = makeApp();
      const res = await app.request(
        '/api/pos-tables/tbl_9/status',
        { method: 'PATCH', body: JSON.stringify({ status }) },
        { DB: db }
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, id: 'tbl_9', status });
      expect(bindArgsOf(db, 'UPDATE pos_tables SET status')).toEqual([status, TENANT, 'tbl_9']);
    });

    it('rejects unknown statuses with 400 + errors[]', async () => {
      const app = makeApp();
      const res = await app.request(
        '/api/pos-tables/tbl_1/status',
        { method: 'PATCH', body: JSON.stringify({ status: 'burned' }) },
        {}
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(Array.isArray(body.errors)).toBe(true);
    });

    it('returns 404 when the table does not exist', async () => {
      const db = makeDb({
        'UPDATE pos_tables': (ch) => ch.run.mockResolvedValue({ success: true, meta: { changes: 0 } }),
      });
      const app = makeApp();
      const res = await app.request(
        '/api/pos-tables/tbl_ghost/status',
        { method: 'PATCH', body: JSON.stringify({ status: 'available' }) },
        { DB: db }
      );
      expect(res.status).toBe(404);
    });

    it('enforces the admin-only gate', async () => {
      const app = makeApp({ id: 'u_mgr', role: 'manager' });
      const res = await app.request(
        '/api/pos-tables/tbl_1/status',
        { method: 'PATCH', body: JSON.stringify({ status: 'cleaning' }) },
        {}
      );
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /:id', () => {
    it('deletes within the tenant scope', async () => {
      const db = makeDb();
      const app = makeApp();
      const res = await app.request('/api/pos-tables/tbl_1', { method: 'DELETE' }, { DB: db });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(bindArgsOf(db, 'DELETE FROM pos_tables')).toEqual([TENANT, 'tbl_1']);
    });

    it('returns 404 when nothing was deleted', async () => {
      const db = makeDb({
        'DELETE FROM pos_tables': (ch) => ch.run.mockResolvedValue({ success: true, meta: { changes: 0 } }),
      });
      const app = makeApp();
      const res = await app.request('/api/pos-tables/tbl_ghost', { method: 'DELETE' }, { DB: db });
      expect(res.status).toBe(404);
    });
  });

  it('answers unknown sub-paths with 405 (catch-all)', async () => {
    const app = makeApp();
    const res = await app.request('/api/pos-tables/tbl_1/random', { method: 'PATCH' }, {});
    expect(res.status).toBe(405);
  });
});

// ─── Kitchen fulfillment state machine (PATCH /api/orders/:id/kitchen-status) ─

describe('orders kitchen-status endpoint', () => {
  function makeKitchenApp() {
    return mountRouter(ordersRoutes, { tenantId: TENANT, user: { id: 'u_admin', role: 'admin' }, basePath: '/api/orders' });
  }

  function kitchenDb(currentStatus, { auditFails = false } = {}) {
    return makeDb({
      'SELECT id, kitchen_status FROM orders': (ch) =>
        ch.first.mockResolvedValue({ id: 'ord_1', kitchen_status: currentStatus }),
      ...(auditFails && {
        'INSERT INTO audit_log': (ch) => ch.run.mockRejectedValue(new Error('audit down')),
      }),
    });
  }

  async function patchStatus(app, ordId, status, db) {
    return app.request(
      `/api/orders/${ordId}/kitchen-status`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      { DB: db }
    );
  }

  it.each([
    ['pending', 'confirmed'],
    ['pending', 'canceled'],
    ['confirmed', 'preparing'],
    ['confirmed', 'canceled'],
    ['preparing', 'ready'],
    ['ready', 'served'],
  ])('allows legal transition %s → %s', async (from, to) => {
    const db = kitchenDb(from);
    const res = await patchStatus(makeKitchenApp(), 'ord_1', to, db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: 'ord_1', status: to });
    expect(bindArgsOf(db, 'UPDATE orders SET kitchen_status')).toEqual([to, TENANT, 'ord_1']);
  });

  it('treats a missing kitchen_status as pending (legacy rows can start the flow)', async () => {
    const db = kitchenDb(null);
    const res = await patchStatus(makeKitchenApp(), 'ord_1', 'confirmed', db);
    expect(res.status).toBe(200);
  });

  it.each([
    ['confirmed', 'pending'], // never rewinds
    ['pending', 'ready'], // cannot skip states
    ['ready', 'canceled'], // cancel window closed at ready
    ['served', 'confirmed'], // served is terminal
  ])('rejects illegal transition %s → %s with 409', async (from, to) => {
    const db = kitchenDb(from);
    const res = await patchStatus(makeKitchenApp(), 'ord_1', to, db);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain(`Illegal kitchen status transition: '${from}' → '${to}'`);
    // Illegal transitions must not write anything beyond the existence read.
    expect(findBy(db, 'UPDATE orders SET kitchen_status')).toBeUndefined();
  });

  it('returns 404 for an order outside the tenant (and never updates)', async () => {
    const db = makeDb(); // first() resolves null → not found
    const res = await patchStatus(makeKitchenApp(), 'ord_ghost', 'confirmed', db);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('Order not found');
    expect(findBy(db, 'UPDATE orders SET kitchen_status')).toBeUndefined();
  });

  it('validates the body enum with 400 before touching the DB', async () => {
    const db = kitchenDb('pending');
    const res = await patchStatus(makeKitchenApp(), 'ord_1', 'microwaved', db);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(db.calls.length).toBe(0);
  });

  it('still succeeds when the best-effort audit write fails', async () => {
    const db = kitchenDb('pending', { auditFails: true });
    const res = await patchStatus(makeKitchenApp(), 'ord_1', 'confirmed', db);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: 'ord_1', status: 'confirmed' });
  });
});

// ─── POS dine-in flow (POST /api/pos/orders with tableId) ─────────────────────

describe('POS order flow — dine-in table integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function posOrderRequest(body) {
    return new Request('http://localhost/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
      body: JSON.stringify(body),
    });
  }

  // Step sequence WITHOUT tableId mirrors pos-unit.test.js POST /orders tests:
  // [shift-active, product lookup] then (table check ONLY if tableId), tax, recipe…
  function baseSteps({ tableRow } = {}) {
    const steps = [
      chainDb([{ is_active: 1 }]), // shift active check
      chainDb([{ id: 'p1', selling_price: '10', name: 'Coffee' }]), // product lookup
      chainDb([]), // promotions (none active)
    ];
    if (tableRow !== undefined) steps.push(tableRow); // conditional ownership check
    steps.push(chainDb([{ tax_rate: '0.15' }])); // org tax rate
    steps.push(chainDb([])); // recipe ingredients (none → self-stock deduction only)
    return steps;
  }

  async function importPosApp() {
    const mod = await import('../src/routes/pos/index.js');
    return mod.default;
  }

  it('creates a dine-in order bound to an owned table and occupies it inside the commit batch', async () => {
    verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
    const posApp = await importPosApp();
    const db = makeStepDb(baseSteps({ tableRow: chainDb([{ id: 'tbl_x' }]) }));
    const res = await posApp.fetch(
      posOrderRequest({ items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'cash', tableId: 'tbl_x' }),
      { DB: db, JWT_SECRET: 'secret' }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.order.tableId).toBe('tbl_x');
    expect(body.order.kitchenStatus).toBe('pending');

    // The transaction INSERT carries the table reference (last bound param).
    const txCalls = db.prepare.mock.calls;
    const txIdx = txCalls.findIndex(([sql]) => String(sql).includes('INSERT INTO pos_transactions'));
    expect(txIdx).toBeGreaterThan(-1);
    const txBinds = txCalls[txIdx].length ? db.prepare.mock.results[txIdx].value.bind.mock.calls[0] : [];
    expect(txBinds[txBinds.length - 1]).toBe('tbl_x');

    // The occupy UPDATE rides in the SAME atomic batch, right after the
    // transaction INSERT and before any item INSERT.
    expect(db.batch).toHaveBeenCalledTimes(1);
    const stmts = db.batch.mock.calls[0][0];
    const txStmtIdxInBatch = stmts.findIndex((s) => String(s.sql).includes('INSERT INTO pos_transactions'));
    const occupyIdx = stmts.findIndex((s) => String(s.sql).includes("UPDATE pos_tables SET status = 'occupied'"));
    expect(occupyIdx).toBeGreaterThan(-1); // present
    expect(occupyIdx).toBe(txStmtIdxInBatch + 1); // directly after the sale
    const itemIdx = stmts.findIndex((s) => String(s.sql).includes('INSERT INTO pos_transaction_items'));
    expect(itemIdx).toBeGreaterThan(occupyIdx);
  });

  it('rejects orders referencing another tenant’s table with 400 and commits nothing', async () => {
    verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
    const posApp = await importPosApp();
    const db = makeStepDb(baseSteps({ tableRow: chainDb([]) }));
    const res = await posApp.fetch(
      posOrderRequest({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash', tableId: 'tbl_other_tenant' }),
      { DB: db, JWT_SECRET: 'secret' }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Table tbl_other_tenant not found');
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('keeps the legacy takeout sequence: no pos_tables query at all when tableId is absent', async () => {
    verifyToken.mockResolvedValue({ userId: 'u1', posType: 'pos', tenantId: '1', organizationId: 1, role: 'cashier' });
    const posApp = await importPosApp();
    const db = makeStepDb(baseSteps()); // NO table step
    const res = await posApp.fetch(
      posOrderRequest({ items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'cash' }),
      { DB: db, JWT_SECRET: 'secret' }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order.tableId).toBeNull();
    expect(body.order.kitchenStatus).toBe('pending');

    const sqls = db.prepare.mock.calls.map(([sql]) => String(sql));
    expect(sqls.some((s) => s.includes('FROM pos_tables'))).toBe(false);
    sqls.forEach((s) => expect(s.includes('UPDATE pos_tables')).toBe(false));
  });
});
