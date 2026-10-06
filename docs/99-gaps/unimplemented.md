---
title: "Code vs docs — UNDOCUMENTED code"
aliases:
  - unimplemented
tags:
  - type/audit
  - audience/agent
  - domain/docs
  - status/live
created: 2026-10-06
updated: 2026-10-06
relates-to:
  - "[[99-gaps/README]]"
  - "[[code-vs-docs]]"
  - "[[unverified]]"
  - "[[API_SURFACE_MAP]]"
  - "[[API_CONTRACT]]"
  - "[[security-guide]]"
  - "[[migrations]]"
code-references:
  - "backend/src/index.js"
  - "backend/src/api/upload.js"
  - "backend/src/utils/response.js"
  - "backend/src/api/tenant-import.js"
  - "backend/migrations/0127_meals_tenant_composite_pk.sql"
  - "app/src/lib/api.ts"
  - "app/src/middleware/securityHeaders.ts"
  - "app/src/components/pos/views/TableView.tsx"
  - "app/src/components/admin/AdminApp.tsx"
  - "docs/examples/tenant-manifest.example.json"
verified: 2026-10-06
---
# Code vs docs — UNDOCUMENTED code

Real code that **no doc in scope claims** — a route, a table, a helper, a convention or a capability
that exists and is unmentioned. This is the gap class that only reading the code can produce, and it
is the reason the audits read source rather than grepping docs at each other. **10 entries**, plus
**F‑4** filed in [[code-vs-docs]].

| Entry | The unclaimed thing | Severity |
|---|---|---|
| **C‑9** | ~199 of the 268 documented endpoints have **no OpenAPI registration at all** — including the canonical `/api/projects` surface `openapi.json` has no path for | P2 |
| **D‑13** | That `0127` is committed but **not applied** — "head in the tree" ≠ "head in the ledger" | P2 |
| **A‑11** | A fourth `window.__API_BASE` site, `app/src/middleware/securityHeaders.ts` | P3 |
| **A‑18** | Two response helpers no doc names: `ok(data, status)` and `created(id, status)` | P3 |
| **C‑11** | Three raw `fetch` calls in `api.ts` outside `apiFetch`, against the table's "never inline raw fetch" framing | P3 |
| **S‑10** | `DELETE /api/media/*` — in no row of the surface map | P3 |
| **S‑11** | A **second** POS login entry, `POST /api/auth/pos-login`; the guide reads as if `/api/pos/auth/login` is the only path | P3 |
| **G‑24** | The five guides' honesty-marker convention (`UNVERIFIABLE`, "no single Inventory panel", "planned, not live") is not recorded as the folder's standard anywhere | P3 |
| **R‑17** | `G1`–`G4` mean governance incidents in the appendices and deploy gates in the waves plan — one namespace, two meanings | P3 |
| **N‑14** | `## 6. Export CLI` appears **twice** with a duplicated body, an artefact of the 2026-10-06 three-way split | P3 |

**F‑4** (filed in [[code-vs-docs]], `STALE`): `TableView.tsx`, `KitchenView.tsx` and
`ProjectPicker.tsx` are real POS views absent from `COMPONENT_CATALOG.md` §3 — and `TableView` is the
restaurant-table surface `API_SURFACE_MAP.md` documents as `/pos-tables/*`, so the POS table feature
has no layer-1 entry point anywhere in the vault.

One entry is a judgement call and is labelled as such: **A‑18**. The source audit recorded the two
helpers as an aside inside a `MATCHED` entry rather than as a classed gap, but real code with no claim
anywhere is exactly this file's subject, so it is filed here.

# Entries by folder

## docs/01-architecture

<!-- 2 entries from this folder -->

### A‑11 · [[ARCHITECTURE]] §3 — `window.*` globals · one site omitted

- **Origin** audit A entry `A‑11` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "verified 2026-10-02: zero `window.*` data globals anywhere under `components/admin/` or
  `components/pos/`. … `CampsSection.astro` still sets/reads `window.__API_BASE` and
  `window.__SSR_RENDERED` (`MarketplaceHome.astro` reads `__API_BASE`) and `gallery.astro` uses
  `window.__galleryImages`."
- **Expected** no cross-file data global under admin/pos; the three named public files are the only
  public ones.
- **Actual** All 22 `window.*` occurrences under `components/admin/` + `components/pos/` are browser
  APIs, not channels: `window.print()` (`PaymentReceipt.tsx:115`, `FolioReceipt.tsx:157`,
  `views/ReceiptModal.tsx:51`), `window.URL.createObjectURL` (`AuditLogPanel.tsx:87,93`),
  `window.location` (`ResetPasswordPage.tsx:17`, `RegisterPage.tsx:18`, `AdminApp.tsx:217,329,332,333,341`,
  `POSApp.tsx:157,252`), `setTimeout`/`clearTimeout`, `window.open`. All three named public globals
  confirmed. **A fourth `__API_BASE` site is not listed**: `app/src/middleware/securityHeaders.ts` also
  references it.
- **Class** MATCHED (the claim itself) + one UNDOCUMENTED site · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC

### A‑18 · [[ARCHITECTURE]] §4 — response helpers

- **Origin** audit A entry `A‑18` · baseline `dee3124` · source `docs/01-architecture/ARCHITECTURE.md`
- **Source** `docs/01-architecture/ARCHITECTURE.md` — the section named in the heading above
- **Claim** "`jsonResponse` / `cachedJsonResponse` / `errorResponse` in `backend/src/utils/response.js`.
  All data is camelCased (`toCamel`) on the way out; the registry (`routes/registry.js`) documents the
  contract."
- **Expected** three helpers, `toCamel` applied on output, registry present.
- **Actual** `backend/src/utils/response.js:38` `jsonResponse`, `:64` `cachedJsonResponse`,
  `:87` `errorResponse`, `:11` `toCamel` — inside both success helpers (`JSON.stringify(toCamel(data))`
  at `:41` and `:65`). `backend/src/routes/registry.js` = 3,494 lines, header at `:1-8` calls itself
  "the single source of truth for the API contract". Two helpers the doc does not mention:
  `ok(data, status)` (`:96`) and `created(id, status)` (`:103`).
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none

## docs/02-api

<!-- 3 entries from this folder -->

### C‑9 · [[API_CONTRACT]] §1 — "the backend mirrors it" · coverage is much thinner than implied

- **Origin** audit A entry `C‑9` · baseline `dee3124` · source `docs/02-api/API_CONTRACT.md`
- **Source** `docs/02-api/API_CONTRACT.md` — the section named in the heading above
- **Claim** "The backend mirrors it: every route registered in `backend/src/routes/registry.js` and every
  handler in `backend/src/api/**` / `backend/src/routes/pos/**`." §5 closes: "Exact paths, methods, and
  payloads: see `backend/openapi.json` (source of truth)."
- **Expected** the registry / `openapi.json` to be a usable index of the surface.
- **Actual** `backend/openapi.json` contains **88 paths**. The surface map's 268 endpoint rows resolve
  against `openapi.json` for only **69** paths / **65** path+method pairs. The remaining **199** rows are
  real at runtime but have **no OpenAPI registration at all** — they are served by the wildcard
  dispatcher in `index.js` (`registry.js:5-7` documents this: *"Runtime dispatch (the wildcard catch-all in
  index.js …) is intentionally UNCHANGED"*). That includes the **canonical** `/api/projects` surface: the
  map's own headline says "Canonical mount is `/api/projects`", and `openapi.json` has no `/api/projects`
  path at all (only `/api/camps` and `/api/camps/{id}`).
- **Class** UNDOCUMENTED · **Severity** **P2** · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC
- **Severity rationale** `API_CONTRACT.md` calls `openapi.json` the source of truth for exact paths, and
  `app/src/lib/api-types.ts` is generated from it. A reader who trusts that will find ~74% of the
  documented endpoints absent and no stated reason. The map's header does explain the registry's scope;
  the *contract* does not.

### C‑11 · [[API_CONTRACT]] §5 cross-note — `/auth/refresh` raw fetch

- **Origin** audit A entry `C‑11` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` Auth table, `/auth/refresh` row
- **Claim** "— (internal silent-refresh via raw fetch) | `POST /api/auth/refresh` | … | Rotate access
  token (no public wrapper; **api.ts uses a raw fetch on purpose**)"
- **Expected** a deliberate raw `fetch` for refresh, distinct from the shared client.
- **Actual** `app/src/lib/api.ts:120-121` — `// T7: shared in-flight silent-refresh — concurrent 401s await
  one refresh call … Uses a raw fetch on purpose: apiFetch`; `:139` picks `/pos/auth/refresh` or
  `/auth/refresh` by realm; `:150` `const response = await fetch(...)`. The rationale is in the source.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **UNDOCUMENTED (P3)** `api.ts` also holds raw `fetch` calls outside `apiFetch` that this table's blanket
  "never inline raw `fetch` calls in components" framing does not mention: `:1273` (`/upload` multipart),
  `:1558` (`/admin/audit/export`), `:2688` (`/admin/performance/export`).

### S‑10 · [[API_SURFACE_MAP]] — upload & media

- **Origin** audit A entry `S‑10` · baseline `dee3124` · source `docs/02-api/API_SURFACE_MAP.md`
- **Source** `docs/02-api/API_SURFACE_MAP.md` — the section named in the heading above
- **Claim** "`/upload` | POST | `upload.js` | R2 bucket (`MEDIA_BUCKET`) | Auth | Upload image to R2
  (multipart or octet-stream, ≤8MB, jpg/png/webp/gif)"; "`/media/*` | GET | `upload.js` (mediaRoutes) |
  R2 bucket | Public | Stream stored media object (immutable cache, tenant-scoped keys)".
- **Expected** both, with the size and MIME list.
- **Actual** `backend/src/api/upload.js:7` `export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;` — exactly 8 MB.
  `:15-19` MIME map `jpg`/`jpeg` → `image/jpeg`, `png`, `webp`, `gif` — exactly the five documented.
  `:84` documents the `application/octet-stream` + `?filename=` path. `:146` `export const mediaRoutes =
  new Hono()`; `:148` `mediaRoutes.on(['GET','HEAD'], '*', …)`; `:191` `mediaRoutes.delete('*', …)`;
  `:222` the 404 fallback. The cited code-range `upload.js:146-222` is exact.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **UNDOCUMENTED (P3)** the `DELETE /api/media/*` route at `upload.js:191` appears in no row of this
  section.

## docs/06-security

<!-- 1 entry from this folder -->

### S‑11 · [[security-guide]] §Authentication — both token worlds · MATCHED

- **Origin** audit B entry `S‑11` · baseline `ddc63c6` · source `docs/06-security/security-guide.md`
- **Source** `docs/06-security/security-guide.md` — the section named in the heading above
- **Claim** Admin tokens from `POST /api/auth/login` with `role: 'admin'` or `'super_admin'`, scoped
  via `tenantId`; POS tokens from `POST /api/pos/auth/login` with `posType: 'pos'`, scoped via
  `organizationId`; tokens stateless; stored client-side in `localStorage`; transmitted as
  `Authorization: Bearer`; cross-tenant access blocked; scope denial returns **403**, not 401.
- **Expected** all of it.
- **Actual** `backend/src/routes/pos/index.js:240-246` builds the POS claim set —
  `organizationId: user.organization_id`, `storeId`, `projectId`, `role`, `posType: 'pos'`,
  `userType: 'org'` — and `:370` sets `posType: 'pos'` on the refresh token. POS login is mounted at
  `routes/pos/index.js:278` `pos.post('/auth/login', …)`, reached as `/api/pos/auth/login` via
  `index.js:339`. Admin auth is `index.js:213` `app.all('/api/auth/*', …)` → `handleAuthRoute`.
  Token storage is `app/src/lib/session.ts:52,63,74` (`window.localStorage.getItem/setItem/removeItem`).
  The 403/401 split matches Part 8a **C‑7** exactly.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **UNDOCUMENTED (P3)** there is a **second** POS login entry the guide does not mention:
  `POST /api/auth/pos-login` (`index.js:211`, `handlePosLoginRequest`), which
  `API_SURFACE_MAP.md` documents as "POS cashier login via admin host". Same handler, different
  mount; the guide reads as if `/api/pos/auth/login` is the only POS credential path.

## docs/07-data

<!-- 1 entry from this folder -->

### D‑13 · [[migrations]] §1 — the head claim does not carry the pending-apply caveat · UNDOCUMENTED

- **Origin** audit B entry `D‑13` · baseline `ddc63c6` · source `docs/07-data/migrations.md`
- **Source** `docs/07-data/migrations.md` §1 vs `backend/migrations/0127_meals_tenant_composite_pk.sql`
- **Claim (gap)** No doc in `docs/07-data` states that `0127` is committed but **not applied**, or
  that `0124`/`0126`/`0127` post-date the guide.
- **Actual** `0127`'s own header says it plainly ("PENDING-APPLY … Owner command (never run by an
  agent)"), and `tenant-import-schema.md` §"Why the array caps stay at 200" and the appendix both
  reason *about* `0127` as a landed change ("**Reusable across tenants since 0127**"), which is only
  true once it is applied. Nothing in `07-data` carries the distinction between *the head in the
  tree* and *the head in the ledger*.
- **Class** UNDOCUMENTED · **Severity** P2 · **Action** UPDATE-DOC
- **Severity** P2 · **Action** UPDATE-DOC

## docs/08-guides

<!-- 1 entry from this folder -->

### G‑24 · All five guides — the honesty-marker convention · MATCHED, and it is the folder's real asset · UNDOCUMENTED

- **Origin** audit B entry `G‑24` · baseline `ddc63c6` · source `docs/08-guides/README.md (and all five guides)`
- **Source** `docs/08-guides/README.md (and all five guides)` — the section named in the heading above
- **Claim** Across the five guides, claims are qualified in-line: `UNVERIFIABLE` (camp-guide rate-plan
  precedence, service-guide worker inbox and Availability panel), `no dedicated panel`,
  `no separate Orders row`, `no single Inventory panel`, `no fixed … enum`, `no color thresholds, no
  block/capacity endpoints`, `live values: cash|card|split`, `planned, not live`, `Tab not
  implemented`, `no Session/Weekday/Group/Early Bird`, `no tip handling in admin-reports.js`.
- **Expected** the markers to be honest about what is absent.
- **Actual** **Every single one of these markers was checked and holds** (**G‑9**, **G‑11**, **G‑13**,
  **G‑14**, **G‑16**, **G‑17**, **G‑20**-partial, **G‑22**). Ten+ named absences, zero false
  absences found.
- **Class** MATCHED · **Severity** P3 · **Action** none
- **Severity** P3 · **Action** none
- **UNDOCUMENTED (P3)** nothing in `08-guides/README.md` §Concepts or §Docs records this convention as
  the folder's standard — it is a README bullet that says "Status lifecycles are the load-bearing
  concept" while the actual method (declare the absence) goes unnamed. A future guide author
  writing confidently-by-default would break a standard nothing documents.

## docs/09-plans

<!-- 1 entry from this folder -->

### R‑17 · [[FINAL_IMPLEMENTATION_PLAN_v3_appendices]] §1 — the G-numbering collides with the wave plan's G-numbers · UNDOCUMENTED

- **Origin** audit B entry `R‑17` · baseline `ddc63c6` · source `docs/09-plans/FINAL_IMPLEMENTATION_PLAN_v3_appendices.md`
- **Source** `FINAL_IMPLEMENTATION_PLAN_v3_appendices.md` §1 "Governance Incident Closure" vs
  `FINAL_IMPLEMENTATION_PLAN_v3_waves.md` §"Deploy gates"
- **Claim (collision)** The appendices define **G1** "A1 created migrations 0100 and 0101 during the
  audit", **G2** "A22 applied a production code fix into the tree", **G3** "M1 was committed without a
  definition", **G4** "A17 probed the live R2 bucket" — while the waves file defines **G1** as the
  Wave 1 storefront deploy gate, **G2** the Wave 2 money-path gate, **G3** the Wave 3 auth gate, and
  **G6.5** staging validation.
- **Expected** distinct namespaces.
- **Actual** Both files are live in `docs/09-plans/`, both are `status: approved`, and the folder
  README **correctly disambiguates** them ("**Deploy gates G1–G6.5**" vs "**Governance incidents
  G1–G4** are closure records, not plans"). So the README is right and the collision is only in the
  two files.
- **Class** UNDOCUMENTED · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Note** `G1`'s subject is also stale — migrations `0100_add_project_id_nullable.sql` and
  `0101_add_pos_stores_project_id.sql` both exist in the live lineage and were reconstructed as part
  of the squash (**R‑12**).

## docs/10-tenant-import

<!-- 1 entry from this folder -->

### N‑14 · [[tenant-import-appendix]] — §"6. Export CLI" is duplicated verbatim · UNDOCUMENTED

- **Origin** audit B entry `N‑14` · baseline `ddc63c6` · source `docs/10-tenant-import/tenant-import-appendix.md`
- **Source** `docs/10-tenant-import/tenant-import-appendix.md`, headings at `:174` and `:190`
- **Claim (gap)** `:174` is `## 6. Export CLI + round-trip losses`; `:190` is
  `## 6. Export CLI + what round-trips vs what drops`. Both carry the same three-paragraph intro and
  the same three command lines.
- **Expected** one §6.
- **Actual** **Two `## 6` headings with a duplicated body** — an artefact of the 2026-10-06
  three-way split of `docs/tenant-import.md` (same date as the appendix's `created:`). The round-trip
  ledger and residual findings follow once, at `§"The round-trip ledger as of 2026-10-02"` (`:211`).
- **Class** UNDOCUMENTED · **Severity** P3 · **Action** UPDATE-DOC
- **Severity** P3 · **Action** UPDATE-DOC
- **Note** the same split shows a related artefact in `tenant-import-schema.md` — the `## 2` heading at
  `:31` and `tenant-import-types.md`'s `## 3` at `:29` — but there the split is clean (each half owns
  its section number). Only the appendix duplicates.
