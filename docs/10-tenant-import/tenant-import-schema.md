---
title: "Tenant Import — manifest schema reference"
aliases:
  - "tenant-import"
tags:
  - type/reference
  - audience/developer
  - domain/tenant-import
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[tenant-import]]"
  - "[[tenant-import-types]]"
  - "[[tenant-import-appendix]]"
  - "[[docs/10-tenant-import/README]]"
  - "[[docs/98-history/merged/audit-2026-09-30-tenant-manifest-schema]]"
code-references:
  - "backend/src/api/tenant-import.js"
  - "backend/tests/tenant-import-smoke.test.js"
  - "backend/tests/tenant-import.test.js"
  - "backend/src/utils/response.js"
  - "docs/examples/tenant-manifest.example.json"
  - "scripts/validate-manifest.mjs"
verified: never
---
# Tenant Import — manifest schema reference

> The 88-leaf-field manifest schema table, the D1 `IN (…)` probe caps, and the 2026-09-30
> schema-level findings. Part of the [[tenant-import]] set.
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
(`too many SQL variables at offset N`). Both go through one helper,
`probeIdsInBatches`, which derives the batch size from that ceiling
(`100 − fixedBinds − 5` headroom = **94 ids + `tenant_id` = 95 binds**) instead
of hard-coding a step. Deriving it is the point: a literal `i += 50` keeps
working until someone raises an array cap, and then the probe silently drifts
back over the ceiling. Both callers `SET`-de-duplicate first, so a manifest
repeating an id does not spend binds twice:

| Probe | Placeholder | Binds per statement | Batched? |
|---|---|---|---|
| `campId` resolvability | the **distinct** `campId` values across every section that accepts one | 94 ids + `tenant_id` = **95** | yes — `products[]` caps at 200, so a single `IN (…)` would have traded the clean 400 for an opaque 500 on a large manifest |
| explicit `menu.meals[].id` ownership | the **distinct** explicit meal ids | 94 ids + `tenant_id` = **95** | yes — `menu.meals` caps at 200, so a manifest authoring an id on every meal binds 201 values in one query |

> The second row **used to be un-batched and un-deduplicated** (up to 200
> binds), which was documented as a known latent exposure. Migration 0127 closed
> both while reshaping the probe's scope — see below.

#### Why the array caps stay at 200 (the "or 1000" question, answered)

The natural follow-up to "the probe batches" is "so raise the caps". **Don't,
and the probe was never the binding constraint.** Cloudflare's published D1
limits (verified 2026-10-02) give **100 bound parameters per query** *and*
**1,000 queries per Worker invocation on Paid / 50 on Free**. This repo runs on
the **Free** plan. The write path is where a large manifest breaks, not the
read probe:

- `menu.meals` emits **2 statements per meal** into a single `DB.batch()`, so
  the current cap of 200 already means up to **400 statements** in one
  invocation — against a Free ceiling of **50**.
- Raising `menu.meals` to 1000 would mean **2,000** statements in one batch.

So the caps are already unreachable on Free for the write path, and raising
them makes it strictly worse. Making 1000 work is a *batching* change (split
the meal writes into several `DB.batch()` calls, which also needs a partial
progress story because there is no cross-section transaction — F-A17-02),
not a probe change. That is a separate piece of work and is **not** done here.

> **Known limitation, measured:** a manifest that repeats one `menu.meals[].id`
> **within itself** is invisible to the probe — it asks the *database* who owns
> an id, and a duplicate that exists only in the payload has not been written
> yet. Such a manifest passes the pre-flight and fails the meals `batch()` as
> the generic `500 Import failed: …`, not the precise 409. Pinned by a test
> rather than left implied.

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

### Schema-level findings (2026-09-30 read-only sweep — no code changes)

1. **All 8 top-level sections optional** → `{}` parses (no-op import; still needs POS org or 409).
   `images`/`identity` documentation blocks are stripped by `.strip()` on the import path.
2. **`project` validated but inert**: runImport never reads `data.project` (verified by grep —
   zero references); rooms need exactly one existing project (`defaultCampId`, else the
   INSERT…SELECT guard 404s). Only identity mode creates a project (from identity fields).
3. **Rooms `camp_id` discrepancy**: handler reads `room.camp_id` (:302) but `camp_id` is NOT in
   the rooms Zod object and the schema is `.strip()` → the key never survives validation, so rooms
   always land in `defaultCampId`. (Recorded, not fixed — mission is read-only.)
4. **Reference-resolution asymmetry**: unknown `productName` → 400 (rooms, ratePlans); unknown
   `categoryName` → null (meals, no error).
5. **Image rule** (resolveImage :38–58): `data:image/(jpg|jpeg|png|webp|gif);base64,…` ≤ 8 MB →
   R2 `MEDIA_BUCKET` → `/api/media/…` URL (tracked for rollback on failure); `http(s)` /
   `/api/media/` passthrough; anything else (incl. unbound bucket) → null. Applies to
   tenant logo/favicon/hero, product image_url, meal image_url. No KV writes.
6. **Companion guide**: `docs/tenant-import.md` (§ Sections reference) + sample
   `docs/examples/tenant-manifest.example.json` + gate
   `cd backend && npx vitest run tests/tenant-import-smoke.test.js`.
