---
title: "Tenant Import — appendix (examples, validator, export, round-trip, images)"
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
  - "[[tenant-import-types]]"
  - "[[docs/10-tenant-import/README]]"
  - "[[docs/98-history/worksheets/audit-2026-09-30-tenant-import-parity]]"
  - "[[docs/98-history/merged/audit-2026-10-02-tenant-import-edge-cases]]"
code-references:
  - "docs/examples/tenant-manifest.example.json"
  - "backend/src/middleware/resolveScope.js:46-79"
  - "backend/tests/tenant-import-smoke.test.js"
  - "scripts/validate-manifest.mjs"
  - "backend/src/utils/response.js:41"
  - "scripts/export-tenant.mjs"
  - "backend/tests/tenant-export-room-status.test.js"
  - "backend/tests/tenant-import-project-id.test.js"
  - "backend/src/api/tenant-import.js:801-822"
  - "app/src/components/admin/AdminApp.tsx"
verified: never
---
# Tenant Import — appendix (examples, validator, export, round-trip, images)

> Example manifests, the validator CLI, the export CLI and its round-trip ledger, the residual
> findings, and the images/errors/top-10-mistakes reference. Part of the [[tenant-import]] set.
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

### Table 2 — Undocumented (code does, doc silent)

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

### Table 3 — Accepted-ignored (schema-valid, no effect)

| # | Key | Effect |
|---|---|---|
| A1 | Entire `project` block (`name`/`location`/`capacity`/`status`) | Parses, never read by `runImport` in either mode. (Same root cause as F1; listed here as the accepted-ignored instance.) |
| A2 | `rooms[].campId` wire key | The rooms Zod object has no `camp_id` and the schema is `.strip()` → the key never survives validation; the handler's `room.camp_id` read is dead — rooms always land in `defaultCampId`. (A.1 finding 3.) |
| A3 | Unknown meal `categoryName` | Accepted → `meal_category_id` null, no error — asymmetric with unknown `productName` → 400 for rooms/ratePlans. |
| A4 | `products[].categoryId`, `posUsers[]` explicit `storeId` | Accepted and stored verbatim with no existence check (see FK table K5). |
| — | Top-level `images` block | Explicitly NOT a gap — the doc's Images section documents it as stripped/inert, and `.strip()` confirms it. Stated explicitly per mission. |

### Table 4 — FK behavior (guarded vs blind writes)

| # | Write | Behavior | Doc status |
|---|---|---|---|
| K1 | `rooms_new` | Guarded `INSERT…SELECT`: requires a `projects` row (`id` = campId, same tenant, not deleted) AND a `pos_products` row (`id` = productId, same tenant); zero changes → per-room 404. | Matches doc. |
| K2 | `rate_plans_new` | Guarded `INSERT…SELECT` on `pos_products` (`id` + tenant); zero changes → per-plan 404; `camp_id` inherited from the product. | Guard matches doc; inheritance undocumented (U3). |
| K3 | `pos_products` + `products` mirror | Plain batch `INSERT`; duplicate SKU/ID surfaces as UNIQUE → 409. `ensureProductInProductsTable` mirrors into `products` via `INSERT OR IGNORE…SELECT`, best-effort (errors swallowed). | Matches doc. |
| K4 | `meals.meal_category_id` | Blind: unknown `categoryName` → null; an explicit `mealCategoryId` is used verbatim with no existence check → dangling reference or an FK-violation 500 (thrown → wrapper generic 500), depending on D1 FK enforcement. | Doc silent. |
| K5 | `products.category_id`, `pos_users.store_id` | Blind stores, no existence checks. | Doc silent. |
| K6 | Cross-section atomicity | Per-section `DB.batch` calls, no cross-section transaction — partial D1 writes persist if a later section fails (only R2 uploads roll back, U1). | Doc silent. |

### Sample-vs-code notes (`docs/examples/tenant-manifest.example.json`)

- Existing-tenant mode (no `identity`) with an inert `project` block + illustrative `images` block — both stripped/ignored exactly as the doc states. No gap.
- `products[1]` ("Family Tent", `type: "menu"`) is schema-valid but semantically odd (a tent typed as a menu item); harmless, no doc impact.
- Meal "Fresh Juice" `imageUrl` is https → passthrough, no upload (the smoke test asserts zero R2 PUTs on the URL-only sample). No gap.
- Verification section checked verbatim against `backend/tests/tenant-import-smoke.test.js`: exactly 4 its — fixture-source logging, 200 + all `counts` > 0 (+ `EXPECTED_COUNTS` equality), no R2 PUT on URL-only sample, queryable rows (`room101.product_id='prod_tent'`, `camp_1`, category resolution, store 5 / org 7). No gap.

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

### Harness gotchas (cost 5 red rounds — recorded so the next run does not repeat them)

1. **The wire casing is camelCase.** `runImport` builds snake_case `counts`
   (`rate_plans`, `meal_categories`, `pos_users`, `tenant_id`) but `jsonResponse` deep-converts
   with `toCamel` (`backend/src/utils/response.js:41`), so the response carries
   `ratePlans`, `mealCategories`, `posUsers`, `tenantId`. Comparing against snake_case
   keys reports three phantom "missing sections" on a **201** whose DB rows are all
   present. This single mistake turned 3 passing steps red and looked like a real defect.
2. **Never rename a product id in place.** `rooms[].productId` and `ratePlans[].productId`
   are explicit ids in both shipped examples (`prod_palmhut`); renaming the product id
   without rewriting those references 404s the whole import at
   `Room "…" failed: camp or product not found for this tenant`.
3. **Match category names programmatically, never by hand.** Typing
   `"Prepared Foods / ماكولات جاهزة"` (alef) instead of the manifest's
   `"Prepared Foods / مأكولات جاهزة"` (hamza) 400s on step 3's own new pre-flight — a
   harness bug that looks exactly like the defect under test.
4. **Existing-tenant mode needs a tenant-scoped login.** A tenant admin logs in with
   `tenantId` in the login body (`auth.js:143` branch 1); without it only the
   `super_admin` + `tenant_id IS NULL` branch runs and a tenant admin gets
   `401 Invalid email or password`.
5. **A tenant-scoped re-import needs a real tenant-scoped token** — the orphaned
   `super_admin` JWT used for create mode has no `tenant_id`, so the same request
   answers `401 Unauthorized: missing tenant context` rather than reaching the handler.

---

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
| `rooms[].roomStatus` / `cleaningStatus` | **emitted** — both keys are in the exporter's rooms mapping | accepted + bound + persisted | ✅ **round-trips** — closed on both legs. The exporter used to *read* both columns (`GET /api/rooms` is `SELECT r.*`), count them, and then discard them while advertising the loss in three places, so every exported room silently came back `available` / `clean`. A canary now reports them only if the read side stops returning the columns. Verified by a real local export run over HTTP (`backend/tests/tenant-export-room-status.test.js`). |
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

### Residual findings — measured, reported, NOT fixed (2026-10-02, hermetic fresh local D1)

### 3.1 `pos_products.id` / `meals.id` are still GLOBAL primary keys

`0126` re-scoped `pos_products.sku` and `pos_users.email`/`username`. It deliberately did
**not** re-scope the two identifier primary keys (`pos_products.id TEXT PRIMARY KEY`,
`meals.id TEXT PRIMARY KEY`) — a PK cannot be re-scoped without rewriting every
`meal_lang` / `meal_schedules` reference.

Consequence, measured: **a manifest that ships explicit ids cannot be loaded into a
second tenant.** Step 5c returns `409 "One or more products already exist (duplicate SKU
or ID)"`, and the `meals` half already answers a clear `400` naming the meal and the id
(the `0126` probe). So the manifest *authoring* rule stands: strip tenant-local `id`s
before loading the same catalogue twice. Carried forward from parity finding D3, which
`0126` only partially closed.

### 3.2 A rejected identity-path import leaves an orphan tenant

Steps 3, 4 and 5c all returned a clean 4xx **and all three left the provisioned tenant
behind**:

```
dahabmarket-full  products=3 rooms=2 rate_plans=2 meals=3 posUsers=2   ← step 5a, OK
rasshaitan-full   products=3 rooms=2 rate_plans=2 meals=3 posUsers=2   ← step 1,  OK
edge-collide      products=3 rooms=2 rate_plans=2 meals=3 posUsers=2   ← step 5b, OK
edge-badmeal      products=0 rooms=0 rate_plans=0 meals=0 posUsers=0   ← step 3, 400
edge-badcamp      products=0 rooms=0 rate_plans=0 meals=0 posUsers=0   ← step 4, 400
edge-collideid    products=0 rooms=0 rate_plans=0 meals=0 posUsers=0   ← step 5c, 409
```

Each rejected tenant still owns its committed `admins` row, POS organization + store,
`tenant_org_mapping` row and default `project` — provisioning steps 1–4 of
`tenant-import.js:801-822` run **before** `runImport`, and `tenant-import.js:829-832`
returns the error response without touching them. This is the pre-existing
"no D1 rollback" decision (F-A17-02), not a regression from `a5dec09`/`1378d27` — but
those two fixes moved the *meal-category* and *campId* failures forward to before the
first data write, so the residue is now "tenant shell only" instead of "tenant + partial
catalogue". The shell is strictly smaller than before; it is not gone.

> **SUPERSEDED (2026-10-02, Wave 8 item 3):** the shipped `mcat_existing_*`
> placeholder has been REMOVED from all five `docs/examples/manifests/*.json`
> files, which now resolve every meal through `categoryName` against their own
> `menu.categories[]`. The finding below is kept as the measurement that produced
> the fix; the examples no longer exhibit the condition. The blind
> `mealCategoryId` path in the handler itself is unchanged.
### 3.3 The shipped `mealCategoryId` placeholder still cannot bootstrap a fresh tenant

`camp-full.json` / `supermarket-full.json` carry `mealCategoryId: "mcat_existing_*"`.
Their `_note` correctly states the id **must already exist in the target tenant** — and
on a fresh tenant it does not. Removing the placeholder leaves that meal with no
`categoryName` either, and `meals.meal_category_id` is `NOT NULL REFERENCES
meal_categories(id)`, so the meals batch fails and the whole import 500s. The harness
therefore pointed that one placeholder at the category the same file declares for that
semantic (`mcat_existing_drinks` → `Drinks / مشروبات`,
`mcat_existing_prepared` → `Prepared Foods / …`), matched from the manifest's own
`categories[]` names. This is parity finding D4, unchanged by `0126`.

---

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
with a corrected manifest.` (create mode, thrown error or a mid-write batch
failure only — a deliberate 4xx keeps its own status, message and `errors`
through the undo, §1a) and
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
8. **Expecting `products[].type` or `rooms[].roomStatus`/`cleaningStatus` to
   be lost on export→import.** Neither is. `GET /api/products` selects
   `p.type`, and the exporter emits it, so
   `room`/`menu`/`buffet`/`retail` survive a round trip; the exporter likewise
   emits both room lifecycle columns, so a reserved/dirty room comes back
   reserved/dirty (A.6 losses 1 and 3, both closed — §6).
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
