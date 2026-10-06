---
title: "Tenant-import tenant-type coverage matrix (2026-09-30, mani-a3-matrix)"
aliases:
tags:
  - type/audit
  - audience/developer
  - domain/tenant-import
  - domain/audit
  - status/merged
created: 2026-09-30
updated: 2026-10-06
relates-to:
  - "[[98-history/merged/README]]"
  - "[[tenant-import-types]]"
  - "[[audit-2026-09-30-tenant-manifest-gaps]]"
  - "[[audit-2026-09-30-tenant-manifest-schema]]"
code-references:
  - "backend/src/api/tenant-import.js"
  - "backend/migrations/0001_core.sql:19"
  - "backend/src/api/tenants.js:19"
  - "backend/src/api/camps.js:43"
  - "backend/migrations/0001_core.sql"
verified: never
---
# Tenant-import tenant-type coverage matrix (2026-09-30, mani-a3-matrix)

Parent: Manifest audit 2026-09-30 — A.3 type matrix. Docs only; no source touched.

## Baseline + sources

- Baseline `3dfd63d` confirmed pushed before write (`git ls-remote origin main` ==
  `git rev-parse HEAD` == `3dfd63d`; tracked tree dirty only with pre-existing
  package-lock/package.json mods + untracked spec/scratch — staged just the 2 files).
- Read: full `backend/src/api/tenant-import.js` (619 lines, this session) + A.1 schema doc
  (`docs/audit-2026-09-30-tenant-manifest-schema.md`, 85 leaf fields) + A.2 gap doc
  (`docs/audit-2026-09-30-tenant-manifest-gaps.md`) + `docs/tenant-import.md` type line
  (:27 `camp|supermarket|transportation|other`) + D1 schema
  (`backend/migrations/0001_core.sql:19`) + wider vocabs (`backend/src/api/tenants.js:19`,
  `backend/src/api/camps.js:43`) for contrast only — the matrix is handler-verified.
- Method: every cell backed by a handler branch read. `runImport` (:187–477) contains
  ZERO branches on tenant type (verified by grep: the only `type` writes in the import
  path are the product `type` column INSERT :259 + default `item.type || 'retail'` :267,
  and the identity-mode tenant/project writes :567–569/:584–586). Line refs below are
  `tenant-import.js` unless noted.
- Repo-wide `git grep` for `restaurant-only` / `curated-listing` returns ZERO hits:
  neither string exists anywhere in code, docs, or schema. They are not valid values
  on any type enum in the repo.

## Cell legend

- **O (optional)** — section is `.optional()` in `manifestSchema`; accepted and processed
  identically regardless of tenant type (no type-discriminating branch).
- **I (ignored)** — section is schema-valid but never read by `runImport` in any mode.
- **TI (type-inappropriate)** — the handler cannot provision/process this combination:
  schema-rejected (400) and/or D1 CHECK-rejected. Evidence cited per cell.
- **M (mandatory)** — handler errors unless the section is present. **Zero cells.**
  All seven manifest sections are `.optional()` (:86, :92, :106, :119, :131, :147,
  :159); `{}` parses (A.1 finding 1). Stated explicitly per mission rule.

## Pre-table — identity provisioning (the type selector itself)

| `identity.type` sent | Handler verdict | Evidence |
|---|---|---|
| `camp` | Accepted (also the Zod default) | :15 `z.enum(['camp','supermarket','transportation','other']).default('camp')` → tenants INSERT :567–569 + projects `project_type` INSERT :584–586 |
| `supermarket` | Accepted | Same enum :15; stored verbatim into `tenants.type`/`business_type` fallback and `projects.project_type` (:569, :586) |
| `transportation` | Accepted | Same enum :15; same two writes |
| `restaurant-only` | **TI — 400 `validationError`** | Not in :15 enum → `identitySchema.safeParse` fails at :532–533, before the super-admin check (:536–538). Second barrier: D1 `CHECK (type IN ('camp','supermarket','transportation','other'))` (`0001_core.sql:19`) would reject it even if Zod passed. Contrast (not handler): `tenants.js:19` accepts `restaurant`/`custom`, `camps.js:43` lists `restaurant` — the import handler is narrower, and bare `restaurant` 400s here too |
| `curated-listing` | **TI — 400 `validationError`** | Same two barriers as `restaurant-only` (:15 enum fail at :532–533; CHECK at `0001_core.sql:19`) |
| (omitted) | Accepted as `camp` | Zod `.default('camp')` at :15 |

## Matrix — 5 types × 8 manifest sections

`menu` is split into `categories` / `meals` (A.1 field counts). `†` = existing-tenant
path only: the type value never reaches the handler there (`scope.tenantId` at :606–608,
zero type reads in `runImport`), so these cells describe what the handler does with the
section for a tenant of that nominal type — which is byte-identical to every other column.

| Section | camp | supermarket | transportation | restaurant-only | curated-listing |
|---|---|---|---|---|---|
| tenant | O (:65–86 opt; COALESCE :212–244) | O (same) | O (same) | O† (same; no type branch) | O† (same; no type branch) |
| project | I (validated :87–92, never read — A.2 F1/A1) | I (same) | I (same) | I† (same) | I† (same) |
| products | O (:93–106 opt; `name` required :95) | O (same) | O (same) | O† (same) | O† (same) |
| rooms | O (:107–119 opt; `name` required :109; guard :312–337) | O (same) | O (same) | O† (same) | O† (same) |
| rate_plans | O (:120–131 opt; `name` :124 + `price_per_night` :125 required; guard :353–374) | O (same) | O (same) | O† (same) | O† (same) |
| menu.categories | O (:133–136 opt; `name` required :134) | O (same) | O (same) | O† (same) | O† (same) |
| menu.meals | O (:137–146 opt; `name` required :140; unknown `categoryName`→null :415) | O (same) | O (same) | O† (same) | O† (same) |
| pos_users | O (:148–159 opt; email/password/first/last required :149–153; store fallback :441–447) | O (same) | O (same) | O† (same) | O† (same) |

## Per-section evidence notes (branch reads, never assumption)

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

## Counts

- Matrix cells: 40 (5 types × 8 sections). Statuses: O = 35 (7 optional rows × 5),
  I = 5 (project row × 5), TI = 0 in-matrix (TI lives in the pre-table:
  2 values × identity provisioning), M = 0 — stated explicitly, none empty.
- Identity pre-table: 6 rows (3 accepted + 2 TI + 1 default). Nothing left unstated.
