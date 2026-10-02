-- Migration 0127: tenant-scoped composite PRIMARY KEY on `meals`.
-- (parity finding D3, `meals` half — WRITE-ONLY, NOT applied.)
--
-- ⚠️ PENDING-APPLY. This file is committed but NOT applied to any database.
-- Owner command (never run by an agent):
--     cd backend && npx wrangler d1 migrations apply campmaster-db --remote
-- (add `--local` to rehearse against a throwaway local D1 first; the repo's own
-- `replayTo0126` harness in `backend/tests/meals-tenant-composite-pk.test.js`
-- replays the whole chain in-process and is the cheaper rehearsal).
-- Apply it BEFORE deploying any code that depends on the new shape.
--
-- WHAT: rebuilds THREE tables so `meals` is keyed by (tenant_id, id) instead
-- of by a GLOBAL `id`:
--   meals           `id TEXT PRIMARY KEY`
--                → `id TEXT NOT NULL` + `PRIMARY KEY (tenant_id, id)`
--   meal_lang       `meal_id TEXT REFERENCES meals(id)`
--                → `meal_id TEXT NOT NULL` + `tenant_id TEXT NOT NULL`
--                  + `PRIMARY KEY (tenant_id, meal_id, lang)`
--                  + `FOREIGN KEY (tenant_id, meal_id) REFERENCES meals(tenant_id, id)`
--   meal_schedules  `meal_id TEXT NOT NULL` + `FOREIGN KEY (meal_id) REFERENCES meals(id)`
--                → same column, but the edge becomes
--                  `FOREIGN KEY (tenant_id, meal_id) REFERENCES meals(tenant_id, id)`
-- No column is added to or removed from any of the three beyond the two new
-- `tenant_id` columns on meal_lang; every other column keeps its name, type,
-- NOT NULL, DEFAULT, CHECK, FK target/action and ORDINAL POSITION.
--
-- WHY (the blocker this closes): `meals.id` was the last GLOBAL identifier
-- arbiter on a manifest-imported table. `0126` re-scoped `pos_products.sku`
-- and `pos_users.email`/`username`, but left it because "a PK cannot be
-- re-scoped without rewriting every `meal_lang`/`meal_schedules` reference".
-- That is precisely what this file does. Consequence before the fix: a
-- verbatim export→import copy of a manifest carrying explicit meal ids
-- (`docs/examples/manifests/camp-full.json` ships `meal_grill`, and
-- `restaurant-only.json` ships the same id) answers
-- `409 Duplicate SKU, ID, or unique field` for the SECOND tenant — measured
-- live by `docs/audit-2026-09-30-tenant-import-parity.md` §D3 and again by
-- `docs/audit-2026-10-02-tenant-import-edge-cases.md` §3.1. After it, two
-- tenants may each own a meal with the same logical id.
--
-- ⚠️ WHY meal_lang AND meal_schedules ARE IN THE SAME FILE (not optional):
-- SQLite requires an FK's parent columns to be the PRIMARY KEY or to carry a
-- UNIQUE index. Making `meals`' PK composite therefore INVALIDATES every
-- single-column `REFERENCES meals(id)` edge — the schema starts answering
-- `foreign key mismatch - "meal_lang" referencing "meals"` on the next
-- INSERT (verified against SQLite 3.45 locally, and reproduced in
-- `backend/tests/meals-tenant-composite-pk.test.js` §2 which asserts the
-- mismatch on the OLD shape before proving the new shape fixes it). So this
-- is NOT "rebuild one table"; it is one atomic 3-table swap. Leaving
-- meal_lang/meal_schedules behind would ship a database that 500s on every
-- meal insert.
--
-- TENANT-SCOPE MECHANICS: `meals.tenant_id` is `NOT NULL` (0111), so every
-- copied row carries a real tenant and the composite PK admits no NULL
-- tenant. `meal_lang.tenant_id` is NEW and is backfilled from the parent
-- meal in the copy below (`JOIN meals`), never invented — a meal_lang row
-- whose meal_id matches no meal is a pre-existing FK violation that the
-- INNER JOIN would silently drop, so the copy is written to fail closed on
-- it instead (see the COPY note).
--
-- Rebuild idiom (precedent 0106/0107/0111/0112/0126, replicated verbatim):
-- `PRAGMA defer_foreign_keys = true` → CREATE real (non-TEMP — D1 blocks temp)
-- staging tables → copy-ALL → drop-ALL-olds → rename-ALL → guard RESTORE →
-- recreate ALL indexes → `PRAGMA defer_foreign_keys = false` +
-- `PRAGMA foreign_key_check`. Never `foreign_keys=OFF` (skill).
--
-- FK-ACTION SEMANTICS under D1 (enforcement ≡ PRAGMA foreign_keys=ON; same
-- verification as 0111/0112/0126, SQLite 3.45.1):
-- Inbound edges on `meals` are exactly two — `meal_lang.meal_id` (CASCADE)
-- and `meal_schedules.meal_id` (CASCADE) — both REBUILT here, so nothing
-- outside this file can be wiped by the old-parent DROP. `meal_categories`
-- is the PARENT of meals (CASCADE, not rebuilt — its target is unchanged),
-- and `tenants`/`projects` are parents too (CASCADE / SET NULL, not rebuilt).
--   - CASCADE: the DROP's implicit DELETE fires IMMEDIATELY by table NAME
--     (never deferred). Both referrers are rebuilt, so their rows live in
--     staging and the drop cannot reach them — this is the 0107 CASCADE-FIX.
--   - The copies below populate every key before COMMIT, so the trailing
--     `PRAGMA foreign_key_check` validates against the repopulated finals.
--
-- GUARDS: none required, and that is a PROVEN claim rather than an omission —
-- `PRAGMA foreign_key_list` over the full replayed chain returns exactly two
-- tables with an edge into `meals` (meal_lang, meal_schedules) and BOTH are
-- rebuilt in this file. There is no non-rebuilt CASCADE/SET NULL dependent to
-- guard-save. The guard tables `0108`'s `_0108_project_guard` and any
-- `_guard*` leftovers are unrelated and untouched.
--
-- INDEX RECREATION: the DROPs destroy every index, so ALL pre-existing
-- indexes on all three tables are recreated (3 on meals, 8 on
-- meal_schedules, and meal_lang's single implicit PRIMARY KEY autoindex which
-- the new composite PK recreates automatically), all IF NOT EXISTS so both
-- environments converge without error. `idx_meal_schedules_meal` stays a
-- single-column index on purpose — `meal_schedules.meal_id` is still the
-- column every schedule lookup filters on, and the composite FK does not
-- change that.
--
-- COMPATIBILITY NOTE FOR THE CODE THAT FOLLOWS THIS MIGRATION: every
-- `INSERT INTO meal_lang` must now bind `tenant_id`, and every
-- `meal_lang`/`meals` JOIN must now also match on `tenant_id` (a bare
-- `ml.meal_id = m.id` becomes ambiguous the moment two tenants own the same
-- logical meal id — that ambiguity IS the feature, so the join MUST be
-- tenant-qualified or the feature returns cross-tenant meal names).
-- `backend/src/api/meals.js`, `backend/src/api/meal-schedules.js`,
-- `backend/src/api/tenant-import.js` and `backend/src/api/admin.js` carry
-- those edits; do not deploy them ahead of this migration.
--
-- ROLLBACK SAFETY (hard rule 7): table rebuilds are forward-only — there is
-- no down-migration. Rollback = restore-from-backup ("locker") procedure,
-- stated in the apply commit body. Do NOT attempt DROP/rename reversals once
-- writes land on the rebuilt tables.
--
-- No KV writes (free-plan 1,000 writes/day quota).

PRAGMA defer_foreign_keys = true;

-- ══════════════════════════════════════════════════════════════
-- PHASE A: create-ALL staging tables (0111/0126 idiom).
--
-- Rebuilt-to-rebuilt FK edges point at STAGING parent names (`meals_new`) so
-- DROP-ing the old parent cannot resolve to — and wipe — the freshly copied
-- staging children; SQLite rewrites those references to the final names on
-- RENAME. All other FK targets and actions are preserved verbatim.
-- ══════════════════════════════════════════════════════════════

-- A1. meals (rebuild parent — composite PK is the whole point; column order
-- preserved exactly so any positional reader keeps working, which means
-- `id` stays FIRST and the PK becomes a table-level constraint after it)
CREATE TABLE meals_new (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meal_category_id TEXT NOT NULL REFERENCES meal_categories(id) ON DELETE CASCADE,
  price REAL NOT NULL DEFAULT 0,
  image_url TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  PRIMARY KEY (tenant_id, id)
);

-- A2. meal_lang (child of meals_new staging — CASCADE unchanged; gains
-- `tenant_id` because the FK it carries is now COMPOSITE and SQLite has no
-- way to express a two-column edge from a one-column child. `lang` keeps its
-- languages(code) CASCADE.)
CREATE TABLE meal_lang_new (
  tenant_id TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  lang TEXT NOT NULL REFERENCES languages(code) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (tenant_id, meal_id, lang),
  FOREIGN KEY (tenant_id, meal_id) REFERENCES meals_new(tenant_id, id) ON DELETE CASCADE
);

-- A3. meal_schedules (child of meals_new staging — CASCADE unchanged; it
-- already carried tenant_id NOT NULL, so its only change is the edge shape.
-- The 0111 column order is preserved: id, tenant_id, camp_id, date, meal_id,
-- package_type, max_servings, created_at, project_id.)
CREATE TABLE meal_schedules_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  camp_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'all',
  max_servings INTEGER NOT NULL DEFAULT 100,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, meal_id) REFERENCES meals_new(tenant_id, id) ON DELETE CASCADE
);

-- ══════════════════════════════════════════════════════════════
-- PHASE B: copy-ALL (plain INSERT — fail-closed on column drift, no OR IGNORE).
-- Parents before children so staging→staging FKs hold during the copy.
-- ══════════════════════════════════════════════════════════════

INSERT INTO meals_new (
  id, tenant_id, meal_category_id, price, image_url, is_active, created_at, updated_at, project_id
)
SELECT
  id, tenant_id, meal_category_id, price, image_url, is_active, created_at, updated_at, project_id
FROM meals;

-- tenant_id is DERIVED from the parent meal, never invented. The SELECT is
-- written so that a meal_lang row with no parent meal cannot vanish: it
-- selects `meals_new.id` into the new table's `meal_id` and the parent row's
-- `tenant_id` into `tenant_id`, so an orphan produces NULL in a NOT NULL
-- column and the statement violates the constraint — aborting the whole file
-- loudly — instead of being silently dropped by an INNER JOIN filter. Same
-- fail-closed reasoning as 0107/0108/0126.
INSERT INTO meal_lang_new (tenant_id, meal_id, lang, name, description)
SELECT m.tenant_id, m.id, l.lang, l.name, l.description
FROM meal_lang l
LEFT JOIN meals_new m ON m.id = l.meal_id;

INSERT INTO meal_schedules_new (
  id, tenant_id, camp_id, date, meal_id, package_type, max_servings, created_at, project_id
)
SELECT
  id, tenant_id, camp_id, date, meal_id, package_type, max_servings, created_at, project_id
FROM meal_schedules;

-- ══════════════════════════════════════════════════════════════
-- PHASE C: drop-ALL-olds (children-first). Both children are REBUILT, so
-- their rows already live in staging and the old-parent DROP cannot cascade
-- into them; their own drops are ordered first only so the composite edges
-- are resolved in the same order they were created.
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS meal_schedules;
DROP TABLE IF EXISTS meal_lang;
DROP TABLE IF EXISTS meals;

-- ══════════════════════════════════════════════════════════════
-- PHASE D: rename-ALL to final names (parents-first so the staging→staging
-- FK references rewrite to the final names).
-- ══════════════════════════════════════════════════════════════
ALTER TABLE meals_new RENAME TO meals;
ALTER TABLE meal_lang_new RENAME TO meal_lang;
ALTER TABLE meal_schedules_new RENAME TO meal_schedules;

-- ══════════════════════════════════════════════════════════════
-- PHASE E: no guard RESTORE. Both CASCADE referrers of `meals` were rebuilt
-- (see the GUARDS note above — there is provably no non-rebuilt dependent).
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- PHASE F: recreate ALL pre-existing indexes (the DROPs destroyed them),
-- IF NOT EXISTS so both environments converge without error.
-- ══════════════════════════════════════════════════════════════
-- meals
CREATE INDEX IF NOT EXISTS idx_meals_tenant ON meals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meals_category ON meals(meal_category_id);
CREATE INDEX IF NOT EXISTS idx_meals_project ON meals(project_id);
-- meal_lang — the new composite PK recreates its implicit autoindex on
-- (tenant_id, meal_id, lang) automatically; there were never any explicit
-- indexes on this table (0005 declared none).
-- meal_schedules — 0005 + 0100 + 0111 set, verbatim
CREATE INDEX IF NOT EXISTS idx_meal_schedules_camp ON meal_schedules(camp_id);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_camp_date ON meal_schedules(camp_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_date ON meal_schedules(date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_meal ON meal_schedules(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant ON meal_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant_date ON meal_schedules(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_tenant_camp_date ON meal_schedules(tenant_id, camp_id, date);
CREATE INDEX IF NOT EXISTS idx_meal_schedules_project ON meal_schedules(project_id);

PRAGMA defer_foreign_keys = false;

-- Verify no broken FKs remain (the two composite edges this migration
-- created, plus every untouched edge into/out of the three rebuilt tables).
PRAGMA foreign_key_check;