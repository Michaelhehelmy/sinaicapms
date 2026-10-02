/**
 * Identity-mode saga rollback — POST /api/tenants/import with an `identity`
 * block provisions a tenant SHELL (tenant, admin, POS org + store + mapping,
 * default project) BEFORE it runs the data import. D1 gives the handler no
 * cross-statement transaction, so before this fix any failure inside the data
 * import left that shell behind: a tenant, a working admin login, a POS
 * organization, and a burned subdomain UNIQUE slot the operator can never
 * re-provision (the re-run answers 400 "This subdomain is already taken") — a
 * half-built tenant visible in the super-admin console with no owner.
 *
 * This suite is the spec's REAL gate, not a statement-inspection mock:
 *   - fresh in-memory SQLite built by replaying EVERY migration file in
 *     backend/migrations in order, `foreign_keys = ON` exactly like D1, so the
 *     FK edges that force the rollback ORDER are enforced — the order is not
 *     cosmetic, it is the difference between a clean rollback and a
 *     half-deleted shell;
 *   - the real Hono route behind the production resolveScope + requireAuth
 *     chain, driven as a super-admin (the only role allowed to provision);
 *   - every claim is a real ROW COUNT. Asserting that DELETE statements were
 *     issued would pass just as happily if every one of them had silently
 *     matched zero rows.
 *
 * Four cases, in the order they matter:
 *   1. rollback      — a failure in the LAST data section (pos users), by which
 *                      point tenant, admin, org, store, mapping, project,
 *                      products, rooms, rate plans, meal categories and meals
 *                      are all committed, leaves ZERO rows and reports the
 *                      rolled-back 500.
 *   2. no orphans    — a PRE-WRITE failure deletes nothing (the undo log is
 *                      empty, so the caller's own precise 400 stands) and
 *                      writes nothing.
 *   3. keeps tenant  — the existing-tenant branch NEVER deletes: it reports
 *                      "partial data may remain" instead.
 *   4. success       — the happy path is unchanged and issues no DELETE.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { mountRouterAuthenticated, signAdminToken } from './helpers/routerHarness.js';

const migrationsDir = join(import.meta.dirname, '../migrations');
const SOURCE = readFileSync(join(import.meta.dirname, '../src/api/tenant-import.js'), 'utf8');

const JWT_SECRET = 'test-secret-import-rollback';
const IMPORT_SCOPE_OPTIONS = {
  auth: { roles: ['super_admin', 'admin'], requireTenant: false },
  requireTenantHint: false,
};

const SUPER_ADMIN = {
  sub: 'adm_super_rb',
  userId: 'adm_super_rb',
  email: 'super@rollback.test',
  role: 'super_admin',
  tenantId: null,
};

/** Shell rows the identity provisioning commits before the data import runs. */
const SHELL_TABLES = ['tenants', 'admins', 'projects', 'pos_organizations', 'pos_stores', 'tenant_org_mapping'];
/** Rows the data sections commit for the aborted tenant. */
const DATA_TABLES = [
  'pos_products', 'products', 'rooms_new', 'rate_plans_new',
  'meal_categories', 'meal_categories_lang', 'meals', 'meal_lang', 'pos_users',
];

const ROLLED_BACK_MESSAGE =
  'All partial data has been rolled back. You can retry with a corrected manifest.';

/**
 * Fresh local D1: every migration in lexical order, FK enforcement ON.
 * Files are replayed verbatim via db.exec — no stubbing, no hand-written DDL.
 */
function buildFreshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const f of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(migrationsDir, f), 'utf8'));
  }
  return db;
}

/**
 * D1-compatible adapter over better-sqlite3 (the repo standard idiom) plus an
 * SQL tape: every statement is recorded in execution order, so "was there a
 * DELETE at all?" and "in which order did the rollback run?" are answerable
 * without inspecting the handler.
 *
 * Two fidelity details that matter here:
 *  - statements fail SYNCHRONOUSLY (the throw happens inside the `.run()` call,
 *    not in a promise nobody awaits), otherwise a mid-batch failure would
 *    escape as an unhandled rejection and the request would answer success;
 *  - `batch()` is one real transaction, so it is all-or-nothing exactly like
 *    D1's, and the handler's `meta.changes === 0` guards read true `changes`.
 *
 * `failOn` injects a D1-style runtime failure on the first statement whose SQL
 * contains the fragment — the shape of the late-500 the saga exists for.
 */
function makeD1(db, { failOn = null } = {}) {
  const tape = [];
  const record = (sql) => tape.push(sql.replace(/\s+/g, ' ').trim());
  const fire = (sql, params) => {
    if (failOn && sql.includes(failOn)) {
      throw new Error(`D1_ERROR: injected failure on "${failOn}"`);
    }
    return db.prepare(sql).run(...params);
  };
  return {
    prepare(sql) {
      return {
        bind: (...params) => {
          const stmt = { sql, params };
          return {
            ...stmt,
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
              return { success: true, meta: { changes: fire(sql, params).changes } };
            },
          };
        },
      };
    },
    async batch(statements) {
      return db.transaction(() =>
        statements.map(({ sql, params }) => {
          record(sql);
          return { success: true, meta: { changes: fire(sql, params).changes } };
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
 * A tenant that existed BEFORE the request, with a subdomain that also passes
 * the identity-mode format gate (no dots/underscores) so the "already taken"
 * rejection in T2 is reached instead of the format check, and with a live
 * project so the room/rate-plan INSERT…SELECT guards resolve.
 */
function seedBystanderTenant(db, tenantId, subdomain) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tenants (id, subdomain, name, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`
  ).run(tenantId, subdomain, 'Pre-existing Tenant', now, now);
  db.prepare(
    `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', 'admin', 'Pre', 'Existing', 1, ?, ?)`
  ).run(`adm_${tenantId}`, tenantId, `pre@${tenantId}.test`, now, now);
  db.prepare(
    `INSERT INTO projects (id, tenant_id, name, slug, project_type, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'camp', 'active', ?, ?)`
  ).run('proj_bystander', tenantId, 'Pre-existing Camp', 'pre-existing-camp', now, now);
}

const identityOf = (overrides = {}) => ({
  name: 'Rollback Camp',
  subdomain: 'rollbackcamp',
  type: 'camp',
  email: 'admin@rollbackcamp.test',
  password: 'password123',
  firstName: 'Ali',
  lastName: 'Hassan',
  ...overrides,
});

/** Products → rooms → rate plans → meal categories → meals → POS users. */
const dataSections = {
  tenant: { primaryColor: '#0f766e', currency: 'EGP' },
  products: [{ id: 'prod_rbk_tent', name: 'Beach Tent', sku: 'TENT-RBK-1', basePrice: 1500, capacity: 4, type: 'room' }],
  rooms: [{ id: 'room_rbk_1', name: 'Room 101', productName: 'Beach Tent', maxGuests: 2, basePrice: 1500 }],
  ratePlans: [{ productName: 'Beach Tent', name: 'Summer', pricePerNight: 1500, season: 'summer' }],
  menu: { categories: [{ name: 'Grills' }], meals: [{ name: 'Mixed Grill', categoryName: 'Grills', price: 350 }] },
  posUsers: [{ email: 'cashier@rollbackcamp.test', password: 'password123', firstName: 'Aya', lastName: 'Salem', role: 'cashier' }],
};

describe('tenant-import identity-mode saga rollback (fresh local D1)', () => {
  // No underscore: the id ends up in a seeded admin email, and zod's email
  // check (identity mode) rejects an underscore in the domain — T2 needs that
  // request to reach the uniqueness probe, not the schema.
  const BYSTANDER = 'tenantbystander';
  const BYSTANDER_SUBDOMAIN = 'bystander-camp';

  let db;
  let env;
  let app;
  let superToken;
  let tenantAdminToken;
  /** Row counts before the request — the migration replay seeds its own rows. */
  let baseline;

  const makeEnv = (options = {}) => ({
    DB: makeD1(db, options),
    MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
    JWT_SECRET,
  });

  beforeEach(async () => {
    db = buildFreshDb();
    seedSuperAdmin(db);
    seedBystanderTenant(db, BYSTANDER, BYSTANDER_SUBDOMAIN);
    app = mountRouterAuthenticated(tenantImportRoutes, {
      basePath: '/api/tenants/import',
      scopeOptions: IMPORT_SCOPE_OPTIONS,
    });
    superToken = await signAdminToken(SUPER_ADMIN, JWT_SECRET);
    tenantAdminToken = await signAdminToken(
      { sub: `adm_${BYSTANDER}`, userId: `adm_${BYSTANDER}`, email: `pre@${BYSTANDER}.test`, role: 'admin', tenantId: BYSTANDER },
      JWT_SECRET,
    );
    env = makeEnv();
    baseline = Object.fromEntries(
      [...SHELL_TABLES, ...DATA_TABLES].map((t) => [t, count(`SELECT COUNT(*) AS c FROM ${t}`)]),
    );
  });

  const post = (manifest, token = superToken, tenantHint = false) =>
    app.request(
      'http://localhost/api/tenants/import',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, ...(tenantHint ? { 'x-tenant-id': BYSTANDER } : {}) },
        body: JSON.stringify(manifest),
      },
      env,
    );

  const count = (sql, ...args) => db.prepare(sql).get(...args).c;
  /** Every tracked table must be back at its pre-request row count. */
  const expectBaseline = () => {
    for (const table of [...SHELL_TABLES, ...DATA_TABLES]) {
      expect(count(`SELECT COUNT(*) AS c FROM ${table}`), `${table} rows`).toBe(baseline[table]);
    }
  };
  const deletes = () => env.DB.tape.filter((s) => s.startsWith('DELETE FROM'));
  const at = (table) => deletes().findIndex((s) => s.startsWith(`DELETE FROM ${table} `));

  it('T1 — rolls the whole shell back to zero rows when the data import fails in its last section', async () => {
    // Fails on the FIRST pos_users row — the last section — so every earlier
    // section is already committed. Pre-fix this is the orphan shell: a tenant,
    // a login, a POS org and a burned subdomain plus five tables of real data,
    // none of it owned by anybody.
    env = makeEnv({ failOn: 'INSERT INTO pos_users' });

    const res = await post({ identity: identityOf(), ...dataSections });
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Import failed:');
    expect(body.error).toContain('D1_ERROR'); // the original reason survives
    expect(body.error).toContain(ROLLED_BACK_MESSAGE);

    // ── Back to zero rows for the aborted tenant, table by table ──
    // Every tracked table returns to its PRE-REQUEST row count. For the data
    // tables that baseline is 0, so this is a hard "no orphans" assertion; for
    // tenants/admins the baseline is the seeded rows, and their survival is
    // what proves the delete targeted the aborted tenant and not "everything".
    for (const table of DATA_TABLES) expect(baseline[table], `${table} baseline`).toBe(0);
    expectBaseline();
    // The burned identifiers are free again: the operator's retry cannot hit
    // "This subdomain is already taken" / "An account with this email exists".
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE subdomain = ?', 'rollbackcamp')).toBe(0);
    expect(count('SELECT COUNT(*) AS c FROM admins WHERE email = ?', 'admin@rollbackcamp.test')).toBe(0);

    // ── Reverse order: children before parents ──
    for (const table of ['meals', 'meal_categories', 'rooms_new', 'rate_plans_new', 'pos_products']) {
      expect(at(table), `DELETE FROM ${table}`).toBeGreaterThanOrEqual(0);
    }
    // rooms_new holds a RESTRICT edge on pos_products, so inverting these two
    // deletes fails loudly instead of quietly leaving rooms behind.
    expect(at('rooms_new')).toBeLessThan(at('pos_products'));
    expect(at('rate_plans_new')).toBeLessThan(at('pos_products'));
    // mapping → store → org (pos_stores.organization_id is NO ACTION), then
    // project/admin → tenant (projects NO ACTION, admins SET NULL — neither
    // would clean up on a tenant delete).
    expect(at('tenant_org_mapping')).toBeLessThan(at('pos_organizations'));
    expect(at('pos_stores')).toBeLessThan(at('pos_organizations'));
    expect(at('projects')).toBeLessThan(at('tenants'));
    expect(at('admins')).toBeLessThan(at('tenants'));
    expect(at('tenants')).toBe(deletes().length - 1); // tenant strictly last

    // `pos_users` is the final section, so no handler failure can leave rows
    // behind to exercise that edge — but the undo log must still carry it:
    // pos_users holds NO ACTION FKs on pos_stores/pos_organizations, so the day
    // a section is appended after it, an untracked pos_users row would block
    // both deletes above and leave the org behind forever.
    expect(SOURCE).toContain("track('pos_users')");
  });

  it('T2 — a pre-write failure deletes nothing and writes nothing', async () => {
    // All three rejections land BEFORE the first INSERT (identity schema →
    // subdomain format → subdomain/email uniqueness), so the undo log is empty:
    // no DELETE may run, and the caller gets its own precise 400 back rather
    // than a generic "rolled back" 500.
    const badFormat = await post({ identity: identityOf({ subdomain: 'INVALID SUBDOMAIN!' }), ...dataSections });
    expect(badFormat.status).toBe(400);
    expect((await badFormat.json()).error).toContain('Subdomain must be lowercase');
    expect(deletes()).toEqual([]);

    const takenSubdomain = await post({ identity: identityOf({ subdomain: BYSTANDER_SUBDOMAIN }), ...dataSections });
    expect(takenSubdomain.status).toBe(400);
    expect((await takenSubdomain.json()).error).toContain('already taken');
    expect(deletes()).toEqual([]);

    const takenEmail = await post({ identity: identityOf({ email: `pre@${BYSTANDER}.test` }), ...dataSections });
    expect(takenEmail.status).toBe(400);
    expect((await takenEmail.json()).error).toContain('already exists');
    expect(deletes()).toEqual([]);

    // No orphans: every tracked table is exactly where it started, and the only
    // tenant/admin rows left are the ones seeded before the request.
    expectBaseline();
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE id = ?', BYSTANDER)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM admins WHERE id = ?', `adm_${BYSTANDER}`)).toBe(1);
  });

  it('T3 — the existing-tenant branch never deletes: it reports partial data instead', async () => {
    // Same late failure, existing-tenant mode, on the FIRST meal_lang row: the
    // meals batch has no local try/catch (unlike products / pos users), so the
    // D1 error THROWS out of runImport — the only shape that reaches the
    // route-level catch this test pins. The rows already committed belong to a
    // tenant that predates the request, so there is no undo log to replay:
    // deleting them would destroy live data the manifest merely touched. The
    // honest contract is "partial data may remain, re-run or clean up".
    env = makeEnv({ failOn: 'INSERT INTO meal_lang' });

    const res = await post({ ...dataSections }, tenantAdminToken, true);
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toContain('Import failed:');
    expect(body.error).toContain('Partial data may remain in the tenant.');
    expect(body.error).toContain('Re-run with the same manifest to retry, or clean up manually.');
    expect(body.error).not.toContain(ROLLED_BACK_MESSAGE);
    expect(deletes()).toEqual([]);

    // The tenant, its admin and every section committed before the failure survive.
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE id = ?', BYSTANDER)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM admins WHERE id = ?', `adm_${BYSTANDER}`)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM pos_products WHERE tenant_id = ?', BYSTANDER)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM rooms_new WHERE tenant_id = ?', BYSTANDER)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM rate_plans_new WHERE tenant_id = ?', BYSTANDER)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM meal_categories WHERE tenant_id = ?', BYSTANDER)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM meals')).toBe(0); // batch rolled back
    expect(count('SELECT COUNT(*) AS c FROM pos_users')).toBe(0); // never reached
  });

  it('T4 — the success path is unchanged and issues no DELETE', async () => {
    const res = await post({ identity: identityOf(), ...dataSections });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.created.tenantId).toMatch(/^tenant_/);
    expect(body.created.adminId).toMatch(/^adm_/);
    expect(body.created.organizationId).toBeTruthy();
    expect(body.counts).toEqual({
      products: 1, rooms: 1, ratePlans: 1, mealCategories: 1, meals: 1, posUsers: 1,
    });
    expect(deletes()).toEqual([]);

    // Shell intact: tenant, admin, org, store, mapping and default project.
    const tenantId = body.created.tenantId;
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE id = ?', tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM admins WHERE id = ?', body.created.adminId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM tenant_org_mapping WHERE tenant_id = ?', tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM pos_stores WHERE organization_id = ?', body.created.organizationId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM projects WHERE tenant_id = ?', tenantId)).toBe(1);
    // Data sections intact.
    expect(count('SELECT COUNT(*) AS c FROM pos_products WHERE tenant_id = ?', tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM rooms_new WHERE tenant_id = ?', tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM rate_plans_new WHERE tenant_id = ?', tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM meal_categories WHERE tenant_id = ?', tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM meals WHERE tenant_id = ?', tenantId)).toBe(1);
    expect(count('SELECT COUNT(*) AS c FROM pos_users WHERE tenant_id = ?', tenantId)).toBe(1);
    // The bystander tenant is untouched.
    expect(count('SELECT COUNT(*) AS c FROM tenants WHERE id = ?', BYSTANDER)).toBe(1);
  });
});