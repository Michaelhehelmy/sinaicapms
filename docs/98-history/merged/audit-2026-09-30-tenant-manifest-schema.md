---
title: "Tenant-import Zod schema — field-by-field reference (2026-09-30, mani-a1-schema)"
aliases:
tags:
  - type/audit
  - audience/developer
  - audience/historian
  - domain/tenant-import
  - domain/audit
  - status/merged
created: 2026-09-30
updated: 2026-10-06
superseded-by: "[[10-tenant-import/tenant-import-schema]]"
relates-to:
  - "[[98-history/merged/README]]"
  - "[[tenant-import-schema]]"
  - "[[audit-2026-09-30-tenant-manifest-gaps]]"
  - "[[audit-2026-09-30-tenant-manifest-types]]"
code-references:
  - "backend/src/api/tenant-import.js"
  - "docs/examples/tenant-manifest.example.json"
verified: never
---
# Tenant-import Zod schema — field-by-field reference (2026-09-30, mani-a1-schema)

Parent: Manifest audit 2026-09-30 — A.1 schema extract. Docs only; no source touched.

## Source

- `backend/src/api/tenant-import.js` — full 619-line read + Zod grep, this session.
- Schemas: `identitySchema` (:12–21) + `manifestSchema` (:64–160). Both end in `.strip()`.
- Wire contract: caller sends **camelCase** → `toSnake()` → these **snake_case** Zod keys
  (`importTenantManifest` :493, route wrapper :528/:591/:608). Zod failure → `validationError` → 400
  `{ success:false, error, errors:[{field,message}] }`.
- **Default column** = Zod-level default. Handler runtime fallbacks (`|| 0`, `|| 'retail'`,
  `COALESCE`, generated ids, … in `runImport` :187–477) are recorded in Notes and are NOT Zod defaults.
- Array caps are Zod `.max()` on the array: products 200, rooms 200, rate_plans 200,
  menu.categories 50, menu.meals 200, pos_users 100.
- **Field count: 85 leaf fields** (identity 8 + tenant 20 + project 4 + products 12 + rooms 11 +
  rate_plans 10 + menu.categories 2 + menu.meals 8 + pos_users 10).

## Full table (Section | Field = Zod snake_case key | Type | Required | Default | Notes incl. wire camelCase)

| Section | Field | Type | Required | Default | Notes |
|---|---|---|---|---|---|
| identity | name | string min(1) | yes | — | wire `name`; "Tenant name is required"; → tenants.name + identity-mode default project name |
| identity | subdomain | string min(1) | yes | — | wire `subdomain`; + handler regex `/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/` (1 char or 3–63; 2-char rejected) + subdomain/admin-email uniqueness 400s |
| identity | type | enum camp\|supermarket\|transportation\|other | no | `camp` (Zod) | wire `type`; → tenants.type, business_type fallback, projects.project_type |
| identity | email | string email | yes | — | wire `email`; "Valid admin email is required"; admins uniqueness 400 |
| identity | password | string min(8) | yes | — | wire `password`; bcrypt via hashPassword; new admin role='admin', is_active=1 |
| identity | first_name | string min(1) | yes | — | wire `firstName` |
| identity | last_name | string min(1) | yes | — | wire `lastName` |
| identity | business_type | string | no | — | wire `businessType`; handler `id.business_type \|\| id.type` into tenants.business_type |
| tenant | name | string | no | — | wire `name`; COALESCE over existing row |
| tenant | logo_url | string | no | — | wire `logoUrl`; via resolveImage (base64→R2→`/api/media/…`, http(s)//api-media passthrough, else null) then `logoUrl \|\| t.logo_url \|\| null` |
| tenant | favicon_url | string | no | — | wire `faviconUrl`; same resolveImage pipeline as logo_url |
| tenant | primary_color | string | no | — | wire `primaryColor`; COALESCE |
| tenant | footer_text | string | no | — | wire `footerText`; COALESCE |
| tenant | location | string | no | — | wire `location`; COALESCE |
| tenant | whatsapp_number | string | no | — | wire `whatsappNumber`; COALESCE |
| tenant | phone | string | no | — | wire `phone`; COALESCE |
| tenant | email | string | no | — | wire `email`; COALESCE |
| tenant | description | string | no | — | wire `description`; COALESCE |
| tenant | hero_image_url | string | no | — | wire `heroImageUrl`; same resolveImage pipeline as logo_url |
| tenant | gallery_images | string | no | — | wire `galleryImages`; JSON-encoded string stored verbatim |
| tenant | about_text | string | no | — | wire `aboutText`; COALESCE |
| tenant | faq_items | string | no | — | wire `faqItems`; JSON-encoded string stored verbatim |
| tenant | reviews | string | no | — | wire `reviews`; JSON-encoded string stored verbatim |
| tenant | map_embed_url | string | no | — | wire `mapEmbedUrl`; COALESCE |
| tenant | activities | string | no | — | wire `activities`; JSON-encoded string stored verbatim |
| tenant | capacity | number | no | — | wire `capacity`; handler `t.capacity ?? null` |
| tenant | currency | string | no | — | wire `currency`; COALESCE |
| tenant | menu_config | string | no | — | wire `menuConfig`; JSON-encoded string stored verbatim |
| project | name | string min(1) | no | — | wire `name`; min applies when present. NOTE: `data.project` is never read in runImport (no reference anywhere in file) — validated but inert in existing-tenant mode; identity mode builds the default project from identity fields instead |
| project | location | string | no | — | wire `location`; same inert note as project.name |
| project | capacity | number min(0) | no | — | wire `capacity`; same inert note as project.name |
| project | status | enum active\|inactive\|planning\|completed | no | — | wire `status`; same inert note as project.name |
| products | id | string | no | — | wire `id`; handler default `prod_`+uuid12; duplicate ID → 409 |
| products | name | string min(1) | yes | — | wire `name`; "Product name is required"; also keys the productNameToId map for rooms/ratePlans refs |
| products | sku | string | no | — | wire `sku`; handler default `PROD-`+PID upper; duplicate SKU → 409 |
| products | base_price | number min(0) | no | — | wire `basePrice`; handler `item.base_price \|\| 0` → pos_products.selling_price |
| products | capacity | number min(1) | no | — | wire `capacity`; handler `item.capacity \|\| 1`; feeds rooms max_guests fallback |
| products | description | string | no | — | wire `description`; `→ null` when omitted |
| products | short_description | string | no | — | wire `shortDescription`; `→ null` when omitted |
| products | image_url | string | no | — | wire `imageUrl`; resolveImage pipeline; `→ null` when omitted/unresolvable |
| products | category_id | string | no | — | wire `categoryId`; `→ null` when omitted |
| products | is_active | number | no | — | wire `isActive`; handler `!== undefined ? v : 1` |
| products | type | enum room\|menu\|buffet\|retail | no | — | wire `type`; handler default `'retail'` (Zod has no default here) |
| products | camp_id | string | no | — | wire `campId`; handler `\|\| defaultCampId` (sole non-deleted project id, else null) |
| rooms | id | string | no | — | wire `id`; handler default `room_`+uuid12; lands in `rooms_new` via guarded INSERT…SELECT |
| rooms | name | string min(1) | yes | — | wire `name`; "Room name is required" |
| rooms | product_id | string | no | — | wire `productId`; direct FK reference (must be tenant's product or 404 guard) |
| rooms | product_name | string | no | — | wire `productName`; resolved via imported + existing tenant products; unknown → 400 |
| rooms | floor | string \| number | no | — | wire `floor`; handler `String(room.floor)`, null when undefined |
| rooms | status | string | no | — | wire `status`; handler default `'available'` (free-form, no enum) |
| rooms | bed_type | string | no | — | wire `bedType`; `→ null` when omitted |
| rooms | max_guests | number | no | — | wire `maxGuests`; defaults to referenced product capacity, else 2 |
| rooms | base_price | number | no | — | wire `basePrice`; null when undefined (no min constraint) |
| rooms | notes | string | no | — | wire `notes`; `→ null` when omitted |
| rooms | is_active | number | no | — | wire `isActive`; handler `!== undefined ? v : 1` |
| rate_plans | id | string | no | — | wire `id`; handler default `rp_`+uuid12; lands in `rate_plans_new` via guarded INSERT…SELECT |
| rate_plans | product_id | string | no | — | wire `productId`; must be tenant's product or 404 guard |
| rate_plans | product_name | string | no | — | wire `productName`; resolved via map; unknown → 400 |
| rate_plans | name | string min(1) | yes | — | wire `name`; "Rate plan name is required" |
| rate_plans | price_per_night | number positive | yes | — | wire `pricePerNight`; "Price must be positive" (only strictly-positive field in manifest) |
| rate_plans | start_date | string | no | — | wire `startDate`; handler `\|\| null` |
| rate_plans | end_date | string | no | — | wire `endDate`; handler `\|\| null` |
| rate_plans | season | string | no | — | wire `season`; handler `\|\| 'all'` (free-form, no enum) |
| rate_plans | min_stay | number | no | — | wire `minStay`; handler `\|\| 1` |
| rate_plans | is_active | number | no | — | wire `isActive`; handler `!== undefined ? v : 1` |
| menu.categories | name | string min(1) | yes | — | wire `name`; "Category name is required"; → meal_categories + meal_categories_lang (lang='en'); keys categoryNameToId map |
| menu.categories | position | number | no | — | wire `position`; handler `cat.position \|\| 0` |
| menu.meals | id | string | no | — | wire `id`; handler default `meal_`+uuid12; → meals + meal_lang (lang='en') |
| menu.meals | name | string min(1) | yes | — | wire `name`; "Meal name is required" |
| menu.meals | meal_category_id | string | no | — | wire `mealCategoryId`; direct category reference |
| menu.meals | category_name | string | no | — | wire `categoryName`; resolved via map; unknown → null (NO 400, unlike rooms/ratePlans) |
| menu.meals | price | number min(0) | no | — | wire `price`; handler `meal.price \|\| 0` |
| menu.meals | description | string | no | — | wire `description`; → meal_lang, null when omitted |
| menu.meals | image_url | string | no | — | wire `imageUrl`; resolveImage pipeline; `→ null` when omitted/unresolvable |
| menu.meals | is_active | number | no | — | wire `isActive`; handler `!== undefined ? v : 1` |
| pos_users | email | string email | yes | — | wire `email`; "Valid email is required"; duplicate → 409; INSERT first_name/last_name only (`name` is GENERATED) |
| pos_users | username | string | no | — | wire `username`; handler defaults to email; duplicate → 409 |
| pos_users | password | string min(8) | yes | — | wire `password`; bcrypt via hashPassword |
| pos_users | first_name | string min(1) | yes | — | wire `firstName`; "First name is required" |
| pos_users | last_name | string min(1) | yes | — | wire `lastName`; "Last name is required" |
| pos_users | phone | string | no | — | wire `phone`; `→ null` when omitted |
| pos_users | role | enum cashier\|manager\|admin | no | — | wire `role`; handler default `'cashier'` (Zod has no default here) |
| pos_users | department | string | no | — | wire `department`; `→ null` when omitted |
| pos_users | employee_id | string | no | — | wire `employeeId`; `→ null` when omitted |
| pos_users | store_id | number int | no | — | wire `storeId`; handler defaults to org's first pos_stores id, nullable when org has no store |

## Schema-level findings (read-only — no code changes per mission)

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
