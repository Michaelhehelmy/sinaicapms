---
title: "Tenant Import — tenant-type matrix"
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
  - "[[tenant-import-schema]]"
  - "[[tenant-import-appendix]]"
  - "[[docs/10-tenant-import/README]]"
  - "[[docs/98-history/merged/audit-2026-09-30-tenant-manifest-types]]"
code-references:
  - "backend/migrations/0001_core.sql:19"
  - "backend/src/api/tenants.js:19"
  - "backend/src/api/camps.js:43"
  - "backend/migrations/0001_core.sql"
verified: never
---
# Tenant Import — tenant-type matrix

> Which of the 8 manifest sections actually does anything for each of the 5 tenant types, with
> the handler-branch evidence behind every cell. Part of the [[tenant-import]] set.
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

### Per-section evidence notes (branch reads, never assumption)

1. **tenant (O × 5).** Schema `.optional()` at :86 (`}).optional()`). Update block :206–245
   binds every field with `||`/`??` into `COALESCE` — omitted keeps existing, no field is
   required, no branch reads any tenant type. Applies to all 5 columns; † columns add
   only that the path (:606–608) never loads the tenant's type.
2. **project (I × 5).** Schema `.optional()` at :92. `runImport` contains zero references
   to `data.project` (A.2 F1, re-verified by grep this session). Inert in both modes for
   every type; identity mode builds the default project from identity fields (:580–586).
3. **products (O × 5).** Array `.max(200).optional()` at :106. Only `name` is required
   (:95). Runtime defaults (`base_price || 0`, `capacity || 1`, `type || 'retail'`,
   `camp_id || defaultCampId`, `is_active` :261–267) apply uniformly — no type branch.
   `type` here is the PRODUCT enum (`room|menu|buffet|retail`, :104), not the tenant type.
   Duplicate SKU/ID → 409 (:273–276) for every type.
4. **rooms (O × 5).** Array `.max(200).optional()` at :119. Only `name` required (:109).
   Unknown `productName` → 400 (:296–298); guarded `INSERT…SELECT` → per-room 404 when
   the camp/product guard matches nothing (:332–337); `defaultCampId` null unless exactly
   one non-deleted project (:200–203). All type-agnostic — the guard predicates on
   `projects.id`/`tenant_id` and `pos_products.id`/`tenant_id`, never on any type column.
   The `room.camp_id` read at :302 is dead (key stripped by `.strip()` — A.1 finding 3),
   so rooms always land in `defaultCampId` for every type.
5. **rate_plans (O × 5).** Array `.max(200).optional()` at :131. `name` (:124) and
   strictly-positive `price_per_night` (:125) required. Unknown `productName` → 400
   (:347–349); guarded `INSERT…SELECT` → 404 (:368–373); `camp_id` inherited from the
   referenced product (:355–358, A.2 U3). No type branch.
6. **menu.categories (O × 5).** Array `.max(50).optional()` at :136. Only `name`
   required (:134). Inserts into `meal_categories` + `meal_categories_lang` (:384–394)
   with no type predicate.
7. **menu.meals (O × 5).** Array `.max(200).optional()` at :146. Only `name` required
   (:140). Unknown `categoryName` → null, no error (:414–415, A.1 finding 4) — asymmetric
   with rooms/ratePlans but identical across all 5 tenant types.
8. **pos_users (O × 5).** Array `.max(100).optional()` at :159. Required: `email` (:149),
   `password` ≥ 8 (:151), `first_name` (:152), `last_name` (:153); `name` is GENERATED so
   inserts use first/last only (:451–462). `role` defaults to `'cashier'` (:460), `store_id`
   falls back to the org's first store else null (:441–447). Duplicate email/username →
   409 (:468–470). No type branch.
9. **† columns (restaurant-only / curated-listing data sections).** No assumption is
   involved: the existing-tenant path derives `tenantId` from `scope.tenantId` (:606–607)
   and calls `importTenantManifest` (:608) whose schema (:64–160) has no type field and
   whose `runImport` has no type read. A tenant carrying such a label (settable only
   outside this handler — e.g. `tenants.js:19` accepts `restaurant`/`custom`, never the
   exact `-only`/`curated-` strings, which match nothing repo-wide) would still import
   every section under the identical rules above. The TI verdict applies strictly to
   identity-mode provisioning (pre-table), where the value IS validated.
