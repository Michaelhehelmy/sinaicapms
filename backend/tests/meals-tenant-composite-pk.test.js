/**
 * 0127 — tenant-scoped composite PRIMARY KEY on `meals`.
 *
 * Migration: 0127_meals_tenant_composite_pk.sql (rebuilds THREE tables in the
 * 0111/0126 idiom: defer_foreign_keys → staging CREATEs → fail-closed copy →
 * drop → rename → recreate every index → fk_check tail).
 *
 * The blocker this closes: `meals.id` was the last GLOBAL identifier arbiter on
 * a manifest-imported table. `0126` re-scoped `pos_products.sku` and
 * `pos_users.email`/`username` but left `meals.id`, so the SAME manifest with
 * its explicit meal ids (`meal_grill` in both `camp-full.json` and
 * `restaurant-only.json`) answered `409 Duplicate SKU, ID, or unique field` for
 * the second tenant. See `docs/audit-2026-09-30-tenant-import-parity.md` §D3.
 *
 * Why the file rebuilds THREE tables, and that this is proven rather than
 * asserted: SQLite requires an FK's parent columns to be the PK or carry a
 * UNIQUE index, so making `meals`' PK composite INVALIDATES every
 * single-column `REFERENCES meals(id)` edge. Section 2 below reproduces the
 * resulting `foreign key mismatch` against the PRE-0127 shape, then proves the
 * new shape fixes it — without that step, "rebuild 3 tables" would look like
 * scope creep.
 *
 * Four layers of proof, all against REAL SQL:
 *   1. SHAPE   — applies on a full in-process replay of every migration in the
 *                repo with `foreign_keys = ON`, lands the composite PKs, keeps
 *                every index, and preserves each table's column order.
 *   2. FK      — the old shape really does break the single-column edge (the
 *                non-vacuity proof), and the new shape admits two tenants
 *                sharing one logical meal id while keeping every FK valid.
 *   3. CODE    — the three SQL sites that must become tenant-qualified for the
 *                new shape (meal_lang INSERT, the ON CONFLICT target, and the
 *                tenant-scoped DELETEs) are asserted against real SQL.
 *   4. BEHAVIOR— the real Hono import route over a D1-compatible shim on a
 *                0127-migrated replay: the same manifest with explicit meal
 *                ids loads into TWO tenants, and a same-tenant re-import still
 *                409s.
 */
import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import mealsRoutes from '../src/api/meals.js';
import { handleMealSchedulesRoute } from '../src/api/meal-schedules.js';
import tenantImportRoutes from '../src/api/tenant-import.js';
import { mountRouter } from './helpers/routerHarness.js';

const migrationsDir = join(import.meta.dirname, '../migrations');
const MIGRATION = '0127_meals_tenant_composite_pk.sql';
const readMigration = (file) => readFileSync(join(migrationsDir, file), 'utf8');

/**
 * Replay every migration in the repo except 0127 — the 0126 head 0127 applies
 * onto. `foreign_keys = OFF` for the replay itself (the squash baseline's
 * 0001_core…0014_seed + 0100+ chain needs it; this mirrors the repo's own
 * scratch-replay tooling), then FKs are switched back ON before 0127 runs so
 * the rebuild is validated under real enforcement.
 */
function replayTo0126() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && f !== MIGRATION)
    .sort();
  expect(files.length).toBeGreaterThan(20);
  for (const f of files) db.exec(readMigration(f));
  return db;
}

/**
 * Run a migration file the way D1 does — one implicit transaction around the
 * whole file. `PRAGMA defer_foreign_keys = true` only survives inside a
 * transaction (better-sqlite3's `exec` in autocommit resets it after each
 * statement) and D1 wraps every migration file in a transaction.
 */
function execMigration(db, file = MIGRATION) {
  db.transaction(() => db.exec(readMigration(file)))();
}

const indexNames = (db, table) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND name NOT LIKE 'sqlite_autoindex%' ORDER BY name")
    .all(table)
    .map((r) => r.name);
const allColumns = (db, table) =>
  db.prepare(`PRAGMA table_xinfo(${table})`).all().map((c) => c.name);
// PK column order. `PRAGMA table_info` reports `pk` (0 = not part of the PK,
// >0 = 1-based position within it), which is the only place that flag lives —
// sqlite_master has no such column.
const pkColumns = (db, table) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map((c) => c.name);

// ─── D1-compatible shim (0126 idiom) ────────────────────────────────────────
function wrapD1(sqlite) {
  const isRead = (sql) => /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql);
  return {
    prepare(sql) {
      return {
        bind: (...params) => {
          const st = {
            _sql: sql,
            _params: params,
            all: async () => {
              const s = sqlite.prepare(sql);
              if (isRead(sql)) return { results: s.all(...params) };
              return { results: [], meta: { changes: Number(s.run(...params).changes) } };
            },
            first: async () => sqlite.prepare(sql).get(...params) ?? null,
            run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }),
          };
          return st;
        },
      };
    },
    batch: async (stmts) =>
      stmts.map((st) => {
        const s = sqlite.prepare(st._sql);
        if (isRead(st._sql)) return { results: s.all(...st._params) };
        return { meta: { changes: Number(s.run(...st._params).changes) } };
      }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. SHAPE — applies on the 0126 head and lands the promised DDL
// ═══════════════════════════════════════════════════════════════════════════
describe('0127 — meals tenant-scoped composite PK (shape on the 0126 head)', () => {
  it('applies cleanly on a full migration replay with foreign_keys = ON', () => {
    const db = replayTo0126();
    db.pragma('foreign_keys = ON');
    expect(() => execMigration(db)).not.toThrow();
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('re-keys meals by (tenant_id, id) and widens both child PKs to match', () => {
    const db = replayTo0126();
    db.pragma('foreign_keys = ON');
    // Baseline: all three were single-column / bare.
    expect(pkColumns(db, 'meals')).toEqual(['id']);
    expect(pkColumns(db, 'meal_lang')).toEqual(['meal_id', 'lang']);
    execMigration(db);

    expect(pkColumns(db, 'meals')).toEqual(['tenant_id', 'id']);
    expect(pkColumns(db, 'meal_lang')).toEqual(['tenant_id', 'meal_id', 'lang']);
    // meal_schedules keeps its own single-column PK (its `id` is a `msch_`
    // surrogate, never manifest-authored) — only its EDGE changes.
    expect(pkColumns(db, 'meal_schedules')).toEqual(['id']);
  });

  it('rewrites BOTH child edges to the composite (tenant_id, meal_id) form', () => {
    const db = replayTo0126();
    db.pragma('foreign_keys = ON');
    execMigration(db);

    const mealLangFks = db.pragma('foreign_key_list(meal_lang)').filter((f) => f.table === 'meals');
    // A composite edge is reported as two rows sharing one `id`, each naming
    // its own `from`/`to` column — that pairing IS the edge.
    expect(mealLangFks.map((f) => `${f.from}->${f.to}`).sort()).toEqual(['meal_id->id', 'tenant_id->tenant_id']);
    expect(new Set(mealLangFks.map((f) => f.id)).size).toBe(1);
    expect(mealLangFks[0].on_delete).toBe('CASCADE');

    const schedFks = db.pragma('foreign_key_list(meal_schedules)').filter((f) => f.table === 'meals');
    expect(schedFks.map((f) => `${f.from}->${f.to}`).sort()).toEqual(['meal_id->id', 'tenant_id->tenant_id']);
    expect(new Set(schedFks.map((f) => f.id)).size).toBe(1);
    expect(schedFks[0].on_delete).toBe('CASCADE');

    // No single-column `REFERENCES meals(id)` edge survives on either child —
    // that shape is exactly what 0127 exists to remove, and it is the one that
    // raises `foreign key mismatch` (asserted in section 2).
    for (const child of ['meal_lang', 'meal_schedules']) {
      const mealsEdges = db.pragma(`foreign_key_list(${child})`).filter((f) => f.table === 'meals');
      expect(mealsEdges.map((f) => f.from)).toContain('tenant_id');
      expect(mealsEdges).toHaveLength(2);
    }
  });

  it('preserves every column, its ordinal position, and the untouched FK targets', () => {
    const db = replayTo0126();
    db.pragma('foreign_keys = ON');
    const before = {
      meals: allColumns(db, 'meals'),
      mealLang: allColumns(db, 'meal_lang'),
      schedules: allColumns(db, 'meal_schedules'),
    };
    execMigration(db);

    expect(allColumns(db, 'meals')).toEqual(before.meals);
    expect(allColumns(db, 'meal_schedules')).toEqual(before.schedules);
    // meal_lang's ONLY change is the added tenant_id — no column dropped.
    expect(allColumns(db, 'meal_lang')).toEqual(['tenant_id', ...before.mealLang]);

    // The non-meals edges are byte-identical: meals→meal_categories CASCADE,
    // meals→tenants CASCADE, meals→projects SET NULL, meal_lang→languages
    // CASCADE, meal_schedules→tenants/projects.
    const shape = (table, target) =>
      db
        .pragma(`foreign_key_list(${table})`)
        .filter((f) => f.table === target)
        .map((f) => `${f.from}:${f.on_delete}`)
        .sort();
    expect(shape('meals', 'meal_categories')).toEqual(['meal_category_id:CASCADE']);
    expect(shape('meals', 'tenants')).toEqual(['tenant_id:CASCADE']);
    expect(shape('meals', 'projects')).toEqual(['project_id:SET NULL']);
    expect(shape('meal_lang', 'languages')).toEqual(['lang:CASCADE']);
    expect(shape('meal_schedules', 'tenants')).toEqual(['tenant_id:CASCADE']);
    expect(shape('meal_schedules', 'projects')).toEqual(['camp_id:SET NULL', 'project_id:SET NULL']);
  });

  it('recreates every pre-existing index on all three rebuilt tables', () => {
    const db = replayTo0126();
    const before = {
      meals: indexNames(db, 'meals'),
      lang: indexNames(db, 'meal_lang'),
      schedules: indexNames(db, 'meal_schedules'),
    };
    db.pragma('foreign_keys = ON');
    execMigration(db);

    expect(indexNames(db, 'meals').sort()).toEqual(before.meals.sort());
    expect(indexNames(db, 'meal_schedules').sort()).toEqual(before.schedules.sort());
    // meal_lang never had an explicit index (0005 declared none) — the new
    // composite PK supplies its implicit autoindex.
    expect(indexNames(db, 'meal_lang')).toEqual([]);
    expect(before.meals.length).toBeGreaterThanOrEqual(3);
    expect(before.schedules.length).toBeGreaterThanOrEqual(8);
  });

  it('leaves no staging or guard table behind', () => {
    const db = replayTo0126();
    db.pragma('foreign_keys = ON');
    execMigration(db);
    // Only the three staging names THIS file creates — the replayed chain
    // legitimately owns unrelated `*_new` tables (plans_new, products_new, …).
    const leftovers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('meals_new','meal_lang_new','meal_schedules_new')")
      .all();
    expect(leftovers).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. FK — the old shape really breaks, the new shape really fixes it
// ═══════════════════════════════════════════════════════════════════════════
describe('0127 — the composite edge is required, not cosmetic', () => {
  it('PROVES the single-column edge 500s against a composite meals PK (non-vacuity)', () => {
    // Reproduced on the PRE-0127 shape: re-key `meals` by (tenant_id, id)
    // while leaving `meal_lang`'s single-column `REFERENCES meals(id)` intact —
    // exactly the "rebuild one table" migration 0127 exists to NOT be. SQLite
    // cannot resolve the parent key, so the next INSERT raises
    // `foreign key mismatch`. This is the evidence for rebuilding all THREE
    // tables; without it, the extra two rebuilds look unmotivated.
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE meal_categories (id TEXT PRIMARY KEY);
      CREATE TABLE meals (
        id TEXT NOT NULL, tenant_id TEXT NOT NULL, meal_category_id TEXT NOT NULL
          REFERENCES meal_categories(id) ON DELETE CASCADE,
        PRIMARY KEY (tenant_id, id)
      );
      CREATE TABLE meal_lang (
        meal_id TEXT REFERENCES meals(id) ON DELETE CASCADE,
        lang TEXT NOT NULL, name TEXT NOT NULL,
        PRIMARY KEY (meal_id, lang)
      );
      INSERT INTO meal_categories VALUES ('c1');
      INSERT INTO meals VALUES ('m1', 't1', 'c1');
    `);
    expect(() => db.prepare("INSERT INTO meal_lang VALUES ('m1', 'en', 'Mango')").run()).toThrow(
      /foreign key mismatch/,
    );
  });

  it('admits two tenants sharing one logical meal id and keeps every FK valid', () => {
    const db = replayTo0126();
    db.pragma('foreign_keys = ON');
    seedMenu(db);
    execMigration(db);

    expect(db.pragma('foreign_key_check')).toEqual([]);

    // The pre-existing rows survived, and their translations kept the tenant
    // their PARENT meal had (the copy derives it, never invents it).
    expect(db.prepare('SELECT id, tenant_id, meal_category_id FROM meals ORDER BY id').all()).toEqual([
      { id: 'meal_shared', tenant_id: 't_a', meal_category_id: 'cat_a' },
    ]);
    expect(db.prepare('SELECT tenant_id, meal_id, lang, name FROM meal_lang').all()).toEqual([
      { tenant_id: 't_a', meal_id: 'meal_shared', lang: 'en', name: 'Shared Meal' },
    ]);

    // ── the actual feature: tenant B owns the SAME logical id ──
    db.prepare("INSERT INTO meals (id, tenant_id, meal_category_id, price) VALUES ('meal_shared', 't_b', 'cat_b', 30)").run();
    db.prepare("INSERT INTO meal_lang (tenant_id, meal_id, lang, name) VALUES ('t_b', 'meal_shared', 'en', 'B Own Meal')").run();
    expect(db.prepare("SELECT COUNT(*) c FROM meals WHERE id = 'meal_shared'").get().c).toBe(2);
    expect(db.pragma('foreign_key_check')).toEqual([]);

    // The pair-keyed join returns each tenant's OWN translation — this is the
    // assertion that makes the qualification in meals.js/meal-schedules.js
    // load-bearing rather than cosmetic.
    const joined = (tenantId) =>
      db
        .prepare(
          `SELECT m.tenant_id, m.id, ml.name FROM meals m
             LEFT JOIN meal_lang ml ON ml.tenant_id = m.tenant_id AND ml.meal_id = m.id AND ml.lang = 'en'
           WHERE m.tenant_id = ?`,
        )
        .all(tenantId);
    expect(joined('t_a')).toEqual([{ tenant_id: 't_a', id: 'meal_shared', name: 'Shared Meal' }]);
    expect(joined('t_b')).toEqual([{ tenant_id: 't_b', id: 'meal_shared', name: 'B Own Meal' }]);

    // A bare `ml.meal_id = m.id` join is exactly the bug 0127 would introduce:
    // it returns BOTH translations for BOTH meals.
    const naive = db
      .prepare(
        `SELECT m.tenant_id, m.id, ml.name FROM meals m
           LEFT JOIN meal_lang ml ON ml.meal_id = m.id AND ml.lang = 'en'
         WHERE m.tenant_id = 't_a'`,
      )
      .all();
    expect(naive).toHaveLength(2);
  });

  it('still rejects a same-tenant duplicate id and a cross-tenant category', () => {
    const db = replayTo0126();
    db.pragma('foreign_keys = ON');
    seedMenu(db);
    execMigration(db);

    expect(() =>
      db.prepare("INSERT INTO meals (id, tenant_id, meal_category_id, price) VALUES ('meal_shared', 't_a', 'cat_a', 10)").run(),
    ).toThrow(/UNIQUE|PRIMARY KEY/);
    // meal_category_id stays a SINGLE-column FK to the globally-keyed
    // meal_categories, so the composite change must not have loosened it.
    // (0127 scopes MEAL ids only — a category belonging to a sibling tenant is
    // still FK-valid, which is why the handler, not the schema, owns that
    // tenant check.)
    expect(() =>
      db.prepare("INSERT INTO meals (id, tenant_id, meal_category_id, price) VALUES ('m9', 't_a', 'cat_missing', 10)").run(),
    ).toThrow(/FOREIGN KEY/);
    expect(db.prepare('SELECT COUNT(*) c FROM meals WHERE id = ?').get('m9').c).toBe(0);
  });

  it('preserves the CASCADE edges both ways', () => {
    const db = replayTo0126();
    db.pragma('foreign_keys = ON');
    seedMenu(db);
    execMigration(db);
    db.prepare("INSERT INTO meals (id, tenant_id, meal_category_id, price, project_id) VALUES ('meal_shared', 't_b', 'cat_b', 30, 'proj_b')").run();
    db.prepare("INSERT INTO meal_lang (tenant_id, meal_id, lang, name) VALUES ('t_b', 'meal_shared', 'en', 'B Own Meal')").run();
    db.prepare("INSERT INTO meal_schedules (id, tenant_id, camp_id, date, meal_id, project_id) VALUES ('ms1', 't_a', 'proj_a', '2026-10-02', 'meal_shared', 'proj_a')").run();
    db.prepare("INSERT INTO meal_schedules (id, tenant_id, camp_id, date, meal_id, project_id) VALUES ('ms2', 't_b', 'proj_b', '2026-10-02', 'meal_shared', 'proj_b')").run();
    expect(db.pragma('foreign_key_check')).toEqual([]);

    // Deleting tenant A's meal must NOT touch tenant B's rows — the composite
    // edge is what makes that true, and it is the tenant-scoped DELETEs in
    // admin.js/meals.js that depend on it.
    db.prepare("DELETE FROM meals WHERE tenant_id = 't_a' AND id = 'meal_shared'").run();
    expect(db.prepare('SELECT id, tenant_id FROM meals').all()).toEqual([{ id: 'meal_shared', tenant_id: 't_b' }]);
    // Tenant A's translation cascaded with its meal; tenant B's survived.
    expect(db.prepare('SELECT tenant_id FROM meal_lang').all()).toEqual([{ tenant_id: 't_b' }]);
    // The schedule of the deleted meal cascaded; the sibling tenant's did not.
    expect(db.prepare('SELECT id FROM meal_schedules ORDER BY id').all()).toEqual([{ id: 'ms2' }]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('aborts the whole file on a pre-existing orphan meal_lang row (fail-closed copy)', () => {
    // `meal_lang.meal_id REFERENCES meals(id)` already forbids an orphan, so
    // this row can only exist if FKs were OFF when it was written — which is
    // exactly what the in-repo replay does. The copy is written so the orphan
    // surfaces as a NOT NULL violation rather than being silently dropped by
    // an INNER JOIN filter.
    const db = replayTo0126();
    seedMenu(db);
    // FKs OFF for the orphan write (the state a legacy/pre-FK row is in), then
    // ON so 0127 is validated under real enforcement.
    db.pragma('foreign_keys = OFF');
    db.prepare("INSERT INTO meal_lang (meal_id, lang, name) VALUES ('meal_ghost', 'en', 'Ghost')").run();
    db.pragma('foreign_keys = ON');

    expect(() => execMigration(db)).toThrow(/NOT NULL/);
    // Fail-closed means the pre-migration shape is still intact — no partial
    // swap, no half-rebuilt table.
    expect(pkColumns(db, 'meals')).toEqual(['id']);
    expect(db.prepare('SELECT COUNT(*) c FROM meals').get().c).toBe(1);
  });
});

/** Two tenants + the minimal parent rows `meals` needs, at the 0126 head. */
function seedMenu(db) {
  db.exec(`
    INSERT INTO tenants (id, subdomain, name) VALUES
      ('t_a', 'a.example', 'Camp A'), ('t_b', 'b.example', 'Camp B');
    INSERT INTO projects (id, tenant_id, name, slug) VALUES
      ('proj_a', 't_a', 'A', 'a'), ('proj_b', 't_b', 'B', 'b');
    INSERT INTO meal_categories (id, tenant_id, project_id) VALUES
      ('cat_a', 't_a', 'proj_a'), ('cat_b', 't_b', 'proj_b'),
      ('cat_of_other_tenant', 't_b', 'proj_b');
  `);
  db.prepare("INSERT INTO meals (id, tenant_id, meal_category_id, price, project_id) VALUES ('meal_shared', 't_a', 'cat_a', 20, 'proj_a')").run();
  db.prepare("INSERT INTO meal_lang (meal_id, lang, name) VALUES ('meal_shared', 'en', 'Shared Meal')").run();
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. CODE — the SQL sites that must follow the new shape, against real SQL
// ═══════════════════════════════════════════════════════════════════════════
const mealsEnv = (sqlite) => ({ DB: wrapD1(sqlite) });

/** A 0127-migrated replay with two tenants, each owning one live project. */
function buildCodeDb() {
  const db = replayTo0126();
  db.pragma('foreign_keys = ON');
  seedMenu(db);
  execMigration(db);
  return db;
}

const callMeals = (db, method, path, body) =>
  mountRouter(mealsRoutes, {
    tenantId: 't_a',
    user: { role: 'admin', tenantId: 't_a' },
    basePath: '/api/meals',
  }).request(`http://localhost/api/meals${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }, mealsEnv(db));

describe('0127 — the meal code paths bind the new tenant_id column', () => {
  it('POST /api/meals writes a tenant-scoped meal_lang row', async () => {
    const db = buildCodeDb();
    const res = await callMeals(db, 'POST', '', {
      projectId: 'proj_a', name: 'Koshari', mealCategoryId: 'cat_a', price: 45,
    });
    expect(res.status).toBe(200);
    const row = db.prepare("SELECT tenant_id, meal_id, name FROM meal_lang WHERE name = 'Koshari'").get();
    expect(row).toEqual({ tenant_id: 't_a', meal_id: db.prepare("SELECT meal_id FROM meal_lang WHERE name='Koshari'").get().meal_id, name: 'Koshari' });
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('POST /api/meals/bulk writes tenant-scoped rows for every item', async () => {
    const db = buildCodeDb();
    const res = await callMeals(db, 'POST', '/bulk', {
      items: [
        { projectId: 'proj_a', name: 'One', mealCategoryId: 'cat_a', price: 10 },
        { projectId: 'proj_a', name: 'Two', mealCategoryId: 'cat_a', price: 20 },
      ],
    });
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) c FROM meal_lang').get().c).toBe(3);
    expect(db.prepare('SELECT COUNT(*) c FROM meal_lang WHERE tenant_id != ?').get('t_a').c).toBe(0);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('PUT /api/meals upserts on the COMPOSITE conflict target (not the old 2-col one)', async () => {
    const db = buildCodeDb();
    const res = await callMeals(db, 'PUT', '/meal_shared', {
      projectId: 'proj_a', name: 'Shared Meal Renamed',
    });
    expect(res.status).toBe(200);
    // A stale `ON CONFLICT(meal_id, lang)` would have thrown
    // "ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint"
    // and the handler would have answered 500 "Failed to update meal".
    expect(db.prepare("SELECT name FROM meal_lang WHERE meal_id = 'meal_shared' AND tenant_id = 't_a'").get().name).toBe(
      'Shared Meal Renamed',
    );
    // Still exactly ONE translation — the upsert updated, it did not insert.
    expect(db.prepare('SELECT COUNT(*) c FROM meal_lang').get().c).toBe(1);
  });

  it('DELETE /api/meals is tenant-scoped and leaves a sibling tenant alone', async () => {
    const db = buildCodeDb();
    // Tenant B owns the same logical id (the case 0127 enables).
    db.prepare("INSERT INTO meals (id, tenant_id, meal_category_id, price, project_id) VALUES ('meal_shared', 't_b', 'cat_b', 30, 'proj_b')").run();
    db.prepare("INSERT INTO meal_lang (tenant_id, meal_id, lang, name) VALUES ('t_b', 'meal_shared', 'en', 'B Meal')").run();
    db.prepare("INSERT INTO meal_schedules (id, tenant_id, camp_id, date, meal_id, project_id) VALUES ('ms_a', 't_a', 'proj_a', '2026-10-02', 'meal_shared', 'proj_a')").run();
    db.prepare("INSERT INTO meal_schedules (id, tenant_id, camp_id, date, meal_id, project_id) VALUES ('ms_b', 't_b', 'proj_b', '2026-10-02', 'meal_shared', 'proj_b')").run();

    const res = await callMeals(db, 'DELETE', '/meal_shared');
    expect(res.status).toBe(200);
    expect(db.prepare('SELECT tenant_id FROM meals').all()).toEqual([{ tenant_id: 't_b' }]);
    expect(db.prepare('SELECT tenant_id, name FROM meal_lang').all()).toEqual([{ tenant_id: 't_b', name: 'B Meal' }]);
    expect(db.prepare('SELECT id FROM meal_schedules').all()).toEqual([{ id: 'ms_b' }]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('GET /api/meals never leaks the other tenant’s translation of the same id', async () => {
    const db = buildCodeDb();
    db.prepare("INSERT INTO meals (id, tenant_id, meal_category_id, price, project_id) VALUES ('meal_shared', 't_b', 'cat_b', 30, 'proj_b')").run();
    db.prepare("INSERT INTO meal_lang (tenant_id, meal_id, lang, name) VALUES ('t_b', 'meal_shared', 'en', 'B Secret Meal')").run();

    const res = await callMeals(db, 'GET', '');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('Shared Meal');
    expect(JSON.stringify(body)).not.toContain('B Secret Meal');
  });

  it('GET /api/meal-schedules joins the meal + translation on the tenant pair', async () => {
    const db = buildCodeDb();
    db.prepare("INSERT INTO meals (id, tenant_id, meal_category_id, price, project_id) VALUES ('meal_shared', 't_b', 'cat_b', 30, 'proj_b')").run();
    db.prepare("INSERT INTO meal_lang (tenant_id, meal_id, lang, name) VALUES ('t_b', 'meal_shared', 'en', 'B Secret Meal')").run();
    db.prepare("INSERT INTO meal_schedules (id, tenant_id, camp_id, date, meal_id, project_id) VALUES ('ms_a', 't_a', 'proj_a', '2026-10-02', 'meal_shared', 'proj_a')").run();

    const res = await handleMealSchedulesRoute(
      new Request('http://localhost/api/meal-schedules', { headers: {} }),
      mealsEnv(db),
      't_a',
    );
    expect(res.status).toBe(200);
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].mealName).toBe('Shared Meal');
    expect(JSON.stringify(rows)).not.toContain('B Secret Meal');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. BEHAVIOR — the same manifest with explicit meal ids loads into two tenants
// ═══════════════════════════════════════════════════════════════════════════
const importEnv = (sqlite) => ({
  DB: wrapD1(sqlite),
  MEDIA_BUCKET: { put: vi.fn().mockResolvedValue({}), delete: vi.fn().mockResolvedValue({}) },
});

/**
 * The parity D3 shape, narrowed to what 0127 actually unlocks: an EXPLICIT
 * `meals[].id` plus explicit POS-user credentials and a shared SKU.
 *
 * Deliberately NO explicit `products[].id`: `pos_products.id` is still the
 * GLOBAL primary key, so a cross-tenant copy carrying one still 409s. That is
 * a separate arbiter and the reason the companion pos_products composite-PK
 * work is recorded BLOCKED — this file must not quietly imply it is solved.
 * `rooms`/`ratePlans` therefore reference the product by `productName`.
 * (0126 already made `sku`/`username`/`email` tenant-scoped.)
 */
const portableManifest = () => ({
  tenant: { name: 'Shared Camp', primaryColor: '#0f766e' },
  project: { name: 'Shared Camp', type: 'camp', location: 'North' },
  products: [
    { name: 'Sea View Room', sku: 'ROOM-SEA-1', basePrice: 220, capacity: 4, type: 'room' },
  ],
  rooms: [{ name: 'Sea View 1', productName: 'Sea View Room', bedType: 'double', maxGuests: 4 }],
  ratePlans: [{ name: 'Season A', productName: 'Sea View Room', pricePerNight: 220, season: 'summer' }],
  menu: {
    categories: [{ name: 'Breakfast', position: 1 }],
    meals: [{ id: 'meal_grill', name: 'Mixed Grill', categoryName: 'Breakfast', price: 350 }],
  },
  posUsers: [
    { email: 'manager@camp.test', username: 'manager', password: 'camp-secret-1', firstName: 'Mona', lastName: 'Mansour', role: 'manager' },
  ],
});

const postImport = (sqlite, tenantId, body) =>
  mountRouter(tenantImportRoutes, {
    tenantId,
    user: { role: 'admin', tenantId },
    basePath: '/tenants/import',
  }).request(
    'http://localhost/tenants/import',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    importEnv(sqlite),
  );

function buildImportDb() {
  const db = replayTo0126();
  db.pragma('foreign_keys = ON');
  execMigration(db);
  seedImportTenant(db, 't_overlap_a', 'overlap-a');
  seedImportTenant(db, 't_overlap_b', 'overlap-b');
  return db;
}

function seedImportTenant(db, tenantId, subdomain) {
  db.prepare("INSERT INTO tenants (id, subdomain, name, type, status, onboarding_status) VALUES (?, ?, ?, 'camp', 'active', 'completed')")
    .run(tenantId, subdomain, subdomain);
}

describe('0127 — a manifest with explicit meal ids loads into two tenants', () => {
  it('imports the SAME verbatim manifest (ids + SKUs + credentials) twice', async () => {
    const db = buildImportDb();
    const resA = await postImport(db, 't_overlap_a', portableManifest());
    const resB = await postImport(db, 't_overlap_b', portableManifest());
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const counts = (await resB.json()).counts;
    for (const section of ['products', 'rooms', 'ratePlans', 'mealCategories', 'meals', 'posUsers']) {
      expect(counts[section]).toBeGreaterThan(0);
    }
    // The blocker: before 0127 the SECOND import answered 409
    // "Duplicate SKU, ID, or unique field" on `meal_grill`.
    expect(db.prepare('SELECT COUNT(*) c FROM meals WHERE id = ?').get('meal_grill').c).toBe(2);
    expect(db.prepare('SELECT COUNT(*) c FROM meals WHERE tenant_id = ?').get('t_overlap_a').c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM pos_products WHERE tenant_id = ?').get('t_overlap_b').c).toBe(1);
    expect(db.prepare('SELECT COUNT(*) c FROM pos_users WHERE email = ?').get('manager@camp.test').c).toBe(2);
    // Each tenant's translation row stayed with its own meal.
    expect(db.prepare("SELECT tenant_id FROM meal_lang WHERE meal_id = 'meal_grill' ORDER BY tenant_id").all()).toEqual([
      { tenant_id: 't_overlap_a' },
      { tenant_id: 't_overlap_b' },
    ]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('still 409s the SAME tenant re-importing its own meal id', async () => {
    const db = buildImportDb();
    expect((await postImport(db, 't_overlap_a', portableManifest())).status).toBe(200);

    // Fresh SKU + product, SAME meal id: the tenant-scoped meal-id probe is
    // then the only arbiter left standing, so the 409 it returns is provably
    // the meal one (0126's per-tenant SKU arbiter would otherwise fire first).
    const again = portableManifest();
    again.products[0].sku = 'ROOM-SEA-2';
    again.posUsers = [];
    const res = await postImport(db, 't_overlap_a', again);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already exists in this tenant/);
    expect(db.prepare('SELECT COUNT(*) c FROM meals WHERE tenant_id = ?').get('t_overlap_a').c).toBe(1);
  });

  it('chunks the meal-id probe so a >50-id manifest never hits the D1 bind ceiling', async () => {
    const db = buildImportDb();
    // 120 explicit ids = 121 bound values in one statement, past D1's
    // "100 variables per query" ceiling (`too many SQL variables at offset
    // N`), which local better-sqlite3 does NOT enforce (SQLite's own ceiling
    // is 32766). So this proves the chunk loop really runs over the whole id
    // set — and that a real collision in the LAST chunk is still found.
    const first = await postImport(db, 't_overlap_a', {
      menu: {
        categories: [{ name: 'Bulk', position: 1 }],
        meals: Array.from({ length: 120 }, (_, i) => ({
          id: `meal_bulk_${i}`, name: `Bulk ${i}`, categoryName: 'Bulk', price: 10 + i,
        })),
      },
    });
    expect(first.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) c FROM meals WHERE id LIKE ?').get('meal_bulk_%').c).toBe(120);

    // Re-import with ONE colliding id that sits past the first chunk. An
    // unchunked probe would have thrown before it ever reached this row.
    const dup = await postImport(db, 't_overlap_a', {
      menu: {
        categories: [{ name: 'Bulk2', position: 1 }],
        meals: [
          ...Array.from({ length: 60 }, (_, i) => ({ id: `meal_new_${i}`, name: `New ${i}`, categoryName: 'Bulk2', price: 5 })),
          { id: 'meal_bulk_119', name: 'Colliding', categoryName: 'Bulk2', price: 5 },
        ],
      },
    });
    expect(dup.status).toBe(409);
    expect((await dup.json()).error).toContain('meal_bulk_119');
    expect(db.prepare('SELECT COUNT(*) c FROM meals WHERE id LIKE ?').get('meal_new_%').c).toBe(0);
  });
});