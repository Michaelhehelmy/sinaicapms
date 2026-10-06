---
title: "Tenant-import doc-vs-code gap analysis (2026-09-30, mani-a2-gaps)"
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
  - "[[docs/98-history/merged/README]]"
  - "[[tenant-import]]"
  - "[[audit-2026-09-30-tenant-manifest-schema]]"
  - "[[audit-2026-09-30-tenant-manifest-types]]"
code-references:
  - "docs/examples/tenant-manifest.example.json"
  - "backend/src/api/tenant-import.js"
  - "backend/src/index.js:244-251"
  - "backend/tests/tenant-import-smoke.test.js"
  - "app/src/components/admin/TenantImportPanel.tsx"
  - "app/src/components/admin/AdminApp.tsx:154"
  - "backend/src/middleware/resolveScope.js:46-79"
verified: never
---
# Tenant-import doc-vs-code gap analysis (2026-09-30, mani-a2-gaps)

Parent: Manifest audit 2026-09-30 — A.2 gap analysis. Docs only; no source touched.

## Baseline + sources

- Baseline `00baf7e` confirmed pushed before write (`git ls-remote origin main` ==
  `git rev-parse HEAD` == `00baf7e`; tracked tree dirty only with pre-existing
  package-lock/package.json mods + untracked spec/scratch — staged just the 2 files).
- Read: `docs/tenant-import.md` (158 lines) +
  `docs/examples/tenant-manifest.example.json` (141 lines) + A.1 schema doc
  (`docs/audit-2026-09-30-tenant-manifest-schema.md`, 85 leaf fields) + full
  `backend/src/api/tenant-import.js` (619 lines) + mount
  (`backend/src/index.js:244-251`, roles `['super_admin','admin']`) + smoke gate
  (`backend/tests/tenant-import-smoke.test.js`, 4 its) + panel
  (`app/src/components/admin/TenantImportPanel.tsx`, paste/file/preview/toast verified).
- Method: every doc claim checked against handler lines; every handler branch
  checked against the doc. Line refs below are `tenant-import.js` unless noted.

## Table 1 — False claims (doc says X, code does Y)

| # | Doc claim (`docs/tenant-import.md`) | Code behavior | Ref |
|---|---|---|---|
| F1 | `project`: "Sets/updates the tenant's default project for camp scoping." | `runImport` never reads `data.project` (zero references in file); the block is validated but inert in BOTH modes. Identity mode builds the default project from identity fields (name/slug/type), ignoring `project`. The doc's own follow-up note ("`project` block is ignored in existing-tenant mode") contradicts the sentence and is itself incomplete (ignored in identity mode too). | :187–477, :580–586 |
| F2 | "Every other caller who includes `identity` gets 403 `Only super-admin can provision new tenants`." | Identity Zod validation (:532–533) runs BEFORE the super-admin role check (:536–538): a malformed `identity` block from a non-super-admin returns 400 `validationError`, not 403. The 403 fires only when the identity block is itself schema-valid. | :531–538 |
| F3 | Images: "Anything else (wrong ext, oversize, malformed data URI, `MEDIA_BUCKET` unbound) resolves to `null`." | True for `product.imageUrl` / `meal.imageUrl` (`imageUrl \|\| null`), but FALSE for tenant `logoUrl`/`faviconUrl`/`heroImageUrl`: the tenant UPDATE binds `logoUrl \|\| t.logo_url \|\| null`, so an invalid sent value falls back to the RAW sent string and is stored verbatim in `tenants` (never nulled). Sending `logoUrl: "not-a-url"` persists `"not-a-url"`. | :208–210, :236 |
| F4 | Usage: "Admin panel (tenant admin): *Settings → Tenant Import*". | The panel is a top-level `Import` nav tab (`AdminApp.tsx` `TENANT_NAV` id `'import'`, label `'Import'`), not a route inside Settings. Paste / Load-from-file / per-section-counts preview / Import / counts-breakdown toast all verified true in `TenantImportPanel.tsx`. | `AdminApp.tsx:154`, `TenantImportPanel.tsx:54-61,186-253` |

## Table 2 — Undocumented (code does, doc silent)

| # | Behavior | Ref |
|---|---|---|
| U1 | R2 rollback on failure: every successfully PUT key is tracked (`uploadedKeys`) and best-effort deleted on ANY failure — deterministic `fail()` or a thrown R2/DB error (F-A17-02). D1 rows are NOT rolled back (the "upload-then-insert-with-cleanup" choice is stated in the code comment). The doc mentions neither half. | :187, :499–518 |
| U2 | Handler runtime defaults (Zod has none here; all via `\|\|`/ternary — the doc lists only ID/SKU/username/store defaults): products `base_price`→0, `capacity`→1, `type`→`'retail'`, `camp_id`→defaultCampId, `is_active`→1; rooms `status`→`'available'`, `max_guests`→referenced-product capacity else 2, `floor`→`String()`; rooms `base_price`→null when omitted (vs products/meals which default 0); ratePlans `season`→`'all'`, `min_stay`→1; menu `position`→0, meal `price`→0; posUsers `role`→`'cashier'`, `username`→email. | :259–268, :304–310, :322–329, :360–364, :387, :423–424, :458–462 |
| U3 | `rate_plans.camp_id` is inherited from the referenced product's camp (`p.camp_id` in the SELECT) — no manifest key feeds it. | :355–358 |
| U4 | Duplicate product names: a later same-name row overwrites `productNameToId` (last wins); pre-existing tenant products are indexed only when the name is not already imported (imported wins). | :249–288 |
| U5 | `defaultCampId` is null unless the tenant has EXACTLY one non-deleted project: with 0 or 2+ projects, products import with `camp_id` null silently while rooms 404 (the guard matches nothing). The doc's project note covers the rooms-404 half; the silent null-camp products half is undocumented. | :200–203, :267 |
| U6 | `posUsers[].store_id` falls back to null when the org has no store; the doc says only "defaults to the org's first store". | :441–447 |
| U7 | Tenant text fields bind with `\|\|` (falsy) into `COALESCE`: an empty-string send is treated as omitted (existing value kept) — the import cannot clear a field to empty. (`capacity` uses `??`, so 0 stores correctly.) | :235–244 |
| U8 | Non-POST → 405 `Method not allowed`; thrown non-UNIQUE DB errors → 500 (`Failed to create products…` / `Failed to create POS users…` from `runImport`, generic `Failed to import tenant data` from the route wrapper). The doc error table has no 405/500 rows. | :271–278, :465–472, :609–617 |
| U9 | The subdomain 400 message text says "3-63 chars" but 1-char subdomains pass the regex — the doc documents the true rule (1 char or 3–63; 2-char rejected) correctly; the handler message understates it. | :541–543 |
| U10 | `ensureTenantOrg` auto-creates org + store + mapping (`INSERT OR IGNORE`) in BOTH modes — the existing-tenant 409 `Tenant is not provisioned for POS` fires only when it returns falsy, not on first use. The doc's 409 row reads as a pure precondition check. | `resolveScope.js:46-79`, :193–197 |

## Table 3 — Accepted-ignored (schema-valid, no effect)

| # | Key | Effect |
|---|---|---|
| A1 | Entire `project` block (`name`/`location`/`capacity`/`status`) | Parses, never read by `runImport` in either mode. (Same root cause as F1; listed here as the accepted-ignored instance.) |
| A2 | `rooms[].campId` wire key | The rooms Zod object has no `camp_id` and the schema is `.strip()` → the key never survives validation; the handler's `room.camp_id` read is dead — rooms always land in `defaultCampId`. (A.1 finding 3.) |
| A3 | Unknown meal `categoryName` | Accepted → `meal_category_id` null, no error — asymmetric with unknown `productName` → 400 for rooms/ratePlans. |
| A4 | `products[].categoryId`, `posUsers[]` explicit `storeId` | Accepted and stored verbatim with no existence check (see FK table K5). |
| — | Top-level `images` block | Explicitly NOT a gap — the doc's Images section documents it as stripped/inert, and `.strip()` confirms it. Stated explicitly per mission. |

## Table 4 — FK behavior (guarded vs blind writes)

| # | Write | Behavior | Doc status |
|---|---|---|---|
| K1 | `rooms_new` | Guarded `INSERT…SELECT`: requires a `projects` row (`id` = campId, same tenant, not deleted) AND a `pos_products` row (`id` = productId, same tenant); zero changes → per-room 404. | Matches doc. |
| K2 | `rate_plans_new` | Guarded `INSERT…SELECT` on `pos_products` (`id` + tenant); zero changes → per-plan 404; `camp_id` inherited from the product. | Guard matches doc; inheritance undocumented (U3). |
| K3 | `pos_products` + `products` mirror | Plain batch `INSERT`; duplicate SKU/ID surfaces as UNIQUE → 409. `ensureProductInProductsTable` mirrors into `products` via `INSERT OR IGNORE…SELECT`, best-effort (errors swallowed). | Matches doc. |
| K4 | `meals.meal_category_id` | Blind: unknown `categoryName` → null; an explicit `mealCategoryId` is used verbatim with no existence check → dangling reference or an FK-violation 500 (thrown → wrapper generic 500), depending on D1 FK enforcement. | Doc silent. |
| K5 | `products.category_id`, `pos_users.store_id` | Blind stores, no existence checks. | Doc silent. |
| K6 | Cross-section atomicity | Per-section `DB.batch` calls, no cross-section transaction — partial D1 writes persist if a later section fails (only R2 uploads roll back, U1). | Doc silent. |

## Sample-vs-code notes (`docs/examples/tenant-manifest.example.json`)

- Existing-tenant mode (no `identity`) with an inert `project` block + illustrative `images` block — both stripped/ignored exactly as the doc states. No gap.
- `products[1]` ("Family Tent", `type: "menu"`) is schema-valid but semantically odd (a tent typed as a menu item); harmless, no doc impact.
- Meal "Fresh Juice" `imageUrl` is https → passthrough, no upload (the smoke test asserts zero R2 PUTs on the URL-only sample). No gap.
- Verification section checked verbatim against `backend/tests/tenant-import-smoke.test.js`: exactly 4 its — fixture-source logging, 200 + all `counts` > 0 (+ `EXPECTED_COUNTS` equality), no R2 PUT on URL-only sample, queryable rows (`room101.product_id='prod_tent'`, `camp_1`, category resolution, store 5 / org 7). No gap.

## Counts

- Table 1 (false claims): 4 rows (F1–F4).
- Table 2 (undocumented): 10 rows (U1–U10).
- Table 3 (accepted-ignored): 4 gap rows (A1–A4) + 1 explicitly-non-gap (none empty).
- Table 4 (FK behavior): 6 rows (K1–K6).
- No table is empty; nothing was left unstated per the mission rule.
