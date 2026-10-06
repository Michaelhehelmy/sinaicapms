---
title: "Tenant Import — one manifest, one call"
aliases:
tags:
  - type/reference
  - audience/developer
  - domain/tenant-import
  - status/live
created: 2026-09-15
updated: 2026-10-06
relates-to:
  - "[[tenant-import-schema]]"
  - "[[tenant-import-types]]"
  - "[[tenant-import-appendix]]"
  - "[[10-tenant-import/README]]"
  - "[[BACKLOG_VOID_REFUND]]"
  - "[[07-data/migrations]]"
code-references:
  - "backend/src/api/tenant-import.js"
  - "backend/migrations/0127_meals_tenant_composite_pk.sql"
  - "backend/src/index.js:244-251"
  - "backend/wrangler.toml"
verified: never
---
# Tenant Import — one manifest, one call

`POST /api/tenants/import` provisions or fills a tenant from a single JSON
manifest: branding, products, rooms, rate plans, menu, and POS users.
Line references below point at `backend/src/api/tenant-import.js` (**1004
lines**, re-read 2026-10-02 after migration 0127 landed) unless noted.
Provenance for each claim:

- **Handler** — `backend/src/api/tenant-import.js`, re-read 2026-10-02. The
  behavioural audits it is checked against are
  `docs/audit-2026-09-30-tenant-manifest-schema.md` (A.1 field census),
  `docs/audit-2026-09-30-tenant-manifest-gaps.md` (A.2),
  `docs/audit-2026-09-30-tenant-manifest-types.md` (A.3),
  `docs/audit-2026-09-30-tenant-import-parity.md` (round-trip parity),
  `.opencode/audits/BLOCKED-manifest-roundtrip.md` (A.6),
  `docs/audit-2026-10-02-tenant-import-edge-cases.md` (edge matrix, 7/7).
- **A.1 counted 85 leaf fields against the schema as it stood on 2026-09-30.**
  The handler now declares **88**: `project.type` plus
  `rooms.roomStatus` / `rooms.cleaningStatus` were added afterwards. §2's
  table is the 88-field version; A.1's number is kept only where it names the
  audit it came from.
- **Live behaviour** — the edge matrix re-ran the real route against a fresh
  local D1 at migration head 0126 and measured 7/7; its step table is quoted
  in §7. **0127 has since landed in the handler but is PENDING-APPLY** — see
  the callout below.

> ### ⚠️ 0127 is committed but NOT applied to any database
>
> `backend/migrations/0127_meals_tenant_composite_pk.sql` re-keys `meals` by
> `(tenant_id, id)` and rebuilds `meal_lang` and `meal_schedules` to match. The
> handler's **code half is already merged**, which means the two halves are
> deployed on different schedules:
>
> - Before 0127 is applied, `meals.id` is still the global PK, so the
>   tenant-scoped probe in §2's probe table finds nothing across tenants and a
>   foreign meal id still hits the raw PK collision → generic 409.
> - Every `meal_lang` INSERT now binds `tenant_id` (:707) — against a
>   pre-0127 database that column does not exist.
>
> **Apply the migration before deploying the code**, and read the *applied
> ledger* (`wrangler d1 migrations list --config backend/wrangler.toml
> `--remote`), not the file count. Owner-only; `docs/RUNBOOK.md` §8 is the
> drift gate.

Wire rule: send **camelCase** (`logoUrl`, `basePrice`, `pricePerNight`,
`mealCategoryId`, `firstName`, `productName`, `categoryName`, …). The route
runs the body through `toSnake()` and validates snake_case Zod schemas
(`identitySchema` :13–22, `manifestSchema` :65–170, both `.strip()` — unknown
keys are silently dropped, never errors). Zod failure answers
400 `{ success:false, error, errors:[{field,message}] }`.
Mount: `backend/src/index.js:244-251`, roles `super_admin` + `admin`.
Gate: `cd backend && npx vitest run tests/tenant-import-smoke.test.js` (4 its).
Full import coverage is **7 suites / 106 tests** — `tenant-import` (53),
`tenant-scoped-uniqueness` (25), `tenant-import-room-status` (8),
`tenant-import-project-id` (7), `tenant-import-export-type` (5),
`tenant-import-smoke` (4), `tenant-import-rollback` (4); run them with
`cd backend && npx vitest run tests/tenant-import`.

Array caps (Zod `.max()`, A.1): products 200 · rooms 200 · rate_plans 200 ·
menu.categories 50 · menu.meals 200 · pos_users 100.

## 1. Identity: create mode vs strip mode

There are exactly two modes, selected by the presence of a truthy `identity`
key — not by URL, not by flag:

| Mode | Caller | What the handler does |
|---|---|---|
| **Create** (`identity` present) | must be `super_admin`, else 403 | Validates identity (:816–817) → checks role (:820–822) → INSERTs tenant row + bcrypt admin (`role='admin'`, `is_active=1`) + org/store/mapping via `ensureTenantOrg` + default `projects` row built from identity fields (name/slug/type) → imports the remaining sections → **201** `{ …, created:{ tenantId, adminId, organizationId } }`. Any failure after the first INSERT **rolls the whole shell back** (saga — see §1a). |
| **Fill** (no `identity`) | tenant `admin` or `super_admin` | Imports into `scope.tenantId` → **200** `{ success, tenantId, counts }`. Never rolls back (§1a). |

Ordering trap (A.2 F2): identity **validation runs before the role check**.
A malformed `identity` block from a non-super-admin returns 400
`validationError`, not 403. The 403
(`Only super-admin can provision new tenants`) fires only when the identity
block itself is schema-valid. Keep identity-mode manifests in separate files
from fill-mode manifests — any truthy `identity` flips a tenant-admin call
into creation mode and it fails.

`identity` fields (Zod :13–22): `name` (required), `subdomain` (required —
regex `/^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/`, i.e. 1 char or 3–63 chars;
**2-char subdomains are rejected**; uniqueness-checked, 400 if taken), `type`
(enum `camp|supermarket|transportation|other`, Zod default `camp`),
`email` (required, valid email, admin-uniqueness 400), `password` (required,
≥ 8 chars, bcrypt), `firstName` / `lastName` (required), `businessType`
(optional string; stored as `tenants.business_type` via
`business_type || type`).

## 1a. Atomicity: a saga in create mode, nothing in fill mode

This is the single most consequential difference between the two modes, and
it is **not** the same contract.

| | Create mode (identity) | Fill mode (no identity) |
|---|---|---|
| Undo log | `created[]` threaded from the route into `runImport` | **none passed** — `importTenantManifest(env, tenantId, toSnake(payload))` with no log |
| On failure after ≥1 row committed | reverse-order tenant-scoped DELETEs, then `500 Import failed: <reason>. All partial data has been rolled back. You can retry with a corrected manifest.` | `500 Import failed: <reason>. Partial data may remain in the tenant. Re-run with the same manifest to retry, or clean up manually.` + a `console.error` naming the tenant |
| On a **deliberate rejection** after ≥1 row committed | reverse-order tenant-scoped DELETEs, then the caller's **own 4xx/409, message and `errors` array unchanged** (stamped with a module-private `Symbol`; see the note below) | same response, verbatim (no saga at all) |
| On failure before any row | the caller's own precise 4xx/409 is returned **unchanged** | same |
| DELETEs issued | reverse of `created[]` (tenants last) | **never** |

> **Why a deliberate rejection keeps its status.** The undo log's length cannot
> be the test for "did this request write anything?": in create mode the shell
> (tenant / admin / POS org / project) is committed *before* the data import
> runs, so the log is never empty by then and every pre-flight 4xx used to be
> rewritten as the rolled-back 500 (status lost, and the message mangled —
> `…categoryName.` became `…categoryName..` — because the reason is quoted into
> a template that ends in its own period). So the handler stamps the rejections
> it authored on purpose (schema 400, unresolvable `campId` / `productName` /
> `categoryName`, a guarded INSERT…SELECT that matched no row, a same-tenant
> duplicate `meals[].id`, a missing POS org) and the saga hands them back after
> the undo. A batch that blew up **while writing** — duplicate SKU / POS-user
> email — is not stamped: committed state was undone, and the caller has to be
> told, so those still answer `500 Import failed: … rolled back.` One deliberate
> rejection is worth catching even earlier: `unresolvableMealCategory` also runs
> in the route *before* the shell, so a bad `categoryName` writes nothing at all
> and issues no DELETE (identical answer either side of the shell — a tenant id
> that has not been INSERTed owns no meal categories). The `campId` probe cannot
> move there: the shell creates the project its references resolve against.

Why create mode can be exact and fill mode cannot: the tenant is brand-new, so
every row carrying that `tenant_id` **is this request's work** — the
tenant-scoped delete is exact rather than approximate. Fill mode's rows belong
to a tenant that predates the request, so there is nothing safe to delete.

Rollback order is dictated by the real FK actions at the 0126 head (verified
with `PRAGMA foreign_key_list`, not assumed): `pos_users` →(NO ACTION)
`pos_stores`/`pos_organizations`; `rooms_new` →(RESTRICT) `pos_products`;
`pos_stores` →(NO ACTION) `pos_organizations`; `projects` →(NO ACTION)
`tenants`; `admins` →(SET NULL) `tenants`; and **`pos_products` has no FK to
`tenants` at all** (only `project_id SET NULL`), so it would silently survive
a tenant delete as an orphan — it is deleted explicitly, after rooms and rate
plans. Each delete is best-effort in its own `try`/`catch`: a blocked step
logs `tenant-import rollback: …` and the rest of the log still runs.

`ensureTenantOrg` is idempotent and does not report what it created, so the
route probes `tenant_org_mapping` **before** calling it and only tracks
org/store/mapping when there was no prior mapping — otherwise a pre-existing
org would be deleted out from under a live tenant.

---

## Where the rest of this documentation lives

`docs/tenant-import.md` was split on 2026-10-06 (docs-vault restructure) into this operator
walkthrough plus three siblings. This file is the **path-preserving entry point**: 30+ code files
and tests cite `docs/tenant-import.md`, so that path keeps working.

| Section | File |
|---|---|
| §1 Identity: create mode vs strip mode · §1a Atomicity | **this file** |
| §2 Full schema table (88 leaf fields) + probe caps + schema-level findings | `tenant-import-schema.md` |
| §3 Tenant-type matrix (5 types × 8 sections) + per-section evidence notes | `tenant-import-types.md` |
| §4 Example manifests · §5 Validator CLI · §6 Export CLI + round-trip ledger + residual findings · §7 Images, errors, top-10 mistakes | `tenant-import-appendix.md` |

Related live work: `docs/BLOCKED-pos-products-composite-pk.md` (parity D3, identifier half) and
`docs/BACKLOG_VOID_REFUND.md`. Archived evidence for all four behavioural audits is under
`docs/98-history/`.
