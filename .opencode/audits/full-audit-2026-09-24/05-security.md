# Pass 5 — Security & Scoping Audit (read-only)

- Date: 2026-09-24
- Scope: cross-tenant scoping, auth bypass, CSRF/CORS. Static analysis + read-only repro reasoning only. No source modified, no live exploits.
- Entry point: `backend/src/index.js` (938 lines). Auth gates: `backend/src/middleware/requireAuth.js`, `backend/src/middleware/resolveScope.js`, `backend/src/middleware/tenant.js`. Response/CORS contract: `backend/src/utils/response.js`.

## Method

1. Enumerated every `app.use`/`app.route`/`app.all` mount in `index.js` and recorded the scope middleware per prefix.
2. For each GET with a URL id param, read the handler SQL and checked for a tenant predicate (`tenant_id = ?` / join-via-tenant / role-gated super-admin), accounting for the `resolveScope` mount + the `order_items`-via-`orders` guard exception.
3. Auth bypass: middleware order (auth vs body parse), HEAD/OPTIONS handling, query-token vs header-token acceptance (`allowQueryToken` grep).
4. CSRF/CORS: cookie grep, `Authorization: Bearer` usage in `app/src/lib/api.ts`, state-changing-GET grep, `cors(`/`Access-Control-*` grep.

---

## 1. Per-endpoint scoping list

Legend: SCOPED = handler binds request tenant; ROLE-GATED = super_admin-only surface (cross-tenant intended); PUBLIC-BY-DESIGN = unauthenticated read of public/approved rows; GUARDED = second query without tenant predicate but reachable only after a tenant-scoped existence check.

### 1a. GET-by-id endpoints (the cross-tenant probe surface)

| # | Route | Mount scope (`index.js`) | Handler predicate | Verdict |
|---|-------|--------------------------|-------------------|---------|
| 1 | `GET /api/projects/:id` (camps.js:248) | method-branch: GET→public, else admin (index.js:631-636, 823-826) | marketplace host: `WHERE c.id=? AND status='active'` (cross-tenant listing intended); tenant host: `WHERE tenant_id=? AND id=?` (camps.js:255-258) | SCOPED (marketplace branch is the intended public directory) |
| 2 | `GET /api/orders/:id` (orders.js:678) | admin, except `/status/*`+`calculate-price` public, kitchen-status dual (index.js:701-711) | `WHERE o.tenant_id=? AND o.id=?` (orders.js:692) | SCOPED |
| 3 | `GET /api/orders/:id/items` (orders.js:659) | admin | existence `SELECT id FROM orders WHERE tenant_id=? AND id=?` (664-666), then `order_items WHERE order_id=?` (669-671) | GUARDED (order_items has no tenant column; isolation via FK guard — see F-04) |
| 4 | `GET /api/orders/:id/split-details` (orders.js:1142) | admin | `orders WHERE tenant_id=? AND id=?` (1147-1149), then `order_items WHERE order_id=?` (1152-1154, comment notes no tenant column) | GUARDED (same as #3) |
| 5 | `GET /api/orders/:id/payments` (orders.js:1181) | admin | `orders WHERE tenant_id=? AND id=?` (1186-1188), then `payment_records WHERE tenant_id=? AND order_id=?` (1190-1192) | SCOPED (both queries tenant-bound) |
| 6 | `GET /api/orders/status/:ref` (orders.js:362, public) | public (index.js:701-704) | `WHERE o.tenant_id=? AND o.reference=?` + email match required (368-381) | SCOPED (tenant hint + email secret) |
| 7 | `GET /api/meals/:id` (meals.js:94) | GET→public, else admin (index.js:540-547) | `WHERE m.tenant_id=? AND m.id=?` + optional `?projectId` ownership assert (101-105) | SCOPED |
| 8 | `GET /api/meal-categories/:id` (meal-categories.js:82) | GET→public, else admin (index.js:512-521) | `WHERE mc.id=? AND mc.tenant_id=?` + optional project assert (90-94) | SCOPED |
| 9 | `GET /api/categories/:id` (categories.js:53) | GET→public, else admin (index.js:524-533) | `WHERE c.id=? AND (c.tenant_id IS NULL OR c.tenant_id=?)` (61) | SCOPED (NULL = shared global dictionary) |
| 10 | `GET /api/plans/:id` (others.js:50) | admin (index.js:503-507) | join `projects c ON … WHERE c.tenant_id=? … AND p.id=?` (52-54) | SCOPED (via camp ownership) |
| 11 | `GET /api/storefront/products/:id` (storefront.js:138) | public read (index.js:866-878) | `WHERE id=? AND tenant_id=?` (144-146) | SCOPED |
| 12 | `GET /api/storefront/pages/:slug`, `/blog/:slug` (storefront.js:452,491) | public read | tenant-scoped reads (same router convention; list at 105-136 binds tenant) | SCOPED (slug + tenant) |
| 13 | `GET /api/pos/products/barcode/:code` (pos-barcode.js:12) | dualRealm (index.js:340) | `WHERE (sku=? OR barcode=?) AND tenant_id=?` (pos-barcode.js:21) | SCOPED |
| 14 | `GET /api/services/items/:id/availability` (services.js:318) | admin except `/public/:slug` GET (index.js:568-578) | `service_items WHERE id=? AND tenant_id=?` (322-324), then `service_availability WHERE service_item_id=?` (326-330) | GUARDED (slot rows keyed by item; item guard is tenant-bound — see F-04) |
| 15 | `GET /api/services/bookings/:id/reviews` (services.js:370) | admin | `service_bookings WHERE id=? AND tenant_id=?` (374-376), then `service_reviews WHERE service_item_id=?` (378-380) | GUARDED (same pattern — see F-04) |
| 16 | `GET /api/projects/:id/meal-plans` (meal-plans.js:17) | public (index.js:794-796) | **no tenant predicate**: `projects WHERE id=?` (21-23), then org mapping + products by `category_id + organization_id` (29-43) | UNVERIFIED — see F-01 |
| 17 | `GET /api/hr/payroll/runs/:id` (hr.js:415) | admin (index.js:837-841) | `payroll_runs WHERE id=? AND tenant_id=?` (421-423), then `payroll_lines WHERE payroll_run_id=?` (426-431) | GUARDED (lines via run guard — see F-04) |
| 18 | `GET /api/admin/payouts/:id` (admin-payouts.js:182) | superAdminGate loop (index.js:286-301) | **no tenant predicate**: `marketplace_payouts WHERE id=?` (187), items `WHERE mp.payout_id=?` (193-200) | ROLE-GATED (super_admin-only; cross-tenant intended — see F-03) |
| 19 | `GET /api/admin/feedback/:id` (feedback.js:147) | superAdminGate loop (index.js:286-301) + in-handler `feedbackGate` (feedback.js:150) | `feedback WHERE id=?` (152-154), no tenant predicate | ROLE-GATED (super_admin-only — see F-03) |
| 20 | `GET /api/marketplace/:tenantSlug` (marketplace.js:106) | public (index.js:582-585) | tenant lookup `(subdomain=? OR id=?) AND status='active'` (110-113), then projects/reviews/categories by resolved `tenant.id` (118-138) | PUBLIC-BY-DESIGN (active-only, approved reviews only) |
| 21 | `GET /api/marketplace/reviews/:projectId` (marketplace.js:181) | public | `WHERE project_id=? AND is_approved=1` (185-190), no tenant predicate | PUBLIC-BY-DESIGN (moderated rows only — see F-03) |
| 22 | `GET /api/tenants/:id` (tenants.js:150-173) | NO middleware — inline soft elevation (tenants.js:86-96) | non-super_admin: `WHERE (id=? OR subdomain=? OR custom_domain=?) AND status='active'` (168); super_admin: unfiltered + admin join (155-162) | PUBLIC-BY-DESIGN (active-only projection; POST create is 403-gated at tenants.js:176-178) |
| 23 | `GET /api/me` (tenants.js:265) | GET→public, else admin (index.js:617-625) | `tenants WHERE t.id=?` bound to scope tenantId (270-274) | SCOPED (self-lookup by resolved tenant) |
| 24 | `GET /api/onboarding/status/:token` (onboarding.js:148) | public (index.js:587-593) | `tenants WHERE onboarding_token=?` (152-156), returns PII subset (email, profile) | CAPABILITY-URL — see F-02 (UNVERIFIED) |
| 25 | `GET /api/meta/:key`, `/api/tenants/:tenantId/meta/*`, `/api/projects/:projectId/meta/*` (meta.js:150-157, 242-250) | method-branch GET→public (index.js:226-232, 759-761) | tenant-meta: entity resolved by path `:tenantId` + existence check (meta.js:259-266); project-meta: `loadProject` + owning-tenant gate on writes (meta.js:271-277, `assertWriteAccess` 64-73). Reads expose only the path-named entity's rows | SCOPED-BY-PATH (reads intentionally public per entity; writes 401/403 — verified at meta.js:115-123) |
| 26 | `GET /api/pos/orders/:id` (routes/pos/index.js:871) | `posAuth` (POS realm) | `pos_transactions WHERE t.id=? AND t.tenant_id=?` (877-882) + items `WHERE ti.order_id=? AND ti.tenant_id=?` (888-893) | SCOPED (tenant from token org mapping) |
| 27 | `GET /api/pos-tables` (pos-tables.js:107, dualRealm) | dualRealm (index.js:783-787) | `WHERE tenant_id=?` (112-117); mutations additionally `assertAdminMutation` (pos-tables.js:137) | SCOPED |
| 28 | `GET /api/leads` list (leads.js:114; no `/:id` GET — PUT/DELETE `:id` bind tenant at leads.js:162-164, 180-182) | POST public, rest admin (index.js:604-613) | `WHERE tenant_id=?` (122-125) | SCOPED (no single-GET surface) |
| 29 | `GET /api/inbox` (inbox.js:95) | admin (index.js:596-600) | union arms + unread counts all bind `tenantId` (inbox.js:103-131) | SCOPED |
| 30 | `GET /api/audit` (audit.js) | admin (index.js:775-778) | tenant-scoped listing + `!tenantId → 401` (audit.js:100) | SCOPED |
| 31 | `GET /api/project-links`, `/api/project-items` lists | admin (index.js:679-692) | `WHERE pi.tenant_id=?` (project-items.js:157); links assert + tenant writes (project-links.js:71-76, 141-143, 175-177) | SCOPED |
| 32 | `GET /api/ai/state/sync/:key` (ai.js:635) | admin (index.js:885-889) | tenantId required (637-638); state partitioned `state:${tenantId}` (642) + 503 without binding (639) | SCOPED (partitioned by tenant) |
| 33 | `GET /api/tags/*`, `GET /api/projects/:projectId/tags/*` (tags.js) | GET public, writes admin w/ `assertWriteAccess` (tags.js:60-69) | reads tenant-filtered; writes require `scope.user + scope.tenantId` | SCOPED-BY-MODEL (mirrors meta.js) |
| 34 | `GET /api/media/*` (upload.js:148) | GET/HEAD→public, DELETE→admin (index.js:744-750) | R2 key must match `media/{tenantId}/{uuid}.{ext}` (`sanitizeMediaKey`, upload.js:64-75); DELETE key-scoped to caller's tenant (upload.js:207-210) | SCOPED-BY-KEY (unforgeable tenant prefix) |
| 35 | `GET /api/stream/orders?tenantId=` (index.js:441) | `sseOrdersGate` (admin realm, `tokenTypes:['stream']`, index.js:430-439) | stream-token tenant binding enforced twice: worker gate + DO `decoded.tenantId !== tenantId → 403` (broadcaster.js:246-248), single-use jti burn (258-261) | SCOPED (short-lived single-use token) |
| 36 | `GET /healthz`, `GET /`, `GET /api/openapi.json` (index.js:155,163,476) | none (public infra) | no tenant data | N/A (no PII) |

Result: 36 surfaces reviewed. 0 confirmed cross-tenant read bypasses. 1 UNVERIFIED observation (F-01), 1 capability-URL note (F-02), rest SCOPED / GUARDED / ROLE-GATED / PUBLIC-BY-DESIGN with falsification below.

---

## 2. Auth-bypass checks

### 2a. Middleware order (auth before body parse?) — PASS

- All Hono sub-routers mount `resolveScope` via `app.use(...)` (runs before the route handler); handlers call `await c.req.json()` / `request.formData()` only INSIDE handlers, i.e. after scope+auth. Verified examples: `uploadRoutes.post` reads `request.formData()` at upload.js:109 after `uploadAdminScope`; `tenantImportRoutes.post` reads `c.req.json()` at tenant-import.js:524 after `tenantImportScope` (index.js:247-250); orders/leads/inbox handlers read body after `getScope(c)`.
- Legacy `app.all` wrappers run the gate first inside the handler before delegating: meal-schedules (index.js:360-373: `mealSchedulesGate` → `handleMealSchedulesRoute`), pos-users (index.js:383-396: `posUsersGate` → `handlePosUsersRoute`; comment at 376-380 documents why `requireTenant:false` + in-handler `scopeTenant` is used), admin catch-all (index.js:325-326 → `handleAdminRoute` with own `superAdminGate`, admin.js:87).
- Rate limiting (`policyLimiter`, index.js:146) runs BEFORE auth — correct order (no body parse, no auth oracle; 401-before-404 leak closed by the plain-404 fallback at index.js:897, comment at 892-896).

### 2b. HEAD / OPTIONS handling — PASS (fail-closed)

- `hono/cors` (index.js:122-140) answers preflight OPTIONS; `allowMethods` (index.js:137) lists GET/POST/PUT/DELETE/PATCH/OPTIONS — no HEAD entry, so HEAD is not advertised. No handler branches on OPTIONS, so preflights never reach auth or business logic (standard).
- Method-branch scopes compare `c.req.method === 'GET'` (catalog, meals, categories, tags, meta, storefront-read at index.js:633-636, 514-517, 527-530, 541-543, 557-562, 619-622, 765-766, 870). A HEAD request to those paths therefore falls into the ADMIN branch → 401 without token. Fail-closed, not a bypass: worst case is a denied read, never an allowed write (all mutations are POST/PUT/PATCH/DELETE-gated).
- Sole HEAD exception is intentional: `mediaScope` explicitly treats `GET || HEAD` as public (index.js:746-747) and the media router serves both (upload.js:148). HEAD returns the same R2 object headers as GET — no privilege difference.
- `app.all(...)` legacy mounts (auth, admin, meal-schedules, pos-users, fallback 404) apply the same gate to every method including HEAD/OPTIONS — no method-discriminated bypass.

### 2c. Query-token vs header-token acceptance — PASS (single exception, fenced)

- `extractRequestToken` defaults `allowQueryToken:false` (requireAuth.js:90-103): header `Bearer` wins; `?token=` is read ONLY when the gate opts in.
- Only ONE gate opts in: `sseOrdersGate` (`allowQueryToken:true`, index.js:432) + the forward at index.js:458. Justification is structural (EventSource cannot set headers) and fenced: that gate accepts ONLY `tokenTypes:['stream']` (index.js:433) — 24h admin JWTs 401 there — and the token must be minted via `POST /api/stream/token` (admin-auth, 60s TTL, single-use jti, tenant-bound; stream-token.js:42-75; DO enforcement broadcaster.js:225-261).
- All other surfaces are header-only: `resolveScope` dualRealm reads `Authorization` header only (resolveScope.js:123-127); `posAuth` reads `c.req.header('Authorization')` only (routes/pos/index.js:74-78); `tenants.js` soft elevation calls `extractRequestToken(request)` with defaults (tenants.js:86); frontend sends `Authorization: Bearer` everywhere and never cookies (app/src/lib/api.ts:143,190,227,1098,1381,2513; sse.ts:78 mints via header).
- `getTenant` reads a `tenant_id` QUERY param (tenant.js:8) — this is a tenant HINT, not a credential: on protected routes `requireAuth`'s `equals` check (requireAuth.js:185-190) and the dualRealm strict check (resolveScope.js:179-181) reject a hint that does not match the token claim (403). On public routes the hint only selects which public partition to read. The super_admin `?tenantId=` override (resolveScope.js:171-174, 203-205) is role-gated to `super_admin` — intended cross-tenant administration, not a bypass (see F-05).
- Falsification: `grep allowQueryToken backend/src` returns only requireAuth.js (definition) + index.js:432,458 (SSE pair). No other `searchParams.get('token')` credential read exists outside `broadcaster.js:217` (the DO side of the same fenced flow).

---

## 3. CSRF / CORS checks

### 3a. Authorization header, not cookies — PASS

- `grep -ri 'Set-Cookie|getCookie|setCookie|Cookie' backend/src` → zero matches. No session cookies are issued or read anywhere.
- All authenticated calls use `Authorization: Bearer <jwt>` (api.ts:143,190,227,1098,1381,2513). Cookie-based CSRF requires ambient credential submission; with header-only auth, a cross-site form/fetch cannot attach the token (no `credentials:include`, no cookie jar entry). `document.cookie` grep in `app/src/lib` → no matches.

### 3b. No state-changing GET — PASS

- Grep for GET handlers containing writes returned zero hits (only hit was an unrelated DELETE string in orders.js:417 inside the POST bulk-delete handler).
- `index.js` `app.get` mounts: `/` (static HTML), `/healthz` (SELECT 1 + KV/R2 probes), `/api/tenants*` → `handleTenants` (GET branch is SELECT-only, tenants.js:98-173; POST branch is the only writer and 403-gates non-super_admin at tenants.js:176-178), `/api/stream/orders` (opens a read stream; the only write is the single-use jti burn, which is replay protection, not state change), `/api/openapi.json` (static registry). Sub-router `routes.get` handlers audited in §1a perform SELECTs only (mutations live on post/put/patch/delete with 405 catch-alls, e.g. meal-categories.js:196, categories.js:174, others.js:137, tenant-import.js:614).

### 3c. CORS set in exactly one place — PASS

- `grep 'cors\(|Access-Control-Allow' backend/src` → exactly ONE match: `app.use('*', cors({...}))` at index.js:122. `response.js:38-41` carries an explicit NOTE forbidding CORS duplication ("Do NOT duplicate them here — a wildcard origin here would bypass the restrictive CORS policy"); `upload.js:144` and the SSE section (index.js:419-420) repeat the "never set Access-Control-* here" contract; `mediaRoutes` (upload.js:165-171) and `broadcaster.js` SSE headers set only `Content-Type/Cache-Control/nosniff`.
- Policy content (index.js:81-140): exact-match allowlist + `[^.]+` single-label wildcard for `*.sinaicamps.com` + 5-min-cached custom-domain check against `tenants.custom_domain`; `allowHeaders` includes `Authorization, Content-Type, x-tenant-id` (index.js:138); `allowMethods` has no TRACE/CONNECT. Null-origin (`!origin → null`, index.js:124) denies non-browser/origin-less callers at the CORS layer (non-CORS fetches still need the Bearer token regardless).

---

## 4. Findings

### F-01 [UNVERIFIED — likely by-design public menu] `GET /api/projects/:id/meal-plans` has no tenant predicate

- File:line: `backend/src/api/meal-plans.js:17-44` (route), mount `backend/src/index.js:794-796` (`mealPlansPublicScope`, no auth).
- Repro (static): `GET /api/projects/<any-project-id>/meal-plans` → handler does `SELECT tenant_id … FROM projects WHERE id=?` (meal-plans.js:21-23) with NO comparison to the request scope, then resolves that project's own org mapping (29-31) and returns that tenant's `pos_products` rows (39-44). Any enumerable project id yields another tenant's menu items (id, name, selling_price, description, image_url).
- Impact if true: low — disclosed fields are public menu data (same class as the public `GET /api/meals` catalog); no PII, prices, costs, or Margins beyond what the storefront already publishes. No write path.
- Falsification / why not confirmed: (a) the mount is deliberately `resolveScope({public:true})` and the router docblock (meal-plans.js:1-11) describes a public read; (b) sibling public catalog reads (`meals.js:78-91`, `storefront.js:105-149`) expose the same product fields scoped to the request tenant — this endpoint differs only in keying by path `:id` instead of tenant hint, which may be intentional for cross-tenant marketplace menu previews. UNVERIFIED pending product decision: either key the lookup by `(id, scopeTenant)` like `meals.js:101-103`, or record the cross-tenant readability as accepted public-menu behavior. No live probe performed per read-only constraint.

### F-02 [UNVERIFIED — capability-URL hygiene] `GET /api/onboarding/status/:token` returns tenant PII on token knowledge

- File:line: `backend/src/api/onboarding.js:148-184` (route), mount `backend/src/index.js:587-593` (public, no auth).
- Repro (static): `GET /api/onboarding/status/<token>` → `SELECT … name, subdomain, email, status … FROM tenants WHERE onboarding_token=?` (152-156) → 200 with `email + profile` (163-179). Security rests entirely on `onboarding_token` unguessability + the `completed` flag is also leaked (`setup_complete`).
- Impact if true: low-moderate — enumeration requires the token; IF tokens are low-entropy/sequential, tenant emails become harvestable. No write path on this route (setup POST at onboarding.js:188 re-validates the token and refuses completed onboarding at 206-209).
- Falsification incomplete (hence UNVERIFIED): token generation site was not traced in this pass (out of per-endpoint budget); IF the token is `crypto.randomUUID` (house convention, cf. tenant-import.js:558, upload.js:50) the capability-URL pattern is acceptable. Recommend a 5-minute follow-up: grep `onboarding_token` generation + confirm UUID entropy and (optionally) expiry. No live probe performed.

### F-03 [FALSIFIED — not a bypass] Role-gated / public-by-design reads without tenant predicates

- Files:lines: `backend/src/api/admin-payouts.js:182-207` (GET `/:id`, POST `/:id/pay` at 211-248); `backend/src/api/feedback.js:147-163` (GET `/:id`); `backend/src/api/marketplace.js:181-196` (GET `/reviews/:projectId`).
- Repro attempt (static): request another tenant's payout/feedback/review id. Payout detail (`marketplace_payouts WHERE id=?`, no tenant) and feedback detail (`feedback WHERE id=?`, no tenant) read cross-tenant rows.
- Why falsified: (a) payouts + admin-feedback routers are mounted INSIDE the `superAdminGate` prefix loop (index.js:286-301) and feedback re-gates in-handler (`feedbackGate`, feedback.js:110,150,168) — only `super_admin` tokens reach the queries, for whom cross-tenant administration is the job (same model as `/api/admin/*` catch-all, index.js:325-326 + admin.js:87). Tenant admins (admin/manager) 403 at the gate. (b) Marketplace reviews expose ONLY `is_approved=1` rows (marketplace.js:188) — moderated public content by design; the tenant-profile route (106-149) filters `status='active'` tenants and approved reviews. Impact of the remaining theoretical vector (super_admin credential compromise) is total by definition and out of scope for row-level scoping.

### F-04 [FALSIFIED — documented guard exception] Second queries without `tenant_id` are all preceded by a tenant-scoped existence check

- Files:lines: `backend/src/api/orders.js:664-671` (`/:id/items`), `orders.js:1151-1154` (`/:id/split-details`, with inline comment "order_items has no tenant_id column — tenant isolation is via order_id FK"); `backend/src/api/hr.js:426-431` (payroll lines via run guard at 421-424); `backend/src/api/services.js:326-331` (availability via item guard at 322-324) and `services.js:378-381` (reviews via booking guard at 374-376); `backend/src/api/project-links.js:157-160` (re-select created link by id after tenant-checked insert at 140-155).
- Repro attempt (static): pass a foreign order/item/booking id as `:id` or `order_id`. Every path first `SELECT … WHERE id=? AND tenant_id=?` and returns 404 on miss (orders.js:667,1149-1150,1188-1189; hr.js:424; services.js:325,377), so the unscoped follow-up query can only ever address an already-authorized parent row. The D1 schema genuinely lacks `tenant_id` on `order_items`, so the guard-then-read shape is the correct pattern, not an omission.
- Residual note (defense-in-depth, not a finding): a future refactor that reorders or drops the guard would silently open IDOR. The `split-details` inline comment is the house convention for marking this — `/:id/items` (669-671) and `hr.js:426-431` lack the equivalent comment. Suggest propagating the one-line comment; no behavior change needed.

### F-05 [FALSIFIED — intended admin function] `super_admin ?tenantId=` override + `tenant_id` query hint cannot escalate a tenant admin

- Files:lines: `backend/src/middleware/resolveScope.js:171-174,203-205` (override only when `decoded.role === 'super_admin'`); `backend/src/middleware/tenant.js:8-12` (`tenant_id` query param is one hint source); `backend/src/middleware/requireAuth.js:185-190` (`equals` claim-vs-hint check for non-super_admin); `backend/src/middleware/resolveScope.js:179-181` (dualRealm strict `decoded.tenantId !== tenantId → 403`).
- Repro attempt (static): as tenant-A admin, call `GET /api/meals?tenant_id=<tenant-B>` or `?tenantId=<tenant-B>`. `getTenant` resolves the hint to B, then the gate compares claim (A) vs hint (B) → 403 `Forbidden: Access denied to this tenant partition`. As super_admin the override succeeds — intended (cross-tenant ops are unattributable to one tenant and stay on the global policy-table budget; index.js:279-283 comment).
- Note: `getTenant` reads `tenant_id` (snake) while the override reads `tenantId` (camel) — inconsistent naming but no security consequence (both paths role-gated as above).

### F-06 [FALSIFIED — inline gates verified] `/api/tenants*` mounts carry no middleware but enforce auth inside the handler

- Files:lines: `backend/src/index.js:253-256` (`app.post/get('/api/tenants…')` with no `app.use` gate); `backend/src/api/tenants.js:81-96` (soft elevation: header token → `verifyToken` → `isActiveAdmin` probe → `isSuperAdmin`); `tenants.js:98-173` (GET branches SELECT-only; public projection excludes secrets); `tenants.js:174-178` (POST create 403 unless `isSuperAdmin`).
- Why falsified: the POST writer is unreachable without an active super_admin session (403 `Unauthorized: Super Admin access required`); deactivated super_admins fail the `isActiveAdmin` probe (tenants.js:91) and drop to the public view. No body parsing precedes the check (elevation runs before the method switch at tenants.js:98). Same shape confirmed for the sibling unauthenticated-but-safe writers: Paymob webhook enforces HMAC-then-scope (paymob-webhook.js:162-203 HMAC fail-closed 503/401, tenant-scoped writes per 152-154 + applyPaidStateTransition binds `tenant_id` at paymob-webhook.js:24-28); tenant-import enforces role split (tenant-import.js:533-535 identity→super_admin 403, 603-604 existing-tenant→401 without scope).

---

## 5. Verdict

- Per-endpoint scoping (§1): 36 surfaces inventoried; 0 confirmed cross-tenant bypasses. All authenticated GET-by-id handlers bind the request tenant, directly or via a tenant-checked parent guard; the only unscoped reads are super_admin-only (intended), approved/active-only public rows (intended), or the two UNVERIFIED observations below.
- Auth bypass (§2): middleware order PASS (auth/scope before any body parse, rate-limiter before auth, 404 fallback closes the 401 oracle); HEAD/OPTIONS PASS (fail-closed to admin branch / preflight-only, one intentional media HEAD exception); query-vs-header PASS (single fenced SSE exception with stream-only token type + 60s single-use tenant-bound mint).
- CSRF/CORS (§3): PASS on all three — header-only Bearer auth with zero cookie surface, zero state-changing GETs, exactly one CORS registration (`index.js:122`) with restrictive allowlist and no header duplication in `response.js`/media/SSE paths.
- Findings count: **6 items — 0 CONFIRMED vulnerabilities, 2 UNVERIFIED observations (F-01 public menu keying, F-02 capability-URL entropy), 4 FALSIFIED (F-03 role-gated reads, F-04 guarded second queries, F-05 admin override, F-06 inline tenant gates)**. Suggested follow-ups are all cheap and non-urgent: product decision on F-01 keying, token-entropy grep for F-02, guard-comment propagation for F-04.
