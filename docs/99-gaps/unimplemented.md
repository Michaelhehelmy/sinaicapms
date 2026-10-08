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
  - "[[code-vs-code]]"
  - "[[unverified]]"
  - "[[API_SURFACE_MAP]]"
  - "[[API_CONTRACT]]"
  - "[[security-guide]]"
  - "[[migrations]]"
  - "[[analytics-guide]]"
code-references:
  - "backend/src/index.js"
  - "backend/src/api/upload.js"
  - "backend/src/utils/response.js"
  - "backend/src/api/tenant-import.js"
  - "backend/src/api/reports.js"
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
is the reason the audits read source rather than grepping docs at each other.

**Two classes now live here, and the distinction is the reason they share a file.** An `UNDOCUMENTED`
entry is *real code with no claim* — the fix is to write the doc, and 2026-10-06 wrote ten of them. A
**deferred** entry is the opposite: a *real absence* the owner has parked, so the fix is to record
that it is absent and stop presenting it as shipping. Both are "the docs and the code disagree"; they
disagree in opposite directions, and the second kind is the one that silently rots, because an absent
feature has nothing in the code for a later grep to find.

| Class | Count | Status |
|---|---|---|
| `UNDOCUMENTED` entries | **10** | 9 `RESOLVED-DOC` · 1 `RESOLVED-REJECTED` — every one closed by an edit to the doc that omitted it |
| `DEFERRED` items | **3** | `G‑1`, `G‑2`, `G‑3` — all under [Advanced analytics](#advanced-analytics) below; **0** `OPEN` |

The folder-wide ledger, including `OPEN` and `RESOLVED-CODE`, is
`## Status as of 2026-10-06` in [[code-vs-docs]].

| Entry | The unclaimed thing | Status |
|---|---|---|
| **C‑9** | ~199 of the 268 documented endpoints have **no OpenAPI registration at all** — including the canonical `/api/projects` surface `openapi.json` has no path for | `RESOLVED-DOC` `0ce48fd` |
| **D‑13** | That `0127` is committed but **not applied** — "head in the tree" ≠ "head in the ledger" | `RESOLVED-DOC` `1a1574c` |
| **A‑11** | A fourth `window.__API_BASE` site, `app/src/middleware/securityHeaders.ts` | **`REJECTED` 2026-10-06** — see the entry |
| **A‑18** | Two response helpers no doc names: `ok(data, status)` and `created(id, status)` | `RESOLVED-DOC` `3b753e4` |
| **C‑11** | Three raw `fetch` calls in `api.ts` outside `apiFetch`, against the table's "never inline raw fetch" framing | `RESOLVED-DOC` `0ce48fd` |
| **S‑10** | `DELETE /api/media/*` — in no row of the surface map | `RESOLVED-DOC` `0ce48fd` + `99a5f60` |
| **S‑11** | A **second** POS login entry, `POST /api/auth/pos-login`; the guide reads as if `/api/pos/auth/login` is the only path | `RESOLVED-DOC` `0ce48fd` + `ff264db` |
| **G‑24** | The five guides' honesty-marker convention (`UNVERIFIABLE`, "no single Inventory panel", "planned, not live") is not recorded as the folder's standard anywhere | `RESOLVED-DOC` `0f0c09a` |
| **R‑17** | `G1`–`G4` mean governance incidents in the appendices and deploy gates in the waves plan — one namespace, two meanings | `RESOLVED-DOC` `ae7162b` |
| **N‑14** | `## 6. Export CLI` appears **twice** with a duplicated body, an artefact of the 2026-10-06 three-way split | `RESOLVED-DOC` `8d9ec8e` |

**`RESOLVED-DOC` means the citing doc was edited, not that the code changed.** The owner chose FIX DOCS
ONLY for this round, so nine of these ten closed by adding the missing claim to the doc that omitted
it — `A‑18`'s two helpers are now named in `ARCHITECTURE.md` §4, `S‑10`'s `DELETE /api/media/*` in
`API_SURFACE_MAP.md`'s Upload & Media rows, and so on. `A‑11` is the tenth and the only one that
closed by *not* editing anything.

**F‑4** (filed in [[code-vs-docs]], `STALE`): `TableView.tsx`, `KitchenView.tsx` and
`ProjectPicker.tsx` are real POS views absent from `COMPONENT_CATALOG.md` §3 — and `TableView` is the
restaurant-table surface `API_SURFACE_MAP.md` documents as `/pos-tables/*`, so the POS table feature
has no layer-1 entry point anywhere in the vault. Closed in `8b01b00`.

One entry is a judgement call and is labelled as such: **A‑18**. The source audit recorded the two
helpers as an aside inside a `MATCHED` entry rather than as a classed gap, but real code with no claim
anywhere is exactly this file's subject, so it is filed here.

## Deferred items

Every item the owner parked rather than built, with the design source it came from, its priority, the
date it was deferred, and why. `DEFER` is not a synonym for "we did not get to it": each row below
records a **decision**, and the decision is only useful while it is written down somewhere a reader
will look before building a plan on the assumption the feature exists.

The six code-side `DEFERRED` items from the `O‑21` residue are **not** here — they are absences in the
*applied migration lineage*, they want a code fix rather than a design decision, and they are filed as
six rows in [[code-vs-code]] with `Severity` P2 and `Action` `FIX-CODE`, deferred to Wave 9.

| Item | Feature | Design source | Priority | Deferred on | Reason |
|---|---|---|---|---|---|
| `G‑1` | Customer Lifetime Value (CLV) — total spend per customer over time | `docs/08-guides/analytics-guide.md` §Customer Metrics | **P3** | 2026-10-06 | never built; the guide is the only artefact in the repo asserting it |
| `G‑2` | Automatic customer segmentation by booking frequency · spend level · recency · source | `docs/08-guides/analytics-guide.md` §Customer Segments | **P3** | 2026-10-06 | never built; no `segments` key or segmentation code anywhere |
| `G‑3` | 30-day / 90-day / annual retention analysis | `docs/08-guides/analytics-guide.md` §Retention Analysis | **P3** | 2026-10-06 | never built; no `retention` key or retention SQL anywhere |

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

> **A‑11 REJECTED 2026-10-06: the "4th `__API_BASE` site" is a JSDoc line, not a site.**
> `app/src/middleware/securityHeaders.ts:16` sits **inside the module's opening comment block** —
> `/**` opens at `:4` and `*/` closes at `:40` — and the sentence it belongs to is the CSP-rationale
> prose "`script-src 'self' 'unsafe-inline'` … Fast Refresh preamble, `window.__API_BASE` bootstrap".
> No read and no write of the global exists anywhere in the file. `git log -S 'window.__API_BASE' --
> app/src/middleware/securityHeaders.ts` returns a single commit, `b164048`, and its diff adds the
> line as `+ *` — a comment, from the moment it appeared.
>
> This is the only `REJECT` in the whole folder and the reason the class exists: the artefact was
> real *as text* and false *as code*, and had it been accepted it would have produced a doc edit
> describing a fourth global that does not exist — adding a false claim in the act of fixing one.
> **Nothing was edited.** The three globals §3 names are exactly right and stand: `__API_BASE` set at
> `CampsSection.astro:186` and read at `CampsSection.astro:251` + `MarketplaceHome.astro:247`;
> `__SSR_RENDERED` at `CampsSection.astro:190`; `__galleryImages` at `gallery.astro:141`.
>
> **The transferable lesson, recorded because it will recur:** a grep for a *symbol* in a file that
> opens with a 36-line JSDoc block will hit prose. The three `window.*` sites in the `Actual` line
> above were each confirmed as code by reading the line — the same check that rejected this one.

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

> **RESOLVED-DOC 2026-10-06** — ARCHITECTURE.md §4 now names all five `response.js` helpers, in
> `3b753e4`. The entry text above is **verbatim** from the source audit: the record is what the
> doc omitted on 2026-10-06 beside what the code already had. **No code changed** — the owner
> chose FIX DOCS ONLY, so an `UNDOCUMENTED` entry closes by writing the missing claim, never by
> adding the missing code.

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

> **RESOLVED-DOC 2026-10-06** — API_CONTRACT.md §1's "the backend mirrors it" and §5's
> "openapi.json (source of truth)" were both replaced, in `0ce48fd`. The entry text above is
> **verbatim** from the source audit: the record is what the doc omitted on 2026-10-06 beside what
> the code already had. **No code changed** — the owner chose FIX DOCS ONLY, so an `UNDOCUMENTED`
> entry closes by writing the missing claim, never by adding the missing code.

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

> **RESOLVED-DOC 2026-10-06** — API_SURFACE_MAP.md now records the three deliberate raw fetches,
> in `0ce48fd`. The entry text above is **verbatim** from the source audit: the record is what the
> doc omitted on 2026-10-06 beside what the code already had. **No code changed** — the owner
> chose FIX DOCS ONLY, so an `UNDOCUMENTED` entry closes by writing the missing claim, never by
> adding the missing code.

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

> **RESOLVED-DOC 2026-10-06** — API_SURFACE_MAP.md Upload & Media gained the `DELETE` row, in
> `0ce48fd` and `99a5f60`. The entry text above is **verbatim** from the source audit: the record
> is what the doc omitted on 2026-10-06 beside what the code already had. **No code changed** —
> the owner chose FIX DOCS ONLY, so an `UNDOCUMENTED` entry closes by writing the missing claim,
> never by adding the missing code.

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

> **RESOLVED-DOC 2026-10-06** — security-guide.md §Authentication now names `POST
> /api/auth/pos-login`, in `ff264db`. The entry text above is **verbatim** from the source audit:
> the record is what the doc omitted on 2026-10-06 beside what the code already had. **No code
> changed** — the owner chose FIX DOCS ONLY, so an `UNDOCUMENTED` entry closes by writing the
> missing claim, never by adding the missing code.

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

> **RESOLVED-DOC 2026-10-06** — migrations.md §1 now separates head-in-the-tree from head-applied,
> in `1a1574c`. The entry text above is **verbatim** from the source audit: the record is what the
> doc omitted on 2026-10-06 beside what the code already had. **No code changed** — the owner
> chose FIX DOCS ONLY, so an `UNDOCUMENTED` entry closes by writing the missing claim, never by
> adding the missing code.

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

> **RESOLVED-DOC 2026-10-06** — 08-guides/README.md §Concepts now records the honesty-marker
> convention, in `0f0c09a`. The entry text above is **verbatim** from the source audit: the record
> is what the doc omitted on 2026-10-06 beside what the code already had. **No code changed** —
> the owner chose FIX DOCS ONLY, so an `UNDOCUMENTED` entry closes by writing the missing claim,
> never by adding the missing code.

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

> **RESOLVED-DOC 2026-10-06** — both colliding files now disambiguate their own G-namespace, in
> `ae7162b`. The entry text above is **verbatim** from the source audit: the record is what the
> doc omitted on 2026-10-06 beside what the code already had. **No code changed** — the owner
> chose FIX DOCS ONLY, so an `UNDOCUMENTED` entry closes by writing the missing claim, never by
> adding the missing code.

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

---

> **RESOLVED-DOC 2026-10-06** — the duplicate §6 was removed and the surviving heading records the
> de-duplication, in `8d9ec8e`. The entry text above is **verbatim** from the source audit: the
> record is what the doc omitted on 2026-10-06 beside what the code already had. **No code
> changed** — the owner chose FIX DOCS ONLY, so an `UNDOCUMENTED` entry closes by writing the
> missing claim, never by adding the missing code.

# Advanced analytics

**This is the anchor `docs/08-guides/analytics-guide.md` points at.** Its three removed capability
sections each ended with *"These features are designed but not built. See
[[unimplemented#advanced-analytics]] for status."* — written in `0f0c09a`, before the target existed.
Until this section landed that was a dangling link, which is the failure mode this note exists to
catch, committed by the pass meant to fix it.

The three items are `DEFERRED`, not `RESOLVED-DOC`, and the difference is the whole reason they are
recorded here rather than closed. **What was resolved is the claim, not the feature:** the guide no
longer presents a metric the API cannot return. **What was deferred is the build**, and nothing in the
tree will ever produce a grep hit for it — an absent feature has no symbol, no migration, no stub and
no route reservation, so the only thing preventing this from being re-audited as a new finding is a
written decision. Triage A reached exactly this conclusion and classified all three `UNKNOWN`
("strike the row, or add `clv` to the endpoint?"); the owner answered *defer*.

**Shared design source:** `docs/08-guides/analytics-guide.md` (`status/live`, `audience/tenant-admin`).
**Priority** P3 for all three. **Deferred on** 2026-10-06.

## G‑1 · Customer Lifetime Value (CLV)

- **Origin** audit A entry `G‑1` · baseline `dee3124` · filed in [[code-vs-docs]] §`docs/08-guides`
- **Design source** `docs/08-guides/analytics-guide.md` §Customer Metrics — the row read
  "**Customer Lifetime Value (CLV)** | Total spend per customer over time"
- **Status** **`DEFERRED` 2026-10-06** · **Priority P3** · **Action** `DEFER` (build) — the doc claim
  was closed in `0f0c09a`, the feature was not
- **Evidence that it never existed** `GET /api/reports/customer-metrics` is `reports.js:348` and
  returns **exactly six keys** at `:404-411` — `days`, `total_customers`, `new_customers`,
  `repeat_customers`, `avg_order_value`, `avg_collected`. No `clv`, no `lifetime_*`.
  `git log -S 'lifetime_value' -- backend/` → **0 commits**.
- **Why deferred** it is a reporting nicety, not a capability anything else depends on: no screen,
  no export, no alert and no other endpoint reads it. `avg_order_value` +
  `avg_collected` already answer the operational question the row was reaching for, and the guide
  now explains the difference between them (cross-channel vs bookings-only — `storefront_orders` has
  no `amount_paid`, `reports.js:385-402`).
- **If it is ever built** the value is derivable today with no migration from the same six keys plus
  per-customer order history; it belongs on `customer-metrics` as a new key, not as a new endpoint.
- **Do not** re-add the row to the guide's Customer Metrics table. That table's remaining six rows
  are the real endpoint output, and the row format is what made the three fabrications invisible.

## G‑2 · Customer segmentation

- **Origin** audit A entry `G‑2` · baseline `dee3124` · filed in [[code-vs-docs]] §`docs/08-guides`
- **Design source** `docs/08-guides/analytics-guide.md` §Customer Segments — customers
  "automatically segmented by" booking frequency · spend level · recency · source
- **Status** **`DEFERRED` 2026-10-06** · **Priority P3** · **Action** `DEFER` (build)
- **Evidence that it never existed** no `segments` key in the response and no segmentation code
  anywhere. `git log -S 'segments' -- backend/src app/src` returns only *path*-segment helpers
  (`utils/errors.js`, a regex comment in `rateLimit.js`) and one marketing taxonomy array — a
  different concept that greps to the same word, which is exactly why this needed a history check
  rather than a grep.
- **Why deferred** four tiers of automatic segmentation is a product programme, not a metric, and it
  is the only one of the three whose absence would eventually need *stored* state (cohort membership
  with an as-of date) rather than a computed field. P3, and behind the other two, because nothing
  consumes it yet.
- **Same shape as `G‑1` and `G‑3`:** `analytics-guide.md` was the **only** artefact in the repo
  asserting any of the three — no backlog row, no roadmap line, no migration, no stub, no endpoint
  reservation. That is what makes them guide fabrications rather than documented-but-unbuilt features,
  and it is worth stating plainly, because the alternative reading — "there is a plan somewhere" —
  would have made them `IMPLEMENT` and sent a wave after nothing.

## G‑3 · Retention analysis

- **Origin** audit A entry `G‑3` · baseline `dee3124` · filed in [[code-vs-docs]] §`docs/08-guides`
- **Design source** `docs/08-guides/analytics-guide.md` §Retention Analysis — **30-day**, **90-day**
  and **annual** retention
- **Status** **`DEFERRED` 2026-10-06** · **Priority P3** · **Action** `DEFER` (build)
- **Evidence that it never existed** no `retention` key in `customer-metrics` and no retention SQL in
  `reports.js`. `git log -S 'retention' -- backend/src/api/reports.js` → **0 commits**. The only
  `retention` hits in `backend/src` are Durable-Object *eviction* comments
  (`durable/broadcaster.js:20,357`) — an unrelated concept that greps to the same word.
- **Why deferred** retention is the one of the three a tenant admin is most likely to be planning
  *around* without it, so deferring it has a cost: the guide must keep saying plainly that the
  numbers do not exist, which is why the "Planned — not yet implemented" block replaced the section
  rather than merely annotating it. Computing it needs a cohort definition the product has not
  chosen (first booking vs first paid booking; calendar month vs 30-day window), and that is a
  decision, not an implementation.
- **If it is ever built** `pos_orders` / `bookings` timestamps are sufficient for a 30-day window with
  no migration; the 90-day and annual figures are the same query with a different bucket, so there is
  no partial-build reason to prefer one.

**What all three share, and why they are filed together.** None is urgent, none is depended on, and
all three were being presented as shipping metrics in a `status/live` guide in the same table format
as the three metrics that are real — so no reader could tell them apart without reading the SQL. The
one interim action, independent of the defer decision, was to stop presenting them as live; that is
done. **If the owner later un-defers any of them, the entry moves to `OPEN` with the reason and the
date, and the guide's table is the place the row comes back to** — not this section, which exists to
say the row is *not* there.
