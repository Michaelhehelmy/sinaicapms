# TRIAGE — manifest import→export round-trip (mtri, 2026-09-30)

Status: **TRIAGE ONLY — no fix** (per tmp spec `2026-09-30-mtri.md`).
Parent finding: `.opencode/audits/BLOCKED-manifest-roundtrip.md` (mani-a6).

HEAD confirmed before work: `52c234b5b3729d07cf7b17168641f6a24763a890`
(`test(monitor): custom domain verification — PASS`; local == origin/main
at task start; working tree held unrelated dirty package.jsons + untracked
tmp files — NONE staged or touched by this commit).

## 0. Exact 5-field list (pasted verbatim from BLOCKED §B2)

> 1. `products[].type` — `GET /api/products` SELECT (`camps.js:484-490`) omits
>    the column although `pos_products.type` exists with values (`room|menu|
>    buffet|retail`, default `retail`). Re-import defaults to `retail`: a
>    `type=room` product round-trips as `retail`. Observed 4/4 staging rows,
>    42/42 local rows unrecoverable.
> 2. `posUsers[].password` — bcrypt one-way hash; no GET returns plaintext.
>    Export emits `posUsers: []` always (re-import of hashes would double-hash;
>    unauthenticated reads are 401). Proven live: import `rt6pass123` → 200 →
>    export `posUsers: []` with note.
> 3. `rooms[].roomStatus / cleaningStatus` — readable via `GET /api/rooms`
>    (160/160 local, 2/2 staging) but the import schema has no such fields.
> 4. `menu.categories[]` without a lang name — `GET /api/meal-categories`
>    returns `name: null` for legacy rows lacking `meal_categories_lang`
>    (2/2 local acaciacamp rows); import requires `name`, so the exporter skips
>    them with a warning (meals keep `mealCategoryId`, which validates).
> 5. `project{}` is export-readable but import-inert (handler has no project
>    writer — known A.1 finding 2, restated for round-trip completeness).

## 1. Per-field verdicts (section + INSERT + SELECT + schema ⇒ verdict)

| # | Section | INSERT (`backend/src/api/tenant-import.js`) | SELECT (read side) | Schema (migration) | Verdict |
|---|---|---|---|---|---|
| 1 | `products[].type` | `:259-268` BINDS `item.type \|\| 'retail'` — import accepts type | `camps.js:486-490` `SELECT p.id, p.tenant_id, …` — **no `p.type`** | `0107:150` `pos_products.type TEXT CHECK(…) DEFAULT 'retail'` EXISTS | **LOST-ON-EXPORT** |
| 2 | `posUsers[].password` | `:448` `hashPassword(user.password)` → `:452-456` INSERT into `password_hash` — import consumes plaintext | `pos-users.js:45-53` `POS_USER_SELECT[_P]` — **no `password_hash`, no plaintext anywhere** | `pos_users.password_hash TEXT NOT NULL`; no plaintext column exists | **LOST-ON-EXPORT** (bcrypt one-way; exporter always `[]`) |
| 3 | `rooms[].roomStatus/cleaningStatus` | `:316-320` `INSERT INTO rooms_new (id, camp_id, product_id, name, status, bed_type, max_guests, base_price, floor, notes, is_active, tenant_id, …)` — **zero mentions** of `room_status`/`cleaning_status` in file (grep count 0); Zod `rooms` (`:107-119`) has `status` but no such fields | `camps.js:760` `SELECT r.* …` — **returns both** (comment `:758-759` says so) | `0107:193-207` `rooms_new.room_status DEFAULT 'available'`, `cleaning_status DEFAULT 'clean'` EXIST | **LOST-ON-IMPORT** (readable, dropped on write) |
| 4 | `menu.categories[]` nameless | `:386-393` writes `meal_categories(id,tenant_id,position)` + `meal_categories_lang(…, 'en', name)` — fine WHEN `name` present; Zod `:134` REQUIRES `name` | `meal-categories.js:53-56` `LEFT JOIN meal_categories_lang …` → `name: null` for legacy rows | `meal_categories` has NO name column (name lives in `meal_categories_lang`); exporter (`export-tenant.mjs:230-237`) SKIPS nameless rows with warning | **LOST-ON-EXPORT** (legacy rows unrecoverable; import side correct) |
| 5 | `project{}` | **NO writer**: `runImport` has zero `INSERT/UPDATE INTO projects` (only identity-creation `:584` provisions); Zod parses `project` (`:87-92`) then ignores it | `export-tenant.mjs:93,139-150` reads `GET /api/projects` — exportable | `projects` table exists; nothing consumes the block on import | **LOST-ON-IMPORT** (export-readable, import-inert) |

## 2. Live local 500 repro (2026-09-30, `wrangler dev --local :8787`)

- Local D1 ledger head `0110` with `0107` + `0108` applied (pragma: `pos_products.project_id TEXT NOT NULL` no default; same for `meal_categories`, `meals`).
- Admin JWT minted locally (HS256, `backend/.dev.vars` secret) for `adm_c1619d93-929` (`e2e-admin@test.com`, `admin`, tenant `acaciacamp`); existing-tenant mode, `x-tenant-id: acaciacamp`.
- `POST /api/tenants/import {"products":[{"name":"MTRI probe room","type":"room","basePrice":100,"capacity":2}]}` →
  `HTTP 500 {"success":false,"error":"Failed to create products: D1_ERROR: NOT NULL constraint failed: pos_products.project_id: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_NOTNULL)"}`.
- `POST /api/tenants/import {"menu":{"categories":[{"name":"MTRI Cat"}],"meals":[]}}` →
  `HTTP 500 {"success":false,"error":"Failed to import tenant data"}` (route-wrapper catch `tenant-import.js:609-614` swallows the underlying `meal_categories.project_id` NOT NULL error into the generic message).
- **Exact failing statement / column**: `INSERT INTO pos_products (id, tenant_id, organization_id, category_id, sku, name, description, short_description, selling_price, capacity, image_url, is_active, type, camp_id, created_at, updated_at)` (`tenant-import.js:259-260`, bound `:261-268`) — binds 14 columns, never binds `project_id`; **failing column `pos_products.project_id`**. Same class: `INSERT INTO meal_categories (id, tenant_id, position, created_at)` (`:386`) and `INSERT INTO meals (…)` (`:420-421`) — column `meal_categories.project_id` / `meals.project_id`.
- No residue: probe product INSERT failed atomically (batch abort); no RT6/MTRI rows written; local workerd stopped after repro; no remote writes, no `deploy.sh`, no source changes.

## 3. Defects (diagnose only — NO FIX in this commit)

- **DEFECT-1 (import-blocking 500, schema ≥ 0107/0108)**: the three handler INSERTs above never bind `project_id` while `0107` rebuilt `pos_products` / `meal_categories` / `meals` with `project_id TEXT NOT NULL` (no default; `0108` guards it). ANY manifest with `products`, `menu.categories`, or `menu.meals` 500s on a 0107+ database in existing-tenant mode. Fix direction (NOT done): resolve tenant-default `project_id` (a `projects` row for the tenant, cf. `defaultCampId` pattern `:200-203`) and bind it in all three INSERTs.
- **DEFECT-2 (silent export loss, `products[].type`)**: `GET /api/products` SELECT (`camps.js:486-490`) omits the existing `pos_products.type` column, so `scripts/export-tenant.mjs` (`:156-181`) can never emit `type` and re-import defaults every product to `retail` — a `type=room` product round-trips as `retail` with exit 0 on both ends. Fix direction (NOT done): add `p.type` to the SELECT (and confirm Zod/import already accept it — they do, `:104` + `:267`).

## 4. What ran / did NOT run

- Ran: local `wrangler dev --local :8787` + 2 import POSTs (above) + pragma checks on local D1 (`pos_products`/`meal_categories`/`meals`/`rooms_new`/`rate_plans_new`/`pos_users` project_id nullability; `rooms_new` room/cleaning columns present; `pos_users.password_hash` NOT NULL).
- Did NOT run: full import→export value round-trip (blocked by DEFECT-1); staging/prod D1 ledger check (Cloudflare API unreachable from sandbox — unchanged); no prod/staging writes; no source edits.
