# Pass 7 — Inconsistency Sweep (read-only, 2026-09-24)

- Spec: `.opencode/agents/tmp/2026-09-24-pass7-inconsistencies.md`
- Method: Read + Grep only (default.grep / default.read). No source modified. ripgrep MCP was unusable (`spawn rg EACCES`), so all sweeps used the `grep` tool.
- Scope: `backend/src`, `backend/migrations`, `app/src/middleware/tenant.ts`, `backend/src/routes/registry.js`, `backend/src/index.js`.
- Per-item contract: two `file:line` locations + repro grep + one-line recommendation + falsification note (or `UNVERIFIED`).

---

## Class 1 — Duplicate error messages for the same condition

### INC-1A — Missing-tenant guard has 4 message/status spellings
- Locations: `backend/src/api/storefront.js:108` (`if (!tenantId) return errorResponse('Tenant ID required', 400)`) vs `backend/src/api/orders.js:966` (`if (!tenantId) return errorResponse('Unauthorized: missing tenant context', 401)`) — plus `backend/src/api/audit.js:172` (`'Tenant context required', 400`) and `backend/src/api/admin.js:143` (`'Tenant ID is required', 400`).
- Repro grep: `grep -rn "Tenant ID required\|missing tenant context\|Tenant context required\|Tenant ID is required" backend/src` (≈100+ hits; `Tenant ID required` alone covers storefront/financials/supply/crm/hr/ai; `missing tenant context` covers resolveScope/orders/camps/tags; `Tenant context required` covers audit/project-items/project-links/tags/pos-tables).
- Recommendation: Canonicalize on one message+status for `!tenantId` (keep the legacy `401 'Unauthorized: missing tenant context'` only where byte-compat is locked, else `400 'Tenant ID required'`) via the shared `errorResponse` helper.
- Falsification: Read storefront.js:108-context, orders.js:966-context, audit.js:172-context, admin.js:143-context via grep output; all four fire on the identical `!tenantId` predicate with different bodies/statuses — confirmed, not a different-condition false positive.

### INC-1B — Invalid/missing token has 5 spellings
- Locations: `backend/src/middleware/requireAuth.js:66-67` (defaults `missingToken 'Missing or invalid Authorization header'` 401 / `invalidToken 'Session expired or invalid signature'` 401) vs `backend/src/routes/pos/index.js:243` (`return errorResponse('Invalid token type', 401)`, with `typeMismatch` overrides at `:206,:209`) — plus `backend/src/middleware/sharedAuth.js:247` (`'Unauthorized: Missing or invalid token'` 401) and `backend/src/index.js:434` (`'Missing or invalid Authorization header or token query parameter'`).
- Repro grep: `grep -rn "Invalid token type\|Session expired or invalid signature\|Missing or invalid token\|Missing or invalid Authorization" backend/src`.
- Recommendation: Unify token-failure bodies behind `requireAuth`'s `DEFAULT_MESSAGES` + per-gate overrides and document the one intentional exception (POS refresh `Invalid token type`).
- Falsification: Read requireAuth.js:65-72 + :158-161 (typeMismatch falls back to invalidToken shape) and pos/index.js:206-252 context via grep; POS-refresh divergence is deliberate per comment, the sharedAuth/index.js variants are separate hand-rolled gates — confirmed duplication, one case intentional.

### INC-1C — Forbidden/scope-denied has 4 spellings
- Locations: `backend/src/middleware/requireAuth.js:71` (`scopeDenied 'Forbidden: Access denied to this tenant partition'` 403, also emitted at `backend/src/middleware/resolveScope.js:180`) vs `backend/src/api/pos-tables.js:79` (`'Forbidden: admin role required'` 403) — plus `requireAuth.js:68` (`'Forbidden: POS sessions are not allowed to access admin routes'`) and `:69` (`'Forbidden: Insufficient permissions'`).
- Repro grep: `grep -rn "Forbidden:" backend/src/middleware backend/src/api/pos-tables.js`.
- Recommendation: Keep `scopeDenied` for tenant-partition denials and `insufficientRole` for role denials, and retire the one-off `admin role required` string in pos-tables.
- Falsification: Read pos-tables.js:70-82 (`assertAdminMutation`) vs requireAuth.js:65-72; both are 403 role/scope denials on the same admin-mutation path — confirmed overlap; UNVERIFIED whether any client branches on the `admin role required` literal (no client grep run).

### INC-1D — 404 not-found has 3 spellings
- Locations: `backend/src/index.js:897` (`app.all('/api/*', () => errorResponse('API endpoint not found', 404))`) vs `backend/src/index.js:906` (`app.notFound((c) => errorResponse('Not found', 404))`) — plus `:387,:394` (`'Tenant not found', 404` for non-super-admin without tenant).
- Repro grep: `grep -rn "endpoint not found\|'Not found'\|Tenant not found" backend/src/index.js`.
- Recommendation: Keep `API endpoint not found` for `/api/*` catch-all and `Not found` for non-API fallback, and rename the tenant-missing 404 to a 400/401 tenant message so 404 means route-missing only.
- Falsification: Read index.js:897-906 (adjacent lines, visibly two 404 bodies) and :381-394 context via grep — confirmed; UNVERIFIED whether the `Tenant not found` 404 is covered by a byte-compat test.

---

## Class 2 — Dual field names (same concept, two names)

### INC-2A — `amountPaid` (camel) vs `paidAmount` (camel) on the wire
- Locations: `backend/src/routes/registry.js:513` (`amountPaid: z.number().optional()` in `OrderCreateRequest`, repeated `:558,:579,:605,:665,:2160`) vs `backend/src/routes/registry.js:3013` (`paidAmount: z.number().nullable().optional()` in `PosOrderDetail`).
- Repro grep: `grep -rn "amountPaid\|paidAmount" backend/src/routes/registry.js`.
- Recommendation: Pick one wire name (`amountPaid`) for both order and POS-order schemas and keep the other as a deprecated alias for one release.
- Falsification: Read registry.js:505-519 and :3005-3023; both are same-file OpenAPI schemas for a paid-sum field — confirmed, not two different semantics.

### INC-2B — `amount_paid` vs `paid_amount` (snake, DB columns)
- Locations: `backend/src/api/reservations.js:337` (`INSERT INTO orders (… total_amount, amount_paid, …)`) vs `backend/src/api/reservations.js:417` (`INSERT INTO pos_transactions (… total_amount, paid_amount, …)`) — plus `backend/src/api/financials.js:417,422` (`invoices.paid_amount`) and `backend/src/api/orders.js:30,52` (`amount_paid` zod) vs `orders.js:837` (`paid_amount` select on the POS mirror insert).
- Repro grep: `grep -rn "amount_paid\|paid_amount" backend/src`.
- Recommendation: Document the table-scoped convention (orders/invoices use their historic column; do not rename columns) and add a registry-level comment so new tables pick one name.
- Falsification: Read reservations.js:333-340 (orders insert) and :412-424 (pos_transactions insert); both are paid-sum columns on sibling booking tables — confirmed dual naming; UNVERIFIED whether a migration unifying them is desired (likely not — rename = breaking).

### INC-2C — `totalPrice` / `total_price` / `totalAmount` / `total_amount` four-way
- Locations: `backend/src/api/orders.js:306` (`let totalPrice = 0`, internal) + `backend/src/api/orders.js:358` (`return jsonResponse({ total_price: totalPrice })`) vs `backend/src/routes/registry.js:548` (`priceEnvelopeSchema = z.object({ totalPrice: z.number() })`) — plus `backend/src/api/reservations.js:94,99` (`totalAmount`/`total_amount` pair in `buildDuplicateResponse`).
- Repro grep: `grep -rn "totalPrice\|total_price\|totalAmount\|total_amount" backend/src/api/orders.js backend/src/routes/registry.js | head -40`.
- Recommendation: Enforce the Phase-9 camelCase wire contract (`totalAmount`) end-to-end and leave `total_amount` as DB-only, deleting the `total_price`/`totalPrice` wire variants.
- Falsification: Read orders.js:304-358 (var `totalPrice` → wire `total_price`) and registry.js:548; same calculate-price value exposed under two wire keys — confirmed.

### INC-2D — `camp_id` vs `project_id` (scope key dual, wire+DB)
- Locations: `backend/src/api/orders.js:706` (destructured `camp_id`, inserted at `:737`) vs `backend/migrations/0100_add_project_id_nullable.sql:78` (`ALTER TABLE orders ADD COLUMN project_id …`, with header noting `orders (has camp_id 0092:32)` at `:16`).
- Repro grep: `grep -rn "camp_id" backend/src/api/orders.js | head; grep -n "camp_id\|project_id" backend/migrations/0100_add_project_id_nullable.sql | head -30`.
- Recommendation: Treat `project_id` as the canonical scope key for all new code and read `camp_id` only through the 0105 backfill/compat path until the sunset removes it.
- Falsification: Read 0100:13-28 (explicit per-table `camp_id` presence ledger) and orders.js:706-737; same-table dual scope columns — confirmed by migration author's own ledger.

---

## Class 3 — Dual date formats

### INC-3A — JS `toISOString()` vs SQL `datetime('now')` for the same `created_at/updated_at`
- Locations: `backend/src/api/storefront.js:627` (`isPublished ? new Date().toISOString() : null` for `published_at`) vs `backend/src/api/categories.js:83` (`INSERT … created_at … datetime('now')`) — plus `backend/src/api/orders.js:737-738` (`datetime('now'), datetime('now')` for order timestamps) vs `backend/src/index.js:200` (`timestamp: new Date().toISOString()`).
- Repro grep: `grep -rn "toISOString" backend/src | head -20; grep -rn "datetime('now')" backend/src | head -20` (≈37 toISOString hits vs ≈100 datetime hits).
- Recommendation: Write all DB timestamps with `datetime('now')` (SQLite UTC, no `T/Z`) and reserve `toISOString()` for API response bodies only.
- Falsification: Read storefront.js:620-630 and categories.js:80-90 contexts via grep+spot-read; both write TEXT timestamps into sibling catalog tables in different serializations — confirmed; UNVERIFIED whether any query compares a `toISOString` value against a `datetime('now')` value lexicographically (would silently misorder on the `T` vs ` ` separator).

### INC-3B — Day-truncation three ways
- Locations: `backend/src/routes/pos/index.js:439` (`new Date().toISOString().slice(0, 10)`) vs `backend/src/api/reports.js:74` (`cutoffDate.toISOString().split('T')[0]`, repeated `:76,:119,:121,:159,:190,:258,:303`) — plus `backend/src/api/reports.js:79` (`date(created_at)` in SQL) and `backend/src/routes/pos/index.js:972` (`date(created_at) = ?`).
- Repro grep: `grep -rn "slice(0, 10)\|split('T')\[0\]\|date(created_at)" backend/src/routes/pos/index.js backend/src/api/reports.js`.
- Recommendation: Canonicalize day strings to one helper (`toISODate`) and prefer SQL `date()` for day comparisons so input format never matters.
- Falsification: Grep-verified all three spellings coexist; UNVERIFIED whether timezone edges differ (JS local-vs-UTC midnight vs SQLite `date()` UTC) — flagged as the real risk, not just style.

### INC-3C — Space-separated datetime vs ISO datetime
- Locations: `backend/src/routes/pos/index.js:953` (`return new Date(end).toISOString().slice(0, 19).replace('T', ' ')`) vs `backend/src/api/orders.js:1283` (`const recordedAt = new Date().toISOString()` full ISO with `T/Z`).
- Repro grep: `grep -rn "replace('T', ' ')\|toISOString().slice(0, 19)" backend/src`.
- Recommendation: Store the SQLite-compatible space form in DB-bound values and emit ISO form only at the API boundary, with one converter each way.
- Falsification: Read pos/index.js:945-973 (space form is deliberately built to compare against `created_at` TEXT) vs orders.js:1280-1290 context via grep; different consumers justify different shapes but no shared helper exists — confirmed duplication with UNVERIFIED parity (no test asserting `space(datetime) == iso(datetime)` round-trip found in this pass).

---

## Class 4 — Dual money formats (REAL vs INTEGER cents)

### INC-4A — REAL storage vs INTEGER-cents wire
- Locations: `backend/migrations/0009_financials.sql:62-63` (`total_amount REAL NOT NULL DEFAULT 0, paid_amount REAL DEFAULT 0`, also `:78-80` invoice lines) vs `backend/src/services/paymob.js:10` (`opts.amountCents — Amount in the smallest currency unit (piasters/cents)`, consumed at `:93,:163-184` `amount_cents`) — plus `backend/src/api/reservations.js:459` (`amountCents: Math.round(effectiveTotal * 100)`) and `backend/src/api/storefront.js:369` (`amountCents: Math.round(totalAmount * 100)`).
- Repro grep: `grep -rn "REAL" backend/migrations/0009_financials.sql backend/migrations/0003_products.sql backend/migrations/0010_storefront.sql; grep -rn "amountCents\|amount_cents" backend/src/services/paymob.js backend/src/api/reservations.js backend/src/api/storefront.js backend/src/api/paymob-webhook.js`.
- Recommendation: Keep REAL as the DB unit and INTEGER cents as the Paymob/wire unit, and funnel every conversion through one `toCents()/fromCents()` pair next to the Paymob service.
- Falsification: Read paymob.js:1-30 (cents documented at the boundary) and 0009_financials.sql:60-80 (REAL storage); the `*100` conversions at reservations.js:459 / storefront.js:369 / paymob-webhook.js:124-125 are grep-verified — confirmed dual representation, boundary placement correct.

### INC-4B — Rounded vs unrounded line totals
- Locations: `backend/src/routes/pos/index.js:433` (`const round2 = (n) => Math.round(n * 100) / 100`, used at `:465,:543-544,:1104`) + `backend/src/api/orders.js:718-720` (`effectiveTotal = Math.round(Σ qty*unit_price * 100) / 100`) vs `backend/src/api/storefront.js:212` (`const totalPrice = unitPrice * quantity`, unrounded; same at `:252`) + `backend/src/api/reservations.js:297` (`mealPlanTotal += parseFloat(…) * mp.quantity`, unrounded; same at `:401` `lineTotal`).
- Repro grep: `grep -rn "Math.round.*\* 100) / 100\|round2" backend/src/routes/pos/index.js backend/src/api/orders.js backend/src/api/promotions.js; grep -rn "unitPrice \* quantity\|selling_price || 0) \* " backend/src/api/storefront.js backend/src/api/reservations.js`.
- Recommendation: Route every money multiplication through the single `round2` helper so cart, order-create, reservation, and POS paths agree to the cent.
- Falsification: Read orders.js:716-721 (rounded recompute), storefront.js:211-223 + :251-258 (unrounded), reservations.js:286-300 + :397-410 (unrounded); same `qty × unit_price` concept with different rounding — confirmed; UNVERIFIED which path is "correct" to the cent (needs a penny-fixture test, not run in this read-only pass).

### INC-4C — `parseFloat(x || 0)` vs `Number(x) || 0` coercion
- Locations: `backend/src/api/reservations.js:164` (`parseFloat(prodResult[0].base_price || 0)`, repeated `:177,:208,:297,:327,:370`) vs `backend/src/api/orders.js:1260` (`Number(order.amount_paid) || 0`, also `paymob-webhook.js:124` `Number(txn.amount_cents)`).
- Repro grep: `grep -rn "parseFloat(" backend/src/api/reservations.js backend/src/api/orders.js | head; grep -rn "Number(order\.\|Number(txn\." backend/src/api/orders.js backend/src/api/paymob-webhook.js`.
- Recommendation: Standardize on one coercion (`Number(x ?? 0)`) since `parseFloat('12abc')` silently parses a prefix while `Number` rejects it.
- Falsification: Grep-verified both idioms on DB-sourced numerics; UNVERIFIED whether any stored value actually contains a trailing-chars string that would make the two diverge (no DB sampled — read-only pass).

---

## Class 5 — Dual project-id columns (`camp_id` + `project_id`)

### INC-5A — Same tables carry both `camp_id` and `project_id`
- Locations: `backend/migrations/0100_add_project_id_nullable.sql:66` (`ALTER TABLE rooms_new ADD COLUMN project_id …`, header `:14` notes `rooms_new (has nullable camp_id 0066:24)`) and `:78` (`ALTER TABLE orders ADD COLUMN project_id …`, header `:16` notes `orders (has camp_id 0092:32)`) — plus `:72,:84,:102,:126` (rate_plans_new, pos_products, pos_users, meal_schedules all gain `project_id` while retaining `camp_id`).
- Repro grep: `grep -n "ADD COLUMN project_id\|has camp_id\|has nullable camp_id" backend/migrations/0100_add_project_id_nullable.sql`.
- Recommendation: Freeze new code on `project_id` and schedule the `camp_id` column drop per-table after the 0105 backfill + sunset window, one migration per table.
- Falsification: Read 0100:1-29 (author's own per-table `camp_id` presence ledger) and :63-145 (14 bare ADD COLUMNs); dual columns are intentional transitional state per the file header — confirmed as live inconsistency, not a misread.

### INC-5B — Backfill equates them (`project_id = camp_id`)
- Locations: `backend/migrations/0105_backfill_order_items_project_id.sql:39` (`UPDATE rooms_new SET project_id = camp_id WHERE project_id IS NULL AND camp_id IS NOT NULL`) and `:44` (same for `rate_plans_new`) — plus `:49-67` (`pos_products`/`orders` via `COALESCE(camp_id, …tenant default…)`).
- Repro grep: `grep -n "SET project_id.*camp_id\|COALESCE" backend/migrations/0105_backfill_order_items_project_id.sql | head -20`.
- Recommendation: Keep the backfill as the single equivalence point and forbid new `SET project_id = camp_id` copies in application code (resolve via the projects table instead).
- Falsification: Grep-verified; UNVERIFIED whether post-backfill rows can still diverge (a later `camp_id` update that does not touch `project_id` would silently split scope — no trigger grep run).

### INC-5C — Membership resolved via `camp_id` join in one path, `project_id` scope in another
- Locations: `backend/src/api/reservations.js:155` (`SELECT … FROM rooms_new r JOIN projects c ON r.camp_id = c.id WHERE r.id = ? …`) vs `backend/src/api/tags.js:19-20` (mount `app.use('/api/projects/:projectId/tags', …)` + `:265` project-tags router scoped by `:projectId`) — plus `backend/src/api/meta.js:270` (`/api/projects/:projectId/meta`).
- Repro grep: `grep -rn "ON r.camp_id\|ON.*camp_id = c.id" backend/src; grep -rn "/api/projects/:projectId" backend/src/api/tags.js backend/src/api/meta.js backend/src/index.js | head`.
- Recommendation: Resolve room→project membership through `rooms_new.project_id` (falling back to the `camp_id` join only for pre-backfill rows) so both paths use one key.
- Falsification: Read reservations.js:153-157 (camp_id join is load-bearing for pricing) and tags.js:19-20 + meta.js:270 (projectId-scoped mounts); two keys for one membership fact — confirmed; UNVERIFIED whether any room row exists with `project_id != camp_id` (would make the two paths disagree).

---

## Class 6 — Dual is-admin checks

### INC-6A — Central `requireAuth({ roles })` gates vs inline `role ===` checks
- Locations: `backend/src/api/admin.js:85` (`const superAdminGate = requireAuth({ … roles: ['super_admin'] … })`, same pattern `admin-health.js:4`, `admin-subscriptions.js:20`, `admin-performance.js:4`, `feedback.js:51`, `index.js:264`) vs `backend/src/api/tenants.js:89` (`if (decoded && decoded.role === 'super_admin')`) — plus `categories.js:119`, `tags.js:98`, `audit.js:173`, `meta.js:69`, `tenant-import.js:533`, `index.js:387,394` (`auth.user.role !== 'super_admin'`).
- Repro grep: `grep -rn "roles: \['super_admin'\]" backend/src/api backend/src/index.js; grep -rn "role === 'super_admin'\|role !== 'super_admin'" backend/src`.
- Recommendation: Migrate all inline super-admin comparisons to `requireAuth({ roles: ['super_admin'] })` gates so role semantics change in one file.
- Falsification: Read requireAuth.js:170-171 (central role gate) and tenants.js:85-95 context via grep (soft-elevation path that must never reject, per sharedAuth comment); tenants.js inline check is arguably intentional — confirmed duplication with one KNOWN-intentional site, remainder UNVERIFIED for byte-compat lock-in.

### INC-6B — Exact-membership lists vs unused `ROLE_RANKS` hierarchy
- Locations: `backend/src/middleware/requireAuth.js:58-63` (`ROLE_RANKS = { super_admin: 100, admin: 80, manager: 50, cashier: 30 }`, with `:56-57` comment "today's gates use exact-membership lists to preserve byte-compat") vs `backend/src/api/pos-tables.js:78` (`if (!['admin', 'super_admin'].includes(scope.user.role))`) — plus `broadcaster.js:241`, `stream-token.js:38,48` (`STREAM_MINT_ROLES.includes`), `index.js:381`.
- Repro grep: `grep -rn "ROLE_RANKS" backend/src; grep -rn "includes(scope.user.role)\|includes(decoded.role)\|includes(user.role)" backend/src`.
- Recommendation: Keep exact-membership until Phase 5, then replace all `includes(...)` role checks with rank comparisons (`>= admin`) in one pass — do not mix the two models in new code.
- Falsification: Read requireAuth.js:56-63 (rank table explicitly dormant) and pos-tables.js:70-82 (membership check live); two authorization models shipped side-by-side by the author's own comment — confirmed.

### INC-6C — `scopeMode: 'lenient'` vs default `'equals'` tenant-scope semantics
- Locations: `backend/src/middleware/requireAuth.js:186-188` (`const mismatch = options.scopeMode === 'lenient' ? !!decoded.tenantId && decoded.tenantId !== ctx.tenantId : decoded.tenantId !== ctx.tenantId`) vs `backend/src/middleware/resolveScope.js:24-25` (comment: admin/manager hard-scoped by the `'equals'` check).
- Repro grep: `grep -rn "scopeMode" backend/src`.
- Recommendation: Annotate every `lenient` call site (SSE) with its byte-compat reason and default all new gates to `'equals'`.
- Falsification: Read requireAuth.js:180-190; both semantics live in one branch — confirmed; UNVERIFIED which routes actually pass `scopeMode: 'lenient'` (only the grep hit count, not each call site, was reviewed).

---

## Class 7 — Dual tenant resolution (header vs subdomain vs JWT)

### INC-7A — Backend triple-source `getTenant` vs frontend `resolveTenantId` (two implementations)
- Locations: `backend/src/middleware/tenant.js:8-12` (`queryTenant || headerTenant || host`, query key `tenant_id`, header `x-tenant-id`) + `:27` (`WHERE (id = ? OR subdomain = ? OR custom_domain = ?)`) vs `app/src/middleware/tenant.ts:100-134` (`resolveTenantId`: apex→`marketplace`, localhost `?tenant=`, subdomain split, custom-domain www/staging strip) + `:155` lookup.
- Repro grep: `grep -n "queryTenant\|headerTenant\|x-tenant-id\|subdomain\|custom_domain" backend/src/middleware/tenant.js; grep -n "resolveTenantId\|subdomain\|customDomain\|?tenant" app/src/middleware/tenant.ts | head -20`.
- Recommendation: Document the key mismatch (`tenant_id` query param backend vs `tenant` frontend) and converge localhost/dev on one param name with the backend as source of truth.
- Falsification: Read tenant.js:1-35 (full file) and tenant.ts:100-134 (full function); same hostname→tenant mapping implemented twice with different localhost keys and different staging-www handling — confirmed.

### INC-7B — Three runtime tenant sources with per-mode precedence
- Locations: `backend/src/middleware/resolveScope.js:151-182` (dualRealm: POS `organizationId → tenant_org_mapping → tenant_id` at `:155-163` vs admin header/query hint + `super_admin ?tenantId=` override at `:166-174` + strict claim-equals at `:179-181`) vs `backend/src/middleware/resolveScope.js:192-205` (default admin mode: `tenantHint` → gate → `queryOverride || tenantHint || user.tenantId`).
- Repro grep: `grep -n "tenant_org_mapping\|queryOverride\|tenantHint\|organizationId" backend/src/middleware/resolveScope.js`.
- Recommendation: Publish the precedence table (hint → claim → override → org-map, per mode) in the resolveScope header comment and add one test per mode asserting it.
- Falsification: Read resolveScope.js:117-211 (full dualRealm + default branches); three sources with different winners per mode — confirmed; UNVERIFIED whether `pos-users.js:73-78` (super_admin `?tenantId=` vs admin JWT claim) agrees with this precedence (file not read).

### INC-7C — `x-tenant-id` header: required surface vs "not source of truth" comment
- Locations: `backend/src/index.js:138` (`allowHeaders: ['Content-Type', 'x-tenant-id', 'Authorization']`) + `app/src/middleware/tenant.ts:183` (SSR sends `{ 'x-tenant-id': tenantId }` for `/projects`+`/products`) vs `backend/src/api/services.js:65` (comment fragment: "Scope is the ONLY source of truth for tenant identity — x-tenant-id was …").
- Repro grep: `grep -rn "x-tenant-id" backend/src app/src | head -20`.
- Recommendation: Finish the migration the services.js comment announces (scope-only) or bless the header as a first-class hint; do not leave CORS/Vary advertising a deprecated input.
- Falsification: Header advertisement (index.js:138, response.js:72 `Vary: x-tenant-id`) and SSR usage (tenant.ts:183) are read-verified; the services.js:65 sentence is truncated in grep output and its full claim is UNVERIFIED (file body beyond line 65 not read).

---

## Class 8 — Dual total computations

### INC-8A — `calculatePriceOnServer` loop duplicated in two files
- Locations: `backend/src/api/reservations.js:153-213` (room→product→rates→overrides→`while (currentDate < checkOut)` nightly loop, `:206-208` override-else-rate accumulation) vs `backend/src/api/orders.js:290-337` (same `while` loop, `:330-332` identical accumulation, `:337 return totalPrice`).
- Repro grep: `grep -n "calculatePriceOnServer\|matchingRate\|overridePrice\|season === 'summer'" backend/src/api/reservations.js backend/src/api/orders.js`.
- Recommendation: Extract one shared pricing module imported by both routers so seasonal/override fixes can never land in only one copy.
- Falsification: Read reservations.js:153-209 and orders.js:300-337; loop bodies (setHours-normalized day compare, start/end window, summer/winter month branches, override-map lookup) match statement-for-statement — confirmed duplication; UNVERIFIED whether the unread heads (orders.js:270-300 rate/override fetch) differ in scoping.

### INC-8B — Order-create total: recomputed-rounded vs room-plus-meals-unrounded
- Locations: `backend/src/api/orders.js:716-721` (`effectiveTotal = total_amount || 0; if items: Math.round(Σ qty*unit_price*100)/100`, client total ignored per `:711-714` comment) vs `backend/src/api/reservations.js:280-299` (`effectiveTotal = roomPrice; += Σ selling_price*qty` unrounded meal portion) + `:401` (`lineTotal = unitPrice * mp.quantity`, unrounded).
- Repro grep: `grep -n "effectiveTotal" backend/src/api/orders.js backend/src/api/reservations.js`.
- Recommendation: Give reservations the same `Math.round(…*100)/100` recompute (or share the orders implementation) so identical carts total identically on both endpoints.
- Falsification: Read orders.js:706-721 and reservations.js:275-300 + :394-410; same "authoritative server total" contract with different rounding — confirmed; UNVERIFIED end-to-end (no paired-request fixture run — read-only pass).

### INC-8C — Split/tip rounding formula copy-pasted with renamed vars
- Locations: `backend/src/api/orders.js:1135` (`Math.round(((order.total_amount + (order.tip_amount || 0)) / split_count) * 100) / 100`) vs `backend/src/api/orders.js:1156` (identical formula over `splitCount`) — plus `:1237-1238` (`legsSum`/`amountRounded`), `:1297` (`newPaid`), `:1349` (`balance`) five round-sites for paid/total arithmetic.
- Repro grep: `grep -n "perGroupAmount\|legsSum\|newPaid\|Math.round((.*total_amount" backend/src/api/orders.js`.
- Recommendation: Collapse the two split branches (and the pay/record legs) into one `splitAmount(total, tip, n)` helper.
- Falsification: Grep-verified both lines in one file with only the variable snake/camel rename differing — confirmed copy-paste; UNVERIFIED whether the two branches' surrounding validation differs (bodies beyond the formula not compared).

---

## Class 9 — Dead mirror routes

### INC-9A — `/api/camps` sunset alias mirrors canonical `/api/projects` (same handler instance)
- Locations: `backend/src/api/camps-alias.js:38-44` (`registerCampsAlias`: mounts the SAME `campsRoutes` at `/api/camps` + `/*` with scope+sunset+limiter) vs `backend/src/index.js:641` (`registerCampsAlias(app, { scope: catalogScope, limiter: tenantAwareLimiter })`) + `:823-826` (canonical `/api/projects` + `/*` mount of `campsRoutes`).
- Repro grep: `grep -rn "registerCampsAlias\|/api/camps\|/api/projects" backend/src/api/camps-alias.js backend/src/index.js | head -30`.
- Recommendation: Delete the alias on/after its sunset (`CAMPS_ALIAS_SUNSET = 'Fri, 23 Oct 2026'`, file `:23`, deletion note `:6-9`) plus the CI allowlist entry, keeping `/api/projects` canonical.
- Falsification: Read camps-alias.js:1-45 (full file: "both prefixes serve the SAME campsRoutes instance", "byte-identical CRUD") and index.js:637-641; live duplicate surface with a dated kill-switch — confirmed, not dead yet (intentionally transitional).

### INC-9B — `/api/v1/*` versioned cutover mirrors every `/api/*` via rewrite
- Locations: `backend/src/index.js:908-936` (`VERSION_PREFIX = '/api/v1'` path-rewrite before dispatch + `withSunset` on unversioned, `:914,:920-927,:933-935`) vs `backend/src/routes/registry.js:3449` (OpenAPI doc: "every path below is also served under the /api/v1 prefix … unversioned alias is deprecated … until 2026-11-21") — plus `app/src/middleware/tenant.ts:92,142,149` (SSR already calls `/api/v1`).
- Repro grep: `grep -n "VERSION_PREFIX\|api/v1\|withSunset\|Sunset" backend/src/index.js | head -20; grep -n "api/v1" backend/src/routes/registry.js app/src/middleware/tenant.ts | head`.
- Recommendation: After 2026-11-21, flip the default (serve versioned, redirect unversioned) and then remove the rewrite, rather than carrying two full surfaces indefinitely.
- Falsification: Read index.js:908-937 (full block) and tenant.ts:83-98 (binding path keeps `/api/v1`); two live surfaces with deprecation headers — confirmed transitional mirror, not an accidental fork.

### INC-9C — Sibling-prefix mounts from one module risk shadowing (ordering-dependent dedup)
- Locations: `backend/src/index.js:799-826` (comment: canonical mount "Registered AFTER the specific /api/projects/* sub-mounts … KEEP THIS MOUNT LAST … a bare /api/projects/* wildcard would otherwise overwrite", mounts for `links :680-683`, `items :689-692`, `meta :759-761`, `tags :771-773`, `meal-plans :795-796` before `campsRoutes :823-826`) vs `backend/src/api/meal-plans.js:5-9` (header warns mounting at `/api/projects` "cannot shadow the other /api/projects/:projectId/*" mounts).
- Repro grep: `grep -n "KEEP THIS MOUNT LAST\|overwrite\|shadow" backend/src/index.js backend/src/api/meal-plans.js; grep -n "app.use('/api/products'\|app.use('/api/rooms'\|app.use('/api/rateplans'" backend/src/index.js`.
- Recommendation: Add a route-registration order test (specific-before-bare for `/api/projects/*`) so a future mount cannot silently swallow `links/items/meta/tags/meal-plans`.
- Falsification: Read index.js:676-826 ordering block; shadowing risk is documented by the authors themselves — confirmed as a live hazard class; UNVERIFIED whether `/api/products|rooms|rateplans` (`:649-674`, sub-routers from the same `api/camps` module per `:29`) overlap any `/api/projects/*` path (mount lists compared by prefix only, handler path tables not cross-checked).

---

## Summary counts

| Class | Items | Verified | UNVERIFIED facets |
|---|---|---|---|
| 1 duplicate error messages | 4 (1A–1D) | 4 | 1C client-branching, 1D byte-compat lock |
| 2 dual field names | 4 (2A–2D) | 4 | 2B rename appetite |
| 3 dual date formats | 3 (3A–3C) | 3 core | 3A lexicographic compare, 3B TZ edges, 3C round-trip test |
| 4 dual money formats | 3 (4A–4C) | 3 core | 4B penny fixture, 4C stored-value divergence |
| 5 dual project-id columns | 3 (5A–5C) | 3 core | 5B trigger gap, 5C row-divergence query |
| 6 dual is-admin checks | 3 (6A–6C) | 3 core | 6A tenants.js intent, 6C lenient call sites |
| 7 dual tenant resolution | 3 (7A–7C) | 2 + 1 partial | 7B pos-users precedence, 7C services.js full sentence |
| 8 dual total computations | 3 (8A–8C) | 3 core | 8A fetch-head diff, 8B e2e fixture, 8C branch validation |
| 9 dead mirror routes | 3 (9A–9C) | 3 core | 9C handler-table cross-check |
| **Total** | **29** | **28 core-confirmed + 1 partial** | all UNVERIFIED facets listed per item |

Zero-finding classes: none — every class produced at least two independently-located findings above.
