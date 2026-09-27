/**
 * Phase 5 step 5a — cart_items.project_id stamped on every add-to-cart.
 *
 * Migration: 0121_add_cart_items_project_id.sql (nullable, schema-only;
 * 0109 is RESERVED-but-absent per 0110:20-25, so 0121 is the next free slot).
 *
 * Writers (grep `INSERT INTO cart` backend/src — exactly 2, both stamped):
 *   1. backend/src/api/storefront.js POST /cart/items — carts header INSERT
 *      stamps the creating line's product project (single-project header).
 *   2. Same handler — cart_items line INSERT binds the line product's
 *      project_id, derived server-side from pos_products (never from the
 *      client; addToCartSchema strips unknown keys). The re-add UPDATE path
 *      re-stamps too (heals legacy NULL rows).
 * Non-sites verified by grep: checkout reads cart_items but 5b/5c own it;
 * no POS / Paymob / record-payment writer touches carts or cart_items.
 *
 * Pattern: REAL storefront router against REAL SQLite (better-sqlite3
 * :memory:) through the phase-4f D1-compatible shim, plus a migration-shape
 * probe (phase-0 idiom: stub tables → exec REAL migration file → PRAGMA).
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import storefrontRouter from '../src/api/storefront.js';
import { mountRouter } from './helpers/routerHarness.js';

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

// ─── D1-compatible shim (phase-4f idiom) ────────────────────────────────────
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

// ─── Migration-shape stub (pre-0121 lineage: carts has project_id via 0103,
// cart_items does NOT — exactly what 0103's "leaves cart_items unextended"
// phase-0 test asserts) ─────────────────────────────────────────────────────
function buildPre0121Stub() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL);
    CREATE TABLE carts (
      id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, user_id TEXT,
      session_id TEXT, project_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE cart_items (
      id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1, unit_price REAL NOT NULL,
      total_price REAL NOT NULL, created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(cart_id, product_id)
    );
  `);
  return db;
}

// ─── Behavior DB (post-migration shape, real-typed columns) ─────────────────
const TENANT = 't_cart5a';

function buildCartDb() {
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
    INSERT INTO projects (id, tenant_id) VALUES ('proj_room', '${TENANT}'), ('proj_meal', '${TENANT}');
    INSERT INTO pos_products (id, tenant_id, project_id, sku, name, selling_price, type, is_active, deleted_at) VALUES
      ('room_prod', '${TENANT}', 'proj_room', 'ROOM-1', 'Sea View Room', 200, 'room', 1, NULL),
      ('meal_prod', '${TENANT}', 'proj_meal', 'MEAL-1', 'Camp Breakfast', 50, 'menu', 1, NULL);
  `);
  return sqlite;
}

const TENANT_HEADERS = { 'Content-Type': 'application/json', 'x-tenant-id': TENANT };
const postItem = (body) =>
  new Request('http://localhost/cart/items', {
    method: 'POST',
    headers: TENANT_HEADERS,
    body: JSON.stringify(body),
  });

// ─── Migration shape ────────────────────────────────────────────────────────
describe('0121 — cart_items.project_id (nullable, schema-only)', () => {
  it('adds nullable project_id TEXT + idx_cart_items_project to cart_items', () => {
    const db = buildPre0121Stub();
    execMigration(db, '0121_add_cart_items_project_id.sql');
    const cols = db.prepare('PRAGMA table_info(cart_items)').all();
    expect(cols.map((c) => c.name)).toContain('project_id');
    const col = cols.find((c) => c.name === 'project_id');
    expect(col.type).toBe('TEXT');
    expect(col.notnull).toBe(0);
    expect(col.dflt_value).toBeNull();
    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'cart_items' AND name = 'idx_cart_items_project'"
      )
      .get();
    expect(idx?.name).toBe('idx_cart_items_project');
    // Nullable for legacy: a NULL insert probes clean.
    db.prepare(
      `INSERT INTO cart_items (id, cart_id, product_id, quantity, unit_price, total_price, project_id)
       VALUES ('probe_ci', 'probe_cart', 'probe_prod', 1, 10, 10, NULL)`
    ).run();
    expect(
      db.prepare('SELECT project_id FROM cart_items WHERE id = ?').get('probe_ci').project_id
    ).toBeNull();
  });

  it('exact ALTER text + carts untouched', () => {
    const sql = readMigration('0121_add_cart_items_project_id.sql');
    expect(sql).toContain(
      'ALTER TABLE cart_items ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;'
    );
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_cart_items_project ON cart_items(project_id);'
    );
    // This file touches cart_items ONLY — no DDL against carts (0103 owns it).
    expect(codeLines(sql)).not.toContain('ALTER TABLE carts');
  });
});

// ─── Router behavior: room + meal ⇒ 2 rows, NOT NULL, distinct ─────────────
describe('POST /cart/items stamps project_id per line (server-side)', () => {
  it('add room + meal ⇒ 2 rows, both project_id NOT NULL, distinct', async () => {
    const sqlite = buildCartDb();
    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog) };
    const app = mountRouter(storefrontRouter, { tenantId: TENANT });

    const r1 = await app.request(
      postItem({ productId: 'room_prod', quantity: 1, sessionId: 's5a' }), {}, env
    );
    expect(r1.status).toBe(201);
    const r2 = await app.request(
      postItem({ productId: 'meal_prod', quantity: 2, sessionId: 's5a' }), {}, env
    );
    expect(r2.status).toBe(201);

    const rows = sqlite
      .prepare('SELECT product_id, project_id FROM cart_items ORDER BY product_id')
      .all();
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.project_id).not.toBeNull();
    const projects = rows.map((r) => r.project_id).sort();
    expect(projects).toEqual(['proj_meal', 'proj_room']);
    expect(new Set(projects).size).toBe(2);
    expect(rows.find((r) => r.product_id === 'room_prod').project_id).toBe('proj_room');
    expect(rows.find((r) => r.product_id === 'meal_prod').project_id).toBe('proj_meal');

    // Header stamped with the creating line's project (single-project header).
    const cart = sqlite.prepare('SELECT project_id FROM carts').get();
    expect(cart.project_id).toBe('proj_room');

    // Every add-to-cart INSERT binds project_id (never trusted from client).
    const itemInsert = sqlLog.find((s) => s.startsWith('INSERT INTO cart_items'));
    expect(itemInsert).toContain('project_id');
  });

  it('ignores a client-supplied projectId (never trusted)', async () => {
    const sqlite = buildCartDb();
    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog) };
    const app = mountRouter(storefrontRouter, { tenantId: TENANT });

    const res = await app.request(
      postItem({ productId: 'meal_prod', quantity: 1, sessionId: 's_evil', projectId: 'evil_proj' }),
      {},
      env
    );
    expect(res.status).toBe(201);
    const row = sqlite.prepare('SELECT project_id FROM cart_items').get();
    expect(row.project_id).toBe('proj_meal');
  });

  it('re-add of the same product bumps quantity and keeps the line project', async () => {
    const sqlite = buildCartDb();
    const sqlLog = [];
    const env = { DB: wrapD1(sqlite, sqlLog) };
    const app = mountRouter(storefrontRouter, { tenantId: TENANT });

    expect((await app.request(postItem({ productId: 'room_prod', quantity: 1, sessionId: 's_re' }), {}, env)).status).toBe(201);
    const again = await app.request(postItem({ productId: 'room_prod', quantity: 2, sessionId: 's_re' }), {}, env);
    expect(again.status).toBe(200);
    const row = sqlite.prepare('SELECT quantity, project_id FROM cart_items').get();
    expect(row.quantity).toBe(3);
    expect(row.project_id).toBe('proj_room');
  });
});
