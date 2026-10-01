/**
 * DEFECT-1 — tenant-import writes every project_id-bearing row with the
 * resolved project instead of leaving project_id NULL.
 *
 * Before the fix, POST /api/tenants/import inserted pos_products,
 * rooms_new, rate_plans_new, meal_categories, meals and pos_users WITHOUT
 * the project_id column, so every imported row landed with
 * project_id IS NULL even though the manifest's `project` block had just
 * created/updated the tenant's project (DEFECT-3). Those NULLs then poison
 * every project-scoped read (order_items stamping, storefront checkout,
 * kitchen status, admin project filters all join/filter on project_id).
 *
 * This suite is the spec's REAL gate — not a statement-inspection mock:
 *   - fresh in-memory SQLite built by replaying EVERY migration file in
 *     backend/migrations (0001_core … 0124_guest_folios) in order, so the
 *     real post-0111/0112/0115/0123 column lists (project_id present) apply;
 *   - real POST /api/tenants/import through the production router + auth
 *     chain against docs/examples/manifests/camp-full.json (the bilingual
 *     full manifest);
 *   - `SELECT COUNT(*) … WHERE project_id IS NULL` == 0 on every table the
 *     import writes, and a positive row count for each so the zero can't be
 *     satisfied by "nothing was imported".
 *
 * The D1 wrapper is the repo's standard thin better-sqlite3 adapter (same
 * idiom as price-overrides.test.js) — batch runs in a real transaction so
 * the `changes === 0` room/rate-plan 404 guards behave like D1.
 *
 * SCHEMA NOTE: migrations 0107 made project_id NOT NULL on pos_products /
 * rooms_new / rate_plans_new / meal_categories / meals (0108 then guarded it);
 * 0111 rebuilt all five back to NULLABLE because `ON DELETE SET NULL` and
 * `NOT NULL` contradict. At the current head (0124) every project_id column is
 * nullable, so the graceful NULL degradation below is legal. On a DB stranded
 * at 0107–0110 (the state the local dev D1 was in) the same NULL bind would
 * raise NOT NULL instead — which is that schema's intended fail-closed
 * behaviour, not a regression.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'node:path';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { mountRouterAuthenticated, signAdminToken } from './helpers/routerHarness.js';

const migrationsDir = join(import.meta.dirname, '../migrations');
const MANIFEST_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'docs',
  'examples',
  'manifests',
  'camp-full.json',
);

const JWT_SECRET = 'test-secret-import-project-id';
const IMPORT_SCOPE_OPTIONS = {
  auth: { roles: ['super_admin', 'admin'], requireTenant: false },
  requireTenantHint: false,
};

/** Tables the import writes that carry a nullable `project_id` FK column. */
const PROJECT_SCOPED_TABLES = [
  'pos_products',
  'rooms_new',
  'rate_plans_new',
  'meal_categories',
  'meals',
  'pos_users',
];

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

/**
 * Fresh local D1: every migration in lexical order, FK enforcement ON (the
 * guards the import relies on are FK-backed). Migration files are replayed
 * verbatim via db.exec — no stubbing, no hand-written DDL.
 */
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

/** Seed the minimum tenant the real-auth chain + import handler need. */
function seedTenant(db, tenantId) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO tenants (id, subdomain, name, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`
  ).run(tenantId, `${tenantId}.test`, 'Import Project Gate', now, now);
  db.prepare(
    `INSERT INTO admins (id, tenant_id, email, password_hash, role, first_name, last_name, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 'x', 'admin', 'Gate', 'Admin', 1, ?, ?)`
  ).run(`adm_${tenantId}`, tenantId, `gate@${tenantId}.test`, now, now);
}

describe('DEFECT-1: tenant-import binds project_id (fresh local D1)', () => {
  let db;
  let d1;
  let env;
  let app;
  let adminToken;
  const tenantId = 'tenant_p1';

  beforeEach(async () => {
    db = buildFreshDb();
    seedTenant(db, tenantId);
    d1 = makeD1(db);
    env = {
      DB: d1,
      MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
      JWT_SECRET,
    };
    app = mountRouterAuthenticated(tenantImportRoutes, {
      basePath: '/api/tenants/import',
      scopeOptions: IMPORT_SCOPE_OPTIONS,
    });
    adminToken = await signAdminToken(
      { sub: `adm_${tenantId}`, userId: `adm_${tenantId}`, email: `gate@${tenantId}.test`, role: 'admin', tenantId },
      JWT_SECRET,
    );
  });

  const post = (manifest) =>
    app.request(
      'http://localhost/api/tenants/import',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'x-tenant-id': tenantId },
        body: JSON.stringify(manifest),
      },
      env,
    );

  const count = (sql, ...args) => db.prepare(sql).get(...args);

  /**
   * camp-full.json as an EXISTING-TENANT import against this fresh tenant.
   *
   * Two documented edits, both about tenant-local placeholders the manifest's
   * own `_note` calls out — neither touches project_id:
   *  1. `identity` dropped: that block selects the route's super-admin
   *     *creation* mode (provisions a brand-new tenant), not the
   *     existing-tenant import under test.
   *  2. `campId` / `categoryId` / `storeId` placeholders dropped: the `_note`
   *     says they "must match the target tenant (or be omitted)". They carry
   *     another tenant's ids, and FK enforcement ON (as in D1) turns the
   *     stale `campId` into a rooms/rate-plan FOREIGN KEY failure — the
   *     handler's documented `campId` → sole-project fallback then applies.
   *  3. The `mealCategoryId` on meal_juice dropped for the same reason: it
   *     names a category that does not exist here, and `meals.meal_category_id`
   *     is NOT NULL. Rewritten to `categoryName` so the meal still resolves to
   *     a real category and the meal table stays covered.
   */
  const loadManifest = ({ dropProject = false } = {}) => {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    delete manifest.identity;
    for (const p of manifest.products) {
      delete p.campId;
      delete p.categoryId;
    }
    for (const u of manifest.posUsers) delete u.storeId;
    for (const m of manifest.menu.meals) {
      if (!m.mealCategoryId) continue;
      m.categoryName = 'Drinks / مشروبات';
      delete m.mealCategoryId;
    }
    if (dropProject) delete manifest.project;
    return manifest;
  };

  it('imports camp-full.json into the fresh schema and reports counts', async () => {
    const manifest = loadManifest();
    const res = await post(manifest);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // jsonResponse camelCases the snake_case internal count keys.
    expect(data.counts.products).toBe(manifest.products.length);
    expect(data.counts.rooms).toBe(manifest.rooms.length);
    expect(data.counts.ratePlans).toBe(manifest.ratePlans.length);
    expect(data.counts.mealCategories).toBe(manifest.menu.categories.length);
    expect(data.counts.meals).toBe(manifest.menu.meals.length);
    expect(data.counts.posUsers).toBe(manifest.posUsers.length);
  });

  it('leaves ZERO NULL project_id rows in pos_products + every menu table', async () => {
    expect((await post(loadManifest())).status).toBe(200);

    // Row count > 0 per table first — otherwise a 0-NULL count would pass
    // vacuously because nothing was imported.
    for (const table of PROJECT_SCOPED_TABLES) {
      const total = count(`SELECT COUNT(*) AS c FROM ${table}`).c;
      expect(total, `${table} should have imported rows`).toBeGreaterThan(0);
    }

    for (const table of PROJECT_SCOPED_TABLES) {
      const nulls = count(`SELECT COUNT(*) AS c FROM ${table} WHERE project_id IS NULL`).c;
      expect(nulls, `${table}.project_id NULL count`).toBe(0);
    }
  });

  it('binds the manifest project block id on every written row', async () => {
    const manifest = loadManifest();
    expect((await post(manifest)).status).toBe(200);

    // DEFECT-3 wrote/updated exactly one project for this tenant.
    const project = db
      .prepare('SELECT id, name FROM projects WHERE tenant_id = ? AND deleted_at IS NULL')
      .get(tenantId);
    expect(project).toBeTruthy();
    expect(project.name).toBe(manifest.project.name);

    // Distinct project_id per table must be exactly {project.id} — not some
    // other project, and not a mixed bag.
    for (const table of PROJECT_SCOPED_TABLES) {
      const rows = db
        .prepare(`SELECT DISTINCT project_id AS pid FROM ${table} WHERE project_id IS NOT NULL`)
        .all();
      expect(rows.map((r) => r.pid), `${table} distinct project_id`).toEqual([project.id]);
    }
  });

  it('falls back to the tenant default project when the manifest has NO project block', async () => {
    // Pre-existing sole live project; manifest omits `project`.
    db.prepare(
      `INSERT INTO projects (id, tenant_id, name, slug, project_type, status, created_at, updated_at)
       VALUES ('camp_existing', ?, 'Existing Camp', 'existing-camp', 'camp', 'active', datetime('now'), datetime('now'))`
    ).run(tenantId);

    expect((await post(loadManifest({ dropProject: true }))).status).toBe(200);

    // No new project forked by the project-less import.
    const projects = db
      .prepare('SELECT COUNT(*) AS c FROM projects WHERE tenant_id = ? AND deleted_at IS NULL')
      .get(tenantId).c;
    expect(projects).toBe(1);

    for (const table of PROJECT_SCOPED_TABLES) {
      const nulls = count(`SELECT COUNT(*) AS c FROM ${table} WHERE project_id IS NULL`).c;
      expect(nulls, `${table}.project_id NULL count (default fallback)`).toBe(0);
      const pids = db.prepare(`SELECT DISTINCT project_id AS pid FROM ${table}`).all();
      expect(pids.map((r) => r.pid), `${table} project_id`).toEqual(['camp_existing']);
    }
  });

  it('binds NULL (never throws) when the tenant has no resolvable project', async () => {
    // No project block, and TWO live projects → defaultCampId is null by the
    // ambiguous-tenant rule. Import must still succeed with NULL project_id.
    for (const [id, slug] of [['camp_a', 'camp-a'], ['camp_b', 'camp-b']]) {
      db.prepare(
        `INSERT INTO projects (id, tenant_id, name, slug, project_type, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'camp', 'active', datetime('now'), datetime('now'))`
      ).run(id, tenantId, slug, slug);
    }

    const res = await post(loadManifest({ dropProject: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const products = count('SELECT COUNT(*) AS c FROM pos_products').c;
    expect(products).toBeGreaterThan(0);
    // Graceful degradation: rows exist, project_id is NULL, no 500.
    expect(count('SELECT COUNT(*) AS c FROM pos_products WHERE project_id IS NULL').c).toBe(products);
  });

  it('every project_id-bearing INSERT in the handler names the column', () => {
    // Guards against a future project_id-bearing table being added without
    // the bind (the DEFECT-1 class of bug).
    const src = readFileSync(join(import.meta.dirname, '..', 'src', 'api', 'tenant-import.js'), 'utf8');
    const insertBlocks = src.split('INSERT ').slice(1);
    const scoped = new Set(PROJECT_SCOPED_TABLES);
    for (const block of insertBlocks) {
      const table = block.match(/INTO\s+([a-z_]+)/)?.[1];
      if (!table || !scoped.has(table)) continue;
      const columnList = block.slice(0, block.indexOf(')'));
      expect(columnList, `${table} INSERT must name project_id`).toContain('project_id');
    }
  });
});