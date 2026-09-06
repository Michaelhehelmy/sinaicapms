/**
 * Money-state transition guards.
 *
 * Verifies the concurrency races closed by T41:
 *   payout double-pay / double-cancel → guarded UPDATE (AND status='pending')
 *   in a single atomic db.batch() → loser returns 409
 *   shift double-close → guarded UPDATE (AND status='open') → loser returns 409
 *
 * Uses the same SQL-routing mock DB + mountRouter helper as admin-payouts.test.js,
 * extended with batch-call tracking (batchCalls) so tests can prove the payout
 * UPDATE and every payment-settle UPDATE travel through ONE db.batch call.
 * The POS router is driven the same way pos-unit.test.js does (mock sharedAuth,
 * fetch the router directly with { DB, JWT_SECRET }).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import adminPayoutsRouter from '../../src/api/admin-payouts';
import { mountRouter } from '../helpers/routerHarness';

vi.mock('../../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
  rehashIfNeeded: vi.fn(),
}));

import posRouter from '../../src/routes/pos/index.js';
import { verifyToken } from '../../src/middleware/sharedAuth.js';

// ── SQL-routing mock DB (batch-aware) ───────────────────────────────────────

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
    batch: vi.fn(async (stmts) => {
      db.batchCalls.push(stmts.map((s) => s.sql));
      return stmts.map((s) => runHandler(s.sql, s.boundBinds) ?? { meta: { changes: 1 } });
    }),
    batchCalls: [],
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

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /:id/pay — double-approve race ─────────────────────────────────────

describe('Money guards — POST /:id/pay double-approve', () => {
  it('rejects the second of two concurrent pays with a 409 envelope', async () => {
    // Race simulation: BOTH requests see status 'pending' (the mock never
    // mutates the payout row), then the guarded UPDATE is the arbiter —
    // first batch flips it (changes 1), second finds 0 rows (changes 0).
    let guardedPayHits = 0;
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id/, [{ id: 'po1', status: 'pending', tenant_id: 1, amount: 800 }])
      .on(/SELECT \* FROM marketplace_payments WHERE payout_id/, [
        { id: 'mp1', payment_status: 'captured' },
        { id: 'mp2', payment_status: 'captured' },
      ])
      .on(/UPDATE marketplace_payouts SET status = 'paid'/, () => {
        guardedPayHits += 1;
        return { meta: { changes: guardedPayHits === 1 ? 1 : 0 } };
      })
      .on(/UPDATE marketplace_payments SET payment_status = 'settled'/, () => ({ meta: { changes: 1 } }));

    const app = mountRouter(adminPayoutsRouter);

    const res1 = await app.request(req('/po1/pay', { method: 'POST' }), {}, env(db));
    expect(res1.status).toBe(200);

    const res2 = await app.request(req('/po1/pay', { method: 'POST' }), {}, env(db));
    const body2 = await res2.json();

    expect(res2.status).toBe(409);
    expect(body2.success).toBe(false);
    expect(body2.error).toBe('Payout has already been settled or cancelled');
  });
});

// ── POST /:id/cancel — double-cancel race ───────────────────────────────────

describe('Money guards — POST /:id/cancel double-cancel', () => {
  it('rejects the second of two concurrent cancels with a 409 envelope', async () => {
    let guardedCancelHits = 0;
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id/, [{ id: 'po1', status: 'pending', tenant_id: 1, amount: 800 }])
      .on(/SELECT id FROM marketplace_payments WHERE payout_id/, [
        { id: 'mp1' }, { id: 'mp2' },
      ])
      .on(/UPDATE marketplace_payouts SET status = 'cancelled'/, () => {
        guardedCancelHits += 1;
        return { meta: { changes: guardedCancelHits === 1 ? 1 : 0 } };
      })
      .on(/UPDATE marketplace_payments SET payout_id = NULL/, () => ({ meta: { changes: 1 } }));

    const app = mountRouter(adminPayoutsRouter);

    const res1 = await app.request(req('/po1/cancel', { method: 'POST' }), {}, env(db));
    expect(res1.status).toBe(200);

    const res2 = await app.request(req('/po1/cancel', { method: 'POST' }), {}, env(db));
    const body2 = await res2.json();

    expect(res2.status).toBe(409);
    expect(body2.success).toBe(false);
    expect(body2.error).toBe('Only pending payouts can be cancelled');
  });
});

// ── Shift close — double-close race (POS) ───────────────────────────────────

describe('Money guards — POST /shifts/close double-close', () => {
  beforeEach(() => {
    verifyToken.mockResolvedValue({ userId: 7, posType: 'pos', tenantId: 't7', role: 'cashier' });
  });

  it('rejects the second of two concurrent shift closes with a 409 envelope', async () => {
    let guardedCloseHits = 0;
    const db = makeRoutingDb()
      .on(/SELECT is_active FROM pos_users/, [{ is_active: 1 }])
      .on(/SELECT id, opening_cash, opening_time FROM pos_shifts/, [{ id: 's1', opening_cash: 100, opening_time: '2026-09-06 08:00:00' }])
      .on(/FROM pos_transactions/, [{ total_cash: 50 }])
      .on(/UPDATE pos_shifts/, () => {
        guardedCloseHits += 1;
        return { meta: { changes: guardedCloseHits === 1 ? 1 : 0 } };
      });

    const shiftCloseReq = () => new Request('http://localhost/shifts/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer pos-token' },
      body: JSON.stringify({ actualClosingCash: 150 }),
    });

    const res1 = await posRouter.fetch(shiftCloseReq(), { DB: db, JWT_SECRET: 'secret' });
    expect(res1.status).toBe(200);

    const res2 = await posRouter.fetch(shiftCloseReq(), { DB: db, JWT_SECRET: 'secret' });
    const body2 = await res2.json();

    expect(res2.status).toBe(409);
    expect(body2.success).toBe(false);
  });
});

// ── Successful pay — single atomic batch ────────────────────────────────────

describe('Money guards — successful pay batching', () => {
  it('runs the payout UPDATE and all payment settles through ONE db.batch call', async () => {
    const db = makeRoutingDb()
      .on(/SELECT \* FROM marketplace_payouts WHERE id/, [{ id: 'po1', status: 'pending', tenant_id: 1, amount: 800 }])
      .on(/SELECT \* FROM marketplace_payments WHERE payout_id/, [
        { id: 'mp1', payment_status: 'captured' },
        { id: 'mp2', payment_status: 'captured' },
      ])
      .on(/UPDATE marketplace_payouts SET status = 'paid'/, () => ({ meta: { changes: 1 } }))
      .on(/UPDATE marketplace_payments SET payment_status = 'settled'/, () => ({ meta: { changes: 1 } }));

    const app = mountRouter(adminPayoutsRouter);
    const res = await app.request(req('/po1/pay', { method: 'POST' }), {}, env(db));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.payout.status).toBe('paid');
    expect(body.payout.paidAt).toBeDefined();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].paymentStatus).toBe('settled');
    expect(body.items[0].settledAt).toBe(body.payout.paidAt);

    // Both statement families travelled through the SAME batch call.
    expect(db.batch).toHaveBeenCalledTimes(1);
    const [payoutUpdateSql, ...settleSqls] = db.batchCalls[0];
    expect(payoutUpdateSql).toMatch(/set status = 'paid'/i);
    expect(payoutUpdateSql).toMatch(/AND status = 'pending'/);
    expect(settleSqls).toHaveLength(2);
    for (const sql of settleSqls) {
      expect(sql).toMatch(/SET payment_status = 'settled'/);
    }
  });
});