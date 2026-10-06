---
title: "Audit — tenant-import edge-case matrix (edge, 2026-09-30)"
aliases:
tags:
  - type/audit
  - audience/developer
  - audience/historian
  - domain/tenant-import
  - domain/audit
  - status/merged
created: 2026-10-02
updated: 2026-10-06
superseded-by: "[[10-tenant-import/tenant-import-appendix]]"
relates-to:
  - "[[98-history/merged/README]]"
  - "[[tenant-import-appendix]]"
  - "[[audit-2026-09-30-tenant-import-parity]]"
  - "[[BLOCKED-pos-products-composite-pk]]"
code-references:
  - "package.json"
  - "package-lock.json"
  - "backend/src/api/tenant-import.js:782"
  - "backend/src/utils/response.js:41"
  - "backend/tests/tenant-import.test.js:787-1038"
  - "deploy.sh"
  - "backend/src/api/tenant-import.js:829-832"
verified: never
---
# Audit — tenant-import edge-case matrix (edge, 2026-09-30)

Verdict: **PASS** — 7/7 edge steps green, plus **3 measured residual findings** that
are logged, not fixed.

Spec: `.opencode/agents/tmp/2026-09-30-edge.md` (task `edge-case-verify`).
Baseline: `1378d27` — confirmed pushed before any write
(`git rev-parse HEAD` == `git rev-parse origin/main` == `1378d27`, 0 ahead / 0 behind).
Pre-existing dirty `app|backend|monitor` `package.json`/`package-lock.json` and untracked
tmp specs / scratch were left **unstaged and untouched**.

Scope note: this is a **measurement** commit. No source file was edited — every finding
below is reported, not fixed. The identity-path rollback was assessed and **SKIPPED**
(reason in §5); no rollback commit was produced.

---

## 1. Method — hermetic fresh local D1

Same pattern as the round-trip parity audit (`b4a20a4`), repeated from scratch:

1. `cp -a backend/.wrangler/state → /tmp/opencode/edge-backup/state`, then
   `md5sum` over **every** file under `state` (942 files, not just `*.sqlite` — the
   Durable-Object and KV stores carry `-wal`/`-shm` siblings whose bytes matter).
   Pre-wipe baseline census: **14 tenants / 90 admins / 43 products / 161 rooms /
   17 projects / ledger 111**.
2. `rm -rf backend/.wrangler/state` → `npx wrangler d1 migrations apply campmaster-db --local`
   → every migration ✅, ledger head **0126** (not the stranded 0110/0111 the workspace
   DB sits at — only a genuinely fresh chain exercises the head schema).
3. Seeded one **real** super-admin row and logged in through the real
   `POST /api/auth/login`. A hand-minted HS256 JWT is not enough: the import route's
   gate does a live `admins.is_active` lookup and answers `401 Account deactivated`.
4. `wrangler dev --local --port 8787` detached (`setsid nohup … < /dev/null & disown`).
5. **Restore verified byte-identical**: md5 of all 942 restored files == the backup
   manifest, and the post-restore census is **14 / 90 / 43 / 161 / 17 / ledger 111** —
   the original workspace state. Nothing destroyed.

---

## 2. The matrix — 7/7 PASS

Every step's status code is the code the handler actually returned.

| # | Step | Status | Verdict |
| --- | --- | --- | --- |
| 1 | `camp-full.json` → identity/create mode | **201** | PASS |
| 2a | same manifest again, identity mode | **400** | PASS |
| 2b | same manifest again, existing-tenant mode | **409** | PASS |
| 3 | unresolvable meal `categoryName` | **400** | PASS |
| 4 | unresolvable product `campId` | **400** | PASS |
| 5a | `supermarket-full.json` → 2nd tenant | **201** | PASS |
| 5b | 3rd tenant reuses camp-full SKU + POS username/email | **201** | PASS |
| 5c | 2nd tenant reuses camp-full explicit `pos_products.id` | **409** | PASS |

### Step 1 — `camp-full.json` → **201**

All six sections imported and every count matched the manifest, both on the wire and in
the DB (read independently through `wrangler d1 execute --local`, not inferred from the
response body):

| section | reported | DB |
| --- | --- | --- |
| products | 3 | 3 |
| rooms | 2 | 2 |
| ratePlans | 2 | 2 |
| mealCategories | 3 | 3 |
| meals | 3 | 3 |
| posUsers | 2 | 2 |

### Step 2 — the same manifest again → **no 500**

Two distinct repeats, because the two modes fail for different reasons:

- **2a identity mode → `400 "This subdomain is already taken"`.** The subdomain
  uniqueness probe at `tenant-import.js:782` fires before any write.
- **2b existing-tenant mode → `409 "One or more products already exist (duplicate SKU
  or ID)"`.** Same tenant, same SKUs: the tenant-scoped arbiter from `0126`
  (`UNIQUE INDEX (tenant_id, sku)`) correctly rejects the same-tenant duplicate.
  Product count for the tenant stays **3** — the repeat neither duplicates nor
  half-writes.

Neither path returns a 500. **Named actual, as the spec asked: 400 (identity) and 409
(existing-tenant) — not an idempotent 200.**

### Step 3 — unresolvable meal `categoryName` → **400**

```
Meal "Mixed Grill / مشويات مشكلة" references unknown category
"Nonexistent Category / تصنيف غير موجود". Declare the category in
menu.categories[] or remove categoryName.
```

`pos_products` rows written: **0**. The `a5dec09` pre-flight fires before every write.

### Step 4 — unresolvable product `campId` → **400**

```
Product "Sea-View Tent / خيمة بإطلالة بحرية" references unknown camp
"proj_does_not_exist_edge". campId must name a project this tenant already owns;
omit it to attach the row to the tenant default project.
```

`pos_products` rows written: **0**. The `1378d27` pre-flight fires before every write.

### Step 5 — a second tenant, with forced overlap

- **5a `supermarket-full.json` → `201`**, all six counts matching, on a second tenant
  with no collision against the first.
- **5b → `201`.** A third tenant was given camp-full's **SKU values verbatim**
  (`TENT-SV`, `HUT-PALM`, `MEAL-GRILL`) *and* camp-full's **POS username + email
  verbatim** (`salem_cashier`, `noura_mgr`, `cashier@…`, `manager@…`) — precisely the
  four arbiters migration `0126` re-scoped. All six sections imported with matching
  counts. SQL confirms each duplicated value now spans exactly 2 tenants:
  `pos_products.sku` ×3 values, `pos_users.username` ×2, `pos_users.email` ×2 — i.e.
  the tenant-scoped arbiters hold, and the same catalog/staff set genuinely loads into
  two tenants.
- **5c → `409`** (added by this audit, see §3.1): reusing camp-full's explicit
  `pos_products.id` values on another tenant is still refused.

---

## 3. Residual findings — measured, reported, NOT fixed

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

## 4. Harness gotchas (cost 5 red rounds — recorded so the next run does not repeat them)

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

## 5. Rollback assessment — **SKIPPED** (Wave 8 item)

**Decision: do not implement the identity-path try/catch rollback.** Both spec
preconditions fail, and the second one is decisive.

### 5.1 Existing test coverage of the identity path is insufficient

`backend/tests/tenant-import.test.js:787-1038` is the only identity-path suite
(16 tests). It covers the happy path (201 + the created ids, the tenant/admin/org/project
INSERTs, the project-block reuse, the identity-strip) and every **pre-provisioning**
rejection (403 non-super-admin, 400 bad subdomain format / taken subdomain / duplicate
email / missing fields).

**Nothing exercises the branch that would carry the rollback** — the post-provisioning
failure at `tenant-import.js:829-832`, where `importTenantManifest` returns `status >= 400`
*after* steps 1–4 have committed. There is no fixture that makes `runImport` fail on the
identity path, so a rollback would land with zero safety net and no way to prove it works.

### 5.2 The change is not small

"Delete only the newly-created tenant" is not a small try/catch here:

- **D1 has no cross-request transaction.** Provisioning commits `tenants`, `admins`,
  the POS org + store + `tenant_org_mapping` (via `ensureTenantOrg`) and `projects` as
  four independent writes, and `runImport` then commits each section in its own
  `DB.batch`. A catch block cannot un-commit them.
- **The committed data rows are FK children of what you would delete.**
  `pos_products.project_id` / `rooms_new.project_id` / `rate_plans_new.project_id` /
  `meals.project_id` are `ON DELETE SET NULL`, but `pos_users` → `pos_organizations`,
  `rooms_new`/`rate_plans_new` → `projects` and `meal_lang` → `meals` are plain
  `RESTRICT`/`NO ACTION`. Deleting just the tenant row trips
  `FOREIGN KEY constraint failed`; deleting the whole set is a wide multi-table sweep
  over the same 9–10 tables the d4/d5 tests enumerate, each needing its own ordering.
- **That is exactly the surface F-A17-02 declined to authorise** —
  `tenant-import.js:723-726` records "Imported *rows* are not rolled back (the plan's
  'or' option — two-phase upload-then-insert-with-cleanup — was chosen; **no D1 rollback
  was authorized**)", and the R2 rollback that *was* built is scoped to `MEDIA_BUCKET`
  keys only.
- **A partial rollback is worse than the honest orphan.** §3.2 shows the current residue
  is a clean tenant shell: an admin who retries with a fresh subdomain succeeds, and an
  admin who notices the orphan can delete one row. A rollback that deletes the tenant
  first and then fails open on the FKs would leave a half-deleted shell that is harder
  to reason about and impossible to retry.

### 5.3 Wave 8 item to carry forward

> **Identity-path rollback on a post-provisioning failure.** The
> `if (result.status >= 400)` branch at `backend/src/api/tenant-import.js:829-832` carries
> the comment *"If import returned an error response, clean up partial provisioning"*
> but performs **no cleanup**. Measured on a fresh 0126 local D1 (2026-09-30 edge audit):
> a rejected identity import leaves an `admins` row, a POS organization + store, a
> `tenant_org_mapping` row and a default `project` behind. Any fix must (a) cover all
> nine import-written tables plus the four provisioning tables in FK-safe order, or wrap
> provisioning + import in one `DB.batch` (D1 batches are transactional, but a single
> batch cannot span the R2 uploads and `hashPassword`), and (b) ship with a fixture that
> fails `runImport` on the identity path — which does not exist today.

---

## 6. What was not done

- **No source file edited.** No handler, schema, migration or test change.
- **No rollback commit** — the rollback was skipped, so no separate commit precedes this one.
- No remote writes, no `deploy.sh`, no `wrangler d1 migrations apply --remote`, no KV
  writes, no prod/staging probing.
- The workspace `.wrangler/state` was restored byte-identical (§1) and the worker was
  stopped.