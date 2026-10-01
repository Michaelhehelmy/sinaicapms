/**
 * DEFECT-4 — `rooms[].roomStatus` / `rooms[].cleaningStatus` were readable on
 * the export side but had NO counterpart in the import schema, so a manifest
 * exported by scripts/export-tenant.mjs carrying a reserved or dirty room
 * re-imported as the schema default ('available' / 'clean'). The operational
 * room state silently reverted on every round-trip, with exit 0 on both ends.
 *
 * This suite is the spec's REAL gate against a fresh local D1, not a statement
 * inspection:
 *   1. fresh in-memory SQLite built by replaying EVERY migration in
 *      backend/migrations in order, FK enforcement ON — so the real
 *      rooms_new columns, the cleaning_status CHECK and the 0115 tenant
 *      FK/NOT NULL constraint all apply;
 *   2. the real POST /api/tenants/import through mountRouterAuthenticated
 *      (production resolveScope + requireAuth);
 *   3. assertions against the actual stored rows, not the echoed response.
 *
 * The DB-side constraints are the reason the default assertions matter:
 * an invalid cleaning_status would be rejected by the schema CHECK, so a
 * passing suite proves the enum and the column agree.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'node:path';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { mountRouterAuthenticated, signAdminToken } from './helpers/routerHarness.js';

const migrationsDir = join(import.meta.dirname, '../migrations');

const JWT_SECRET = 'test-secret-room-status';
const IMPORT_SCOPE_OPTIONS = {
  auth: { roles: ['super_admin', 'admin'], requireTenant: false },
  requireTenantHint: false,
};

/** Values the rooms status/cleaning endpoints accept (camps.js). */
const ROOM_STATUS_VALUES = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'];
const CLEANING_STATUS_VALUES = ['dirty', 'in_progress', 'clean', 'inspected'];

/** Thin D1-compatible adapter over better-sqlite3 (repo standard idiom). */
function makeD1(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        bind(...args) {
          return {
            async all() {
              return { results: stmt.all(...args) };
            },
            async first() {
              return stmt.get(...args) ?? null;
            },
            async run() {
              const info = stmt.run(...args);
              return { success: true, meta: { changes: info.changes } };
            },
          };
        },
      };
    },
    async batch(statements) {
      return db.transaction(() =>
        statements.map((s) => {
          const info = s.run();
          return { success: true, meta: { changes: info.changes } };
        }),
      )();
    },
  };
}

/** Fresh local D1: every migration in lexical order, FK enforcement ON. */
function buildFreshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  return db;
}

function seedTenant(db, tenantId) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tenants (id, subdomain, name, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`
  ).run(tenantId, `${tenantId}.test`, 'Room Status Gate', now, now);
  db.prepare(
    `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', 'admin', 'Gate', 'Admin', 1, ?, ?)`
  ).run(`adm_${tenantId}`, tenantId, `gate@${tenantId}.test`, now, now);
}

/**
 * Manifest whose rooms cover the values that matter: the spec's `reserved`
 * case, a dirty room, and a plain room that must fall back to the defaults.
 * Products exist so the rooms INSERT...SELECT guard resolves.
 */
function manifestWithRooms(rooms) {
  return {
    tenant: { name: 'Room Status Gate', currency: 'EGP' },
    project: { name: 'Room Status Gate Camp' },
    products: [
      { id: 'prod_gate_room', name: 'Gate Room Product', basePrice: 1500, capacity: 4, type: 'room' },
    ],
    rooms,
    ratePlans: [],
    menu: { categories: [], meals: [] },
    posUsers: [],
  };
}

const storedRooms = (db, tenantId) =>
  db.prepare('SELECT name, room_status, cleaning_status FROM rooms_new WHERE tenant_id = ?').all(tenantId);

describe('DEFECT-4: rooms[].roomStatus / cleaningStatus persist on import', () => {
  let db;
  let d1;
  let env;
  let importApp;
  let adminToken;
  const tenantId = 'tenant_room_status';

  beforeEach(async () => {
    db = buildFreshDb();
    d1 = makeD1(db);
    seedTenant(db, tenantId);
    env = {
      DB: d1,
      MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
      JWT_SECRET,
    };
    importApp = mountRouterAuthenticated(tenantImportRoutes, {
      basePath: '/api/tenants/import',
      scopeOptions: IMPORT_SCOPE_OPTIONS,
    });
    adminToken = await signAdminToken(
      {
        sub: `adm_${tenantId}`, userId: `adm_${tenantId}`,
        email: `gate@${tenantId}.test`, role: 'admin', tenantId,
      },
      JWT_SECRET,
    );
  });

  const postImport = (manifest) =>
    importApp.request(
      'http://localhost/api/tenants/import',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': tenantId },
        body: JSON.stringify(manifest),
      },
      env,
    );

  it('persists roomStatus=reserved on the stored row (the spec case)', async () => {
    const res = await postImport(
      manifestWithRooms([
        { id: 'room_gate_1', name: 'Room 101', productId: 'prod_gate_room', roomStatus: 'reserved' },
      ])
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const rows = storedRooms(db, tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Room 101');
    expect(rows[0].room_status).toBe('reserved');
  });

  it('persists both fields together, and every accepted value round-trips', async () => {
    const rooms = ROOM_STATUS_VALUES.map((roomStatus, i) => ({
      id: `room_room_status_${i}`,
      name: `Room RS ${i}`,
      productId: 'prod_gate_room',
      roomStatus,
    })).concat(
      CLEANING_STATUS_VALUES.map((cleaningStatus, i) => ({
        id: `room_clean_status_${i}`,
        name: `Room CS ${i}`,
        productId: 'prod_gate_room',
        cleaningStatus,
      }))
    );

    const res = await postImport(manifestWithRooms(rooms));
    expect(res.status).toBe(200);

    const byName = Object.fromEntries(storedRooms(db, tenantId).map((r) => [r.name, r]));
    expect(Object.keys(byName)).toHaveLength(rooms.length);
    for (const [i, roomStatus] of ROOM_STATUS_VALUES.entries()) {
      expect(byName[`Room RS ${i}`].room_status, `roomStatus ${roomStatus}`).toBe(roomStatus);
      // cleaning_status omitted → must fall back to the schema default.
      expect(byName[`Room RS ${i}`].cleaning_status).toBe('clean');
    }
    for (const [i, cleaningStatus] of CLEANING_STATUS_VALUES.entries()) {
      expect(byName[`Room CS ${i}`].cleaning_status, `cleaningStatus ${cleaningStatus}`).toBe(cleaningStatus);
      // roomStatus omitted → must fall back to the schema default.
      expect(byName[`Room CS ${i}`].room_status).toBe('available');
    }
  });

  it('defaults to available/clean when both fields are omitted', async () => {
    const res = await postImport(
      manifestWithRooms([
        { id: 'room_gate_default', name: 'Plain Room', productId: 'prod_gate_room' },
      ])
    );
    expect(res.status).toBe(200);

    const rows = storedRooms(db, tenantId);
    expect(rows).toHaveLength(1);
    expect(rows[0].room_status).toBe('available');
    expect(rows[0].cleaning_status).toBe('clean');
  });

  it('rejects an out-of-enum roomStatus instead of writing it', async () => {
    const res = await postImport(
      manifestWithRooms([
        { id: 'room_gate_bad', name: 'Bad Room', productId: 'prod_gate_room', roomStatus: 'on_fire' },
      ])
    );
    expect(res.status).toBe(400);
    // Nothing written: the enum guard fires before any INSERT is batched.
    expect(storedRooms(db, tenantId)).toHaveLength(0);
  });

  it('rejects an out-of-enum cleaningStatus (mirrors the schema CHECK)', async () => {
    const res = await postImport(
      manifestWithRooms([
        { id: 'room_gate_bad2', name: 'Bad Room 2', productId: 'prod_gate_room', cleaningStatus: 'soaked' },
      ])
    );
    expect(res.status).toBe(400);
    expect(storedRooms(db, tenantId)).toHaveLength(0);
  });

  it('the Zod enums match the values the rooms endpoints accept', async () => {
    const src = readFileSync(
      join(import.meta.dirname, '..', 'src', 'api', 'camps.js'),
      'utf8'
    );
    // The import enum is only correct while it still matches the endpoint the
    // rest of the app writes through; drift here silently narrows imports.
    for (const value of ROOM_STATUS_VALUES) {
      expect(src, `camps.js lost room status ${value}`).toContain(`'${value}'`);
    }
    for (const value of CLEANING_STATUS_VALUES) {
      expect(src, `camps.js lost cleaning status ${value}`).toContain(`'${value}'`);
    }
    // cleaning_status is CHECKed by the schema, so the enum must not drift
    // wider than what the column accepts.
    const schema = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
      .join('\n');
    const check = schema.match(
      /cleaning_status TEXT DEFAULT 'clean' CHECK\(cleaning_status IN \(([^)]*)\)\)/
    );
    expect(check, 'no cleaning_status CHECK found in migrations').toBeTruthy();
    const schemaValues = [...check[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect([...CLEANING_STATUS_VALUES].sort()).toEqual(schemaValues);
  });

  it('the rooms INSERT names both columns and binds both values', async () => {
    const sqls = [];
    const spy = {
      prepare: vi.fn((sql) => { sqls.push(sql); return d1.prepare(sql); }),
      batch: d1.batch.bind(d1),
    };
    const res = await importApp.request(
      'http://localhost/api/tenants/import',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': tenantId },
        body: JSON.stringify(
          manifestWithRooms([
            { id: 'room_gate_bind', name: 'Bind Room', productId: 'prod_gate_room', roomStatus: 'occupied', cleaningStatus: 'inspected' },
          ])
        ),
      },
      { ...env, DB: spy }
    );
    expect(res.status).toBe(200);

    const insert = sqls.find((s) => s.includes('INSERT INTO rooms_new'));
    expect(insert, 'rooms INSERT').toBeTruthy();
    expect(insert).toContain('room_status');
    expect(insert).toContain('cleaning_status');

    const columnList = insert.match(/INSERT INTO rooms_new \(([^)]+)\)/)[1]
      .split(',')
      .map((c) => c.trim());
    // Column order is the bind order for the INSERT...SELECT: every column
    // before created_at/updated_at takes exactly one placeholder.
    const boundColumns = columnList.filter((c) => c !== 'created_at' && c !== 'updated_at');
    expect(boundColumns.slice(-2)).toEqual(['room_status', 'cleaning_status']);

    // One placeholder per bound column, plus the 3 tenant-scoping guard binds
    // (c3.id, c3.tenant_id, p.id) in the WHERE clause. Getting this wrong
    // shifts every trailing bind silently instead of erroring.
    const placeholders = (insert.match(/\?/g) || []).length;
    expect(placeholders).toBe(boundColumns.length + 3);
  });
});