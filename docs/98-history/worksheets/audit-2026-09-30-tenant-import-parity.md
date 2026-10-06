---
title: "Audit — tenant-import round-trip parity (rtp, 2026-09-30)"
aliases:
tags:
  - type/worksheet
  - audience/developer
  - domain/tenant-import
  - status/done
created: 2026-10-01
updated: 2026-10-06
relates-to:
  - "[[98-history/worksheets/README]]"
  - "[[tenant-import-appendix]]"
  - "[[audit-2026-10-02-tenant-import-edge-cases]]"
  - "[[audit-2026-09-30-tenant-manifest-gaps]]"
code-references:
  - "package.json"
  - "package-lock.json"
  - "scripts/export-tenant.mjs:265"
  - "deploy.sh"
  - "scripts/export-tenant.mjs:189-194"
verified: never
---
# Audit — tenant-import round-trip parity (rtp, 2026-09-30)

Verdict: **PASS** on counts + round-trip parity, with **6 honest drift items** (2 newly
discovered blockers, 1 newly discovered export gap, 3 carried forward).

Spec: `.opencode/agents/tmp/2026-09-30-rtp.md` (task `rt-parity`, commit 5 of 5).
Baseline: `467b6f9` — confirmed pushed before any write
(`git rev-parse HEAD` == `git rev-parse origin/main` == `467b6f9`, 0 ahead / 0 behind).
Pre-existing dirty `app|backend|monitor` `package.json`/`package-lock.json` and untracked
tmp specs / scratch were left **unstaged and untouched**.

Scope note: this is a **measurement** commit. No source file was edited — every drift
below is reported, not fixed.

---

## 1. Method — hermetic fresh local D1

Followed the established 2026-08-11 / 0111–0113 pattern (AGENT_LOGBOOK line 6535):

1. `cp -a backend/.wrangler/state → /tmp/opencode/rtp-backup/state` (17 MB).
2. `rm -rf backend/.wrangler/state` → `npx wrangler d1 migrations apply campmaster-db --local`
   → all **52 migrations ✅**, ledger head **0124** (`0124_guest_folios` last).
   *Fresh-D1 gotcha honoured: `wrangler dev --local` does **not** auto-apply migrations,
   so a wiped `.wrangler/state` is a blank DB. Applying them explicitly is what makes the
   run hermetic.*
3. Seeded one super-admin (`adm_rtp_superadmin` / `rtp-super@test.local`, bcrypt cost 12)
   and logged in through the real `POST /api/auth/login`.
   *Auth gotcha: a hand-minted HS256 token is rejected `401 Account deactivated` — the
   import route's gate does a live `admins.is_active` lookup, so a real row + real login
   is required. The migration chain also seeds its own `admin@sinaicamps.com` super-admin.*
4. `setsid nohup npx wrangler dev --local --port 8787` (a plain `nohup &` dies with the
   shell-tool timeout — the process group is killed; `setsid` is required).
5. **Restore verified byte-identical**: `md5sum` of the restored and backed-up
   `*.sqlite` / `metadata.sqlite` match (`7c49015f…`, `1d538547…`); post-restore census
   returns the original stranded workspace DB — **12 tenants / 88 admins / 43 products /
   161 rooms**, migration ledger head **0111** (`0110`+`0111`, i.e. still the pre-`0112`
   state the logbook records). No workspace data destroyed.

---

## 2. Per-manifest counts vs manifest — 5/5 PASS

Every manifest in `docs/examples/manifests/`, each on a **distinct tenant**:

| Manifest | Subdomain | HTTP | products | rooms | ratePlans | mealCategories | meals | posUsers |
|---|---|---|---|---|---|---|---|---|
| `camp-full.json` | `rasshaitan-full` | **201** | 3/3 ✅ | 2/2 ✅ | 2/2 ✅ | 3/3 ✅ | 3/3 ✅ | 2/2 ✅ |
| `supermarket-full.json` | `dahabmarket-full` | **201** | 3/3 ✅ | 2/2 ✅ | 2/2 ✅ | 3/3 ✅ | 3/3 ✅ | 2/2 ✅ |
| `restaurant-only.json` | `bedouintable-full` | **201** ¹ | 3/3 ✅ | 2/2 ✅ | 2/2 ✅ | 3/3 ✅ | 3/3 ✅ | 2/2 ✅ |
| `transportation.json` | `sinaishuttle-full` | **201** | 3/3 ✅ | 2/2 ✅ | 2/2 ✅ | 3/3 ✅ | 3/3 ✅ | 2/2 ✅ |
| `curated-listing.json` | `sinaistays-full` | **201** | 3/3 ✅ | 2/2 ✅ | 2/2 ✅ | 3/3 ✅ | 3/3 ✅ | 2/2 ✅ |

¹ `restaurant-only.json` needs its own fresh DB — see drift **D3**. All 5 imported at
full counts; the response `counts` object matched the manifest section-by-section for
every section of every file.

Required normalization (every edit is a cross-tenant placeholder the file's own `_note`
declares "must match the target tenant (or be omitted)"):
`products[].campId` omitted · `products[].categoryId` omitted ·
`posUsers[].storeId` omitted · `meals[].mealCategoryId` → same-file `categoryName`
(D4 explains why this last one is not optional).

---

## 3. Round-trip parity — 0 field drift

`import → export → re-import → export`, field-by-field, **all 7 sections including the
20-field tenant branding block**:

| Source tenant | Re-import tenant | Re-import HTTP | Field drift |
|---|---|---|---|
| `rasshaitan-full` | `rtp2-rasshaitan` | 201 | **0** |
| `dahabmarket-full` | `rtp2-dahabmarket` | 201 | **0** |
| `bedouintable-full` | `rtp2-bedouin` | 201 | **0** |
| `sinaishuttle-full` | `rtp2-shuttle` | 201 | **0** |
| `sinaistays-full` | `rtp2-stays` | 201 | **0** |

**Total: 0 field drift across 5 manifests.**

The diff is a recursive structural diff over the full A.1 manifest shape
(20 tenant fields + project + products + rooms + ratePlans + menu.categories +
menu.meals + posUsers), array-order-normalised by business key. The **only** normalization
applied between the two exports is stripping **tenant-local identity** — the
source tenant's `id`, `sku`, `campId` and child `productId`/`mealCategoryId` — which
D3 shows *must* be stripped for a cross-tenant copy to be accepted at all. Everything
else, branding included, is byte-identical.

An earlier harness pass that also dropped the `tenant` block reported 20 "drift" fields
per manifest; that was the harness's own doing (the re-imported tenant kept default
branding), not product behaviour. The table above is the full-fidelity pass.

---

## 4. Defect-1/2/3/4 verification at the data level

Each was re-proven against a **fresh 0124** DB rather than trusted from the commit message:

| Defect | Assertion | Result |
|---|---|---|
| **DEFECT-1** (`project_id` binds) | 0 NULL `project_id` rows across `pos_products` / `rooms_new` / `rate_plans_new` / `meal_categories` / `meals` / `pos_users` | **0 NULLs** ✅ |
| **DEFECT-2** (`products[].type` exported) | all four types survive manifest → export1 → export2 | **15/15 products keep `room`/`menu`/`buffet`/`retail`** ✅ |
| **DEFECT-3** (`project{}` written) | no project fork per import run | **5 projects / 5 tenants** ✅ |
| **DEFECT-4** (`roomStatus`/`cleaningStatus`) | `SELECT name, room_status, cleaning_status FROM rooms_new` after import | `Reserved Room → reserved/dirty`, `Cleaning Room → cleaning/in_progress`, `Default Room → available/clean` ✅ |

DEFECT-2 detail (the case the triage called unrecoverable — `room` used to flatten to
`retail`):

```
camp-full            manifest: room room menu   export1: room room menu   export2: room room menu
restaurant-only      manifest: room menu buffet export1: room menu buffet export2: room menu buffet
transportation       manifest: retail retail room export1: retail retail room export2: retail retail room
```

posUsers import also verified at the row level: `username`, `email`, `first_name`,
`last_name`, `role`, `department`, `employee_id`, `phone`, `organization_id`, `store_id`,
`project_id`, `is_active=1`, `status='active'` all persist; `name` is correctly the
GENERATED column and `password` is bcrypt-hashed (never plaintext).

---

## 5. Drift list (honest — reported, NOT fixed)

### D1 — `posUsers` export gap: 9 of 10 fields are readable but never emitted (NEW)

`scripts/export-tenant.mjs:265` hardcodes `const posUsers = []`. The fields are **not**
unreadable — `GET /api/pos-users` returns them all:

```json
{"data":[{"id":1,"username":"pu_cashier","email":"cashier@rtppu.example.com","firstName":"C",
  "lastName":"One","name":"C One","phone":null,"role":"cashier","isActive":1,"status":"active",
  "department":null,"employeeId":null,"organizationId":7,"storeId":7,"tenantId":"tenant_8cbba93a-ea9", …}]}
```

So `email`, `username`, `firstName`, `lastName`, `phone`, `role`, `isActive`,
`department`, `employeeId` are all available and are all accepted by the import schema
— only `password` is genuinely lost. The exporter's own message
(`posUsers[].password (only password_hash is stored/returned…)`) **understates** this:
the whole `posUsers` array is dropped, not just the password.

### D2 — `roomStatus`/`cleaningStatus`: import fixed, **exporter still drops them** (NEW)

DEFECT-4 fixed the *write* side, but the exporter's room key list
(`export-tenant.mjs:189-194`) never gained `roomStatus`/`cleaningStatus` — the mapper
only *counts* them into a lost-field tally (`:202-209`) without ever copying them onto
the output object — so a CLI-exported manifest still loses them. Live proof on a 3-room
probe tenant:

```
DB (import wrote them):  Reserved Room → reserved/dirty · Cleaning Room → cleaning/in_progress · Default Room → available/clean
export-tenant.mjs output: {"name":"Reserved Room", …}   ← no roomStatus, no cleaningStatus
```

The lost-field message is also now **factually wrong** — it says
`rooms[].roomStatus/cleaningStatus (3/3 rows readable via GET, no import field)`, but an
import field *does* exist since DEFECT-4. The mapper's own inline comment is stale the
same way (`// Read-side extras the import schema drops on re-import`). Same false claim at
`export-tenant.mjs:31` (`KNOWN LOSSES` — "readable but dropped by re-import") and
`docs/tenant-import.md:279-280` ("the import schema has no such fields") — the pair
`d4`'s logbook entry already flagged as left-behind.

### D3 — globally-unique identifiers make manifests non-portable (NEW, blocking)

Three identifiers are globally unique, not tenant-scoped, so **two tenants can never hold
the same value**:

| Column | Scope | Source |
|---|---|---|
| `pos_products.sku` | `TEXT UNIQUE NOT NULL` — global | `0112:153` |
| `meals.id` | `TEXT PRIMARY KEY` — global | `0001` |
| `pos_users.username` / `email` | `TEXT UNIQUE NOT NULL` — global | `pos_users` DDL |

Consequence, reproduced live: `meal_grill` is an explicit meal id in **both**
`camp-full.json` and `restaurant-only.json`. Importing all 5 shipped examples into one
database therefore returns `409 {"error":"Duplicate SKU, ID, or unique field"}` for
`restaurant-only.json` — after its tenant, admin, org, project, 3 products and 2 rooms
have **already been committed** (the identity path creates them before `runImport` and
does not roll them back on a data-section failure). The A.4 examples are only safe to
import **one manifest per database**, or after stripping the colliding ids.

This also means a verbatim cross-tenant export→import copy **must** strip
`id`/`sku`/`campId` — which is what the d2 logbook already recorded for `sku`; the
parity run confirms the same trap for `meals.id`.

> **SUPERSEDED (2026-10-02, Wave 8 item 3):** the shipped `mcat_existing_*`
> placeholder has been REMOVED from all five `docs/examples/manifests/*.json`
> files, which now resolve every meal through `categoryName` against their own
> `menu.categories[]`. The finding below is kept as the measurement that produced
> the fix; the examples no longer exhibit the condition. The blind
> `mealCategoryId` path in the handler itself is unchanged.
### D4 — `meals[].mealCategoryId` placeholder 500s; the `_note` claim is false (NEW, blocking)

`meals.meal_category_id` is `NOT NULL REFERENCES meal_categories(id)` at head 0124, so
the A.4 manifests' placeholder (`mealCategoryId: "mcat_existing_drinks"`,
`"mcat_existing_tastings"`, …) cannot resolve. Direct probe:

```
INSERT INTO meals (…, meal_category_id, …) VALUES (…, NULL, …)
→ NOT NULL constraint failed: meals.meal_category_id
```

Each manifest's `_note` states the direct-id meal "needs a pre-existing category id,
**else stored null — no error**". That is **false at head 0124** — a null category is a
hard 500, not a silent null. Remediation used here: replace the placeholder with a
`categoryName` from the same file (the other two meals in every manifest already do this).

### D5 — `products[].campId` placeholder breaks the rate-plan FK (carried, now pinned)

`campId: "proj_ras_shaitan"` (and its 4 siblings) points at a project that does not
exist. It is accepted silently into `pos_products.camp_id`, and the rate-plan
`INSERT … SELECT` then copies it into `rate_plans_new.camp_id`
(`REFERENCES projects(id) ON DELETE SET NULL`):

```
INSERT INTO rate_plans_new (…, camp_id, …) SELECT …, p.camp_id, …   -- p.camp_id = 'proj_ras_shaitan'
→ FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY
```

The `_note` is right that it can be omitted; it does not say that *keeping* it 500s the
whole import after 3 products + 2 rooms are already written.

### D6 — `rooms[].floor` number is coerced to TEXT (carried, stable)

Manifest `floor: 1` (number) → `floor: "1"` (string) in the first export, because the
handler binds `String(room.floor)`. Not round-trip drift (both exports agree); it is a
one-time manifest→DB coercion worth documenting next to the other handler defaults.

### Not reproduced / out of scope

- **Nameless `meal_categories`** (A.6 drift #4): only reachable for legacy rows with no
  `meal_categories_lang` row. A fresh 0124 DB has none, so the exporter's skip-with-warning
  path could not be exercised here. The code path is unchanged from A.6.
- **Prod / staging**: not probed. No remote writes, no `deploy.sh`, no migration, no KV
  write at any point in this task.

---

## 6. Verdict

| Gate | Result |
|---|---|
| Fresh hermetic D1, workspace state restored byte-identical | ✅ |
| 5/5 manifests imported on distinct tenants | ✅ |
| Counts match the manifest (30/30 section counts) | ✅ |
| export → re-import → export, field-by-field | ✅ |
| **Round-trip field drift** | **0** |
| DEFECT-1/2/3/4 re-proven at the data level | ✅ |
| Drift reported honestly, source untouched | ✅ |

**PASS.** Round-trip parity is exact for every field the export surface actually
produces. The residual drift is confined to fields the export surface never emits (D1,
D2) and to import-side constraints that make the shipped examples non-portable as-is
(D3, D4, D5) — none of which are round-trip *value* drift.
