/**
 * Phase 5 step 5c — unified checkout: ONE storefront_orders row + N tagged
 * storefront_order_items lines + ONE Paymob intention.
 *
 * SCOPE (why storefront tables, not orders/):
 * Rewriting the storefront_orders path into orders/ would balloon into booking
 * semantics — orders.room_id NOT NULL FK → rooms_new RESTRICT, order_state_id
 * NOT NULL, check_in/out NOT NULL, guarded INSERT race logic, customer upsert,
 * availability checks — plus the webhook paid-state transition
 * (orders pending→confirmed + rooms_new reserved vs the storefront branch
 * which has none) and record-payment (payment_records rows for orders only).
 * All three are FORBIDDEN for 5c, so the minimal unification stays on the
 * storefront path: 0122 adds project_id to storefront_order_items, checkout
 * stamps each line from ci.project_id (5a, authoritative) with the product
 * row as legacy-NULL fallback, and the single createPaymobIntention call
 * (never in a loop) is left untouched. Header storefront_orders.project_id
 * (0100) stays NULL for mixed orders — no single header project exists and
 * line-level scoping (5e/5f) reads the LINES.
 *
 * Writers (grep `INSERT INTO storefront_order` backend/src — exactly 2):
 *   1. backend/src/api/storefront.js POST /checkout — storefront_orders
 *      header INSERT (untouched: still no project_id bind; mixed orders have
 *      no single header project).
 *   2. Same handler — storefront_order_items line INSERT binds
 *      `item.project_id ?? item.product_project_id ?? null` per line,
 *      server-side only (never from the client; checkout body carries only
 *      sessionId + contact fields).
 * Non-sites verified by grep: webhook reads both tables but writes
 * payment_status only (untouched); record-payment writes payment_records for
 * orders/ only (untouched); no POS writer touches storefront tables.
 *
 * Pattern: REAL storefront router against REAL SQLite (better-sqlite3
 * :memory:) through the phase-4f D1-compatible shim (5a/5b idiom), Paymob
 * service mocked (reservations.test.js idiom — no real network), plus a
 * migration-shape probe (phase-0 idiom: stub tables → exec REAL migration
 * file → PRAGMA). No KV writes, no D1 writes, no deploy.sh.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import storefrontRouter from '../src/api/storefront.js';
import { createPaymobIntention } from '../src/services/paymob.js';
import { mountRouter } from './helpers/routerHarness.js';

// Mock the Paymob service so the intention path never makes a real network call.
vi.mock('../src/services/paymob.js', () => ({
  createPaymobIntention: vi.fn(async ({ orderRef }) => ({
    clientSecret: `secret_${orderRef}`,
    id: `int_${orderRef}`,
  })),
  verifyPaymobWebhookSignature: vi.fn(),
  extractPaymobTransaction: vi.fn(),
  buildHmacSignedString: vi.fn(),
}));

const migrationsDir = join(import.meta.dirname, '../migrations');
const execMigration = (db, file) =>
  db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
const readMigration = (file) =>
  readFileSync(join(migrationsDir, file), 'utf8');
// Executable statements only — migration headers legitimately name deferred
// tables in prose, so text-shape guards must ignore `--` comments.
const codeLines = (sql) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

// ─── D1-compatible shim (5a/5b idiom) ───────────────────────────────────────
function wrapD1(sqlite, sqlLog) {
  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
  return {
    prepare(sql) {
      return {
        bind: (...params) => {
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
              return sqlite.prepare(sql).get(...params) ?? null;
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

// ─── Migration-shape stub (pre-0122 lineage: storefront_orders HAS
// project_id via 0100, storefront_order_items does NOT) ─────────────────────
function buildPre0122Stub() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL);
    CREATE TABLE storefront_orders (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      reference TEXT UNIQUE NOT NULL, session_id TEXT,
      total_amount REAL DEFAULT 0, status TEXT DEFAULT 'pending',
      payment_status TEXT DEFAULT 'pending', notes TEXT,
      payment_intent_id TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE storefront_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
      product_id TEXT, product_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return db;
}

// ─── Behavior DB (post-0122 shape: lines carry project_id) ─────────────────
const TENANT = 't_ck5c';
// Paymob enabled via env fallback (no platform_settings table in the stub —
// loadPaymentConfig catches the missing-table read and falls back to env).
const PM_ENV = {
  PM_ENABLED: 'true',
  PM_SECRET_KEY: 'sk_test_5c',
  PM_BASE_URL: 'https://accept.paymob.com/api',
  PM_PUBLIC_KEY: 'pk_test_5c',
};

function buildCheckoutDb({ legacyNullLines = false } = {}) {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL);
    CREATE TABLE pos_products (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, project_id TEXT,
      sku TEXT, name TEXT NOT NULL, selling_price REAL DEFAULT 0,
      type TEXT DEFAULT 'retail', is_active INTEGER DEFAULT 1, deleted_at TEXT
    );
    CREATE TABLE carts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT,
      session_id TEXT, project_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE cart_items (
      id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1, unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(cart_id, product_id)
    );
    CREATE TABLE storefront_orders (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL,
      customer_id TEXT, reference TEXT UNIQUE NOT NULL, session_id TEXT,
      total_amount REAL DEFAULT 0, currency TEXT DEFAULT 'EGP',
      status TEXT DEFAULT 'pending', payment_status TEXT DEFAULT 'pending',
      notes TEXT, payment_intent_id TEXT,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE storefront_order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES storefront_orders(id) ON DELETE CASCADE,
      product_id TEXT, product_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1, unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO projects (id, tenant_id) VALUES ('proj_camp', '${TENANT}'), ('proj_rest', '${TENANT}');
    INSERT INTO pos_products (id, tenant_id, project_id, sku, name, selling_price, type, is_active, deleted_at) VALUES
      ('room_prod', '${TENANT}', 'proj_camp', 'ROOM-1', 'Sea View Room', 200, 'room', 1, NULL),
      ('meal_prod', '${TENANT}', 'proj_rest', 'MEAL-1', 'Camp Breakfast', 50, 'menu', 1, NULL);
    INSERT INTO carts (id, tenant_id, session_id, project_id) VALUES ('cart_5c', '${TENANT}', 's5c', 'proj_camp');
  `);
  // 5a-stamped lines carry their own product's project; legacy rows stay NULL
  // (healed at checkout via the product fallback).
  const roomProj = legacyNullLines ? null : "'proj_camp'";
  const mealProj = legacyNullLines ? null : "'proj_rest'";
  sqlite.exec(`
    INSERT INTO cart_items (id, cart_id, product_id, quantity, unit_price, total_price, project_id) VALUES
      ('ci_room', 'cart_5c', 'room_prod', 1, 200, 200, ${roomProj}),
      ('ci_meal', 'cart_5c', 'meal_prod', 1, 50, 50, ${mealProj});
  `);
  return sqlite;
}

const checkoutReq = (body) =>
  new Request('http://localhost/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Migration shape ────────────────────────────────────────────────────────
describe('0122 — storefront_order_items.project_id (nullable, schema-only)', () => {
  it('adds nullable project_id TEXT + idx_storefront_order_items_project', () => {
    const db = buildPre0122Stub();
    execMigration(db, '0122_add_storefront_order_items_project_id.sql');
    const cols = db.prepare('PRAGMA table_info(storefront_order_items)').all();
    expect(cols.map((c) => c.name)).toContain('project_id');
    const col = cols.find((c) => c.name === 'project_id');
    expect(col.type).toBe('TEXT');
    expect(col.notnull).toBe(0);
    expect(col.dflt_value).toBeNull();
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'storefront_order_items' AND name = 'idx_storefront_order_items_project'"
      )
      .get();
    expect(idx?.name).toBe('idx_storefront_order_items_project');
    // Nullable for legacy: a NULL insert probes clean.
    db.prepare(
      `INSERT INTO storefront_orders (id, tenant_id, reference, session_id, total_amount)
       VALUES ('probe_order', 't_probe', 'ORD-PROBE1', 's_probe', 10)`
    ).run();
    db.prepare(
      `INSERT INTO storefront_order_items (id, order_id, product_id, product_name, quantity, unit_price, total_price, project_id)
       VALUES ('probe_soi', 'probe_order', 'probe_prod', 'Probe', 1, 10, 10, NULL)`
    ).run();
    expect(
      db.prepare('SELECT project_id FROM storefront_order_items WHERE id = ?').get('probe_soi').project_id
    ).toBeNull();
  });

  it('exact ALTER text + storefront_orders untouched', () => {
    const sql = readMigration('0122_add_storefront_order_items_project_id.sql');
    expect(sql).toContain(
      'ALTER TABLE storefront_order_items ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;'
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_storefront_order_items_project ON storefront_order_items(project_id);'
    );
    // This file touches storefront_order_items ONLY — the header table's
    // project_id already exists since 0100.
    expect(codeLines(sql)).not.toContain('ALTER TABLE storefront_orders');
  });
});

// ─── Numeric gate: 1 room (200) + 1 meal (50) ⇒ 1 order, total 250, 1 intention ──
describe('POST /checkout unifies a mixed cart into one tagged order + one intention', () => {
  it('room 200 + meal 50 ⇒ 1 order_id, total 250, 1 intention; 1 order row + 2 lines NOT NULL distinct', async () => {
    const sqlite = buildCheckoutDb();
    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog), ...PM_ENV };
    const app = mountRouter(storefrontRouter, { tenantId: TENANT });

    const res = await app.request(checkoutReq({ sessionId: 's5c' }), {}, env);
    const body = await res.json();
    expect(res.status).toBe(201);

    // Response: exactly ONE order_id (a single string, never an array), total 250.
    expect(body.success).toBe(true);
    expect(typeof body.orderId).toBe('string');
    expect(body.orderId).toBeTruthy();
    expect(Array.isArray(body.orderId)).toBe(false);
    expect(body.totalAmount).toBe(250);
    expect(body.orderNumber).toMatch(/^ORD-[0-9A-Z]{6}$/);

    // Exactly ONE Paymob intention: single object on the response, single
    // service call (the handler never loops over lines for intentions).
    expect(body.paymobEnabled).toBe(true);
    expect(body.paymobIntention).toBeTruthy();
    expect(typeof body.paymobIntention.clientSecret).toBe('string');
    expect(createPaymobIntention).toHaveBeenCalledTimes(1);
    const intentionArg = createPaymobIntention.mock.calls[0][0];
    expect(intentionArg.amountCents).toBe(25000);
    expect(intentionArg.orderRef).toBe(body.orderNumber);

    // DB: exactly ONE order row …
    const orders = sqlite.prepare('SELECT id, reference, total_amount FROM storefront_orders').all();
    expect(orders).toHaveLength(1);
    expect(orders[0].id).toBe(body.orderId);
    expect(orders[0].total_amount).toBe(250);

    // … plus TWO lines, both project_id NOT NULL, distinct, correctly mapped.
    const lines = sqlite
      .prepare('SELECT product_id, product_name, quantity, unit_price, total_price, project_id FROM storefront_order_items ORDER BY product_id')
      .all();
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.project_id).not.toBeNull();
    expect(lines.find((l) => l.product_id === 'room_prod').project_id).toBe('proj_camp');
    expect(lines.find((l) => l.product_id === 'meal_prod').project_id).toBe('proj_rest');
    const tagged = lines.map((l) => l.project_id).sort();
    expect(tagged).toEqual(['proj_camp', 'proj_rest']);
    expect(new Set(tagged).size).toBe(2);

    // Every storefront line INSERT binds project_id (none omits the column).
    const lineInserts = sqlLog.filter((s) => s.includes('INSERT INTO storefront_order_items'));
    expect(lineInserts.length).toBeGreaterThan(0);
    for (const sql of lineInserts) expect(sql).toContain('project_id');

    // The intention id is persisted on the single order row.
    const persisted = sqlite
      .prepare('SELECT payment_intent_id FROM storefront_orders WHERE id = ?')
      .get(body.orderId);
    expect(String(persisted.payment_intent_id)).toBe(`int_${body.orderNumber}`);

    // The cart lines are cleaned up (unified checkout consumes the cart).
    expect(sqlLog.some((s) => s.startsWith('DELETE FROM cart_items'))).toBe(true);
  });

  it('legacy NULL cart lines heal via the product fallback (still NOT NULL)', async () => {
    const sqlite = buildCheckoutDb({ legacyNullLines: true });
    // Prove the setup really is legacy: both cart lines start NULL.
    const preNulls = sqlite
      .prepare('SELECT COUNT(*) AS n FROM cart_items WHERE project_id IS NULL')
      .get().n;
    expect(preNulls).toBe(2);

    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog), ...PM_ENV };
    const app = mountRouter(storefrontRouter, { tenantId: TENANT });

    const res = await app.request(checkoutReq({ sessionId: 's5c' }), {}, env);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.totalAmount).toBe(250);

    const lines = sqlite
      .prepare('SELECT product_id, project_id FROM storefront_order_items ORDER BY product_id')
      .all();
    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line.project_id).not.toBeNull();
    expect(lines.find((l) => l.product_id === 'room_prod').project_id).toBe('proj_camp');
    expect(lines.find((l) => l.product_id === 'meal_prod').project_id).toBe('proj_rest');
    expect(createPaymobIntention).toHaveBeenCalledTimes(1);
  });
});
