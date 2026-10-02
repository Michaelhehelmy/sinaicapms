# Tenant Import — one manifest, one call

`POST /api/tenants/import` provisions or fills a tenant from a single JSON
manifest: branding, products, rooms, rate plans, menu, and POS users.
Line references below point at `backend/src/api/tenant-import.js` (**1004
lines**, re-read 2026-10-02 after migration 0127 landed) unless noted.
Provenance for each claim:

- **Handler** — `backend/src/api/tenant-import.js`, re-read 2026-10-02. The
  behavioural audits it is checked against are
  `docs/audit-2026-09-30-tenant-manifest-schema.md` (A.1 field census),
  `docs/audit-2026-09-30-tenant-manifest-gaps.md` (A.2),
  `docs/audit-2026-09-30-tenant-manifest-types.md` (A.3),
  `docs/audit-2026-09-30-tenant-import-parity.md` (round-trip parity),
  `.opencode/audits/BLOCKED-manifest-roundtrip.md` (A.6),
  `docs/audit-2026-10-02-tenant-import-edge-cases.md` (edge matrix, 7/7).
- **A.1 counted 85 leaf fields against the schema as it stood on 2026-09-30.**
  The handler now declares **88**: `project.type` plus
  `rooms.roomStatus` / `rooms.cleaningStatus` were added afterwards. §2's
  table is the 88-field version; A.1's number is kept only where it names the
  audit it came from.
- **Live behaviour** — the edge matrix re-ran the real route against a fresh
  local D1 at migration head 0126 and measured 7/7; its step table is quoted
  in §7. **0127 has since landed in the handler but is PENDING-APPLY** — see
  the callout below.

> ### ⚠️ 0127 is committed but NOT applied to any database
>
> `backend/migrations/0127_meals_tenant_composite_pk.sql` re-keys `meals` by
> `(tenant_id, id)` and rebuilds `meal_lang` and `meal_schedules` to match. The
> handler's **code half is already merged**, which means the two halves are
> deployed on different schedules:
>
> - Before 0127 is applied, `meals.id` is still the global PK, so the
>   tenant-scoped probe in §2's probe table finds nothing across tenants and a
>   foreign meal id still hits the raw PK collision → generic 409.
> - Every `meal_lang` INSERT now binds `tenant_id` (:707) — against a
>   pre-0127 database that column does not exist.
>
> **Apply the migration before deploying the code**, and read the *applied
> ledger* (`wrangler d1 migrations list --config backend/wrangler.toml
> `--remote`), not the file count. Owner-only; `docs/RUNBOOK.md` §8 is the
> drift gate.

Wire rule: send **camelCase** (`logoUrl`, `basePrice`, `pricePerNight`,
`mealCategoryId`, `firstName`, `productName`, `categoryName`, …). The route
runs the body through `toSnake()` and validates snake_case Zod schemas
(`identitySchema` :13–22, `manifestSchema` :65–170, both `.strip()` — unknown
keys are silently dropped, never errors). Zod failure answers
400 `{ success:false, error, errors:[{field,message}] }`.
Mount: `backend/src/index.js:244-251`, roles `super_admin` + `admin`.
Gate: `cd backend && npx vitest run tests/tenant-import-smoke.test.js` (4 its).
Full import coverage is **7 suites / 106 tests** — `tenant-import` (53),
`tenant-scoped-uniqueness` (25), `tenant-import-room-status` (8),
`tenant-import-project-id` (7), `tenant-import-export-type` (5),
`tenant-import-smoke` (4), `tenant-import-rollback` (4); run them with
`cd backend && npx vitest run tests/tenant-import`.

Array caps (Zod `.max()`, A.1): products 200 · rooms 200 · rate_plans 200 ·
menu.categories 50 · menu.meals 200 · pos_users 100.

## 1. Identity: create mode vs strip mode

There are exactly two modes, selected by the presence of a truthy `identity`
key — not by URL, not by flag:

| Mode | Caller | What the handler does |
|---|---|---|
| **Create** (`identity` present) | must be `super_admin`, else 403 | Validates identity (:816–817) → checks role (:820–822) → INSERTs tenant row + bcrypt admin (`role='admin'`, `is_active=1`) + org/store/mapping via `ensureTenantOrg` + default `projects` row built from identity fields (name/slug/type) → imports the remaining sections → **201** `{ …, created:{ tenantId, adminId, organizationId } }`. Any failure after the first INSERT **rolls the whole shell back** (saga — see §1a). |
| **Fill** (no `identity`) | tenant `admin` or `super_admin` | Imports into `scope.tenantId` → **200** `{ success, tenantId, counts }`. Never rolls back (§1a). |

Ordering trap (A.2 F2): identity **validation runs before the role check**.
A malformed `identity` block from a non-super-admin returns 400
`validationError`, not 403. The 403
(`Only super-admin can provision new tenants`) fires only when the identity
block itself is schema-valid. Keep identity-mode manifests in separate files
from fill-mode manifests — any truthy `identity` flips a tenant-admin call
into creation mode and it fails.

`identity` fields (Zod :13–22): `name` (required), `subdomain` (required —
regex `/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/`, i.e. 1 char or 3–63 chars;
**2-char subdomains are rejected**; uniqueness-checked, 400 if taken), `type`
(enum `camp|supermarket|transportation|other`, Zod default `camp`),
`email` (required, valid email, admin-uniqueness 400), `password` (required,
≥ 8 chars, bcrypt), `firstName` / `lastName` (required), `businessType`
(optional string; stored as `tenants.business_type` via
`business_type || type`).

## 1a. Atomicity: a saga in create mode, nothing in fill mode

This is the single most consequential difference between the two modes, and
it is **not** the same contract.

| | Create mode (identity) | Fill mode (no identity) |
|---|---|---|
| Undo log | `created[]` threaded from the route into `runImport` (:239–243) | **none passed** — `importTenantManifest(env, tenantId, toSnake(payload))` with no log (:968) |
| On failure after ≥1 row committed | reverse-order tenant-scoped DELETEs, then `500 Import failed: <reason>. All partial data has been rolled back. You can retry with a corrected manifest.` | `500 Import failed: <reason>. Partial data may remain in the tenant. Re-run with the same manifest to retry, or clean up manually.` + a `console.error` naming the tenant |
| On failure before any row | the caller's own precise 4xx/409 is returned **unchanged** | same |
| DELETEs issued | reverse of `created[]` (tenants last) | **never** |

Why create mode can be exact and fill mode cannot: the tenant is brand-new, so
every row carrying that `tenant_id` **is this request's work** — the
tenant-scoped delete is exact rather than approximate. Fill mode's rows belong
to a tenant that predates the request, so there is nothing safe to delete.

Rollback order is dictated by the real FK actions at the 0126 head (verified
with `PRAGMA foreign_key_list`, not assumed): `pos_users` →(NO ACTION)
`pos_stores`/`pos_organizations`; `rooms_new` →(RESTRICT) `pos_products`;
`pos_stores` →(NO ACTION) `pos_organizations`; `projects` →(NO ACTION)
`tenants`; `admins` →(SET NULL) `tenants`; and **`pos_products` has no FK to
`tenants` at all** (only `project_id SET NULL`), so it would silently survive
a tenant delete as an orphan — it is deleted explicitly, after rooms and rate
plans. Each delete is best-effort in its own `try`/`catch`: a blocked step
logs `tenant-import rollback: …` and the rest of the log still runs.

`ensureTenantOrg` is idempotent and does not report what it created, so the
route probes `tenant_org_mapping` **before** calling it and only tracks
org/store/mapping when there was no prior mapping — otherwise a pre-existing
org would be deleted out from under a live tenant.

## 2. Full schema table (88 leaf fields at the current handler)

`Default` = Zod-level default (almost always none); handler runtime fallbacks
live in Notes. Required = Zod-required. All 8 top-level sections are
`.optional()` — `{}` parses (no-op import, still needs a POS org or 409).
Field census: `identity` 8 · `tenant` 20 · `project` 5 · `products` 12 ·
`rooms` 13 · `ratePlans` 10 · `menu.categories` 2 · `menu.meals` 8 ·
`posUsers` 10 = **88** (A.1's 85 predates `project.type`,
`rooms.roomStatus` and `rooms.cleaningStatus`).

| Section | Wire field (camelCase) | Type | Req | Default / fallback | Notes |
|---|---|---|---|---|---|
| identity | name | string min 1 | yes | — | → `tenants.name` + create-mode default project name |
| identity | subdomain | string min 1 | yes | — | + handler regex above; subdomain + admin-email uniqueness 400s |
| identity | type | enum camp/supermarket/transportation/other | no | `camp` (Zod) | → `tenants.type`, `business_type` fallback, `projects.project_type` |
| identity | email | email string | yes | — | new admin login; uniqueness 400 |
| identity | password | string min 8 | yes | — | bcrypt; `role='admin'`, `is_active=1` |
| identity | firstName | string min 1 | yes | — | — |
| identity | lastName | string min 1 | yes | — | — |
| identity | businessType | string | no | — | `business_type \|\| type` into `tenants.business_type` |
| tenant | name | string | no | keep existing | every tenant field `COALESCE`s over the row — omitted stays |
| tenant | logoUrl | string | no | keep existing | resolveImage pipeline (see §7 images) |
| tenant | faviconUrl | string | no | keep existing | same pipeline as logoUrl |
| tenant | heroImageUrl | string | no | keep existing | same pipeline as logoUrl |
| tenant | primaryColor | string | no | keep existing | COALESCE |
| tenant | currency | string | no | keep existing | COALESCE |
| tenant | footerText | string | no | keep existing | COALESCE |
| tenant | location | string | no | keep existing | COALESCE |
| tenant | whatsappNumber | string | no | keep existing | COALESCE |
| tenant | phone | string | no | keep existing | COALESCE |
| tenant | email | string | no | keep existing | COALESCE |
| tenant | description | string | no | keep existing | COALESCE |
| tenant | galleryImages | JSON-encoded string | no | keep existing | stored verbatim as string |
| tenant | aboutText | string | no | keep existing | COALESCE |
| tenant | faqItems | JSON-encoded string | no | keep existing | stored verbatim as string |
| tenant | reviews | JSON-encoded string | no | keep existing | stored verbatim as string |
| tenant | mapEmbedUrl | string | no | keep existing | COALESCE |
| tenant | activities | JSON-encoded string | no | keep existing | stored verbatim as string |
| tenant | capacity | number | no | keep existing | `??` (so 0 stores correctly; text fields use `\|\|`, see §6 pitfall 7) |
| tenant | menuConfig | JSON-encoded string | no | keep existing | stored verbatim as string |
| project | name | string min 1 (when present) | no | — | **written** (section 0, :344–411): updates the tenant's oldest live project, or INSERTs `proj_`+uuid12 when the tenant owns none |
| project | type | enum camp/supermarket/transportation/other | no | handler `'camp'` | → `projects.project_type`, assigned directly (NOT COALESCEd) — added after A.1 |
| project | location | string | no | COALESCE (never blanks an existing value) | same section 0 |
| project | capacity | number min 0 | no | COALESCE | same section 0 |
| project | status | enum active/inactive/planning/completed | no | handler `'active'` | assigned directly, not COALESCEd |
| products | id | string | no | `prod_`+uuid12 | duplicate ID → 409 |
| products | name | string min 1 | yes | — | keys the productName→id map used by rooms/ratePlans refs |
| products | sku | string | no | `PROD-`+PID upper | duplicate SKU → 409 |
| products | basePrice | number min 0 | no | handler `\|\| 0` → `selling_price` | — |
| products | capacity | number min 1 | no | handler `\|\| 1` | feeds rooms `maxGuests` fallback |
| products | description | string | no | → null | — |
| products | shortDescription | string | no | → null | — |
| products | imageUrl | string | no | → null | resolveImage pipeline |
| products | categoryId | string | no | → null | stored verbatim, **no existence check** (blind, A.2 K5) |
| products | isActive | number | no | 1 (`!== undefined ? v : 1`) | — |
| products | type | enum room/menu/buffet/retail | no | handler `'retail'` (Zod has no default) | **product** type, not tenant type |
| products | campId | string | no | `\|\| defaultCampId` | must name a live project the tenant owns, else **400** before any write; omitted → `defaultCampId` (null when tenant has ≠1 project, A.2 U5) |
| rooms | id | string | no | `room_`+uuid12 | lands in `rooms_new` via guarded INSERT…SELECT |
| rooms | name | string min 1 | yes | — | — |
| rooms | productId | string | no | — | direct FK; must be tenant's product or per-room 404 |
| rooms | productName | string | no | — | resolved via imported + existing tenant products; **unknown → 400** |
| rooms | floor | string \| number | no | null / `String()` | — |
| rooms | status | string (free-form, no enum) | no | `'available'` | — |
| rooms | bedType | string | no | → null | — |
| rooms | maxGuests | number | no | referenced product capacity, else 2 | — |
| rooms | basePrice | number (no min) | no | → null when omitted | unlike products/meals, which default 0 |
| rooms | notes | string | no | → null | — |
| rooms | isActive | number | no | 1 | — |
| rooms | roomStatus | enum available/reserved/occupied/cleaning/out_of_service | no | handler `'available'` | → `rooms_new.room_status`; **no DB CHECK**, so this enum is a policy choice mirroring the values `PATCH /api/rooms/:id/status` accepts. Added after A.1. |
| rooms | cleaningStatus | enum dirty/in_progress/clean/inspected | no | handler `'clean'` | → `rooms_new.cleaning_status`; **CHECKed by the schema**, so the enum must match it exactly — wider is a 500, narrower silently rejects a legal value. Added after A.1. |
| ratePlans | id | string | no | `rp_`+uuid12 | lands in `rate_plans_new` via guarded INSERT…SELECT |
| ratePlans | productId | string | no | — | must be tenant's product or per-plan 404 |
| ratePlans | productName | string | no | — | **unknown → 400** |
| ratePlans | name | string min 1 | yes | — | — |
| ratePlans | pricePerNight | number positive | yes | — | the only strictly-positive field in the manifest |
| ratePlans | startDate | string | no | → null | — |
| ratePlans | endDate | string | no | → null | — |
| ratePlans | season | string (free-form) | no | `'all'` | — |
| ratePlans | minStay | number | no | 1 | — |
| ratePlans | isActive | number | no | 1 | — |
| menu.categories | name | string min 1 | yes | — | → `meal_categories` + `meal_categories_lang` (`lang='en'`); keys the categoryName→id map |
| menu.categories | position | number | no | handler `\|\| 0` | — |
| menu.meals | id | string | no | `meal_`+uuid12 (`generateMealId`) | → `meals` + `meal_lang` (`lang='en'`). **Reusable across tenants since 0127** (`meals` is keyed `(tenant_id, id)`); a same-tenant duplicate still 409s |
| menu.meals | name | string min 1 | yes | — | — |
| menu.meals | mealCategoryId | string | no | — | used verbatim, **no existence check** (blind — dangling id 500s, A.2 K4). **No A.4 example ships this key any more**: create mode mints each category id as `mcat_<uuid12>` at import time, so no manifest can name one. See §2, mistake #5b |
| menu.meals | categoryName | string | no | — | resolved against this manifest's `menu.categories[].name` **plus the categories the tenant already owns**; **unresolvable → 400 before any row is written** (symmetric with rooms/ratePlans) |
| menu.meals | price | number min 0 | no | handler `\|\| 0` | — |
| menu.meals | description | string | no | → null (into `meal_lang`) | — |
| menu.meals | imageUrl | string | no | → null | resolveImage pipeline |
| menu.meals | isActive | number | no | 1 | — |
| posUsers | email | email string | yes | — | duplicate → 409; INSERT is `first_name`/`last_name` only (`name` is a GENERATED column — never send `name`) |
| posUsers | username | string | no | defaults to email | duplicate → 409 |
| posUsers | password | string min 8 | yes | — | bcrypt |
| posUsers | firstName | string min 1 | yes | — | — |
| posUsers | lastName | string min 1 | yes | — | — |
| posUsers | phone | string | no | → null | — |
| posUsers | role | enum cashier/manager/admin | no | handler `'cashier'` (Zod has no default) | — |
| posUsers | department | string | no | → null | — |
| posUsers | employeeId | string | no | → null | — |
| posUsers | storeId | number int | no | org's first `pos_stores` id, else null | stored verbatim, no existence check |

Reference resolution (A.1 finding 4, handler-verified): unknown `productName`
→ 400 for rooms and ratePlans; unknown `categoryName` → 400 for meals too
(the meals pre-flight, `runImport` :316–336). The three name-resolved
sections now behave the same way, and the meal check runs **before any DB
write** — it cannot half-apply the way the old behavior did.
`meals.meal_category_id` is `NOT NULL REFERENCES meal_categories(id)`, so an
unresolvable name used to bind NULL and fail the meals batch as an opaque
500 `Failed to import tenant data` *after* the project, branding, products,
rooms, rate plans and meal categories were already written; that partial
write no longer happens. A meal carrying an explicit `mealCategoryId` is
skipped by the pre-flight — the id is bound verbatim, unvalidated.

`campId` is resolved by a pre-flight of its own (the first thing `runImport`
does, before `ensureTenantOrg` and therefore before the first write): it must
name one of the tenant's live (`deleted_at IS NULL`) projects or the import
400s and writes nothing. Nothing checked it before, and no constraint caught
it either — at the head `pos_products.camp_id` is a bare column (only
`project_id` carries the `projects` FK), so an unknown id was stored verbatim
and the import answered **200**, leaving a dangling cross-tenant project id in
every POS report keyed off that column. Add a `ratePlans` block and the same id
reaches `rate_plans_new.camp_id` (a real `REFERENCES projects(id)`), so the
import instead died there as an opaque 500 *after* the project, branding,
products and rooms were committed. The `project` block needs no extra case: it
updates the tenant's oldest live project, and when the tenant owns none it
mints a `proj_`+uuid that no manifest key can name. `campId` is accepted on
`products[]` only — see mistake #3 for the rooms key.

`rate_plans.camp_id` comes from the referenced product's camp (`p.camp_id`
in the SELECT, :585–588) — no manifest key feeds it. Duplicate product names:
last imported row wins the name map; imported names beat pre-existing ones
(:471–514). `defaultCampId` is null unless the tenant owns exactly one
non-deleted project (:414–417): with 0 or 2+ projects, products import with
`camp_id` null silently while every room 404s.

### Probe caps — the two `IN (…)` probes and the D1 bind ceiling

Both reference probes interpolate their `IN (…)` list, so both are exposed to
D1's **100 bound parameters per query** ceiling
(`too many SQL variables at offset N`). Both are chunked at **50 ids per
statement**, and both `SET`-de-duplicate first so a manifest repeating an id
does not spend binds twice:

| Probe | Placeholder | Binds per statement | Chunked? |
|---|---|---|---|
| `campId` resolvability (:275–304) | the **distinct** `campId` values across every section that accepts one | 50 ids + `tenant_id` = **51** | yes, `for (i += 50)` — `products[]` caps at 200, so a single `IN (…)` would have traded the clean 400 for an opaque 500 on a large manifest |
| explicit `menu.meals[].id` ownership (:668–684) | the **distinct** explicit meal ids | 50 ids + `tenant_id` = **51** | yes — `menu.meals` caps at 200, so a manifest authoring an id on every meal binds 201 values in one query |

> The second row **used to be un-chunked and un-deduplicated** (up to 200
> binds), which was documented as a known latent exposure. Migration 0127 closed
> both while reshaping the probe's scope — see below.

The two probes also differ in **scope**, and 0127 is why:

| | before 0127 | after 0127 |
|---|---|---|
| `meals.id` keying | global `id TEXT PRIMARY KEY` | `PRIMARY KEY (tenant_id, id)` |
| explicit meal id owned by **another** tenant | `400` `already belongs to another tenant — remove the explicit meal id…` | **legal** — the same manifest may now load its meal ids into a second tenant, which is what parity finding D3 asked for |
| explicit meal id owned by **this** tenant | `409 already exists in this tenant (duplicate id …)` | `409`, same message |
| probe WHERE clause | `WHERE id IN (…)` (all tenants) | `WHERE tenant_id = ? AND id IN (…)` |

The probe is tenant-scoped **on purpose**: asking "who owns this id" across all
tenants would both re-introduce the cross-tenant collision 0127 removed **and**
leak another tenant's existence through a 4xx.

`products[].id` still gets **no** probe at all: a manifest shipping another
tenant's explicit product id still falls through to the generic 409
(`One or more products already exist (duplicate SKU or ID)`), because
`pos_products.id` is still the global text primary key. That is the remaining
half of parity D3.

## 3. Tenant-type matrix (A.3 — handler-verified, never assumed)

`runImport` (:239–742) contains **zero branches on tenant type** — the only
`type` writes on the import path are the product-column INSERT (:488), the
project-column INSERTs (:392/:404) and the create-mode tenant/project writes
(:891/:923). Consequence: every data section behaves byte-identically for
every tenant; the type value only matters at create-mode provisioning.
`restaurant-only` and `curated-listing` match **zero** hits repo-wide
(`git grep`) — they exist on no enum anywhere.

Identity `type` verdict (pre-table): `camp` (also the Zod default), 
`supermarket`, `transportation` accepted; `restaurant-only` and
`curated-listing` are **TI — 400 `validationError`** at :816–817 (before the
super-admin check) with a second barrier behind it, the D1
`CHECK (type IN ('camp','supermarket','transportation','other'))`
(`0001_core.sql:19`). Omitted → `camp`. (Wider enums elsewhere —
`tenants.js:19`, `camps.js:43` — accept `restaurant`/`custom`, but the import
handler is narrower; bare `restaurant` 400s here too.)

| Section | camp | supermarket | transportation | restaurant-only | curated-listing |
|---|---|---|---|---|---|
| tenant | O | O | O | O† | O† |
| project | O | O | O | O† | O† |
| products | O | O | O | O† | O† |
| rooms | O | O | O | O† | O† |
| ratePlans | O | O | O | O† | O† |
| menu.categories | O | O | O | O† | O† |
| menu.meals | O | O | O | O† | O† |
| posUsers | O | O | O | O† | O† |

Legend: **O** = optional, accepted and processed identically for every type
(all sections `.optional()`); **I** = schema-valid but never read — **zero
cells since the `project` block became a real writer** (it was 5/40 at A.3
time; see §2 `project` rows and mistake #2); **M** = mandatory — **zero
cells**, stated explicitly. **†** = fill-mode path only: the tenant's
type value never reaches the handler there (`scope.tenantId` at :960, zero
type reads in `runImport`), so these cells restate the identical rules, not an
assumption. 40 cells: O = 40, I = 0, in-matrix TI = 0 (TI lives in the
identity pre-table: 2 values), M = 0.
Per-section evidence (branch reads): tenant COALESCE :434–466; project
upsert/insert :352–410; products defaults `base_price||0 / capacity||1 /
type||'retail' / camp_id||defaultCampId` :483–489; rooms guard :538–566 with
`room.camp_id` :528 dead (key stripped by `.strip()` — rooms always land in
`defaultCampId`); ratePlans guard :583–604; categories/meals inserts
:617–625/:680–692 with no type predicate; posUsers `role||'cashier'`, store
fallback :703–709, GENERATED-name insert :714–724, dup 409 :730–731.

## 4. Example manifests

Finished, schema-valid, FK-resolving, bilingual (EN/AR) references under
`docs/examples/manifests/` (A.4, each `python3 -m json.tool` clean and
validated against the verbatim Zod text — VALIDATED-BY-SCHEMA, no live
backend was reachable at build time):

| File | Tenant shape | Identity workaround for the A.3 TI barrier |
|---|---|---|
| `camp-full.json` | Beach camp: tents + rate plans + grill menu + staff | `type: 'camp'` |
| `supermarket-full.json` | Supermarket: retail products, no rooms | `type: 'supermarket'` |
| `restaurant-only.json` | Restaurant: menu-first, rooms present but nominal | `type: 'other'` + `businessType: 'restaurant-only'` |
| `transportation.json` | Transport operator: fleet-as-products + staff | `type: 'transportation'` |
| `curated-listing.json` | Listing-only showcase | `type: 'other'` + `businessType: 'curated-listing'` |

Each file covers **84 of the 88** leaf fields (measured 2026-10-02 against
the schema's key census, not asserted by hand). The four it omits are all
deliberate:

| Omitted | Why |
|---|---|
| `products[].campId` | these five files use create mode, whose project id is a `proj_`+uuid minted at provisioning time that no manifest can name, so any shipped value is a guaranteed 400 (§2, mistake #3b) |
| `rooms[].roomStatus`, `rooms[].cleaningStatus` | added to the schema after A.4 was authored; a fresh tenant's rooms are `available`/`clean` anyway, which is what an omitted field binds |
| `project.type` | added to the schema after A.4 was authored; omitting it binds the handler default `'camp'` |

They resolve rooms/ratePlans through
both `productName` and `productId`, meals through `categoryName` only, and use
https-only image URLs (no R2 involved). (The files previously carried a
`mealCategoryId: "mcat_existing_*"` placeholder on one meal each to
demonstrate the direct-id path. It was removed: the id it named exists in no
database, create mode cannot produce a knowable category id, and shipping an
example that 500s on a fresh tenant is worse than not demonstrating a path
that only existing-tenant mode can use. The path itself is unchanged — see
the `mealCategoryId` row in §2 and mistake #5b.) The older
`docs/examples/tenant-manifest.example.json` remains the minimal fill-mode
sample — 69 of 88 leaf fields (no `identity` at all; its `project` and
`images` blocks are documented as such, not gaps). The A.4 files carry a stripped `_note` explaining the
`type: 'other'` + `businessType` workaround and the
campId/categoryId/storeId placeholder guidance.

## 5. Validator CLI

`scripts/validate-manifest.mjs` (zero-dep, sole import `node:fs`; A.5)
mirrors A.1 in the same wire order the handler uses: camelCase → deep
`toSnake()` (same regex as `backend/src/utils/response.js`) → snake_case
rules (all sections optional; caps 200/200/200/50/200/100; dangling rooms /
ratePlans `product_name` → ERROR; dangling meals `category_name` → WARNING
only — the CLI is deliberately lax there, but note the route is not: a
dangling meal `category_name` is a 400 (see §2). The same holds for
`products[].camp_id`, which the CLI does not resolve at all: an unresolvable
one is a 400 at the route. So a green CLI run does not
guarantee a 200 import on the meal category or on `campId`; `rooms[].camp_id`
accepted-but-stripped, never an error; unknown keys
stripped; no R2/KV — images are never resolved here):

```bash
npm run validate-manifest -- docs/examples/manifests/camp-full.json
# VALID docs/examples/manifests/camp-full.json
# counts {"products":3,"rooms":2,"rate_plans":2,"meal_categories":3,"meals":3,"pos_users":2}
node scripts/validate-manifest.mjs <manifest.json>   # exit 0 valid, 1 invalid
```

Smoke evidence (A.5, 7/7): all five A.4 manifests exit 0 with per-section
counts; a manifest with the identity subdomain deleted exits 1
(`identity.subdomain: Subdomain is required`); a manifest whose
`rooms[0].productName` points at `NO-SUCH-PRODUCT-XYZ` exits 1 with the
dangling-reference error. Run the validator before every POST — it catches
the 400s locally.

## 6. Export CLI + round-trip losses

`scripts/export-tenant.mjs` (zero-dep, read-only; A.6) rebuilds an A.1-shaped
manifest (tenant/project/products/rooms/ratePlans/menu/posUsers — **never**
`identity`, export cannot provision) from live GETs. Reads only: public
tenant/projects/products/rooms/rateplans/meal-categories/meals with
`x-tenant-id`, plus authed `GET /api/pos-users` when a JWT is supplied. No
POST/PUT/DELETE, no KV, no R2:

```bash
node scripts/export-tenant.mjs acaciacamp --staging --out /tmp/acacia-export.json
node scripts/export-tenant.mjs acaciacamp --out /tmp/acacia-local.json   # local :8787 default
node scripts/export-tenant.mjs acaciacamp --staging --jwt "$TOKEN" --out /tmp/acacia-full.json
npm run validate-manifest -- /tmp/acacia-export.json   # export → validate is the round-trip check
```

## 6. Export CLI + what round-trips vs what drops

`scripts/export-tenant.mjs` (zero-dep, read-only; A.6) rebuilds an A.1-shaped
manifest (tenant/project/products/rooms/ratePlans/menu/posUsers — **never**
`identity`, export cannot provision) from live GETs. Reads only: public
tenant/projects/products/rooms/rateplans/meal-categories/meals with
`x-tenant-id`, plus authed `GET /api/pos-users` when a JWT is supplied. No
POST/PUT/DELETE, no KV, no R2:

```bash
node scripts/export-tenant.mjs acaciacamp --staging --out /tmp/acacia-export.json
node scripts/export-tenant.mjs acaciacamp --out /tmp/acacia-local.json   # local :8787 default
node scripts/export-tenant.mjs acaciacamp --staging --jwt "$TOKEN" --out /tmp/acacia-full.json
npm run validate-manifest -- /tmp/acacia-export.json   # export → validate is the round-trip check
```

Round-trip evidence (A.6, staging `acaciacamp` reads only, file to /tmp never
committed): export exit 0
`{products:4, rooms:2, ratePlans:1, mealCategories:2, meals:2, posUsers:0}` +
validate exit 0 VALID.

### The round-trip ledger as of 2026-10-02

A round trip has **three** legs — export reads, the manifest carries, import
writes — and a field is only closed when all three name it. Re-checked against
the current handler + exporter, not against A.6:

| Field | Export | Import | Verdict |
|---|---|---|---|
| `products[].type` | emits `type` when `GET /api/products` returns it — **fixed**: that SELECT now names `p.type` | accepted + bound | ✅ **round-trips** (`room`/`menu`/`buffet`/`retail` survive; untyped products still default `retail` on the *import* side only when the manifest omits it) |
| `project{name,location,capacity,status}` | emits all four | **written** by section 0 | ✅ **round-trips** — it was import-inert when A.6 recorded the loss |
| `posUsers[].password` | never emitted | required, bcrypt-hashed | ❌ **drops, by design** — bcrypt is one-way and no GET returns plaintext; without `--jwt` the exporter emits `posUsers: []` (with a JWT it emits the rows, still without passwords). Re-importing a hash would double-hash it. Proven live: import `rt6pass123` → 200 → export `[]`. |
| `rooms[].roomStatus` / `cleaningStatus` | **still not emitted** — the exporter only *counts* them into its lost-fields report | accepted + bound + persisted | ⚠️ **half-closed**: the import leg is fixed (they survive a hand-written or API-sourced manifest), but the exporter still drops them, so a full `export → import` cycle loses them. The import no longer "drops them" — the *exporter* does. |
| `menu.categories[]` rows with no lang name | skipped with a warning | `name` is required | ❌ **drops by necessity** — `GET /api/meal-categories` returns `name: null` for legacy rows lacking `meal_categories_lang`, and there is nothing to import |
| `project.type` | not emitted | accepted + bound | ⚠️ **exporter gap** — the import leg works; the exporter simply does not read `project_type` |
| `menu.meals[].id` | emitted verbatim | probed, and **tenant-scoped** since 0127 — a same-tenant duplicate 409s, a foreign one is accepted | ✅ **reusable across tenants**; strip only for a **same**-tenant re-import |
| `products[].id`, `rooms[].id`, `ratePlans[].id` | emitted verbatim | no probe at all | ❌ **still strip them for a cross-tenant copy** — these are global text primary keys. A foreign `products[].id` answers the generic 409 (`One or more products already exist (duplicate SKU or ID)`). |

Known stale text (reported, not fixed here — the exporter is outside this
document's scope): the `KNOWN LOSSES` header in
`scripts/export-tenant.mjs` still lists *"rooms room_status/cleaning_status:
readable but dropped by re-import"*, and its `typeMissing` guard still says
*"GET /api/products SELECT omits the column"* on the line that now only fires
if the DEFECT-2 fix regresses. The `typeMissing` / `roomStatusRows` counters
themselves are worth keeping — they are canaries that re-fire the moment a
column goes missing again — but their message text is now wrong.

**Superseded blocking note (A.6 B1).** A.6 warned that on a ledger at/after
`0107`/`0108` the products/categories/meals INSERTs 500 because they never
bind `project_id`. **That is no longer true at the 0126 head**: all six
project_id-bearing INSERTs now bind one resolved value
(`resolvedProjectId` = the project this import wrote → the tenant's sole live
project → NULL), and 0111 rebuilt those five columns back to **nullable**
(`ON DELETE SET NULL` and `NOT NULL` contradict, so `NOT NULL` could not
survive). A NULL bind degrades to project-less rows instead of throwing. The
0110-era failure the workspace DB was stranded on is real history, not the
current contract — `backend/tests/tenant-import-project-id.test.js` asserts
both the zero-NULL path and the graceful NULL path against a real replay.

## 7. Images, errors, and the top-10 mistakes

Image rule (`resolveImage` :39–59): `data:image/(jpg|jpeg|png|webp|gif);
base64,…` ≤ 8 MB → R2 `MEDIA_BUCKET` → stored `/api/media/…` URL (keys
tracked in `uploadedKeys` and best-effort deleted if the import later fails —
R2 rolls back, D1 rows do not, A.2 U1); `http(s)` / `/api/media/` pass
through; anything else resolves null **for product/meal images only**
(`imageUrl || null`). Tenant `logoUrl`/`faviconUrl`/`heroImageUrl` bind as
`logoUrl || t.logo_url || null` — an invalid sent value falls back to the
**raw sent string, stored verbatim** (A.2 F3: sending `"not-a-url"` persists
`"not-a-url"`). Applies to tenant logo/favicon/hero, product `imageUrl`,
meal `imageUrl`. Never any KV write (free-plan 1,000 writes/day quota).

Status codes: 200 fill-mode import (`{ success, tenantId, counts }` with
`counts = { products, rooms, ratePlans, mealCategories, meals, posUsers }`
— the wire is camelCase because `jsonResponse` deep-converts via `toCamel`)
· 201 create-mode (`{ …200, created }`) · 400 Zod / unknown `productName` /
unknown `campId` / unknown `categoryName` / bad-or-taken subdomain / taken
admin email · 401 no tenant
context in fill mode · 403 truthy `identity` from a non-super-admin (only when
the identity block itself is valid — else 400, §1) · 404 per-room/per-plan
guard miss (no matching tenant camp/product) · 409 POS-org missing (only when
`ensureTenantOrg` returns falsy — it auto-creates org+store+mapping with
`INSERT OR IGNORE` in both modes, A.2 U10), or duplicate SKU/ID/email/username,
or a **same-tenant** duplicate explicit `meals[].id` (an explicit meal id
owned by *another* tenant is legal again since 0127 — it is no longer a 400) · 405 non-POST
(`Method not allowed`) · 500 thrown non-UNIQUE DB errors
(`Failed to create products…` / `Failed to create POS users…`, else generic
`Failed to import tenant data`) **plus the two atomicity messages** —
`Import failed: <reason>. All partial data has been rolled back. You can retry
with a corrected manifest.` (create mode, after rows were committed) and
`Import failed: <reason>. Partial data may remain in the tenant. Re-run with
the same manifest to retry, or clean up manually.` (fill mode, thrown error
only — a deterministic 4xx keeps its own status and message). Admin panel
entry: top-level **Import** nav
tab (`AdminApp.tsx` id `'import'` — not inside Settings, A.2 F4), with
paste / Load-from-file / per-section-counts preview / Import /
counts-breakdown toast (`TenantImportPanel.tsx`).

Measured live (edge matrix, 7/7, fresh local D1 at head 0126):

| Manifest | Mode | Status |
|---|---|---|
| `camp-full.json` | create | **201**, all six counts match the manifest |
| the same manifest again | create | **400** `This subdomain is already taken` — the uniqueness probe fires before any write |
| the same manifest again | fill | **409** `One or more products already exist (duplicate SKU or ID)` — the tenant-scoped `(tenant_id, sku)` arbiter, and the tenant's product count stays unchanged |
| unresolvable meal `categoryName` | create | **400**, 0 product rows written |
| unresolvable product `campId` | create | **400**, 0 product rows written |
| tenant B handed tenant A's SKUs **and** POS emails/usernames verbatim | create | **201**, every count matches — the same catalogue + staff set genuinely loads into two tenants |
| tenant B handed tenant A's explicit `products[].id` | create | **409** (see §6 — `pos_products.id` was *not* re-scoped) |

The last two rows are the measured state **before** 0127; 0127 re-scoped
`meals` only, which is why the meal half of that finding is now closed and the
product half is not. The measured `meal_id`-crosses-tenants case now imports
**201**, where the same manifest answered 400 before.

Top-10 mistakes (every item handler-verified):

1. **Shipping `identity` inside a tenant-admin manifest.** Any truthy
   `identity` flips into create mode and fails — keep the two manifest kinds
   in separate files.
2. **Expecting the `project` block to be ignored.** It is **not** — that was
   true when A.2/A.1 were written (DEFECT-3, LOST-ON-IMPORT) and is false
   now. The block upserts the tenant's **oldest live** project (or mints
   `proj_`+uuid12 when the tenant owns none), runs **before** the default-camp
   resolution, and the products/rooms written later in the same import attach
   to it. It is a re-import-idempotent update, not a fork; omitted
   `name`/`slug`/`location`/`capacity` are COALESCEd so they never blank an
   existing value, and `project_type`/`status` are assigned directly with
   `'camp'`/`'active'` defaults. In create mode the identity block commits a
   project *first*, so the manifest's block updates that same row (one INSERT
   + one UPDATE, never two projects).
3. **Sending `rooms[].campId` to place rooms.** No `camp_id` in the rooms Zod
   object + `.strip()` means the key never survives; the `:528` read is dead
   — rooms always land in `defaultCampId` (A.1 finding 3).
3b. **Sending an unverified `products[].campId`.** The import now 400s with
   `Product "<name>" references unknown camp "<campId>". campId must name a project this tenant already owns; omit it to attach the row to the tenant default project.`
   and writes nothing — and only a *live* project of *this* tenant counts, so
   another tenant's or a soft-deleted project id is rejected too. (The field
   table previously implied an unverified id would quietly fall back — never
   true at head: `pos_products.camp_id` has no FK, so the id was stored
   verbatim and the import answered 200, or the id reached
   `rate_plans_new.camp_id` and 500'd the import with rows already committed.)
   Omitting the field is the safe default: it falls back to the tenant's sole
   project.
4. **Referencing a `productName` that isn't imported or owned.** Rooms and
   ratePlans 400 on unknown names; pre-create the products or fix the names
   (dup names: last imported wins, A.2 U4).
5. **Assuming an unknown `categoryName` fails quietly.** It does not: the
   import now 400s with
   `Meal "<name>" references unknown category "<categoryName>". Declare the category in menu.categories[] or remove categoryName.`
   and writes nothing. (This paragraph previously claimed the opposite —
   "stores null silently" — which was never true at head: the null
   `meal_category_id` violated its NOT NULL constraint and 500'd the import.)
   The mirror-image trap is item 5b: an explicit `mealCategoryId` is still
   bound verbatim with **no** existence check, so a placeholder id fails as a
   raw 500, not a 400. That trap is no longer *shipped* — the A.4 examples
   were fixed to use `categoryName` (Wave 8) because create mode mints the
   category id (`mcat_<uuid12>`) and no manifest can name it — but the blind
   spot in the handler is unchanged, so a hand-written manifest can still hit
   it. Prefer `categoryName`, which is validated and 400s cleanly.
6. **Sending a junk `logoUrl` expecting null-or-keep.** Tenant logo/favicon/
   hero store the raw sent string verbatim on invalid input (A.2 F3).
   Validate URLs client-side or omit the field.
7. **Sending `""` to clear a tenant field.** Text fields bind with `||` into
   `COALESCE`, so empty string counts as omitted and the old value is kept —
   the import cannot clear a field to empty (only `capacity` uses `??`).
8. **Expecting `products[].type` to be lost on export→import.** It is not —
   `GET /api/products` selects `p.type` and the exporter emits it, so
   `room`/`menu`/`buffet`/`retail` survive a round trip (A.6 loss 1, closed).
   The one that still drops is `rooms[].roomStatus`/`cleaningStatus` — the
   *import* persists them, but the **exporter** never emits them (§6).
9. **Assuming create-mode imports are all-or-nothing (or that fill-mode ones
   are).** Both halves were once wrong in opposite directions. Create mode is
   a **saga**: any failure after the first INSERT rolls the shell back and
   answers "All partial data has been rolled back" (§1a). Fill mode is
   deliberately **not**: a thrown error leaves earlier sections committed and
   says so. Per-section `DB.batch` calls with no cross-section transaction is
   still the mechanism underneath both; only the undo log differs.
10. **Looking for Tenant Import under Settings.** It is the top-level Import
     tab (A.2 F4). Bonus: non-POST callers get 405, and the subdomain 400 text
     says "3-63 chars" while 1-char subdomains actually pass (A.2 U8/U9).
