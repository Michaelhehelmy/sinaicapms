# BLOCKED — manifest import→export round-trip (mani-a6, 2026-09-30)

Status: **BLOCKED — documented only, no fix in this commit** (per tmp spec
`2026-09-30-mna6.md`: "Lost field ⇒ BLOCKED doc (no fix)").

Commit 29ec947 confirmed pushed (local `29ec947` == `origin/main`
`29ec9473d3703d8d320ba57eee69d57e8830af3f`) before work started.

## B1 (import-blocking): manifest import 500s on schema ≥ 0107/0108

`POST /api/tenants/import` (existing-tenant mode) fails for the `products`,
`menu.categories`, and `menu.meals` sections because migrations
`0107_enforce_not_null_other_tables.sql` / `0108_add_meals_project_id.sql`
rebuilt `pos_products`, `meal_categories`, and `meals` with
`project_id TEXT NOT NULL` (no default), while the handler INSERTs in
`backend/src/api/tenant-import.js` never bind `project_id`:

| Section | Handler INSERT | Result on local D1 (ledger has 0107+0108) |
|---|---|---|
| products | `:259-268`, no `project_id` | 500 `D1_ERROR: NOT NULL constraint failed: pos_products.project_id` |
| menu.categories | `:386-387`, no `project_id` | 500 `Failed to import tenant data` (generic wrapper) |
| menu.meals | `:421`, no `project_id` | same 500 (same batch path) |
| posUsers | `:452-456`, sets all NOT NULL cols | 200 `counts.posUsers=1` (works) |

Evidence (local `wrangler dev --local :8787`, admin JWT
`e2e-admin@test.com`, `x-tenant-id: acaciacamp`):
- `POST import {products:[RT6 room type=room], ratePlans:[…], menu:1+1, posUsers:[…]}`
  → `{"success":false,"error":"Failed to create products: D1_ERROR: NOT NULL
  constraint failed: pos_products.project_id: SQLITE_CONSTRAINT …"}`
- `POST import {menu:1+1, posUsers:[…]}` → `{"success":false,"error":"Failed to
  import tenant data"}`; local pragma confirms `meal_categories.project_id`
  and `meals.project_id` are NOT NULL-without-default.
- `POST import {posUsers:[rt6probe@test.com]}` →
  `{"success":true,"tenantId":"acaciacamp","counts":{…,posUsers:1}}`.

Whether staging/prod enforce 0107/0108 is UNKNOWN: staging holds data imported
2026-09-27 (pre-dates or pre-enforcement), and `wrangler d1 … --remote` is
unreachable from this sandbox (`fetch failed` — api.cloudflare.com blocked;
staging worker hostname itself is reachable). No remote writes were attempted.

## B2 (lost fields, export-side — full list)

From `scripts/export-tenant.mjs` live runs (staging + local, both
`validate-manifest.mjs` exit 0):

1. `products[].type` — `GET /api/products` SELECT (`camps.js:484-490`) omits
   the column although `pos_products.type` exists with values (`room|menu|
   buffet|retail`, default `retail`). Re-import defaults to `retail`: a
   `type=room` product round-trips as `retail`. Observed 4/4 staging rows,
   42/42 local rows unrecoverable.
2. `posUsers[].password` — bcrypt one-way hash; no GET returns plaintext.
   Export emits `posUsers: []` always (re-import of hashes would double-hash;
   unauthenticated reads are 401). Proven live: import `rt6pass123` → 200 →
   export `posUsers: []` with note.
3. `rooms[].roomStatus / cleaningStatus` — readable via `GET /api/rooms`
   (160/160 local, 2/2 staging) but the import schema has no such fields.
4. `menu.categories[]` without a lang name — `GET /api/meal-categories`
   returns `name: null` for legacy rows lacking `meal_categories_lang`
   (2/2 local acaciacamp rows); import requires `name`, so the exporter skips
   them with a warning (meals keep `mealCategoryId`, which validates).
5. `project{}` is export-readable but import-inert (handler has no project
   writer — known A.1 finding 2, restated for round-trip completeness).

## What ran

- `scripts/export-tenant.mjs` (new, read-only GETs, no identity, no KV/R2):
  `acaciacamp --staging --out /tmp/acacia-staging-export.json` → exit 0,
  counts `{products:4, rooms:2, ratePlans:1, mealCategories:2, meals:2,
  posUsers:0}` (export file stays in /tmp, never committed).
- `validate-manifest.mjs /tmp/acacia-staging-export.json` → exit 0 `VALID`.
- Diff vs `docs/examples/acacia-manifest.json`: identical 7-section shape, no
  `identity`, 20/20 tenant fields match; CONTENT differs (staging subdomain
  currently holds "Sinai Palms" tenant row + 4 products incl. P4/P5 test rows
  from the 2026-09-27 example import, vs the reference's Acacia Camp 13-room /
  57-meal dataset) — environment drift, not an exporter bug.
- Local: 3 import POSTs (above) + authed local export (42/160/32/0/4/0) +
  validate exit 0. `rooms`/`ratePlans` round-trip values not exercised
  (blocked by B1: no product row could be created to reference).
- Cleanup verified: local D1 holds 0 RT6 rows (the successful posUsers probe
  row was lost when the local workerd died pre-checkpoint — `sqlite_sequence`
  gap at 54 only; no tenant/product/meal/lang residue). No stray processes.

## What did NOT run (stated limits)

- Full import→export value round-trip (blocked by B1).
- Staging/prod D1 ledger check for 0107/0108 (Cloudflare API unreachable
  from sandbox; staging worker API reachable and used read-only).
- No prod/staging writes, no `deploy.sh`, no source changes beyond the two
  scripts + package.json script entry.
