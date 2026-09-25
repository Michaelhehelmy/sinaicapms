/**
 * Phase 4e — pos_shifts scoped per project store (Option Y, step 4e).
 *
 * Drives the REAL POS Hono router (`backend/src/routes/pos/index.js`) against
 * a REAL SQLite database (better-sqlite3 :memory:) through a minimal
 * D1-compatible shim (same idiom as phase4b/phase4c). `verifyToken` is stubbed
 * per test; the pos_shifts stub carries the post-0119 `store_id` column.
 *
 * GATE TEST 2: Camp + Restaurant shifts open simultaneously, take independent
 * sales, close independently — exact totals asserted, totals do not cross
 * (a same-cashier decoy sale on the other store + a voided sale are excluded
 * from the Camp till by the store predicate).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

vi.mock('../src/middleware/sharedAuth.js', () => ({
  verifyToken: vi.fn(),
  verifyPassword: vi.fn(),
  generateToken: vi.fn(),
  rehashIfNeeded: vi.fn(),
}));

import posRouter from '../src/routes/pos/index.js';
import { verifyToken } from '../src/middleware/sharedAuth.js';

const TENANT = 't1';
const CAMP = 'p_camp';
const REST = 'p_rest';
const CAMP_STORE = 1;
const REST_STORE = 2;

const CAMP_TOKEN = {
  userId: 'cash_camp', posType: 'pos', tenantId: TENANT, organizationId: 1,
  storeId: CAMP_STORE, role: 'cashier', projectId: CAMP,
};
const REST_TOKEN = {
  userId: 'cash_rest', posType: 'pos', tenantId: TENANT, organizationId: 1,
  storeId: REST_STORE, role: 'cashier', projectId: REST,
};

// ─── Real-shaped stub schema (post-0119: pos_shifts carries store_id)
function buildDb() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE pos_organizations (id INTEGER PRIMARY KEY, tax_rate REAL);
    CREATE TABLE tenant_org_mapping (tenant_id TEXT NOT NULL UNIQUE, organization_id INTEGER NOT NULL UNIQUE);
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, created_at TEXT, deleted_at TEXT);
    CREATE TABLE pos_stores (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, project_id TEXT);
    CREATE TABLE pos_users (
      id TEXT PRIMARY KEY, organization_id INTEGER NOT NULL,
      store_id INTEGER, project_id TEXT, is_active INTEGER DEFAULT 1, deleted_at TEXT,
      username TEXT, email TEXT, first_name TEXT, last_name TEXT,
      password_hash TEXT, role TEXT, last_login_at TEXT
    );
    CREATE TABLE pos_shifts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, cashier_id TEXT NOT NULL,
      store_id INTEGER, status TEXT NOT NULL DEFAULT 'open',
      opening_time TEXT NOT NULL DEFAULT (datetime('now')), closing_time TEXT,
      opening_cash REAL NOT NULL DEFAULT 0.0,
      expected_closing_cash REAL NOT NULL DEFAULT 0.0,
      actual_closing_cash REAL, notes TEXT
    );
    CREATE TABLE pos_transactions (
      id TEXT PRIMARY KEY, tenant_id TEXT, cashier_id TEXT, store_id INTEGER,
      amount_cash REAL DEFAULT 0.0, status TEXT DEFAULT 'pending', created_at TEXT
    );
    INSERT INTO pos_organizations (id, tax_rate) VALUES (1, 0.1);
    INSERT INTO tenant_org_mapping (tenant_id, organization_id) VALUES ('t1', 1);
    INSERT INTO projects (id, tenant_id, created_at, deleted_at) VALUES
      ('p_default', 't1', '2026-01-01 00:00:00', NULL),
      ('p_camp', 't1', '2026-02-01 00:00:00', NULL),
      ('p_rest', 't1', '2026-03-01 00:00:00', NULL);
    INSERT INTO pos_stores (id, organization_id, project_id) VALUES (1, 1, 'p_camp'), (2, 1, 'p_rest');
    INSERT INTO pos_users (id, organization_id, store_id, project_id, is_active, deleted_at, username, email, first_name, last_name, password_hash, role) VALUES
      ('cash_camp', 1, 1, NULL, 1, NULL, 'camp_cashier', 'camp@test.com', 'Camp', 'Cashier', 'hash', 'cashier'),
      ('cash_rest', 1, 2, NULL, 1, NULL, 'rest_cashier', 'rest@test.com', 'Rest', 'Cashier', 'hash', 'cashier');
  `);
  return sqlite;
}

// ─── Minimal D1-compatible shim (records SQL + binds for predicate assertions)
function wrapD1(sqlite, sqlLog, bindLog) {
  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
  return {
    prepare(sql) {
      return {
        bind: (...params) => {
          bindLog.push({ sql, params });
          const bound = {
            _sql: sql,
            _params: params,
            all: async () => {
              sqlLog.push(sql);
              const s = sqlite.prepare(sql);
              if (isRead(sql)) return { results: s.all(...params) };
              const info = s.run(...params);
              return { results: [], meta: { changes: Number(info.changes) } };
            },
            first: async () => {
              sqlLog.push(sql);
              const s = sqlite.prepare(sql);
              if (isRead(sql)) return s.get(...params) ?? null;
              const info = s.run(...params);
              return info.changes > 0 ? { id: null } : null;
            },
            run: async () => {
              sqlLog.push(sql);
              const info = sqlite.prepare(sql).run(...params);
              return { meta: { changes: Number(info.changes) } };
            },
          };
          return bound;
        },
      };
    },
    batch: async (stmts) => {
      const out = [];
      for (const st of stmts) {
        sqlLog.push(st._sql);
        const s = sqlite.prepare(st._sql);
        if (isRead(st._sql)) out.push({ results: s.all(...st._params) });
        else {
          const info = s.run(...st._params);
          out.push({ meta: { changes: Number(info.changes) } });
        }
      }
      return out;
    },
  };
}

function setup() {
  const sqlite = buildDb();
  const sqlLog = [];
  const bindLog = [];
  const db = wrapD1(sqlite, sqlLog, bindLog);
  return { sqlite, db, sqlLog, bindLog };
}

const authed = (db, method, path, body) =>
  posRouter.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer t' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    { DB: db, JWT_SECRET: 'secret' }
  );

function sell(sqlite, id, cashierId, storeId, amountCash, status = 'completed') {
  sqlite
    .prepare(
      `INSERT INTO pos_transactions (id, tenant_id, cashier_id, store_id, amount_cash, status, created_at)
       VALUES (?, 't1', ?, ?, ?, ?, datetime('now'))`
    )
    .run(id, cashierId, storeId, amountCash, status);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Phase 4e — pos_shifts per project store (GATE TEST 2)', () => {
  it('Camp + Restaurant shifts open simultaneously, close independently, exact totals', async () => {
    const { sqlite, db, bindLog } = setup();

    // Two project stores open at once — neither blocks the other.
    verifyToken.mockResolvedValue({ ...CAMP_TOKEN });
    const campOpen = await authed(db, 'POST', '/shifts/open', { openingCash: 100 });
    expect(campOpen.status).toBe(200);

    verifyToken.mockResolvedValue({ ...REST_TOKEN });
    const restOpen = await authed(db, 'POST', '/shifts/open', { openingCash: 200 });
    expect(restOpen.status).toBe(200);

    // Independent sales: Camp 50 + 25 cash (voided 30 excluded), Rest 40 cash.
    // Decoy: a completed cash sale by the CAMP cashier booked to the REST
    // store (1000) — the Camp till must exclude it (store predicate).
    sell(sqlite, 'tx_c1', 'cash_camp', CAMP_STORE, 50);
    sell(sqlite, 'tx_c2', 'cash_camp', CAMP_STORE, 25);
    sell(sqlite, 'tx_cv', 'cash_camp', CAMP_STORE, 30, 'voided');
    sell(sqlite, 'tx_r1', 'cash_rest', REST_STORE, 40);
    sell(sqlite, 'tx_decoy', 'cash_camp', REST_STORE, 1000);

    // Camp closes first: 100 + 75 = 175 exact (decoy + voided excluded).
    verifyToken.mockResolvedValue({ ...CAMP_TOKEN });
    const campClose = await authed(db, 'POST', '/shifts/close', { actualClosingCash: 175 });
    const campBody = await campClose.json();
    expect(campClose.status).toBe(200);
    expect(campBody.shift.totalCashSales).toBe(75);
    expect(campBody.shift.expectedClosingCash).toBe(175);
    expect(campBody.shift.discrepancy).toBe(0);

    // Restaurant still open — closes do not cross.
    verifyToken.mockResolvedValue({ ...REST_TOKEN });
    const restActive = await authed(db, 'GET', '/shifts/active');
    expect((await restActive.json()).active).toBe(true);

    // Rest closes: 200 + 40 = 240 exact.
    const restClose = await authed(db, 'POST', '/shifts/close', { actualClosingCash: 240 });
    const restBody = await restClose.json();
    expect(restClose.status).toBe(200);
    expect(restBody.shift.totalCashSales).toBe(40);
    expect(restBody.shift.expectedClosingCash).toBe(240);
    expect(restBody.shift.discrepancy).toBe(0);

    // Camp now inactive.
    verifyToken.mockResolvedValue({ ...CAMP_TOKEN });
    const campActive = await authed(db, 'GET', '/shifts/active');
    expect((await campActive.json()).active).toBe(false);

    // The till-math carried the store predicate (isolation is in the SQL).
    const mathBind = bindLog.find((b) => b.sql.includes('SUM(amount_cash)'));
    expect(mathBind.sql).toContain('store_id = ?');
  });

  it('open guard is same-store: a stale shift on another store does not block, a second shift on the same store does', async () => {
    const { sqlite, db } = setup();
    // Stale open shift for the Camp cashier on the REST store.
    sqlite
      .prepare(
        `INSERT INTO pos_shifts (id, tenant_id, cashier_id, store_id, status, opening_time, opening_cash)
         VALUES ('sh_stale', 't1', 'cash_camp', 2, 'open', datetime('now'), 5)`
      )
      .run();

    verifyToken.mockResolvedValue({ ...CAMP_TOKEN });
    const first = await authed(db, 'POST', '/shifts/open', { openingCash: 10 });
    expect(first.status).toBe(200);

    // The new row is bound to the cashier's project store.
    const row = sqlite
      .prepare(`SELECT store_id FROM pos_shifts WHERE id != 'sh_stale' AND cashier_id = 'cash_camp'`)
      .get();
    expect(row.store_id).toBe(CAMP_STORE);

    // A second open on the SAME store is still blocked.
    const second = await authed(db, 'POST', '/shifts/open', { openingCash: 10 });
    expect(second.status).toBe(400);
  });

  it('legacy NULL-store token keeps tenant+cashier behavior (INSERT store NULL)', async () => {
    const { sqlite, db } = setup();
    verifyToken.mockResolvedValue({
      userId: 'cash_camp', posType: 'pos', tenantId: TENANT, organizationId: 1, role: 'cashier',
    });

    const open = await authed(db, 'POST', '/shifts/open', { openingCash: 50 });
    expect(open.status).toBe(200);
    const row = sqlite
      .prepare(`SELECT store_id FROM pos_shifts WHERE cashier_id = 'cash_camp'`)
      .get();
    expect(row.store_id).toBeNull();

    sell(sqlite, 'tx_l1', 'cash_camp', CAMP_STORE, 20);
    const close = await authed(db, 'POST', '/shifts/close', { actualClosingCash: 70 });
    const body = await close.json();
    expect(close.status).toBe(200);
    expect(body.shift.expectedClosingCash).toBe(70);
    expect(body.shift.discrepancy).toBe(0);
  });

  it('migration 0119 applies: adds store_id and backfills from the cashier store', async () => {
    const sqlite = new Database(':memory:');
    // Pre-0119 shape: pos_shifts has NO store_id; pos_users.id is INTEGER
    // while pos_shifts.cashier_id is TEXT (the CAST in the backfill).
    sqlite.exec(`
      CREATE TABLE pos_stores (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, project_id TEXT);
      CREATE TABLE pos_users (id INTEGER PRIMARY KEY, organization_id INTEGER NOT NULL, store_id INTEGER);
      CREATE TABLE pos_shifts (
        id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, cashier_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open', opening_time TEXT, closing_time TEXT,
        opening_cash REAL NOT NULL DEFAULT 0.0,
        expected_closing_cash REAL NOT NULL DEFAULT 0.0,
        actual_closing_cash REAL, notes TEXT
      );
      INSERT INTO pos_stores (id, organization_id, project_id) VALUES (1, 1, 'p_camp');
      INSERT INTO pos_users (id, organization_id, store_id) VALUES (7, 1, 1), (8, 1, NULL);
      INSERT INTO pos_shifts (id, tenant_id, cashier_id, status, opening_cash) VALUES
        ('sh_a', 't1', '7', 'open', 100),
        ('sh_b', 't1', '8', 'open', 50),
        ('sh_gone', 't1', '999', 'closed', 10);
    `);

    const file = fileURLToPath(new URL('../migrations/0119_pos_shifts_store_id.sql', import.meta.url));
    const sql = fs.readFileSync(file, 'utf8');
    const execSql = sql.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    sqlite.exec(execSql);

    const rows = sqlite.prepare('SELECT id, store_id FROM pos_shifts ORDER BY id').all();
    expect(rows).toEqual([
      { id: 'sh_a', store_id: 1 }, // cashier 7 → store 1 (INTEGER/TEXT CAST join)
      { id: 'sh_b', store_id: null }, // cashier 8 has NULL store → stays NULL
      { id: 'sh_gone', store_id: null }, // cashier gone → stays NULL (legacy)
    ]);
  });
});
