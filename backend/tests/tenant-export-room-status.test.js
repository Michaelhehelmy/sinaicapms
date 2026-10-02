/**
 * Wave 8 item 5 — `scripts/export-tenant.mjs` now emits
 * `rooms[].roomStatus` / `rooms[].cleaningStatus`.
 *
 * The exporter already READ both columns (`GET /api/rooms` is `SELECT r.*`),
 * counted them, and then threw them away — while advertising the loss in three
 * places at once (`KNOWN LOSSES` in the header, a `lostFields` entry printed on
 * every run, and `docs/tenant-import.md`). Since the import schema gained both
 * fields (DEFECT-4), every exported manifest silently round-tripped each room
 * back to the schema defaults `available` / `clean`, and the exporter told the
 * operator that was unavoidable.
 *
 * This suite is the round-trip gate, not a source inspection:
 *   1. fresh in-memory SQLite built by replaying EVERY migration (so the real
 *      `cleaning_status` CHECK and the `room_status` column apply);
 *   2. real `POST /api/tenants/import` writing all three non-default pairs;
 *   3. real `GET /api/rooms`;
 *   4. the exporter's rooms mapping applied verbatim to that real response
 *      (the exporter is a CLI ending in `main()`, so its key list is mirrored
 *      here key-for-key, and a drift guard asserts the two stay in step);
 *   5. that exported manifest re-imported into a SECOND fresh tenant, with the
 *      stored `room_status` / `cleaning_status` asserted.
 *
 * Step 4-5 is the direction that regressed: before the fix the export dropped
 * both keys and step 5 wrote the defaults.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { roomsRoutes, productsRoutes } from '../src/api/camps.js';
import { mountRouter } from './helpers/routerHarness.js';

const migrationsDir = join(import.meta.dirname, '../migrations');
const exporterPath = join(import.meta.dirname, '..', '..', 'scripts', 'export-tenant.mjs');

/**
 * Thin D1-compatible adapter over better-sqlite3 (repo standard idiom).
 * Each bound statement carries its own sql/params so `batch()` can replay them
 * SYNCHRONOUSLY inside one better-sqlite3 transaction — real D1 batches are
 * all-or-nothing, and a statement-by-statement shim would leave partial rows,
 * making any row-count assertion describe the harness instead of the handler.
 */
function makeD1(db) {
  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
  return {
    prepare(sql) {
      return {
        bind: (...params) => {
          const st = {
            _sql: sql,
            _params: params,
            async all() {
              const stmt = db.prepare(sql);
              if (isRead(sql)) return { results: stmt.all(...params) };
              return { results: [], meta: { changes: stmt.run(...params).changes } };
            },
            async first() {
              return db.prepare(sql).get(...params) ?? null;
            },
            async run() {
              return { success: true, meta: { changes: db.prepare(sql).run(...params).changes } };
            },
          };
          return st;
        },
      };
    },
    async batch(stmts) {
      const results = db.transaction(() =>
        stmts.map((st) => {
          const info = db.prepare(st._sql).run(...st._params);
          return { success: true, meta: { changes: info.changes } };
        }),
      )();
      return results;
    },
  };
}

const buildDb = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  db.pragma('foreign_keys = ON');
  return db;
};

const importEnv = (db) => ({
  DB: makeD1(db),
  MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
});

const postImport = (db, tenantId, manifest) =>
  mountRouter(tenantImportRoutes, {
    tenantId,
    user: { role: 'admin', tenantId },
    basePath: '/tenants/import',
  }).request(
    'http://localhost/tenants/import',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manifest) },
    importEnv(db),
  );

/** GET /api/products for a tenant (the exporter's productId→name source). */
const getJson = (db, tenantId, _unused) =>
  mountRouter(productsRoutes, { tenantId, user: { role: 'admin', tenantId }, basePath: '/api/products' })
    .request('http://localhost/api/products', {}, importEnv(db))
    .then((r) => r.json());

const getRooms = (db, tenantId) =>
  mountRouter(roomsRoutes, { tenantId, user: { role: 'admin', tenantId }, basePath: '/api/rooms' })
    .request('http://localhost/api/rooms', {}, importEnv(db))
    .then((r) => r.json());

const seedTenant = (db, tenantId, subdomain) => {
  db.prepare(
    "INSERT INTO tenants (id, subdomain, name, type, status, onboarding_status) VALUES (?, ?, ?, 'camp', 'active', 'completed')",
  ).run(tenantId, subdomain, subdomain);
};

/**
 * The exporter's rooms mapping, mirrored from scripts/export-tenant.mjs.
 * `pick` is verbatim (first non-null wins); the key list is the drift-guarded
 * part — see the "mirrors export-tenant.mjs" test.
 */
function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return undefined;
}

const EXPORTER_ROOM_KEYS = [
  ['id', 'id'], ['name', 'name'], ['productId', 'productId', 'product_id'],
  ['floor', 'floor'], ['maxGuests', 'maxGuests', 'max_guests'],
  ['basePrice', 'basePrice', 'base_price'], ['status', 'status'],
  ['bedType', 'bedType', 'bed_type'], ['notes', 'notes'],
  ['isActive', 'isActive', 'is_active'],
  ['roomStatus', 'roomStatus', 'room_status'],
  ['cleaningStatus', 'cleaningStatus', 'cleaning_status'],
];

const exportRooms = (roomsRaw, productIdToName = new Map()) => {
  let roomStatusRows = 0;
  const rooms = roomsRaw.map((r) => {
    const o = {};
    for (const [mk, ...aks] of EXPORTER_ROOM_KEYS) {
      const v = pick(r, ...aks);
      if (v !== undefined && v !== null) o[mk] = v;
    }
    const pid = pick(r, 'productId', 'product_id');
    if (pid && productIdToName.has(pid)) o.productName = productIdToName.get(pid);
    if (pick(r, 'roomStatus', 'room_status') !== undefined ||
        pick(r, 'cleaningStatus', 'cleaning_status') !== undefined) {
      roomStatusRows += 1;
    }
    return o;
  });
  return { rooms, roomStatusRows };
};

/** All three non-default pairs plus one row at the schema defaults. */
const LIFECYCLE = [
  ['room_reserved', 'reserved', 'dirty'],
  ['room_cleaning', 'cleaning', 'in_progress'],
  ['room_oos', 'out_of_service', 'inspected'],
  ['room_default', 'available', 'clean'],
];

const manifestWith = (roomIds) => ({
  tenant: { name: 'Acacia Camp' },
  project: { name: 'Acacia Main', type: 'camp' },
  products: [{ name: 'Sea View Room', sku: 'ROOM-1', basePrice: 220, capacity: 4, type: 'room' }],
  rooms: roomIds.map((id) => ({
    id,
    name: `Room ${id}`,
    productName: 'Sea View Room',
    bedType: 'double',
    maxGuests: 4,
    roomStatus: LIFECYCLE.find(([k]) => k === id)?.[1],
    cleaningStatus: LIFECYCLE.find(([k]) => k === id)?.[2],
  })),
});

describe('Wave 8 item 5 — the exporter emits rooms[].roomStatus/cleaningStatus', () => {
  let db;
  beforeEach(() => {
    db = buildDb();
    seedTenant(db, 't_src', 'acacia-src');
    seedTenant(db, 't_dst', 'acacia-dst');
  });

  it('emits both keys for every row returned by the read side', async () => {
    const res = await postImport(db, 't_src', manifestWith(LIFECYCLE.map(([id]) => id)));
    expect(res.status, await res.clone().text()).toBe(200);

    const raw = await getRooms(db, 't_src');
    expect(raw).toHaveLength(4);
    const { rooms, roomStatusRows } = exportRooms(raw);
    expect(roomStatusRows).toBe(4);
    for (const [id, rs, cs] of LIFECYCLE) {
      const room = rooms.find((r) => r.id === id);
      expect(room.roomStatus, `${id} roomStatus`).toBe(rs);
      expect(room.cleaningStatus, `${id} cleaningStatus`).toBe(cs);
    }
  });

  it('round-trips all three non-default pairs into a SECOND tenant', async () => {
    expect((await postImport(db, 't_src', manifestWith(LIFECYCLE.map(([id]) => id)))).status).toBe(200);
    // The exporter resolves a readable productName alongside productId, exactly
    // as it does in production (productIdToName is built from the products
    // export), so the re-import can use the name instead of the source tenant's
    // id — tenant-local identity, per the parity audit's harness rule.
    const rawProducts = await getJson(db, 't_src', 'products');
    const nameById = new Map(rawProducts.map((p) => [p.id, p.name]));
    const { rooms } = exportRooms(await getRooms(db, 't_src'), nameById);

    // The exported rooms must be accepted by the import schema.
    const res = await postImport(db, 't_dst', {
      tenant: { name: 'Acacia Copy' },
      project: { name: 'Acacia Main', type: 'camp' },
      products: [{ name: 'Sea View Room', sku: 'ROOM-1', basePrice: 220, capacity: 4, type: 'room' }],
      // `rooms_new.id` is still a GLOBAL primary key (the same arbiter class
      // as pos_products.id, and still open after 0127), so an exported room id
      // cannot be replayed into a second tenant either. Strip both
      // tenant-local identifiers and key the assertions on the stable `name`.
      rooms: rooms.map(({ productId, id, ...room }) => room),
    });
    expect(res.status, await res.clone().text()).toBe(200);

    const stored = db
      .prepare('SELECT name, room_status, cleaning_status FROM rooms_new WHERE tenant_id = ? ORDER BY name')
      .all('t_dst');
    expect(stored).toHaveLength(4);
    for (const [id, rs, cs] of LIFECYCLE) {
      const name = `Room ${id}`;
      const row = stored.find((r) => r.name === name);
      expect({ name, rs: row.room_status, cs: row.cleaning_status }, `${name} survived the round-trip`).toEqual({ name, rs, cs });
    }
    // The exact pre-fix symptom, asserted as a control: without the emitted
    // keys the import binds the schema defaults, so all four rows would read
    // available/clean regardless of what the source tenant held.
    expect(stored.filter((r) => r.room_status !== 'available' || r.cleaning_status !== 'clean')).toHaveLength(3);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('the canary fires (as a lost-field note) only when the read side stops sending the columns', () => {
    // Rows without either column: 0 of N → the note is emitted.
    expect(exportRooms([{ id: 'r1', name: 'R1' }, { id: 'r2', name: 'R2' }]).roomStatusRows).toBe(0);
    // Rows with them → no note, because nothing is lost any more.
    expect(exportRooms([{ id: 'r1', room_status: 'reserved' }]).roomStatusRows).toBe(1);
  });

  it('mirrors export-tenant.mjs (the rooms key list and the canary wording)', () => {
    const src = readFileSync(exporterPath, 'utf8');
    // Both lifecycle keys are present in the exporter's rooms key list…
    expect(src).toContain("['roomStatus', 'roomStatus', 'room_status']");
    expect(src).toContain("['cleaningStatus', 'cleaningStatus', 'cleaning_status']");
    // …inside the ROOMS map specifically, not merely somewhere in the file.
    const roomsBlock = src.slice(src.indexOf('── rooms'), src.indexOf('── ratePlans'));
    expect(roomsBlock).toContain("['roomStatus', 'roomStatus', 'room_status']");
    expect(roomsBlock).toContain("['cleaningStatus', 'cleaningStatus', 'cleaning_status']");
    // The stale "no import field" claim must be gone — that sentence is the
    // third of the three places it used to be advertised.
    expect(src).not.toMatch(/roomStatus\/cleaningStatus \(.*no import field/s);
    expect(src).not.toMatch(/rooms room_status\/cleaning_status: readable but dropped/);
    // And the rooms key list is the SAME, IN THE SAME ORDER, as the mirror this
    // suite exports with — so the two cannot drift apart silently. Order is
    // compared too: reordering would change which alias wins for a row that
    // carries both spellings.
    const emittedKeys = [...roomsBlock.matchAll(/\['(\w+)', '\w+'(?:, '\w+')?\]/g)].map((m) => m[1]);
    expect(emittedKeys).toEqual(EXPORTER_ROOM_KEYS.map((k) => k[0]));
  });

  it('every emitted roomStatus value is one the import schema accepts', () => {
    // The import schema enums are the contract; an exporter change that emits
    // anything outside them would turn a successful export into a 400 import.
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'api', 'tenant-import.js'), 'utf8');
    const roomStatus = src.match(/room_status: z\.enum\(\[([^\]]+)\]\)/)?.[1]
      .split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    const cleaningStatus = src.match(/cleaning_status: z\.enum\(\[([^\]]+)\]\)/)?.[1]
      .split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    for (const [, rs, cs] of LIFECYCLE) {
      expect(roomStatus).toContain(rs);
      expect(cleaningStatus).toContain(cs);
    }
    // And the DB CHECK agrees with the schema enum (guards a future migration
    // that narrows cleaning_status out from under the exporter).
    const check = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'rooms_new'").get().sql;
    for (const cs of cleaningStatus) expect(check).toContain(`'${cs}'`);
  });
});
/**
 * The four tests above mirror the exporter's mapping in-process, which is the
 * repo's established idiom (`tenant-import-export-type.test.js`) but has a
 * structural blind spot: stashing `scripts/export-tenant.mjs` leaves the MIRROR
 * untouched, so the round-trip assertions still pass — only the drift guard
 * fails. That guard is what binds the two together, and one green guard is a
 * thin thread.
 *
 * This test closes it by running the REAL exporter as a subprocess against a
 * real HTTP server on an ephemeral port, so a revert of the exporter itself
 * cannot pass. It is local-only (127.0.0.1, better-sqlite3, no wrangler, no
 * remote call), and the server serves only the documented public GET shapes.
 */
describe('Wave 8 item 5 — the real exporter emits the keys (subprocess, local only)', () => {
  it(
    'exports roomStatus/cleaningStatus from a real local run',
    async () => {
      const db = buildDb();
      seedTenant(db, 't_src', 'acacia-src');
      await postImport(db, 't_src', manifestWith(LIFECYCLE.map(([id]) => id)));

      const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const rows = (sql, ...args) => db.prepare(sql).all(...args);
      const routes = {
        [`/api/tenants/acacia-src`]: () => rows('SELECT * FROM tenants WHERE subdomain = ?', 'acacia-src'),
        '/api/projects': () => rows('SELECT * FROM projects WHERE tenant_id = ?', 't_src'),
        '/api/products': () => rows('SELECT * FROM pos_products WHERE tenant_id = ?', 't_src'),
        '/api/rooms': () => rows('SELECT r.* FROM rooms_new r WHERE r.tenant_id = ?', 't_src'),
        '/api/rateplans': () => rows('SELECT * FROM rate_plans_new WHERE tenant_id = ?', 't_src'),
        '/api/meal-categories': () => rows(
          `SELECT mc.*, mcl.name FROM meal_categories mc
             LEFT JOIN meal_categories_lang mcl ON mcl.meal_category_id = mc.id AND mcl.lang = 'en'
            WHERE mc.tenant_id = ?`, 't_src'),
        '/api/meals': () => rows(
          `SELECT m.*, ml.name, ml.description FROM meals m
             LEFT JOIN meal_lang ml ON ml.tenant_id = m.tenant_id AND ml.meal_id = m.id AND ml.lang = 'en'
            WHERE m.tenant_id = ?`, 't_src'),
        // auth-gated in production; an empty 200 keeps the exporter's graceful
        // skip path out of this test so it only measures the rooms mapping.
        '/api/pos-users': () => [],
      };

      const { createServer } = await import('node:http');
      const server = createServer((req, res) => {
        const path = new URL(req.url, 'http://localhost').pathname;
        if (!routes[path]) { res.writeHead(404); return res.end('[]'); }
        const body = JSON.stringify(
          routes[path]().map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v]))),
        );
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(body);
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const { port } = server.address();

      try {
        const { execFile } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const { stdout } = await promisify(execFile)(
          process.execPath,
          [exporterPath, 'acacia-src', '--base-url', `http://127.0.0.1:${port}`],
          { maxBuffer: 8 * 1024 * 1024 },
        );
        const manifest = JSON.parse(stdout);
        expect(manifest.rooms).toHaveLength(4);
        for (const [id, rs, cs] of LIFECYCLE) {
          const room = manifest.rooms.find((r) => r.id === id);
          expect({ id, roomStatus: room.roomStatus, cleaningStatus: room.cleaningStatus })
            .toEqual({ id, roomStatus: rs, cleaningStatus: cs });
        }
      } finally {
        server.close();
      }
    },
    30_000,
  );
});
