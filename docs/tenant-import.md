# Tenant Import — one manifest, one call

`POST /api/tenants/import` provisions or fills a tenant from a single JSON
manifest: branding, products, rooms, rate plans, menu, and POS users.
Sources of truth for everything below are the read-only audits
`docs/audit-2026-09-30-tenant-manifest-schema.md` (A.1, 85 leaf fields),
`docs/audit-2026-09-30-tenant-manifest-gaps.md` (A.2),
`docs/audit-2026-09-30-tenant-manifest-types.md` (A.3), and
`.opencode/audits/BLOCKED-manifest-roundtrip.md` (A.6) — all verified
against `backend/src/api/tenant-import.js` (619 lines). Line references
below point at that handler unless noted.

Wire rule: send **camelCase** (`logoUrl`, `basePrice`, `pricePerNight`,
`mealCategoryId`, `firstName`, `productName`, `categoryName`, …). The route
runs the body through `toSnake()` and validates snake_case Zod schemas
(`identitySchema` :12–21, `manifestSchema` :64–160, both `.strip()` — unknown
keys are silently dropped, never errors). Zod failure answers
400 `{ success:false, error, errors:[{field,message}] }`.
Mount: `backend/src/index.js:244-251`, roles `super_admin` + `admin`.
Gate: `cd backend && npx vitest run tests/tenant-import-smoke.test.js` (4 its).

Array caps (Zod `.max()`, A.1): products 200 · rooms 200 · rate_plans 200 ·
menu.categories 50 · menu.meals 200 · pos_users 100.

## 1. Identity: create mode vs strip mode

There are exactly two modes, selected by the presence of a truthy `identity`
key — not by URL, not by flag:

| Mode | Caller | What the handler does |
|---|---|---|
| **Create** (`identity` present) | must be `super_admin`, else 403 | Validates identity (:532–533) → checks role (:536–538) → INSERTs tenant row + bcrypt admin (`role='admin'`, `is_active=1`) + org/store/mapping via `ensureTenantOrg` + default `projects` row built from identity fields (name/slug/type) → imports the remaining sections → **201** `{ …, created:{ tenantId, adminId, organizationId } }` |
| **Fill** (no `identity`) | tenant `admin` or `super_admin` | Imports into `scope.tenantId` → **200** `{ success, tenantId, counts }` |

Ordering trap (A.2 F2): identity **validation runs before the role check**.
A malformed `identity` block from a non-super-admin returns 400
`validationError`, not 403. The 403
(`Only super-admin can provision new tenants`) fires only when the identity
block itself is schema-valid. Keep identity-mode manifests in separate files
from fill-mode manifests — any truthy `identity` flips a tenant-admin call
into creation mode and it fails.

`identity` fields (Zod :12–21): `name` (required), `subdomain` (required —
regex `/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/`, i.e. 1 char or 3–63 chars;
**2-char subdomains are rejected**; uniqueness-checked, 400 if taken), `type`
(enum `camp|supermarket|transportation|other`, Zod default `camp`),
`email` (required, valid email, admin-uniqueness 400), `password` (required,
≥ 8 chars, bcrypt), `firstName` / `lastName` (required), `businessType`
(optional string; stored as `tenants.business_type` via
`business_type || type`).

## 2. Full schema table (A.1 — 85 leaf fields)

`Default` = Zod-level default (almost always none); handler runtime fallbacks
live in Notes. Required = Zod-required. All 8 top-level sections are
`.optional()` — `{}` parses (no-op import, still needs a POS org or 409).

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
| project | name | string min 1 (when present) | no | — | **validated but never read** — inert in both modes (A.1 finding 2); create mode builds the project from identity fields |
| project | location | string | no | — | same inert note |
| project | capacity | number min 0 | no | — | same inert note |
| project | status | enum active/inactive/planning/completed | no | — | same inert note |
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
| products | campId | string | no | `\|\| defaultCampId` | null when tenant has ≠1 project (A.2 U5) |
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
| menu.meals | id | string | no | `meal_`+uuid12 | → `meals` + `meal_lang` (`lang='en'`) |
| menu.meals | name | string min 1 | yes | — | — |
| menu.meals | mealCategoryId | string | no | — | used verbatim, **no existence check** (blind — dangling id can 500, A.2 K4) |
| menu.meals | categoryName | string | no | — | resolved via map; **unknown → null, no error** (asymmetric with rooms/ratePlans) |
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

Reference-resolution asymmetry (A.1 finding 4, handler-verified): unknown
`productName` → 400 for rooms (:296–298) and ratePlans (:347–349); unknown
`categoryName` → null with no error for meals (:414–415).
`rate_plans.camp_id` comes from the referenced product's camp (`p.camp_id`
in the SELECT, :355–358) — no manifest key feeds it. Duplicate product names:
last imported row wins the name map; imported names beat pre-existing ones
(:249–288). `defaultCampId` is null unless the tenant owns exactly one
non-deleted project (:200–203): with 0 or 2+ projects, products import with
`camp_id` null silently while every room 404s.

## 3. Tenant-type matrix (A.3 — handler-verified, never assumed)

`runImport` (:187–477) contains **zero branches on tenant type** — the only
`type` writes on the import path are the product-column INSERT (:259/:267)
and the create-mode tenant/project writes (:567–569/:584–586). Consequence:
every data section behaves byte-identically for every tenant; the type value
only matters at create-mode provisioning. `restaurant-only` and
`curated-listing` match **zero** hits repo-wide (`git grep`) — they exist on
no enum anywhere.

Identity `type` verdict (pre-table): `camp` (also the Zod default), 
`supermarket`, `transportation` accepted; `restaurant-only` and
`curated-listing` are **TI — 400 `validationError`** at :532–533 (before the
super-admin check) with a second barrier behind it, the D1
`CHECK (type IN ('camp','supermarket','transportation','other'))`
(`0001_core.sql:19`). Omitted → `camp`. (Wider enums elsewhere —
`tenants.js:19`, `camps.js:43` — accept `restaurant`/`custom`, but the import
handler is narrower; bare `restaurant` 400s here too.)

| Section | camp | supermarket | transportation | restaurant-only | curated-listing |
|---|---|---|---|---|---|
| tenant | O | O | O | O† | O† |
| project | I | I | I | I† | I† |
| products | O | O | O | O† | O† |
| rooms | O | O | O | O† | O† |
| ratePlans | O | O | O | O† | O† |
| menu.categories | O | O | O | O† | O† |
| menu.meals | O | O | O | O† | O† |
| posUsers | O | O | O | O† | O† |

Legend: **O** = optional, accepted and processed identically for every type
(all sections `.optional()`); **I** = schema-valid but never read
(`data.project` has zero references in the handler); **M** = mandatory —
**zero cells**, stated explicitly. **†** = fill-mode path only: the tenant's
type value never reaches the handler there (`scope.tenantId` at :606–608,
zero type reads in `runImport`), so these cells restate the identical rules,
not an assumption. 40 cells: O = 35, I = 5 (project row), in-matrix TI = 0
(TI lives in the identity pre-table: 2 values), M = 0.
Per-section evidence (branch reads): tenant COALESCE :206–245; products
defaults `base_price||0 / capacity||1 / type||'retail' / camp_id||defaultCampId`
:261–267; rooms guard :312–337 with `room.camp_id` :302 dead (key stripped by
`.strip()` — rooms always land in `defaultCampId`); ratePlans guard :353–374;
categories/meals inserts :384–394/:421 with no type predicate; posUsers
`role||'cashier'`, store fallback :441–447, GENERATED-name insert :451–462,
dup 409 :468–470.

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

Each file covers all 85 A.1 leaf fields, resolves rooms/ratePlans through
both `productName` and `productId`, meals through `categoryName` and direct
`mealCategoryId`, and uses https-only image URLs (no R2 involved). The older
`docs/examples/tenant-manifest.example.json` remains the minimal fill-mode
sample (no `identity`; its `project` and `images` blocks are inert/stripped —
documented, not gaps). The A.4 files carry a stripped `_note` explaining the
`type: 'other'` + `businessType` workaround and the
campId/categoryId/storeId placeholder guidance.

## 5. Validator CLI

`scripts/validate-manifest.mjs` (zero-dep, sole import `node:fs`; A.5)
mirrors A.1 in the same wire order the handler uses: camelCase → deep
`toSnake()` (same regex as `backend/src/utils/response.js`) → snake_case
rules (all sections optional; caps 200/200/200/50/200/100; dangling rooms /
ratePlans `product_name` → ERROR; dangling meals `category_name` → WARNING
only; `rooms[].camp_id` accepted-but-stripped, never an error; unknown keys
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

Round-trip evidence (A.6, staging `acaciacamp` reads only, file to /tmp never
committed): export exit 0
`{products:4, rooms:2, ratePlans:1, mealCategories:2, meals:2, posUsers:0}` +
validate exit 0 VALID. Five fields do **not** survive a round trip (no fix —
recorded in `.opencode/audits/BLOCKED-manifest-roundtrip.md`):

1. `products[].type` — `GET /api/products` SELECT (`camps.js:484-490`) omits
   the column although values exist; re-import defaults to `retail`, so a
   `type=room` product round-trips as `retail` (4/4 staging, 42/42 local).
2. `posUsers[].password` — bcrypt is one-way; no GET returns plaintext, so
   export always emits `posUsers: []` without a JWT note (re-importing hashes
   would double-hash). Proven live: import `rt6pass123` → 200 → export `[]`.
3. `rooms[].roomStatus / cleaningStatus` — readable via `GET /api/rooms` but
   the import schema has no such fields; dropped on re-import.
4. `menu.categories[]` rows without a lang name — `GET /api/meal-categories`
   returns `name: null` for legacy rows lacking `meal_categories_lang`;
   import requires `name`, so the exporter skips them with a warning.
5. `project{}` — export-readable but import-inert (A.1 finding 2).

Blocking note (A.6 B1): on a D1 ledger at/after
`0107_enforce_not_null_other_tables` / `0108_add_meals_project_id`, the
handler's products/categories/meals INSERTs (which never bind `project_id`,
then-NOT NULL without default) 500 — `posUsers`-only imports still 200.
Whether staging/prod enforce those migrations is unknown (Cloudflare API
unreachable from the audit sandbox); check the remote ledger before a bulk
import.

## 7. Images, errors, and the top-10 mistakes

Image rule (`resolveImage` :38–58): `data:image/(jpg|jpeg|png|webp|gif);
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
`counts = { products, rooms, ratePlans, mealCategories, meals, posUsers }`)
· 201 create-mode (`{ …200, created }`) · 400 Zod / unknown `productName` /
bad-or-taken subdomain / taken admin email · 401 no tenant context in
fill mode · 403 truthy `identity` from a non-super-admin (only when the
identity block itself is valid — else 400, §1) · 404 per-room/per-plan guard
miss (no matching tenant camp/product) · 409 POS-org missing (only when
`ensureTenantOrg` returns falsy — it auto-creates org+store+mapping with
`INSERT OR IGNORE` in both modes, A.2 U10) or duplicate SKU/ID/email/username
· 405 non-POST (`Method not allowed`) · 500 thrown non-UNIQUE DB errors
(`Failed to create products…` / `Failed to create POS users…`, else generic
`Failed to import tenant data`). Admin panel entry: top-level **Import** nav
tab (`AdminApp.tsx` id `'import'` — not inside Settings, A.2 F4), with
paste / Load-from-file / per-section-counts preview / Import /
counts-breakdown toast (`TenantImportPanel.tsx`).

Top-10 mistakes (every item handler-verified in A.2):

1. **Shipping `identity` inside a tenant-admin manifest.** Any truthy
   `identity` flips into create mode and fails — keep the two manifest kinds
   in separate files.
2. **Expecting the `project` block to set the camp.** Validated, never read,
   inert in both modes (A.2 F1/A1). Create the camp in the Camps panel first;
   in create mode the project comes from identity fields.
3. **Sending `rooms[].campId` to place rooms.** No `camp_id` in the rooms Zod
   object + `.strip()` means the key never survives; the `:302` read is dead
   — rooms always land in `defaultCampId` (A.1 finding 3).
4. **Referencing a `productName` that isn't imported or owned.** Rooms and
   ratePlans 400 on unknown names; pre-create the products or fix the names
   (dup names: last imported wins, A.2 U4).
5. **Assuming an unknown `categoryName` fails.** It stores null silently —
   the opposite asymmetry from (4). Prefer explicit `mealCategoryId` you have
   verified, or accept the null.
6. **Sending a junk `logoUrl` expecting null-or-keep.** Tenant logo/favicon/
   hero store the raw sent string verbatim on invalid input (A.2 F3).
   Validate URLs client-side or omit the field.
7. **Sending `""` to clear a tenant field.** Text fields bind with `||` into
   `COALESCE`, so empty string counts as omitted and the old value is kept —
   the import cannot clear a field to empty (only `capacity` uses `??`).
8. **Expecting `products[].type` to survive export→import.** The products GET
   omits the column; re-import defaults `retail` (A.6 loss 1).
9. **Assuming all-or-nothing.** Per-section `DB.batch` calls, no
   cross-section transaction — a later section's failure leaves earlier
   sections' rows behind (only R2 uploads roll back, A.2 K6/U1).
10. **Looking for Tenant Import under Settings.** It is the top-level Import
    tab (A.2 F4). Bonus: non-POST callers get 405, and the subdomain 400 text
    says "3-63 chars" while 1-char subdomains actually pass (A.2 U8/U9).
