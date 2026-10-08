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
  - "[[10-tenant-import/README]]"
  - "[[98-history/merged/audit-2026-09-30-tenant-manifest-types]]"
code-references:
  - "backend/src/api/tenant-import.js:13-22"
  - "backend/src/api/tenant-import.js:102-207"
  - "backend/src/api/tenant-import.js:319-338"
  - "backend/src/api/tenant-import.js:368"
  - "backend/src/api/tenant-import.js:451-523"
  - "backend/src/api/tenant-import.js:941-946"
  - "backend/migrations/0001_core.sql:19"
  - "backend/src/api/tenants.js:19"
  - "backend/src/api/camps.js:43"
  - "backend/migrations/0001_core.sql"
  - "docs/10-tenant-import/tenant-import-schema.md"
verified: never
---
# Tenant Import — tenant-type matrix

> Which of the 8 manifest sections actually does anything for each of the 5 tenant types, with
> the handler-branch evidence behind every cell. Part of the [[tenant-import]] set.
## 3. Tenant-type matrix (A.3 — handler-verified, never assumed)

`runImport` (**`tenant-import.js:368`**, not `:239–742`) contains **zero branches
on tenant type** — the only `type` writes on the import path are the
product-column INSERT (`:587`), the project-column UPDATE/INSERT (`:483`, `:505`)
and the create-mode tenant/project writes. Consequence: every data section
behaves byte-identically for every tenant; the type value only matters at
create-mode provisioning.
`restaurant-only` and `curated-listing` match **zero** hits repo-wide
(`git grep`) — they exist on no enum anywhere.

Identity `type` verdict (pre-table): `camp` (also the Zod default), 
`supermarket`, `transportation` accepted; `restaurant-only` and
`curated-listing` are **TI — 400 `validationError`** at
`tenant-import.js:941-942` (`identitySchema.safeParse` → `validationError`, which runs
BEFORE the super-admin role check at `:945-946`) with a second barrier behind it, the D1
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
type value never reaches the handler there (zero type reads anywhere in
`runImport`), so these cells restate the identical rules, not an
assumption. 40 cells: O = 40, I = 0, in-matrix TI = 0 (TI lives in the
identity pre-table: 2 values), M = 0.

> **Evidence note 2 below contradicted this legend and was wrong.** It claimed
> `runImport` "contains zero references to `data.project`", "re-verified by grep
> this session". That grep was a false negative: `tenant-import.js:451` is
> `if (data.project) {` and `:452` is `const p = data.project;`, inside
> `runImport` itself (`:368`), which both modes call. Note 2 is corrected in
> place — the legend above and §2 of `tenant-import-schema.md` were the correct
> halves all along.
Per-section evidence (branch reads): tenant COALESCE `:533-560`; project
upsert/insert `:451-510`; products defaults `base_price||0 / capacity||1 /
type||'retail' / camp_id||defaultCampId` `:579-587`; rooms guard `:640-668` with
`room.camp_id` **`:631` dead** (key stripped by `.strip()` — rooms always land in
`defaultCampId`); ratePlans guard `:685-706`; categories insert `:715-730` / meals
insert with no type predicate; posUsers `role||'cashier'`, store fallback
`:819-822`, GENERATED-name insert `:826-840`, dup 409 `:846-848`.

### Per-section evidence notes (branch reads, never assumption)

1. **tenant (O × 5).** Schema `:103-124` (`}).optional()` at `:124`). Update block
   `:533-560` binds every field with `||`/`??` into `COALESCE` — omitted keeps existing,
   no field is required, no branch reads any tenant type. Applies to all 20 columns; †
   columns add only that the existing-tenant path never loads the tenant's type.
2. **project (O × 5).** Schema `.optional()` at :92. **WRITTEN, not inert.** This note
   previously read `I × 5` and claimed "zero references to `data.project` (A.2 F1,
   re-verified by grep this session)" — a false negative. `runImport` opens the
   section at `tenant-import.js:451` (`if (data.project) {`) and reads the payload at
   `:452`, then runs a two-branch writer: if the tenant owns a live project it
   COALESCEs an UPDATE onto the tenant's **oldest** live project (`:456-492`), else it
   INSERTs `proj_`+uuid12 (`:498-509`). The block runs BEFORE default-camp resolution
   (`:512-515`) so products and rooms written later in the same import attach to it via
   `resolvedProjectId` (`:523`). **Both modes call it**; in identity mode it updates the
   project the identity block already created, so one INSERT + one UPDATE, never two
   projects. Type-agnostic — no branch reads any tenant `type`. The correct count is
   **O × 5**, which is what the legend above and §2 of `tenant-import-schema.md`
   already said.
3. **products (O × 5).** Array `:132-145` (`.max(200).optional()` at `:145`). Only `name`
   is required (`:134`). Runtime defaults (`base_price || 0`, `capacity || 1`,
   `type || 'retail'`, `camp_id || defaultCampId`, `is_active !== undefined ? v : 1`) are
   all bound in the single INSERT at `:579-588` — no type branch. `type` here is the
   PRODUCT enum (`room|menu|buffet|retail`, `:143`), not the tenant type. A `campId` that
   does not resolve is a pre-flight 400 at `:419-425`, before any write. Duplicate
   SKU/ID → 409 (`:599-600`) for every type.
4. **rooms (O × 5).** Array `:146-166` (`.max(200).optional()` at `:166`). Only `name`
   required (`:148`). Unknown `productName` → 400 (`:625-626`); guarded `INSERT…SELECT` →
   per-room 404 when the camp/product guard matches nothing (`:664-668`); `defaultCampId`
   null unless exactly one non-deleted project (`:512-515`). All type-agnostic — the guard
   predicates on `projects.id`/`tenant_id` and `pos_products.id`/`tenant_id`, never on any
   type column. The `room.camp_id` read at `:631` is dead (the rooms Zod object
   `:146-166` has no `camp_id` and `manifestSchema` is `.strip()` — A.1 finding 3), so
   rooms always land in `defaultCampId` for every type.
5. **rate_plans (O × 5).** Array `:167-178` (`.max(200).optional()` at `:178`). `name`
   (`:171`) and strictly-positive `price_per_night` (`:172`) required — the only
   strictly-positive field in the manifest. Unknown `productName` → 400 (`:680-681`);
   guarded `INSERT…SELECT` → 404 (`:702-706`); `camp_id` inherited from the referenced
   product (`p.camp_id` in the SELECT, `:689`, A.2 U3). No type branch.
6. **menu.categories (O × 5).** Array `:180-183` (`.max(50).optional()` at `:183`). Only
   `name` required (`:181`). Inserts into `meal_categories` (`:721`) +
   `meal_categories_lang` (`:726`) with no type predicate.
7. **menu.meals (O × 5).** Array `:184-193` (`.max(200).optional()` at `:193`). Only
   `name` required (`:186`). **Unknown `categoryName` → 400 before any write** — this note
   previously said "→ null, no error", citing the pre-pre-flight behaviour. The pre-flight
   is `unresolvableMealCategory` (`:319-338`), which resolves names against this manifest's
   own `menu.categories[].name` **plus** the categories the tenant already owns and returns
   a rejection string at `:334-335`; the route calls it before the shell is created, so a
   bad name writes nothing at all. An explicit `mealCategoryId` is skipped by the pre-flight
   and bound verbatim with no existence check — that half is still blind, and it is the
   asymmetry that remains. Identical across all 5 tenant types.
8. **pos_users (O × 5).** Array `:195-206` (`.max(100).optional()` at `:206`). Required:
   `email` (`:196`), `password` ≥ 8 (`:198`), `first_name` (`:199`), `last_name` (`:200`);
   `name` is GENERATED so the INSERT at `:826-839` lists first/last only. `role` defaults
   to `'cashier'` (`:837`), `store_id` falls back to the org's first store else null
   (`:819-822`). Duplicate email/username → 409 (`:846-848`). No type branch.
9. **† columns (restaurant-only / curated-listing data sections).** No assumption is
   involved: the existing-tenant path derives `tenantId` from `scope.tenantId` and calls
   `importTenantManifest` (`:879`) whose schema (`manifestSchema :102-207`) has no type
   field and whose `runImport` (`:368`) has no type read. A tenant carrying such a label (settable only
   outside this handler — e.g. `tenants.js:19` accepts `restaurant`/`custom`, never the
   exact `-only`/`curated-` strings, which match nothing repo-wide) would still import
   every section under the identical rules above. The TI verdict applies strictly to
   identity-mode provisioning (pre-table), where the value IS validated.
