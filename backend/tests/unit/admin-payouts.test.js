/**
 * Admin Payouts — payout management for marketplace → tenant payouts.
 *
 * Uses the same SQL-routing mock DB and mountRouter helper as admin-financials-unit.test.js.
 */
import { describe, it, expect, vi } from 'vitest';
import adminPayoutsRouter from '../../src/api/admin-payouts';
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

// ── GET /eligible ────────────────────────────────────────────────────────────

describe('Admin Payouts — GET /eligible', () => {
  it('returns captured unbatched marketplace payments with tenantName and totalNet', async () => {
    const db = makeRoutingDb()
      .on(/SELECT mp\.\*.*FROM marketplace_payments mp/s, [
        { id: 'mp1', tenant_id: '1', net_amount: 900, currency: 'EGP', payment_status: 'captured', channel: 'marketplace', tenant_name: 'Camp A' },
        { id: 'mp2', tenant_id: '1', net_amount: 600, currency: 'EGP', payment_status: 'captured', channel: 'marketplace', tenant_name: 'Camp A' },
      ])
      .on(/COUNT\(\*\) as total.*FROM marketplace_payments mp/s, [{ total: 2, total_net: 1500 }]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/eligible'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.totalNet).toBe(1500);
    expect(body.data[0].tenantName).toBe('Camp A');
  });

  it('filters by tenantId when provided', async () => {
    let capturedBinds = [];
    const db = makeRoutingDb()
      .on(/SELECT mp\.\*.*FROM marketplace_payments mp/s, (binds) => { capturedBinds = binds; return { results: [], meta: { changes: 0 } }; })
      .on(/COUNT\(\*\) as total.*FROM marketplace_payments mp/s, [{ total: 0, total_net: 0 }]);

    const app = mountRouter(adminPayoutsRouter);
    await app.request(req('/eligible?tenantId=42'), {}, env(db));

    expect(capturedBinds).toContain('42');
  });

  it('excludes already-batched payments', async () => {
    const db = makeRoutingDb()
      .on(/SELECT mp\.\*.*FROM marketplace_payments mp/s, [])
      .on(/COUNT\(\*\) as total.*FROM marketplace_payments mp/s, [{ total: 0, total_net: 0 }]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/eligible'), {}, env(db));
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

// ── POST / (create payout) ──────────────────────────────────────────────────

describe('Admin Payouts — POST /', () => {
  it('creates payout from 2 payments — amount = sum net_amount, items stay captured', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id.*FROM marketplace_payments.*WHERE id IN/s, [
        { id: 'mp1', tenant_id: '1', net_amount: 500, currency: 'EGP', payment_status: 'captured', payout_id: null, channel: 'marketplace' },
        { id: 'mp2', tenant_id: '1', net_amount: 300, currency: 'EGP', payment_status: 'captured', payout_id: null, channel: 'marketplace' },
      ])
      .on(/INSERT INTO marketplace_payouts/, { meta: { changes: 1 } })
      .on(/UPDATE.*marketplace_payments.*SET.*payout_id/, { meta: { changes: 1 } });

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/', {
      method: 'POST',
      body: JSON.stringify({ tenantId: '1', paymentIds: ['mp1', 'mp2'], method: 'bank_transfer' }),
    }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.payout).toBeDefined();
    expect(body.payout.tenantId).toBe('1');
    expect(body.payout.amount).toBe(800);
    expect(body.payout.method).toBe('bank_transfer');
    expect(body.payout.status).toBe('pending');
    expect(body.items).toHaveLength(2);
  });

  it('rejects mixed-tenant payment IDs', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id.*FROM marketplace_payments.*WHERE id IN/, [
        { id: 'mp1', tenant_id: '1', net_amount: 500, currency: 'EGP', payment_status: 'captured', payout_id: null, channel: 'marketplace' },
        { id: 'mp2', tenant_id: '2', net_amount: 300, currency: 'EGP', payment_status: 'captured', payout_id: null, channel: 'marketplace' },
      ]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/', {
      method: 'POST',
      body: JSON.stringify({ tenantId: '1', paymentIds: ['mp1', 'mp2'], method: 'bank_transfer' }),
    }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('rejects non-existent payment ID', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id.*FROM marketplace_payments.*WHERE id IN/, [
        { id: 'mp1', tenant_id: '1', net_amount: 500, currency: 'EGP', payment_status: 'captured', payout_id: null, channel: 'marketplace' },
      ]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/', {
      method: 'POST',
      body: JSON.stringify({ tenantId: '1', paymentIds: ['mp1', 'mp_NONEXISTENT'], method: 'bank_transfer' }),
    }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('rejects already-settled payment', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id.*FROM marketplace_payments.*WHERE id IN/, [
        { id: 'mp1', tenant_id: '1', net_amount: 500, currency: 'EGP', payment_status: 'settled', payout_id: null, channel: 'marketplace' },
      ]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/', {
      method: 'POST',
      body: JSON.stringify({ tenantId: '1', paymentIds: ['mp1'], method: 'cash' }),
    }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('rejects POS-channel payment', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id.*FROM marketplace_payments.*WHERE id IN/, [
        { id: 'mp1', tenant_id: '1', net_amount: 500, currency: 'EGP', payment_status: 'captured', payout_id: null, channel: 'pos' },
      ]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/', {
      method: 'POST',
      body: JSON.stringify({ tenantId: '1', paymentIds: ['mp1'], method: 'paymob' }),
    }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('rejects empty paymentIds', async () => {
    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/', {
      method: 'POST',
      body: JSON.stringify({ tenantId: '1', paymentIds: [], method: 'other' }),
    }), {}, env(makeRoutingDb()));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('rejects a numeric tenantId (tenant_id is TEXT everywhere — string contract)', async () => {
    const db = makeRoutingDb()
      .on(/SELECT id.*FROM marketplace_payments.*WHERE id IN/, [
        { id: 'mp1', tenant_id: '1', net_amount: 500, currency: 'EGP', payment_status: 'captured', payout_id: null, channel: 'marketplace' },
      ]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/', {
      method: 'POST',
      body: JSON.stringify({ tenantId: 1, paymentIds: ['mp1'], method: 'bank_transfer' }),
    }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });
});

// ── POST /:id/pay ───────────────────────────────────────────────────────────

describe('Admin Payouts — POST /:id/pay', () => {
  it('marks pending payout as paid — payments flip to settled with settled_at', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id/, [{ id: 'po1', status: 'pending', tenant_id: '1', amount: 800 }])
      .on(/UPDATE.*marketplace_payouts.*SET.*status.*paid/, { meta: { changes: 1 } })
      .on(/SELECT \* FROM marketplace_payments WHERE payout_id/, [
        { id: 'mp1', payment_status: 'captured' },
        { id: 'mp2', payment_status: 'captured' },
      ])
      .on(/UPDATE.*marketplace_payments.*SET.*payment_status.*settled/, { meta: { changes: 1 } });

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/po1/pay', { method: 'POST' }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.payout.status).toBe('paid');
    expect(body.payout.paidAt).toBeDefined();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].paymentStatus).toBe('settled');
    expect(body.items[0].settledAt).toBeDefined();
    expect(body.items[0].settledAt).toBe(body.payout.paidAt);
  });

  it('rejects pay again on already-paid payout', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id/, [{ id: 'po1', status: 'paid', tenant_id: '1', amount: 800 }]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/po1/pay', { method: 'POST' }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
  });

  it('returns 404 for non-existent payout', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id/, []);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/nonexistent/pay', { method: 'POST' }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});

// ── POST /:id/cancel ────────────────────────────────────────────────────────

describe('Admin Payouts — POST /:id/cancel', () => {
  it('cancels pending payout — payout_id cleared, payments stay captured', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id/, [{ id: 'po1', status: 'pending', tenant_id: '1', amount: 800 }])
      .on(/UPDATE.*marketplace_payouts.*SET.*status.*cancelled/, { meta: { changes: 1 } })
      .on(/SELECT id FROM marketplace_payments WHERE payout_id/, [
        { id: 'mp1' }, { id: 'mp2' },
      ])
      .on(/UPDATE.*marketplace_payments.*SET.*payout_id = NULL/, { meta: { changes: 1 } });

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/po1/cancel', { method: 'POST' }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.payout.status).toBe('cancelled');
    expect(body.payout.cancelledAt).toBeDefined();
  });

  it('rejects cancel on already-paid payout', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id/, [{ id: 'po1', status: 'paid' }]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/po1/cancel', { method: 'POST' }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
  });

  it('rejects cancel on already-cancelled payout', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id/, [{ id: 'po1', status: 'cancelled' }]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/po1/cancel', { method: 'POST' }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.success).toBe(false);
  });
});

// ── GET / (paginated list) ──────────────────────────────────────────────────

describe('Admin Payouts — GET /', () => {
  it('returns paginated payouts with tenant_name and item_count', async () => {
    const db = makeRoutingDb()
      .on(/COUNT\(\*\) as cnt FROM marketplace_payouts/, [{ cnt: 1 }])
      .on(/SELECT p\.\*.*FROM marketplace_payouts/s, [
        { id: 'po1', tenant_id: '1', amount: 800, status: 'pending', tenant_name: 'Camp A', item_count: 2 },
      ]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.data[0].tenantName).toBe('Camp A');
    expect(body.data[0].itemCount).toBe(2);
  });

  it('filters by tenantId and status', async () => {
    let capturedBinds = [];
    const db = makeRoutingDb()
      .on(/COUNT\(\*\) as cnt FROM marketplace_payouts/, (binds) => { capturedBinds = [...binds]; return { results: [{ cnt: 0 }], meta: { changes: 0 } }; })
      .on(/SELECT p\.\*.*FROM marketplace_payouts/s, () => ({ results: [], meta: { changes: 0 } }));

    const app = mountRouter(adminPayoutsRouter);
    await app.request(req('/?tenantId=5&status=paid'), {}, env(db));

    expect(capturedBinds).toContain('5');
    expect(capturedBinds).toContain('paid');
  });
});

// ── F-001 atomic create + overlap guard ─────────────────────────────────────

// Stateful mock where the validation SELECT always sees the pre-race
// snapshot (both concurrent creates pass guards) while batch UPDATEs enforce
// the defensive WHERE on live state — the batch decides the winner.
function makeStatefulPayoutDb({ throwOnBatch = false } = {}) {
  const payments = new Map([
    { id: 'mp1', tenant_id: '1', net_amount: 500, currency: 'EGP', payment_status: 'captured', payout_id: null, channel: 'marketplace' },
    { id: 'mp2', tenant_id: '1', net_amount: 300, currency: 'EGP', payment_status: 'captured', payout_id: null, channel: 'marketplace' },
  ].map((p) => [p.id, p]));
  const payouts = new Map();
  const db = {
    payments,
    payouts,
    batches: [],
    prepare(sql) {
      const stmt = {
        sql,
        boundBinds: [],
        bind(...binds) { stmt.boundBinds = binds; return stmt; },
        all: async () => select(sql, stmt.boundBinds),
        first: async () => (await select(sql, stmt.boundBinds)).results[0] ?? null,
        run: async () => { throw new Error('run() unexpected on F-001 paths'); },
      };
      return stmt;
    },
    batch: async (statements) => {
      if (throwOnBatch) throw new Error('D1 batch unavailable');
      db.batches.push(statements.map((s) => s.sql));
      return statements.map((s) => apply(s.sql, s.boundBinds));
    },
  };
  function select(sql, binds) {
    if (/FROM marketplace_payments/.test(sql) && /WHERE id IN/.test(sql)) {
      return {
        results: binds.filter((pid) => payments.has(pid))
          .map((pid) => ({ ...payments.get(pid), payout_id: null, payment_status: 'captured' })),
        meta: { changes: 0 },
      };
    }
    throw new Error(`unexpected SELECT: ${sql}`);
  }
  function apply(sql, binds) {
    if (/INSERT INTO marketplace_payouts/.test(sql)) {
      const [id, tenant_id, amount, currency, method, reference, notes, created_by, created_at] = binds;
      payouts.set(id, { id, tenant_id, amount, currency, method, status: 'pending', reference, notes, created_by, created_at });
      return { meta: { changes: 1 } };
    }
    if (/UPDATE marketplace_payments SET payout_id/.test(sql)) {
      const [payoutId, pid] = binds;
      const row = payments.get(pid);
      if (row && row.payout_id == null && row.payment_status === 'captured') {
        row.payout_id = payoutId;
        return { meta: { changes: 1 } };
      }
      return { meta: { changes: 0 } };
    }
    throw new Error(`unexpected batch statement: ${sql}`);
  }
  return db;
}

const createReq = (paymentIds) => req('/', {
  method: 'POST',
  body: JSON.stringify({ tenantId: '1', paymentIds, method: 'bank_transfer' }),
});

describe('Admin Payouts — F-001 atomic create', () => {
  it('two concurrent POSTs over the same ids → one 201 + one 409, no double-link', async () => {
    const db = makeStatefulPayoutDb();
    const app = mountRouter(adminPayoutsRouter);

    const [resA, resB] = await Promise.all([
      app.request(createReq(['mp1', 'mp2']), {}, env(db)),
      app.request(createReq(['mp1', 'mp2']), {}, env(db)),
    ]);

    expect([resA.status, resB.status].sort()).toEqual([201, 409]);
    const winner = resA.status === 201 ? await resA.json() : await resB.json();
    const loser = resA.status === 409 ? await resA.json() : await resB.json();
    expect(loser.success).toBe(false);
    expect(loser.error).toBe('Payment already linked to another payout');

    // No double-link: every row points at exactly the winning payout.
    for (const row of db.payments.values()) {
      expect(row.payout_id).toBe(winner.payout.id);
    }
  });

  it('mocked batch throw commits neither header nor links', async () => {
    const db = makeStatefulPayoutDb({ throwOnBatch: true });
    const app = mountRouter(adminPayoutsRouter);

    const res = await app.request(createReq(['mp1', 'mp2']), {}, env(db));

    expect(res.status).toBe(500);
    expect(db.payouts.size).toBe(0);
    for (const row of db.payments.values()) {
      expect(row.payout_id).toBeNull();
    }
  });

  it('normal POST links all rows with matching payout_id in one batch', async () => {
    const db = makeStatefulPayoutDb();
    const app = mountRouter(adminPayoutsRouter);

    const res = await app.request(createReq(['mp1', 'mp2']), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(201);
    // INSERT + 2 link UPDATEs travelled through ONE db.batch call.
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(3);
    expect(db.batches[0][0]).toMatch(/INSERT INTO marketplace_payouts/);
    for (const sql of db.batches[0].slice(1)) {
      expect(sql).toMatch(/SET payout_id/);
      expect(sql).toMatch(/payout_id IS NULL/);
      expect(sql).toMatch(/payment_status = 'captured'/);
    }
    for (const pid of ['mp1', 'mp2']) {
      expect(db.payments.get(pid).payout_id).toBe(body.payout.id);
    }
    expect(db.payouts.get(body.payout.id).status).toBe('pending');
  });
});

// ── GET /:id (detail) ───────────────────────────────────────────────────────

describe('Admin Payouts — GET /:id', () => {
  it('returns payout with items', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id = \?/, [
        { id: 'po1', tenant_id: '1', amount: 800, status: 'paid' },
      ])
      .on(/SELECT mp\.\*.*FROM marketplace_payments mp.*WHERE mp\.payout_id/s, [
        { id: 'mp1', tenant_id: '1', net_amount: 500, tenantName: 'Camp A' },
        { id: 'mp2', tenant_id: '1', net_amount: 300, tenantName: 'Camp A' },
      ]);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/po1'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.payout.id).toBe('po1');
    expect(body.items).toHaveLength(2);
  });

  it('returns 404 for non-existent payout', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id = \?/, []);

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/nonexistent'), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
  });
});
