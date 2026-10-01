/**
 * DEFECT-2 — GET /api/products omitted pos_products.type, so a manifest
 * exported by scripts/export-tenant.mjs could never carry `type` and
 * re-import silently defaulted every product to 'retail'. A `type=room`
 * product round-tripped as `retail` with exit 0 on both ends — the loss was
 * completely invisible to the operator.
 *
 * This suite is the spec's REAL round-trip gate, not a statement inspection:
 *   1. fresh in-memory SQLite built by replaying EVERY migration in
 *      backend/migrations in order (so the real pos_products.type CHECK and
 *      DEFAULT apply);
 *   2. real POST /api/tenants/import with a manifest carrying a mix of
 *      room/menu/buffet/retail products;
 *   3. the EXPORT transform of scripts/export-tenant.mjs applied verbatim to
 *      the real GET /api/products response (the exporter is a CLI that ends in
 *      main(), so its mapping is mirrored here key-for-key — drift between the
 *      two is caught by the "mirrors export-tenant.mjs" assertions below);
 *   4. that exported manifest re-imported into a SECOND fresh tenant;
 *   5. exported again and compared — type must survive the full loop.
 *
 * Step 3-5 is the direction that actually regressed: before the fix the
 * first export dropped `type` and step 4 wrote 'retail' everywhere.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'node:path';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { productsRoutes } from '../src/api/camps.js';
import { mountRouter, mountRouterAuthenticated, signAdminToken } from './helpers/routerHarness.js';

const migrationsDir = join(import.meta.dirname, '../migrations');

const JWT_SECRET = 'test-secret-import-export-type';
const IMPORT_SCOPE_OPTIONS = {
  auth: { roles: ['super_admin', 'admin'], requireTenant: false },
  requireTenantHint: false,
};

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
  ).run(tenantId, `${tenantId}.test`, 'Export Type Gate', now, now);
  db.prepare(
    `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', 'admin', 'Gate', 'Admin', 1, ?, ?)`
  ).run(`adm_${tenantId}`, tenantId, `gate@${tenantId}.test`, now, now);
}

/**
 * The exporter's products mapping, mirrored verbatim from
 * scripts/export-tenant.mjs:156-181 (pick() + the key list + the conditional
 * `type` passthrough + campIds[] → singular campId).
 */
function pick(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return undefined;
}

function exportProducts(productsRaw) {
  return productsRaw.map((p) => {
    const o = {};
    for (const [mk, ...aks] of [
      ['id', 'id'], ['name', 'name'], ['sku', 'sku'],
      ['basePrice', 'basePrice', 'base_price'],
      ['capacity', 'capacity'], ['description', 'description'],
      ['shortDescription', 'shortDescription', 'short_description'],
      ['imageUrl', 'imageUrl', 'image_url'],
      ['categoryId', 'categoryId', 'category_id'],
      ['isActive', 'isActive', 'is_active'],
    ]) {
      const v = pick(p, ...aks);
      if (v !== undefined && v !== null) o[mk] = v;
    }
    if (pick(p, 'type') !== undefined) o.type = pick(p, 'type');
    const campIds = pick(p, 'campIds', 'camp_ids', 'campId', 'camp_id');
    const firstCamp = Array.isArray(campIds) ? campIds[0] : campIds;
    if (firstCamp !== undefined && firstCamp !== null) o.campId = firstCamp;
    return o;
  });
}

/** Manifest covering every value the pos_products.type CHECK allows. */
const SOURCE_MANIFEST = {
  tenant: { name: 'Export Type Gate', currency: 'EGP' },
  project: { name: 'Export Type Gate Camp' },
  products: [
    { name: 'Deluxe Room', basePrice: 1500, capacity: 4, type: 'room' },
    { name: 'Grill Plate', basePrice: 350, capacity: 1, type: 'menu' },
    { name: 'Breakfast Buffet', basePrice: 90, capacity: 1, type: 'buffet' },
    { name: 'Souvenir Mug', basePrice: 15, capacity: 1, type: 'retail' },
    { name: 'Untyped Item', basePrice: 25, capacity: 1 },
  ],
  rooms: [],
  ratePlans: [],
  menu: { categories: [], meals: [] },
  posUsers: [],
};

/** The `type` each product must carry through import → export → import. */
const EXPECTED_TYPES = {
  'Deluxe Room': 'room',
  'Grill Plate': 'menu',
  'Breakfast Buffet': 'buffet',
  'Souvenir Mug': 'retail',
  // No `type` in the manifest → import default, which must then be STABLE.
  'Untyped Item': 'retail',
};

describe('DEFECT-2: products[].type survives export (fresh local D1 round-trip)', () => {
  let db;
  let d1;
  let env;
  let importApp;
  let productsApp;
  let adminToken;

  const tenantA = 'tenant_export_a';
  const tenantB = 'tenant_export_b';

  beforeEach(async () => {
    db = buildFreshDb();
    d1 = makeD1(db);
    seedTenant(db, tenantA);
    env = {
      DB: d1,
      MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
      JWT_SECRET,
    };
    importApp = mountRouterAuthenticated(tenantImportRoutes, {
      basePath: '/api/tenants/import',
      scopeOptions: IMPORT_SCOPE_OPTIONS,
    });
    // Scope-injected mount: the export side is an unauthenticated public GET,
    // and its tenant scoping is what we are reading back.
    productsApp = mountRouter(productsRoutes, { tenantId: tenantA, basePath: '/api/products' });
    adminToken = await signAdminToken(
      {
        sub: `adm_${tenantA}`, userId: `adm_${tenantA}`,
        email: `gate@${tenantA}.test`, role: 'admin', tenantId: tenantA,
      },
      JWT_SECRET,
    );
  });

  const importInto = (tenantId, token, manifest) =>
    importApp.request(
      'http://localhost/api/tenants/import',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
        body: JSON.stringify(manifest),
      },
      env,
    );

  const postImport = (manifest) => importInto(tenantA, adminToken, manifest);

  /** Real GET /api/products for a tenant — the exporter's only product read. */
  const readProducts = async (tenantId) => {
    const app = mountRouter(productsRoutes, { tenantId, basePath: '/api/products' });
    const res = await app.request('http://localhost/api/products', { method: 'GET' }, env);
    expect(res.status).toBe(200);
    return res.json();
  };

  /** Import the SOURCE manifest, export it back, return the exported manifest. */
  const exportAfterImport = async () => {
    const res = await postImport(SOURCE_MANIFEST);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const raw = await readProducts(tenantA);
    expect(raw.length).toBe(SOURCE_MANIFEST.products.length);
    return { products: exportProducts(raw), raw };
  };

  it('GET /api/products SELECT reads p.type (the DEFECT-2 root cause)', async () => {
    const sqls = [];
    const spy = { prepare: vi.fn((sql) => { sqls.push(sql); return d1.prepare(sql); }) };
    await postImport(SOURCE_MANIFEST);
    await mountRouter(productsRoutes, { tenantId: tenantA, basePath: '/api/products' })
      .request('http://localhost/api/products', { method: 'GET' }, { DB: spy, JWT_SECRET });

    const select = sqls.find((s) => s.includes('FROM pos_products'));
    expect(select).toBeTruthy();
    expect(select).toMatch(/\bp\.type\b/);
  });

  it('returns type on the wire in camelCase form (no snake_case leak)', async () => {
    const { raw } = await exportAfterImport();
    const room = raw.find((p) => p.name === 'Deluxe Room');

    // toCamel is a no-op for this single-word key, so the wire key is `type`.
    expect(Object.keys(room)).toContain('type');
    expect(room.type).toBe('room');
    for (const key of Object.keys(room)) {
      expect(key, `snake_case key leaked: ${key}`).not.toMatch(/_/);
    }
  });

  it('exports every product type, not just room (menu/buffet/retail too)', async () => {
    const { products } = await exportAfterImport();
    const byName = Object.fromEntries(products.map((p) => [p.name, p]));

    for (const [name, type] of Object.entries(EXPECTED_TYPES)) {
      expect(byName[name], `${name} missing from export`).toBeTruthy();
      expect(byName[name].type, `${name} type`).toBe(type);
    }
  });

  it('round-trips: import → export → re-import → export keeps type stable', async () => {
    const first = await exportAfterImport();
    expect(first.products.every((p) => p.type !== undefined)).toBe(true);

    // Second tenant, so the re-import genuinely re-writes rows rather than
    // short-circuiting on the first tenant's ids.
    seedTenant(db, tenantB);
    const tokenB = await signAdminToken(
      {
        sub: `adm_${tenantB}`, userId: `adm_${tenantB}`,
        email: `gate@${tenantB}.test`, role: 'admin', tenantId: tenantB,
      },
      JWT_SECRET,
    );
    // `id` / `sku` / `campId` are dropped on a cross-tenant copy: id seeds the
    // product key and sku is `TEXT UNIQUE` GLOBALLY (migration 0112:153), so
    // replaying the source tenant's values is a UNIQUE violation, not a type
    // assertion. Same "tenant-local placeholder" idiom as the project-id suite
    // (which drops campId/categoryId). `type` is deliberately KEPT — it is the
    // field under test.
    const reImport = await importInto(tenantB, tokenB, {
      tenant: { name: 'Export Type Gate Copy' },
      project: { name: 'Export Type Gate Copy Camp' },
      products: first.products.map(({ id, sku, campId, ...rest }) => rest),
      rooms: [],
      ratePlans: [],
      menu: { categories: [], meals: [] },
      posUsers: [],
    });
    expect(reImport.status).toBe(200);
    expect((await reImport.json()).success).toBe(true);

    // The rows themselves must hold the imported types, not just the read side.
    const stored = db
      .prepare('SELECT name, type FROM pos_products WHERE tenant_id = ?')
      .all(tenantB);
    const storedByName = Object.fromEntries(stored.map((r) => [r.name, r.type]));
    for (const [name, type] of Object.entries(EXPECTED_TYPES)) {
      expect(storedByName[name], `${name} stored type`).toBe(type);
    }

    // Second export — this is the stability assertion the defect broke.
    const second = exportProducts(await readProducts(tenantB));
    const secondByName = Object.fromEntries(second.map((p) => [p.name, p]));
    for (const [name, type] of Object.entries(EXPECTED_TYPES)) {
      expect(secondByName[name].type, `${name} type after round-trip`).toBe(type);
    }
    expect(secondByName['Deluxe Room'].type).toBe('room');
    expect(secondByName['Deluxe Room'].type).not.toBe('retail');
  });

  it('the exporter key mapping mirrored here still matches scripts/export-tenant.mjs', async () => {
    // Drift guard: export-tenant.mjs is a CLI (main() at module scope) so the
    // mapping is duplicated above. If the script's key list or its conditional
    // `type` passthrough changes, this fails rather than silently testing a
    // mapping that no longer runs in production.
    const src = readFileSync(
      join(import.meta.dirname, '..', '..', 'scripts', 'export-tenant.mjs'),
      'utf8',
    );
    expect(src).toContain("if (pick(p, 'type') !== undefined) o.type = pick(p, 'type');");
    for (const key of ['basePrice', 'shortDescription', 'imageUrl', 'categoryId', 'isActive']) {
      expect(src, `exporter should still map ${key}`).toContain(`['${key}'`);
    }
    // The loss is gone, so the script must no longer advertise it as known.
    expect(src).not.toContain('GET /api/products SELECT omits the column → unrecoverable');
  });
});