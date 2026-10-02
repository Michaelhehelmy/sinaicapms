/**
 * Identity-mode provisioning coverage — POST /api/tenants/import with an
 * `identity` block (super-admin provisioning) on a FRESH local D1.
 *
 * Companion to tenant-import-rollback.test.js (which pins the saga's reverse-
 * order undo when a data section throws). This suite walks the six mission
 * cases of the identity path end to end:
 *
 *   M1  full-manifest success          201 + every shell/data row real
 *   M2  meal categoryName miss         the pre-write validation 400, nothing written
 *   M3  subdomain collision            400, nothing written
 *   M4  admin email collision          400 (and only AFTER the subdomain gate passes)
 *   M5  mid-products failure           rollback of a half-built tenant (5th product, dup SKU)
 *   M6  identity-only (no data rows)   201, shell only, counts all zero, login works
 *
 * Why a real replayed D1 rather than a statement-inspection mock: every claim
 * here is a ROW COUNT on the migrated schema, with `foreign_keys = ON`, so
 * "the shell was rolled back" means no rows are left — not that a DELETE
 * statement was emitted (a DELETE that matched zero rows would satisfy the
 * latter just as happily). The auth/scope wiring is real too: requests run
 * through the production resolveScope + requireAuth chain signed with a real
 * JWT, exactly like the /api/tenants/import mount in index.js.
 *
 * Status expectations follow the saga's own documented rule (tenant-import.js
 * route wrapper): a rejection that lands BEFORE the first write keeps its
 * precise 4xx, anything that fails after the shell exists is answered with the
 * rolled-back 500 that quotes the original reason. M2/M3/M4 are the former,
 * M5 the latter. Assertions are stated as the contract, not fitted to output.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { verifyPassword } from '../src/middleware/sharedAuth.js';
import { mountRouterAuthenticated, signAdminToken } from './helpers/routerHarness.js';

const migrationsDir = join(import.meta.dirname, '../migrations');

const JWT_SECRET = 'test-secret-import-identity';
// Mirrors backend/src/index.js `/api/tenants/import` mount options exactly.
const IMPORT_SCOPE_OPTIONS = {
  auth: { roles: ['super_admin', 'admin'], requireTenant: false },
  requireTenantHint: false,
};

const SUPER_ADMIN = {
  sub: 'adm_super_id',
  userId: 'adm_super_id',
  email: 'super@identity-suite.test',
  role: 'super_admin',
  tenantId: null,
};

/** Shell rows identity provisioning commits before the data import runs. */
const SHELL_TABLES = ['tenants', 'admins', 'projects', 'pos_organizations', 'pos_stores', 'tenant_org_mapping'];
/** Rows the data sections commit for the provisioned tenant. */
const DATA_TABLES = [
  'pos_products', 'products', 'rooms_new', 'rate_plans_new',
  'meal_categories', 'meal_categories_lang', 'meals', 'meal_lang', 'pos_users',
];
const TRACKED_TABLES = [...SHELL_TABLES, ...DATA_TABLES];

const ROLLED_BACK_MESSAGE =
  'All partial data has been rolled back. You can retry with a corrected manifest.';

/** Fresh local D1: every migration in lexical order, FK enforcement ON. */
function buildFreshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  return db;
}

/**
 * D1-compatible adapter over better-sqlite3 plus an execution tape, in the same
 * shape as tenant-import-rollback.test.js: statements fail synchronously (the
 * throw happens inside the call, never as an un-awaited rejection) and
 * `batch()` is one real transaction, so it is all-or-nothing exactly like D1's
 * and the handler's `meta.changes === 0` guards read true `changes`.
 *
 * The tape is what lets "nothing was written" be asserted PROVABLY — the row
 * counts alone cannot tell "rejected before provisioning" apart from "provisioned
 * then rolled back", and those two states deserve different answers.
 */
function makeD1(db) {
  const tape = [];
  const record = (sql) => tape.push(sql.replace(/\s+/g, ' ').trim());
  return {
    prepare(sql) {
      return {
        // `sql`/`params` ride along on the bound statement: `batch()` receives
        // the same objects the handler collected and destructures them.
        bind: (...params) => ({
          sql, params,
          async all() {
            record(sql);
            return { results: db.prepare(sql).all(...params) };
          },
          async first() {
            record(sql);
            return db.prepare(sql).get(...params) ?? null;
          },
          async run() {
            record(sql);
            return { success: true, meta: { changes: db.prepare(sql).run(...params).changes } };
          },
        }),
      };
    },
    async batch(statements) {
      return db.transaction(() =>
        statements.map(({ sql, params }) => {
          record(sql);
          return { success: true, meta: { changes: db.prepare(sql).run(...params).changes } };
        }),
      )();
    },
    tape,
  };
}

/** The super-admin row the real-auth chain probes on every request. */
function seedSuperAdmin(db) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
     VALUES (?, NULL, ?, 'x', 'super_admin', 'Super', 'Admin', 1, ?, ?)`
  ).run(SUPER_ADMIN.sub, SUPER_ADMIN.email, now, now);
}

/**
 * A tenant that predates every request: it owns the taken subdomain in M3 and
 * the taken admin email in M4. Its subdomain carries no dots/underscores so a
 * format-rejected request never masquerades as a uniqueness rejection, and it
 * is seeded BEFORE the baseline snapshot so "nothing was written" means
 * "nothing beyond what already existed".
 */
function seedIncumbentTenant(db, { tenantId, subdomain, adminEmail }) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tenants (id, subdomain, name, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`
  ).run(tenantId, subdomain, 'Incumbent Camp', now, now);
  db.prepare(
    `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', 'admin', 'Ina', 'Cumbent', 1, ?, ?)`
  ).run(`adm_${tenantId}`, tenantId, adminEmail, now, now);
  db.prepare(
    `INSERT INTO projects (id, tenant_id, name, slug, project_type, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'camp', 'active', ?, ?)`
  ).run(`proj_${tenantId}`, tenantId, 'Incumbent Camp', 'incumbent-camp', now, now);
}

const identityOf = (overrides = {}) => ({
  name: 'Identity Camp',
  subdomain: 'identitycamp',
  type: 'camp',
  email: 'owner@identitycamp.test',
  password: 'password123',
  firstName: 'Nour',
  lastName: 'Zaki',
  ...overrides,
});

/** Every section populated: branding, project, products, rooms, rate plans, menu, POS users. */
const fullManifest = {
  identity: identityOf(),
  tenant: {
    name: 'Identity Camp',
    primaryColor: '#0f766e',
    currency: 'EGP',
    location: 'North Sinai',
    description: 'Full manifest import',
  },
  project: { name: 'Identity Camp Annex', type: 'camp', capacity: 30, status: 'active' },
  products: [
    { id: 'prod_identity_tent', name: 'Beach Tent', sku: 'TENT-ID-1', basePrice: 1500, capacity: 4, type: 'room' },
    { id: 'prod_identity_bungalow', name: 'Bungalow', sku: 'BUNG-ID-1', basePrice: 2600, capacity: 6, type: 'room' },
  ],
  rooms: [
    { id: 'room_identity_1', name: 'Room 101', productName: 'Beach Tent', maxGuests: 2, basePrice: 1500 },
    // No maxGuests: the handler must derive it from the product's capacity.
    { id: 'room_identity_2', name: 'Room 102', productId: 'prod_identity_bungalow', bedType: 'double' },
  ],
  ratePlans: [
    { id: 'rp_identity_summer', productName: 'Beach Tent', name: 'Summer', pricePerNight: 1500, season: 'summer' },
    { id: 'rp_identity_winter', productId: 'prod_identity_bungalow', name: 'Winter', pricePerNight: 2200, season: 'winter' },
  ],
  menu: {
    categories: [{ name: 'Grills', position: 1 }, { name: 'Drinks', position: 2 }],
    meals: [
      { name: 'Mixed Grill', categoryName: 'Grills', price: 350 },
      { name: 'Fresh Juice', categoryName: 'Drinks', price: 90, description: 'Cold pressed' },
    ],
  },
  posUsers: [
    { email: 'cashier@identitycamp.test', password: 'password123', firstName: 'Aya', lastName: 'Salem', role: 'cashier' },
    { email: 'manager@identitycamp.test', password: 'password123', firstName: 'Omar', lastName: 'Fathy', role: 'manager' },
  ],
};

describe('tenant import — identity provisioning path (fresh local D1)', () => {
  // Seeded for EVERY case: `identitycamp` / `owner@identitycamp.test` are free,
  // `incumbent-camp` / `incumbent@identitycamp.test` are taken. M3/M4 ask the
  // manifest for one of the taken pair; the rest ignore the incumbent and must
  // leave it (and its rows) alone.
  const INCUMBENT = {
    tenantId: 'tenantincumbent',
    subdomain: 'incumbent-camp',
    adminEmail: 'incumbent@identitycamp.test',
  };

  let db;
  let env;
  let app;
  let superToken;
  let baseline;

  beforeEach(async () => {
    db = buildFreshDb();
    seedSuperAdmin(db);
    seedIncumbentTenant(db, INCUMBENT);
    app = mountRouterAuthenticated(tenantImportRoutes, {
      basePath: '/api/tenants/import',
      scopeOptions: IMPORT_SCOPE_OPTIONS,
    });
    superToken = await signAdminToken(SUPER_ADMIN, JWT_SECRET);
    env = {
      DB: makeD1(db),
      MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
      JWT_SECRET,
    };
    baseline = Object.fromEntries(
      TRACKED_TABLES.map((t) => [t, count(`SELECT COUNT(*) AS c FROM ${t}`)]),
    );
  });

  /** POST as super-admin with NO tenant hint (the only role identity mode accepts). */
  const post = (manifest) =>
    app.request(
      'http://localhost/api/tenants/import',
      { method: 'POST', headers: { Authorization: `Bearer ${superToken}` }, body: JSON.stringify(manifest) },
      env,
    );

  const count = (sql, ...args) => db.prepare(sql).get(...args).c;
  const row = (sql, ...args) => db.prepare(sql).get(...args);
  const insertsInto = (table) => env.DB.tape.filter((s) => s.startsWith(`INSERT INTO ${table} `));
  const deletes = () => env.DB.tape.filter((s) => s.startsWith('DELETE FROM '));
  const ran = (fragment) => env.DB.tape.some((s) => s.includes(fragment));
  /** ensureTenantOrg's org slug rule: 'org_' + tenantId, non-alphanumerics → '_'. */
  const orgSlugFor = (tenantId) => `org_${tenantId}`.replace(/[^a-zA-Z0-9_]/g, '_');

  /** Every tracked table is back at its pre-request row count. */
  const expectBaseline = () => {
    for (const table of TRACKED_TABLES) {
      expect(count(`SELECT COUNT(*) AS c FROM ${table}`), `${table} rows`).toBe(baseline[table]);
    }
  };
  /** The provisioned tenant is gone down to its burned identifiers. */
  const expectNoShell = (subdomain, email) => {
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE subdomain = ?', subdomain), 'tenant row').toBe(0);
    expect(count('SELECT COUNT(*) AS c FROM admins WHERE email = ?', email), 'admin row').toBe(0);
    expect(count('SELECT COUNT(*) AS c FROM tenant_org_mapping WHERE tenant_id = ?', `tenant_${subdomain}`)).toBe(0);
    for (const table of DATA_TABLES) expect(count(`SELECT COUNT(*) AS c FROM ${table}`), `${table} rows`).toBe(0);
  };
  const expectNoOrphanFks = () => expect(db.pragma('foreign_key_check')).toEqual([]);

  it('M1 — provisions the full manifest: shell, branding, project and every data row, 201', async () => {
    const res = await post(fullManifest);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.created.tenantId).toMatch(/^tenant_/);
    expect(body.created.adminId).toMatch(/^adm_/);
    expect(body.created.organizationId).toBeTruthy();
    expect(body.tenantId).toBe(body.created.tenantId);
    expect(body.counts).toEqual({
      products: 2, rooms: 2, ratePlans: 2, mealCategories: 2, meals: 2, posUsers: 2,
    });

    const tenantId = body.created.tenantId;
    const projectRow = row('SELECT * FROM projects WHERE tenant_id = ?', tenantId);
    const projectId = projectRow?.id;

    // ── Shell ──
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE subdomain = ?', 'identitycamp')).toBe(1);
    const tenantRow = row('SELECT * FROM tenants WHERE id = ?', tenantId);
    expect(tenantRow.name).toBe('Identity Camp');
    expect(tenantRow.type).toBe('camp');
    expect(tenantRow.business_type).toBe('camp'); // falls back to `type`
    expect(tenantRow.email).toBe('owner@identitycamp.test');
    expect(tenantRow.status).toBe('active');
    expect(tenantRow.onboarding_status).toBe('completed');

    expect(count('SELECT COUNT(*) AS c FROM admins WHERE tenant_id = ?', tenantId)).toBe(1);
    const adminRow = row('SELECT * FROM admins WHERE tenant_id = ?', tenantId);
    expect(adminRow.id).toBe(body.created.adminId);
    expect(adminRow.email).toBe('owner@identitycamp.test');
    expect(adminRow.role).toBe('admin');
    expect(adminRow.is_active).toBe(1);
    expect(adminRow.first_name).toBe('Nour');
    expect(adminRow.last_name).toBe('Zaki');
    expect(adminRow.password_hash).not.toBe('password123');
    expect(await verifyPassword('password123', adminRow.password_hash)).toBe(true);

    // Branding block merged over the identity INSERT through COALESCE.
    expect(tenantRow.primary_color).toBe('#0f766e');
    expect(tenantRow.currency).toBe('EGP');
    expect(tenantRow.location).toBe('North Sinai');
    expect(tenantRow.description).toBe('Full manifest import');

    // Org + store + mapping, keyed by the created organization.
    expect(count('SELECT COUNT(*) AS c FROM pos_organizations WHERE id = ?', body.created.organizationId)).toBe(1);
    expect(row('SELECT slug FROM pos_organizations WHERE id = ?', body.created.organizationId).slug).toBe(orgSlugFor(tenantId));
    const storeId = row('SELECT id FROM pos_stores WHERE organization_id = ?', body.created.organizationId).id;
    expect(row('SELECT code FROM pos_stores WHERE id = ?', storeId).code).toBe(`ST_${tenantId}`);
    expect(row('SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?', tenantId).organization_id)
      .toBe(body.created.organizationId);

    // Exactly ONE project: the `project` block UPDATES the shell project rather
    // than forking a second camp on every import.
    expect(count('SELECT COUNT(*) AS c FROM projects WHERE tenant_id = ?', tenantId)).toBe(1);
    expect(projectId).toMatch(/^proj_/);
    expect(projectRow.name).toBe('Identity Camp Annex');
    expect(projectRow.slug).toBe('identity-camp-annex');
    expect(projectRow.project_type).toBe('camp');
    expect(projectRow.capacity).toBe(30);
    expect(projectRow.status).toBe('active');

    // ── Data sections ──
    expect(count('SELECT COUNT(*) AS c FROM pos_products WHERE tenant_id = ?', tenantId)).toBe(2);
    const tent = row('SELECT * FROM pos_products WHERE id = ?', 'prod_identity_tent');
    expect(tent.sku).toBe('TENT-ID-1');
    expect(tent.selling_price).toBe(1500);
    expect(tent.organization_id).toBe(body.created.organizationId);
    expect(tent.camp_id).toBe(projectId); // tenant default project
    expect(tent.project_id).toBe(projectId);

    expect(count('SELECT COUNT(*) AS c FROM rooms_new WHERE tenant_id = ?', tenantId)).toBe(2);
    const room1 = row('SELECT * FROM rooms_new WHERE id = ?', 'room_identity_1');
    expect(room1.product_id).toBe('prod_identity_tent'); // resolved by productName
    expect(room1.camp_id).toBe(projectId);
    expect(room1.max_guests).toBe(2); // explicit
    expect(room1.room_status).toBe('available'); // schema default written through
    const room2 = row('SELECT * FROM rooms_new WHERE id = ?', 'room_identity_2');
    expect(room2.product_id).toBe('prod_identity_bungalow'); // resolved by productId
    expect(room2.max_guests).toBe(6); // derived from the product's capacity
    expect(room2.bed_type).toBe('double');

    expect(count('SELECT COUNT(*) AS c FROM rate_plans_new WHERE tenant_id = ?', tenantId)).toBe(2);
    expect(row('SELECT * FROM rate_plans_new WHERE id = ?', 'rp_identity_summer').price_per_night).toBe(1500);
    expect(row('SELECT * FROM rate_plans_new WHERE id = ?', 'rp_identity_summer').camp_id).toBe(projectId);
    expect(row('SELECT * FROM rate_plans_new WHERE id = ?', 'rp_identity_winter').product_id).toBe('prod_identity_bungalow');

    expect(count('SELECT COUNT(*) AS c FROM meal_categories WHERE tenant_id = ?', tenantId)).toBe(2);
    expect(count('SELECT COUNT(*) AS c FROM meal_categories_lang WHERE lang = ?', 'en')).toBe(2);
    const categoryNames = db.prepare(
      `SELECT mcl.name FROM meal_categories_lang mcl
        JOIN meal_categories mc ON mc.id = mcl.meal_category_id
       WHERE mc.tenant_id = ? ORDER BY mcl.name`
    ).all(tenantId).map((r) => r.name);
    expect(categoryNames).toEqual(['Drinks', 'Grills']);

    expect(count('SELECT COUNT(*) AS c FROM meals WHERE tenant_id = ?', tenantId)).toBe(2);
    expect(count('SELECT COUNT(*) AS c FROM meal_lang WHERE lang = ?', 'en')).toBe(2);
    const grill = row('SELECT * FROM meals WHERE price = ?', 350);
    expect(grill.id).toMatch(/^meal_/);
    expect(categoryNames).toContain(row('SELECT name FROM meal_categories_lang WHERE meal_category_id = ?', grill.meal_category_id).name);
    expect(row('SELECT name FROM meal_lang WHERE meal_id = ?', grill.id).name).toBe('Mixed Grill');
    const juice = row('SELECT * FROM meals WHERE price = ?', 90);
    expect(row('SELECT description FROM meal_lang WHERE meal_id = ?', juice.id).description).toBe('Cold pressed');

    expect(count('SELECT COUNT(*) AS c FROM pos_users WHERE tenant_id = ?', tenantId)).toBe(2);
    const cashier = row('SELECT * FROM pos_users WHERE email = ?', 'cashier@identitycamp.test');
    expect(cashier.name).toBe('Aya Salem'); // GENERATED column
    expect(cashier.role).toBe('cashier');
    expect(cashier.organization_id).toBe(body.created.organizationId);
    expect(cashier.store_id).toBe(storeId);
    expect(cashier.is_active).toBe(1);
    expect(await verifyPassword('password123', cashier.password_hash)).toBe(true);
    expect(row('SELECT role FROM pos_users WHERE email = ?', 'manager@identitycamp.test').role).toBe('manager');

    // `products` mirror rows for the rooms/rate plans (rooms_new.product_id is an
    // FK onto pos_products; the mirror is what keeps the id spaces joined).
    expect(count('SELECT COUNT(*) AS c FROM products WHERE tenant_id = ?', tenantId)).toBe(2);
    expect(count('SELECT COUNT(*) AS c FROM products WHERE tenant_id = ? AND base_price = ?', tenantId, 2600)).toBe(1);

    expectNoOrphanFks();
    // The happy path undoes nothing.
    expect(deletes()).toEqual([]);

    // The pre-existing tenant is untouched: its rows are not folded into the new
    // tenant's counts and it keeps its own project.
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE id = ?', INCUMBENT.tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM admins WHERE email = ?', INCUMBENT.adminEmail)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM projects WHERE tenant_id = ?', INCUMBENT.tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM pos_products WHERE tenant_id = ?', INCUMBENT.tenantId)).toBe(0);
    expect(count('SELECT COUNT(*) AS c FROM projects')).toBe(2); // incumbent + provisioned
  });

  it('M2 — rejects an unresolvable meal categoryName with the pre-write 400 and writes nothing', async () => {
    // FINDING (asserted, unfixed — see AGENT_LOGBOOK 2026-10-02 A1): identity
    // mode answers this 500, not 400. The categoryName probe lives INSIDE
    // runImport, which the route calls only AFTER it has committed the tenant
    // shell, so the saga wrapper sees a non-empty undo log and rewrites the
    // precise rejection as `Import failed: <reason>. All partial data has been
    // rolled back.` Observed body:
    //   500 { error: 'Import failed: Meal "Mystery Plate" references unknown
    //        category "Desserts". Declare the category in menu.categories[] or
    //        remove categoryName.. All partial data has been rolled back. …' }
    // The rollback itself is clean (no rows survive), so what regresses is the
    // status code, the "writes nothing at all" guarantee the pre-flight exists
    // to provide, and the message (a doubled period where the reason is quoted
    // into the template). The same wrapper rewrites every other pre-write
    // rejection that runs after the shell exists — the campId probe's 400, the
    // rooms/rate-plan "unknown product" 400/404 and the meal-id 409.
    //
    // "Desserts" is declared by neither the manifest nor the (empty) new tenant.
    // Without the pre-flight this dies on `meals.meal_category_id`
    // (NOT NULL REFERENCES meal_categories) AFTER branding, products, rooms,
    // rate plans and categories are already committed.
    const manifest = {
      ...fullManifest,
      identity: identityOf({ subdomain: 'mealmiss', email: 'owner@mealmiss.test' }),
      menu: {
        categories: [{ name: 'Grills' }],
        meals: [{ name: 'Mystery Plate', categoryName: 'Desserts', price: 120 }],
      },
    };

    const res = await post(manifest);
    const body = await res.json();

    // The pre-flight's documented answer (identical in existing-tenant mode —
    // tenant-scoped-uniqueness.test.js): a 400 that names the meal and the
    // category, NOT a rolled-back server error.
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe(
      'Meal "Mystery Plate" references unknown category "Desserts". ' +
        'Declare the category in menu.categories[] or remove categoryName.',
    );
    expect(body.error).not.toContain(ROLLED_BACK_MESSAGE);

    // Nothing was written — not even provisionally: this rejection is supposed
    // to land before the tenant shell exists, so no INSERT may have been issued.
    expect(insertsInto('tenants')).toEqual([]);
    expect(insertsInto('admins')).toEqual([]);
    expect(deletes()).toEqual([]);
    expectBaseline();
    expectNoOrphanFks();
  });

  it('M3 — rejects a taken subdomain with a 400 and writes nothing', async () => {
    // The manifest asks for the incumbent's subdomain, so the uniqueness probe
    // fires instead of the format gate (the incumbent's subdomain is a legal one).
    const res = await post({
      ...fullManifest,
      identity: identityOf({ subdomain: INCUMBENT.subdomain, email: 'owner@secondcamp.test' }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('This subdomain is already taken');

    expect(insertsInto('tenants')).toEqual([]);
    expect(insertsInto('admins')).toEqual([]);
    expect(insertsInto('projects')).toEqual([]);
    expect(deletes()).toEqual([]);
    expectBaseline();

    // The incumbent is untouched — the collision must not evict or overwrite it.
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE id = ?', INCUMBENT.tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM admins WHERE email = ?', INCUMBENT.adminEmail)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM projects WHERE tenant_id = ?', INCUMBENT.tenantId)).toBe(1);
    expectNoOrphanFks();
  });

  it('M4 — rejects a taken admin email with a 400, after the subdomain gate has passed', async () => {
    // The manifest asks for a FREE subdomain but the incumbent's ADMIN email, so
    // the uniqueness probes must run in order: subdomain first (passes), email
    // second (fires).
    const res = await post({
      ...fullManifest,
      identity: identityOf({ email: INCUMBENT.adminEmail }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('An account with this email already exists');

    // The subdomain probe really did run and find nothing — the 400 is the email
    // gate's, not the subdomain gate's.
    expect(ran('SELECT id FROM tenants WHERE subdomain = ?')).toBe(true);
    expect(ran('SELECT id FROM admins WHERE email = ?')).toBe(true);
    expect(insertsInto('tenants')).toEqual([]);
    expect(insertsInto('admins')).toEqual([]);
    expect(deletes()).toEqual([]);
    expectBaseline();

    // The free subdomain was never consumed by the rejected request.
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE subdomain = ?', 'identitycamp')).toBe(0);
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE id = ?', INCUMBENT.tenantId)).toBe(1);
    expectNoOrphanFks();
  });

  it('M5 — rolls the whole tenant back when the 5th product fails on a duplicate SKU', async () => {
    // 0126 made pos_products.sku UNIQUE per (tenant_id, sku), so the manifest's
    // 5th row collides with its own 1st inside the one batch. The batch is
    // atomic (D1 semantics), so products leave no rows — but the SHELL was
    // committed six statements earlier and must be undone, along with the
    // 4 sections (rooms/rate plans/menu/POS users) that never got to run.
    const products = fullManifest.products.concat([
      { id: 'prod_identity_dup', name: 'Duplicate SKU Tent', sku: 'TENT-ID-1', basePrice: 1500, capacity: 4, type: 'room' },
      { id: 'prod_identity_tent2', name: 'Spare Tent', sku: 'TENT-ID-2', basePrice: 1500, capacity: 4, type: 'room' },
      { id: 'prod_identity_tent3', name: 'Third Tent', sku: 'TENT-ID-3', basePrice: 1500, capacity: 4, type: 'room' },
      { id: 'prod_identity_tent4', name: 'Fourth Tent', sku: 'TENT-ID-4', basePrice: 1500, capacity: 4, type: 'room' },
      { id: 'prod_identity_tent5', name: 'Fifth Tent', sku: 'TENT-ID-1', basePrice: 1500, capacity: 4, type: 'room' },
    ]);
    const manifest = {
      ...fullManifest,
      identity: identityOf({ subdomain: 'productsfail', email: 'owner@productsfail.test' }),
      products,
    };

    const res = await post(manifest);
    const body = await res.json();

    // A write-time failure: the rolled-back 500 that quotes the original reason.
    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Import failed:');
    expect(body.error).toContain('One or more products already exist (duplicate SKU or ID)');
    expect(body.error).toContain(ROLLED_BACK_MESSAGE);

    // It really was a mid-import failure, not a pre-write rejection: the tenant
    // shell was INSERTed and then undone.
    expect(insertsInto('tenants')).toHaveLength(1);
    expect(ran('INSERT INTO pos_products')).toBe(true);
    expect(deletes().length).toBeGreaterThan(0);

    // Zero rows, table by table — a deleted shell plus an atomic product batch.
    expectBaseline();
    expectNoShell('productsfail', 'owner@productsfail.test');
    expectNoOrphanFks();

    // The tenant goes last: children before parents, or an FK edge blocks the
    // parent delete and leaves the shell half-standing.
    expect(deletes().at(-1)).toMatch(/^DELETE FROM tenants /);
  });

  it('M6 — identity-only manifest provisions the shell alone: 201, zero data rows, working login', async () => {
    const res = await post({ identity: identityOf() });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.created.tenantId).toMatch(/^tenant_/);
    expect(body.created.adminId).toMatch(/^adm_/);
    expect(body.created.organizationId).toBeTruthy();
    expect(body.counts).toEqual({
      products: 0, rooms: 0, ratePlans: 0, mealCategories: 0, meals: 0, posUsers: 0,
    });

    const tenantId = body.created.tenantId;
    const tenantRow = row('SELECT * FROM tenants WHERE id = ?', tenantId);
    expect(tenantRow.subdomain).toBe('identitycamp');
    expect(tenantRow.name).toBe('Identity Camp');
    expect(tenantRow.type).toBe('camp');
    expect(tenantRow.email).toBe('owner@identitycamp.test');
    expect(tenantRow.status).toBe('active');
    expect(tenantRow.onboarding_status).toBe('completed');

    // A super-admin provisioned login that actually verifies the manifest password.
    const adminRow = row('SELECT * FROM admins WHERE id = ?', body.created.adminId);
    expect(adminRow.tenant_id).toBe(tenantId);
    expect(adminRow.role).toBe('admin');
    expect(adminRow.is_active).toBe(1);
    expect(adminRow.first_name).toBe('Nour');
    expect(adminRow.last_name).toBe('Zaki');
    expect(adminRow.password_hash).not.toBe('password123');
    expect(await verifyPassword('password123', adminRow.password_hash)).toBe(true);

    expect(row('SELECT slug FROM pos_organizations WHERE id = ?', body.created.organizationId).slug).toBe(orgSlugFor(tenantId));
    expect(count('SELECT COUNT(*) AS c FROM pos_stores WHERE organization_id = ?', body.created.organizationId)).toBe(1);
    expect(row('SELECT organization_id FROM tenant_org_mapping WHERE tenant_id = ?', tenantId).organization_id)
      .toBe(body.created.organizationId);

    // Default project: named from the identity, slugged from the subdomain.
    expect(count('SELECT COUNT(*) AS c FROM projects WHERE tenant_id = ?', tenantId)).toBe(1);
    const projectRow = row('SELECT * FROM projects WHERE tenant_id = ?', tenantId);
    expect(projectRow.name).toBe('Identity Camp');
    expect(projectRow.slug).toBe('identitycamp');
    expect(projectRow.project_type).toBe('camp');
    expect(projectRow.status).toBe('active');

    // No data sections ran: every one of them is still empty.
    for (const table of DATA_TABLES) {
      expect(count(`SELECT COUNT(*) AS c FROM ${table}`), `${table} rows`).toBe(0);
      expect(baseline[table], `${table} baseline`).toBe(0);
    }
    expectNoOrphanFks();
    expect(deletes()).toEqual([]);
  });
});