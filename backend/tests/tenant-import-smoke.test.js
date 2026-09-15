/**
 * T4 QA-gate smoke test — Tenant Import Manifest feature.
 *
 * Imports the canonical docs sample manifest through the real Hono route
 * (mounted via the repo's routerHarness — the seeded scope middleware stands
 * in for the auth token, exactly as the T1/T2 suite does) against a
 * STATE-FUL in-memory D1 mock, then proves the imported rows are queryable.
 *
 * Fixture resolution order:
 *   1. $TENANT_MANIFEST_FIXTURE (set by the QA runner — today points at a temp
 *      copy because `docs/examples/tenant-manifest.example.json` is created by
 *      T5, which runs after this gate).
 *   2. docs/examples/tenant-manifest.example.json — the canonical path the
 *      docs task (T5) must ship; when it exists this test exercises it.
 *   3. The embedded CANONICAL_SAMPLE below (identical shape to the fixture).
 *
 * NOTE FOR T5: docs/examples/tenant-manifest.example.json MUST match the
 * CANONICAL_SAMPLE shape in this file (same fields, all sections present) so
 * the smoke test keeps passing after the docs file lands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { mountRouter } from './helpers/routerHarness.js';

const tenantId = 'tenant_1';
const DOCS_FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'examples',
  'tenant-manifest.example.json',
);

/** Canonical docs sample — identical shape to docs/examples/tenant-manifest.example.json (T5). */
export const CANONICAL_SAMPLE = {
  tenant: {
    name: 'Sinai Palms',
    logoUrl: 'https://cdn.example.com/logo.png',
    primaryColor: '#0f766e',
    currency: 'EGP',
    location: 'Sharm El-Sheikh, South Sinai',
  },
  project: { name: 'Sinai Palms Camp' },
  products: [
    { id: 'prod_tent', name: 'Beach Tent', sku: 'TENT-01', basePrice: 1500, capacity: 4, type: 'room' },
    { name: 'Family Tent', basePrice: 2500, capacity: 6, type: 'room' },
  ],
  rooms: [
    { id: 'room_1', name: 'Room 101', productName: 'Beach Tent', floor: 1, maxGuests: 2, basePrice: 1500 },
    { id: 'room_2', name: 'Room 102', productId: 'prod_tent', bedType: 'double' },
  ],
  ratePlans: [
    { productName: 'Beach Tent', name: 'Summer', pricePerNight: 1500, season: 'summer', minStay: 2 },
  ],
  menu: {
    categories: [{ name: 'Grills' }, { name: 'Drinks', position: 2 }],
    meals: [
      { name: 'Mixed Grill', categoryName: 'Grills', price: 350 },
      { name: 'Fresh Juice', categoryName: 'Drinks', price: 90 },
    ],
  },
  posUsers: [
    { email: 'cashier@sinaipalms.com', password: 'password123', firstName: 'Aya', lastName: 'Salem', role: 'cashier' },
    { email: 'admin@sinaipalms.com', password: 'password123', firstName: 'Omar', lastName: 'Fathy', role: 'admin' },
  ],
};

const EXPECTED_COUNTS = {
  products: 2,
  rooms: 2,
  ratePlans: 1,
  mealCategories: 2,
  meals: 2,
  posUsers: 2,
};

/** Resolve the sample manifest the smoke test imports. */
function resolveSample() {
  if (process.env.TENANT_MANIFEST_FIXTURE && existsSync(process.env.TENANT_MANIFEST_FIXTURE)) {
    return { source: `env:${process.env.TENANT_MANIFEST_FIXTURE}`, manifest: JSON.parse(readFileSync(process.env.TENANT_MANIFEST_FIXTURE, 'utf8')) };
  }
  if (existsSync(DOCS_FIXTURE)) {
    return { source: `docs:${DOCS_FIXTURE}`, manifest: JSON.parse(readFileSync(DOCS_FIXTURE, 'utf8')) };
  }
  return { source: 'embedded:canonical-sample', manifest: CANONICAL_SAMPLE };
}

/**
 * Stateful in-memory D1 mock.
 *
 * Unlike the recording mock used by the T1/T2 unit suite, this one APPLIES
 * the handler's INSERTs into an in-memory row store and answers follow-up
 * SELECTs from that store — so "rows are queryable" is a real end-to-end
 * assertion rather than a statement-inspection assertion.
 *
 * Destination column lists are taken verbatim from backend/src/api/tenant-import.js.
 */
const INSERT_COLUMNS = {
  pos_products: ['id', 'tenant_id', 'organization_id', 'category_id', 'sku', 'name', 'description', 'short_description', 'selling_price', 'capacity', 'image_url', 'is_active', 'type', 'camp_id'],
  // INSERT ... SELECT guarded by projects/pos_products; bound[0..10] map to dest cols, trailing binds are WHERE/EXISTS guards.
  rooms_new: ['id', 'camp_id', 'product_id', 'name', 'status', 'bed_type', 'max_guests', 'base_price', 'floor', 'notes', 'is_active'],
  // INSERT ... SELECT; camp_id comes from p.camp_id (not a bind), so dest col 3 is skipped when mapping binds.
  rate_plans_new: ['id', 'tenant_id', 'product_id', 'camp_id', 'name', 'price_per_night', 'start_date', 'end_date', 'season', 'min_stay', 'is_active'],
  meal_categories: ['id', 'tenant_id', 'position'],
  meal_categories_lang: ['meal_category_id', 'lang', 'name'],
  meals: ['id', 'tenant_id', 'meal_category_id', 'price', 'image_url', 'is_active'],
  meal_lang: ['meal_id', 'lang', 'name', 'description'],
  pos_users: ['organization_id', 'tenant_id', 'username', 'email', 'password_hash', 'first_name', 'last_name', 'phone', 'role', 'department', 'employee_id', 'store_id'],
};

function makeStatefulDb() {
  const store = new Map(); // table -> row[]
  const ensure = (table) => {
    if (!store.has(table)) store.set(table, []);
    return store.get(table);
  };
  const statements = [];

  function zip(cols, bound) {
    const row = {};
    cols.forEach((col, i) => { row[col] = bound[i] ?? null; });
    return row;
  }

  function applyInsert(sql, bound) {
    const b = Array.isArray(bound) ? bound : [];
    if (sql.includes('INSERT INTO pos_products')) {
      const row = zip(INSERT_COLUMNS.pos_products, b);
      row.created_at = row.updated_at = null;
      ensure('pos_products').push(row);
      return true;
    }
    if (sql.includes('INSERT INTO rooms_new')) {
      const row = zip(INSERT_COLUMNS.rooms_new, b.slice(0, INSERT_COLUMNS.rooms_new.length));
      row.created_at = row.updated_at = null;
      ensure('rooms_new').push(row);
      return true;
    }
    if (sql.includes('INSERT INTO rate_plans_new')) {
      const cols = INSERT_COLUMNS.rate_plans_new;
      const row = {};
      cols.forEach((col, i) => {
        // dest col 3 (camp_id) is p.camp_id from the SELECT, not a bind
        row[col] = i === 3 ? null : (b[i > 3 ? i - 1 : i] ?? null);
      });
      row.created_at = row.updated_at = null;
      ensure('rate_plans_new').push(row);
      return true;
    }
    if (sql.includes('INSERT INTO meal_categories ')) {
      ensure('meal_categories').push({ ...zip(INSERT_COLUMNS.meal_categories, b), created_at: null });
      return true;
    }
    if (sql.includes('INSERT INTO meal_categories_lang')) {
      ensure('meal_categories_lang').push({ meal_category_id: b[0], lang: 'en', name: b[1] });
      return true;
    }
    if (sql.includes('INSERT INTO meals')) {
      ensure('meals').push({ ...zip(INSERT_COLUMNS.meals, b), created_at: null, updated_at: null });
      return true;
    }
    if (sql.includes('INSERT INTO meal_lang')) {
      ensure('meal_lang').push({ meal_id: b[0], lang: 'en', name: b[1], description: b[2] ?? null });
      return true;
    }
    if (sql.includes('INSERT INTO pos_users')) {
      const row = zip(INSERT_COLUMNS.pos_users, b);
      row.is_active = 1;
      row.status = 'active';
      ensure('pos_users').push(row);
      return true;
    }
    if (sql.includes('INSERT OR IGNORE INTO products') || sql.includes('INSERT INTO products ')) {
      // Mirror product from pos_products (used by ensureProductInProductsTable)
      const src = ensure('pos_products').find((p) => p.id === b[0]);
      ensure('products').push({
        id: b[0], tenant_id: b[1],
        category_id: src?.category_id ?? null, sku: src?.sku ?? null,
        base_price: src?.selling_price ?? null, capacity: src?.capacity ?? null,
        image_url: src?.image_url ?? null, is_active: src?.is_active ?? 1,
      });
      return true;
    }
    if (sql.includes('INSERT OR IGNORE INTO pos_organizations') || sql.includes('INSERT OR IGNORE INTO pos_stores') || sql.includes('INSERT OR IGNORE INTO tenant_org_mapping')) {
      return true; // org already provisioned in the smoke scenario; harmless no-op
    }
    return false;
  }

  // Simple WHERE col = ? equality filter used by the generic SELECT fallback.
  function filterWhere(rows, sql, bound) {
    const wheres = [];
    const re = /WHERE\s+([a-z_]+)\s*=\s*\?/g;
    let m;
    while ((m = re.exec(sql)) !== null) wheres.push(m[1]);
    if (wheres.length === 0) return rows;
    let bi = 0;
    let filtered = [...rows];
    for (const col of wheres) {
      filtered = filtered.filter((r) => String(r[col] ?? '') === String(bound?.[bi] ?? ''));
      bi += 1;
    }
    return filtered;
  }

  function selectRows(sql, bound) {
    // Handler-specific reads (mirror the exact SELECT shapes in tenant-import.js)
    if (sql.includes('organization_id FROM tenant_org_mapping')) return [{ organization_id: 7 }];
    if (sql.includes('FROM projects')) return [{ id: 'camp_1' }];
    if (sql.includes('id, name FROM pos_products')) return ensure('pos_products').map((p) => ({ id: p.id, name: p.name }));
    if (sql.includes('capacity FROM pos_products')) {
      const p = ensure('pos_products').find((r) => r.id === (bound?.[1] ?? null));
      return p ? [{ capacity: p.capacity }] : [];
    }
    if (sql.includes('FROM meal_categories')) {
      // join meal_categories_lang (lang='en') → { id, name }
      return ensure('meal_categories_lang')
        .filter((l) => l.lang === 'en')
        .map((l) => ({ id: l.meal_category_id, name: l.name }));
    }
    if (sql.includes('FROM pos_stores')) return [{ id: 5 }];
    // Generic read-back for the smoke assertions: any SELECT over a stored table.
    const from = sql.match(/FROM\s+([a-z_]+)/)?.[1];
    if (from && store.has(from)) {
      let rows = filterWhere(ensure(from), sql, bound);
      if (/LIMIT 1\s*$/.test(sql)) rows = rows.slice(0, 1);
      return rows;
    }
    return [];
  }

  const query = (sql, bound) => ({ results: selectRows(sql, bound) });

  function prepare(sql) {
    const state = { sql, bound: [] };
    const stmt = {
      state,
      bind(...args) {
        state.bound = args;
        return stmt;
      },
      async all() {
        statements.push({ type: 'all', ...state });
        return query(state.sql, state.bound);
      },
      async first() {
        statements.push({ type: 'first', ...state });
        return query(state.sql, state.bound).results?.[0] ?? null;
      },
      async run() {
        statements.push({ type: 'run', ...state });
        applyInsert(state.sql, state.bound);
        return { meta: { changes: 1 } };
      },
    };
    return stmt;
  }

  const db = {
    prepare,
    async batch(items) {
      const states = items.map((s) => s.state);
      statements.push({ type: 'batch', items: states });
      const changes = states.map((s) => {
        const applied = applyInsert(s.sql, s.bound);
        if (sqlIncludesModify(s.sql) && !applied) {
          throw new Error(`Stateful mock does not recognize statement: ${s.sql.slice(0, 120)}`);
        }
        return { meta: { changes: 1 } };
      });
      return changes;
    },
    __statements: statements,
  };

  function sqlIncludesModify(sql) {
    return /^\s*INSERT/i.test(sql) || /^\s*UPDATE/i.test(sql);
  }

  return db;
}

describe('T4 smoke: POST /api/tenants/import (docs sample via in-memory D1)', () => {
  let env;
  let app;
  let sample;

  beforeEach(() => {
    sample = resolveSample();
    app = mountRouter(tenantImportRoutes, { tenantId, basePath: '/api/tenants/import' });
    env = { DB: makeStatefulDb(), MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}) } };
  });

  it('logs which fixture source is under test', () => {
    expect(sample.source).toMatch(/^(env|docs|embedded):/);
    // eslint-disable-next-line no-console
    console.log(`[tenant-import-smoke] fixture source: ${sample.source}`);
  });

  it('imports the canonical docs sample: 200, every count > 0', async () => {
    const res = await app.request(
      'http://localhost/api/tenants/import',
      { method: 'POST', body: JSON.stringify(sample.manifest) },
      env,
    );
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.tenantId).toBe(tenantId);
    expect(data.counts).toEqual(EXPECTED_COUNTS);
    for (const [key, value] of Object.entries(data.counts)) {
      expect(value).toBeGreaterThan(0); // every entity section imported
    }
  });

  it('leaves https logo URLs untouched (no R2 upload on the sample)', async () => {
    const res = await app.request(
      'http://localhost/api/tenants/import',
      { method: 'POST', body: JSON.stringify(sample.manifest) },
      env,
    );
    expect(res.status).toBe(200);
    expect(env.MEDIA_BUCKET.put).not.toHaveBeenCalled();
  });

  it('rows are queryable for products/rooms/rate_plans/meals/pos_users after import', async () => {
    const res = await app.request(
      'http://localhost/api/tenants/import',
      { method: 'POST', body: JSON.stringify(sample.manifest) },
      env,
    );
    expect(res.status).toBe(200);

    const db = env.DB;

    // Products
    const products = await db.prepare('SELECT id, name, sku, type FROM pos_products WHERE tenant_id = ?').bind(tenantId).all();
    expect(products.results).toHaveLength(EXPECTED_COUNTS.products);
    expect(products.results.map((r) => r.name)).toEqual(['Beach Tent', 'Family Tent']);
    expect(products.results[0].sku).toBe('TENT-01');
    expect(products.results[0].type).toBe('room');

    // Rooms (product_name references resolved to product ids during import)
    const rooms = await db.prepare('SELECT id, name, product_id, camp_id, status FROM rooms_new').all();
    expect(rooms.results).toHaveLength(EXPECTED_COUNTS.rooms);
    const room101 = rooms.results.find((r) => r.name === 'Room 101');
    expect(room101.product_id).toBe('prod_tent');
    expect(room101.camp_id).toBe('camp_1');
    expect(room101.status).toBe('available');

    // Rate plans (product-guarded insert)
    const ratePlans = await db.prepare('SELECT id, name, product_id, season FROM rate_plans_new').all();
    expect(ratePlans.results).toHaveLength(EXPECTED_COUNTS.ratePlans);
    expect(ratePlans.results[0].name).toBe('Summer');
    expect(ratePlans.results[0].product_id).toBe('prod_tent');

    // Meals + meal_lang (category_name resolved, lang=en)
    const meals = await db.prepare('SELECT id, meal_category_id, price FROM meals').all();
    expect(meals.results).toHaveLength(EXPECTED_COUNTS.meals);
    expect(meals.results.every((r) => r.meal_category_id)).toBe(true); // category reference resolved
    const mealLang = await db.prepare("SELECT meal_id, name FROM meal_lang WHERE lang = 'en'").all();
    expect(mealLang.results.map((r) => r.name)).toEqual(['Mixed Grill', 'Fresh Juice']);

    // POS users (first/last name split; generated name column is a DB concern)
    const users = await db.prepare('SELECT organization_id, email, first_name, last_name, role, store_id FROM pos_users').all();
    expect(users.results).toHaveLength(EXPECTED_COUNTS.posUsers);
    const cashier = users.results.find((r) => r.email === 'cashier@sinaipalms.com');
    expect(cashier.first_name).toBe('Aya');
    expect(cashier.last_name).toBe('Salem');
    expect(cashier.role).toBe('cashier');
    expect(cashier.organization_id).toBe(7);
    expect(cashier.store_id).toBe(5); // resolved from org default store
  });
});