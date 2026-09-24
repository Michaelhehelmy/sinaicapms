# Pass 2 — Route Audit (auth · tenant · validation · envelope)

- Date: 2026-09-24
- Repo: /home/michael/devin/opencode-workspace/sinaicamps
- Mode: read-only. No source files touched, no D1 writes, no deploy.
- Spec: `.opencode/agents/tmp/2026-09-24-pass2-routes.md`
- Depends on: `01-surface.md` (Pass 1 mount map; all Mounted cells verified against `backend/src/index.js`, 938 lines)
- Method: Read/Grep only. Envelope criterion = **failure** path returns `{ success:false, error }` via `errorResponse`/`validationError` (`backend/src/utils/response.js`, `utils/errors.js`). Success shapes vary by design and are out of scope.
- Legend: YES = holds · NO = candidate finding (see § Findings, one falsification attempt each) · — = no input for that dimension · UNVER = unverified (see § UNVERIFIED).

## Routes table

| Method | Path | Mounted | Auth | Tenant | Validate | Envelope | Notes |
|---|---|---|---|---|---|---|---|
| GET | `/` | YES | NO (F1) | NO (F1) | — | NO (F1) | `index.js:155` HTML banner, no JSON. No input. |
| GET | `/healthz` | YES | NO (F2) | NO (F2) | — | NO (F2) | `index.js:163` DB+KV+R2 probes via `jsonResponse`; shape `{status,version,checks}` has no `success` flag. No input. |
| GET | `/api/openapi.json` | YES | NO (F3) | NO (F3) | — | NO (F3) | `index.js:476` deliberate raw `c.json(buildOpenApiDocument())`, comment says NOT wrapped so `$ref` passes through. |
| ALL | `/api/*` fallback | YES | NO (F4) | NO (F4) | — | YES | `index.js:897` plain 404 `errorResponse`; comment: unknown prefixes no longer leak existence via 401-before-404. |
| GET | `/api/health` (Astro) | YES | NO (F5) | NO (F5) | UNVER | UNVER | `app/src/pages/api/health.ts` file-convention mount; content not read this pass. |
| POST | `/api/auth/pos-login` | YES | NO-entry (F6) | YES | NO (F6) | YES | `index.js:210` → `routes/pos/index.js:handlePosLoginRequest`. Public entry by design; tenant via org mapping; manual `identifier/password` presence check, no zod. |
| POST | `/api/pos/auth/login` (legacy) | YES | NO-entry (F6) | YES | NO (F6) | YES | Same handler + Sunset headers (`routes/pos/index.js`). Same manual validation. |
| POST | `/api/auth/login` | YES | NO-entry (F7) | YES | YES | YES | `api/auth.js:114` `loginSchema` (+`tenant_id` alias norm). Super-admin path = null tenant by design. |
| POST | `/api/auth/refresh` | YES | NO-entry (F7) | YES | YES | YES | `api/auth.js:198` `refreshSchema`; `type!=='refresh'` rejected. Stateless re-issue by design (comment). |
| POST | `/api/auth/register` | YES | NO-entry (F7) | YES | YES | YES | `api/auth.js:291` `registerSchema`; account starts `is_active=0`. |
| POST | `/api/auth/forgot-password` | YES | NO-entry (F7) | N/A | YES | YES | `api/auth.js:336` schema + per-IP limiter (`cf-connecting-ip` only). Always-success envelope (anti-enumeration). |
| POST | `/api/auth/reset-password` | YES | NO-entry (F7) | N/A | YES | YES | `api/auth.js:403` `resetPasswordSchema`; single-use + expiry enforced. |
| POST | `/api/auth/change-password` | YES | YES-inline (F8) | YES | YES | YES | Manual `verifyToken` (not `requireAuth`), `api/auth.js` change-password branch; `changePasswordSchema` YES. |
| GET | `/api/auth/me` | YES | YES-inline (F8) | N/A | — | YES | Manual `verifyToken` + `is_active` check, `api/auth.js` me branch. No input. |
| POST | `/api/auth/logout` | YES | NO (F7) | N/A | — | YES | Stateless; returns `{success:true}`. No input. |
| POST | `/api/auth/auto-login` | YES | NO-entry (F7) | YES | NO (F9) | YES | Manual `if (!token)` check, no zod (`api/auth.js` auto-login branch); single-use + 24h expiry enforced. |
| POST | `/api/pos/auth/refresh` | YES | YES `posRefreshGate` realm pos `tokenTypes:[refresh]` | YES | YES | YES | `routes/pos/index.js` `posRefreshSchema` + manual header/body presence check. |
| POST | `/api/tenants` | YES | YES super_admin (inline soft-elevation) | N/A-create | YES | YES | `api/tenants.js:180` `tenantPostSchema`; `admin_password` required. |
| GET | `/api/tenants`, `/public`, `/:id` | YES | NO (F10) | NO-filter (F10) | NO (F10) | YES | Public list/detail; super_admin soft-elevation adds admin fields. Query filters (`search/location/capacity/activities/status`) manual, binds only. Non-super detail forces `status='active'`. |
| USE+ROUTE | `/api/tenants/:tenantId/meta` | YES | YES method-aware (`metaScope`) | YES | YES | YES | `api/meta.js` reorder/post/put schemas + `assertWriteAccess` 401/403; GET reads public by design. |
| USE+ROUTE | `/api/tenants/import` | YES | YES `resolveScope` super_admin+admin | YES | YES | YES | `api/tenant-import.js:490,529` manifest+identity schemas; orphaned identity mode super-admin only. |
| USE+ROUTE | `/api/admin/financials` | YES | YES `superAdminAuth` | NO-x (F11) | NO (F11) | YES | Cross-tenant overview by design (`tenantId:null` scope stamp). GET filters (`status/type/tenantId`) manual; no writes. |
| USE+ROUTE | `/api/admin/payouts` | YES | YES `superAdminAuth` | NO-x (F11) | PARTIAL (F12) | YES | Create validates `createPayoutBody` (`admin-payouts.js:83`); GET filters manual; cross-tenant payout write checks `payments.tenant_id` match per row. |
| USE+ROUTE | `/api/admin/hr` | YES | YES `superAdminAuth` | NO-x (F11) | NO (F11) | YES | Read-only overview (per 01-surface). GET params manual. |
| USE+ROUTE | `/api/admin/supply` | YES | YES `superAdminAuth` | NO-x (F11) | NO (F11) | YES | Read-only overview. GET params manual. |
| USE+ROUTE | `/api/admin/crm` | YES | YES `superAdminAuth` | NO-x (F11) | NO (F11) | YES | Read-only overview. GET params manual. |
| USE+ROUTE | `/api/admin/storefront` | YES | YES `superAdminAuth` | NO-x (F11) | NO (F11) | YES | Read-only overview. GET params manual. |
| USE+ROUTE | `/api/admin/ai` | YES | YES `superAdminAuth` | NO-x (F11) | NO (F11) | YES | Read-only overview. GET params manual. |
| USE+ROUTE | `/api/admin/audit` | YES | YES `superAdminAuth`+inner gate | NO-x (F11) | YES | PARTIAL (F13) | `admin-audit.js:46,121` `auditQuerySchema` on list; CSV export (`:177`) is raw `new Response` text/csv. |
| USE+ROUTE | `/api/admin/settings` | YES | YES `superAdminAuth` | NO-x (F11) | YES | YES | `admin-settings.js:149` `settingsUpdateSchema` on write. |
| USE+ROUTE | `/api/admin/subscriptions` | YES | YES `superAdminAuth` | NO-x (F11) | PARTIAL (F12) | YES | Update validates (`admin-subscriptions.js:140`); GET filters manual. |
| USE+ROUTE | `/api/admin/feedback` | YES | YES `superAdminAuth`+inner `feedbackGate` | NO-x (F11) | YES | YES | `feedback.js:171` status schema; list filters manual pagination. |
| ALL | `/api/admin/health[/…]` | YES | YES inner `superAdminGate` | NO-x (F11) | — | YES | `api/admin-health.js` probes only; zeroed metrics by design (comment: honest, not fake). |
| ALL | `/api/admin/performance[/…]` | YES | YES inner `superAdminGate` | NO-x (F11) | — | PARTIAL (F13) | JSON paths YES; `/export` (`admin-performance.js:207`) raw CSV `new Response`. |
| ALL | `/api/admin/reports[/…]` | YES | YES inner `superAdminGate` | NO-x (F11) | NO (F14) | PARTIAL (F13) | `POST /generate`, `POST /schedule` read `body.reportId/schedule` manually, no zod. CSV job download raw `new Response` (`admin-reports.js:253,263`). In-memory job/schedule Maps (no cron — Pass 1 §h). |
| ALL | `/api/admin[/…]` catch-all | YES | YES inner `superAdminGate` | NO-x (F11) | YES | YES | `api/admin.js:149,184` bulk/tenant/admin schemas; cascade delete batched. |
| USE+ROUTE | `/api/tenant/billing` | YES | YES `resolveScope()` admin | YES | — | YES | `api/tenant-billing.js` GET-only; fallthrough `all('*')` uses `jsonResponse({success:false…},405)` = envelope shape. |
| POST | `/api/payments/webhook` | YES | NO (F15) | N/A | — | YES | Retired mock-Stripe: always 501 `errorResponse` (`api/payments.js`). No mutation possible. |
| ROUTE | `/api/pos` (`products`,`orders`,`orders/:id`,`dashboard`,`shifts/active`) | YES | YES `posAuth` (posType + active probe) | YES | — | YES | `routes/pos/index.js` `pos.use('/*',posAuth)`; tenant from `posUser.tenantId` (org mapping). No write input on these reads. |
| POST | `/api/pos/orders` | YES | YES `posAuth` | YES | YES | YES | `posOrderSchema` (`routes/pos/index.js:324`); idempotency dedupe; tenant-bound product fetch. |
| POST | `/api/pos/shifts/open` | YES | YES `posAuth` | YES | NO (F16) | YES | Manual `parseFloat(body.openingCash)\|\|0` + `<0` check, no zod. |
| POST | `/api/pos/shifts/close` | YES | YES `posAuth` | YES | NO (F16) | YES | Manual `isNaN(actualClosingCash)` check, no zod. Guarded close (409 on race). |
| ROUTE | `/api/pos/products/barcode/:code` | YES | YES dualRealm | YES | NO (F17) | YES | Manual `if (!code)` only (`api/pos-barcode.js`); bound `sku/barcode + tenant_id` lookup. |
| POST | `/api/contact` | YES | NO (F18) | NULLABLE (F18) | YES | YES | Sunset alias of `createLead` (`index.js:348`); `leadPostSchema`; tenant = hostname scope or NULL. |
| POST | `/api/feedback` | YES | NO (F18) | NULLABLE (F18) | YES | YES | `feedback.js:67` schema; `tenant_id` never client-provided (scope-only, nullable). 6/min policy. |
| ALL | `/api/meal-schedules[/…]` | YES | YES `mealSchedulesGate` admin | YES | PARTIAL (F19) | YES | POST validates `schedulePostSchema` (`meal-schedules.js:89`); tenant via `getTenant` + gate ctx. GET/DELETE input handling UNVERIFIED (file tail not read). |
| ALL | `/api/pos-users[/…]` | YES | YES double gate (route + handler `posUsersHandlerGate`) | YES | YES | YES | `scopeTenant` hard-scopes admin→own tenant (`pos-users.js`); create/patch/reset schemas; org-scoped queries. GET filters manual. |
| USE+ROUTE | `/api/stream/token` | YES | YES `resolveScope` admin+super_admin | YES | — | YES | `api/stream-token.js`: no body; 400 when no tenant; mints 60s single-use `stream` JWT (`jti`). |
| GET | `/api/stream/orders` | YES | YES `sseOrdersGate` `tokenTypes:[stream]` only | PARTIAL (F20) | NO (F20) | YES* | `index.js:441`. `scopeMode:'lenient'`; pre-stream errors via `errorResponse`; stream body is SSE (envelope N/A after 200). Token forwarded to DO for single-use + tenant bind. |
| USE+ROUTE | `/api/reports` | YES | YES `resolveScope()` admin | YES | NO (F21) | YES | All 9 report GETs bind scope tenant; query knobs (`days/limit/start/end`) manual `parseInt`/passthrough, no zod. GET-only guard 405 + unknown-type 404. |
| USE+ROUTE | `/api/inventory` | YES | YES `resolveScope()` admin | YES | PARTIAL (F22) | YES | `POST /adjustments` validates (`inventory.js:117`); GETs (`low-stock/adjustments/reorder-suggestions`) query manual (pagination clamped). |
| USE+ROUTE | `/api/price-overrides` | YES | YES `resolveScope()` admin | YES | YES | YES | GET/DELETE query dates via `dateStringSchema.safeParse`; PUT `priceOverridePutSchema`; product ownership pre-check. |
| USE+ROUTE | `/api/plans` | YES | YES `resolveScope()` admin | YES | YES | YES | `others.js:63,89` schemas; camp-ownership checks incl. re-parent guard. |
| USE+ROUTE | `/api/meal-categories` | YES | YES GET-public / mut-admin | YES | YES | YES | `meal-categories.js:105,143` schemas; project ownership asserts; `?projectId` manual but ownership-checked. |
| USE+ROUTE | `/api/categories` | YES | YES GET-public / mut-admin | YES | YES | YES | `categories.js:74,102` schemas; global-row (NULL tenant) mutation restricted to super_admin (H4). Header-cached GET. |
| USE+ROUTE | `/api/meals` | YES | YES GET-public / mut-admin | YES | YES | YES | `meals.js:113,161,230` post/bulk/put schemas. |
| USE+ROUTE | `/api/promotions` | YES | YES GET-public + apply-public / rest admin | YES | YES | YES | `promotions.js:140,182,254` create/update/apply schemas; `apply` pure computation, tenant-scoped promo load. |
| USE+ROUTE | `/api/services` | YES | YES `GET /public/:slug` public / rest admin | YES | PARTIAL (F23) | YES | definitions/items/bookings/status validate (zod); `assign`, availability POST, pricing PUT, reviews POST read body manually with ad-hoc checks, no zod. |
| USE+ROUTE | `/api/marketplace` | YES | NO (F24) | N/A-public | PARTIAL (F24) | YES | Directory/categories/profile/reviews GETs public; query (`search/category/page`) manual binds + `parsePagination` clamp. `POST /reviews` validates (`marketplace.js:156`). |
| ROUTE | `/api`,`/public`,`/onboarding` (signup/setup/tenant/status) | YES | NO (F25) | N/A-create | PARTIAL (F25) | YES | signup/setup/tenant-update validate (zod, `onboarding.js:59,191,275`); `GET /status/:token` path token unvalidated (bound lookup); token-as-auth by design. Signup catch uses manual `{success:false}` jsonResponse (envelope-shaped). |
| USE+ROUTE | `/api/inbox` | YES | YES `resolveScope()` admin | YES | PARTIAL (F26) | YES | `PATCH /read` validates (`inbox.js:145`); GET `kind` allowlist + DELETE `:kind` manual checks, no zod. All arms bind tenant. |
| USE+ROUTE | `/api/leads` | YES | YES POST-public / rest admin (F18) | NULLABLE-POST (F18) | YES | YES | POST = `createLead` (public, nullable tenant); PUT validates `leadPutSchema`; DELETE no body. GET `status` filter manual. |
| USE+ROUTE | `/api/me` | YES | YES GET-public / PUT,PATCH-admin (F27) | YES | YES | YES | GET public per R-9 but 400s without tenant (code contradicts comment — cosmetic). PUT/PATCH `tenantMePutSchema`. |
| ROUTE | `/api/camps*` sunset alias | YES | YES `catalogScope` | YES | YES | YES | `camps-alias.js` re-serves `campsRoutes` + Deprecation/Sunset headers; delete 2026-10-23. |
| USE+ROUTE | `/api/products`,`/rooms`,`/rateplans` | YES | YES GET-public / mut-admin | YES | YES | YES | `camps.js` post/put/bulk schemas per resource; tenant-scoped. |
| USE+ROUTE | `/api/projects/links` | YES | YES admin-only | YES | YES | YES | `project-links.js:125` schema; same-tenant A/B assert; delete binds tenant. |
| USE+ROUTE | `/api/projects/items` | YES | YES admin-only | YES | YES | YES | `project-items.js:187,222` schemas. |
| GET+POST | `/api/orders/calculate-price`, `/status/:ref` | YES | NO (F28) | YES | NO (F28) | YES | Public price preview + ref+email status (email equality re-check). Manual presence checks only, no zod/date/email format validation. |
| POST | `/api/orders/bulk-delete` | YES | YES admin | YES | NO (F29) | YES | Manual `Array.isArray(ids)` check (`orders.js:400`), no zod; deletes tenant-scoped + inbox cascade. |
| POST/PUT/DELETE | `/api/orders` (`/`,`/:id`) | YES | YES admin | YES | YES | YES | `orderPostSchema/orderPutSchema` + `validateOrder` + guarded INSERT…SELECT race guard. |
| PATCH | `/api/orders/:id/status`, `/:id/kitchen-status` | YES | YES admin / dual (F30) | YES | YES | YES | `orderStatusSchema`/`kitchenStatusSchema` + legal-transition machines; kitchen-status accepts POS tokens (dualRealm) by design. |
| POST | `/api/orders/:id/record-payment` | YES | YES admin | YES | YES | YES | `recordPaymentSchema` (`orders.js:1225`); idempotent `id` key. |
| GET | `/api/orders` (`/`,`/:id`,`/:id/items`,`/:id/payments`) | YES | YES admin | YES | —/YES | YES | List/detail tenant-bound; payments read side per comment (record-payment section tail not fully read — schema YES confirmed at grep). |
| PATCH/GET | `/api/orders/:id/{checkin,checkout,course,tip,split,split-details}` | YES | YES admin | YES | NO (F31) | YES | Six handlers parse body manually (`orders.js` checkin/checkout/course/tip/split): allowlist/range/type checks present but no zod. Tenant-bound throughout; room-takeover guard (A22-01) on checkin. |
| USE | `/api/availability` | YES | NO (F32) | YES | NO (F32) | YES | Fully public read-only (60s `cachedJsonResponse`); `checkIn/checkOut` presence-only, no date-format validation; `productId` optional. Bound tenant + NOT EXISTS guard. |
| POST | `/api/public/reservations` | YES | NO (F33) | YES | YES | YES | Public by design; `publicReservationSchema` (strict, server-side pricing); guarded INSERT + idempotency replay; 404 without tenant. |
| POST | `/api/public/paymob/webhook` | YES | YES-HMAC (F34) | YES | NO (F34) | YES | No JWT by design; raw-body HMAC (`paymob-webhook.js`) + signed amount/currency cross-check; writes scoped by resolved order tenant; 200 `{received:true}` ack. No zod. |
| USE+ROUTE | `/api/upload` | YES | YES admin | YES | YES* | YES | Multipart (no JSON body): ext via zod `filenameSchema`, 8 MB cap manual; R2 key `media/{tenantId}/{uuid}`. |
| USE+ROUTE | `/api/media` (GET/HEAD) | YES | NO (F35) | YES | YES | PARTIAL (F35) | Public by design; `mediaKeySchema` allowlist (`upload.js:73`); failures `errorResponse`; success is binary R2 stream (envelope N/A by content type). |
| DELETE | `/api/media/*` | YES | YES admin (method-branch scope) | YES | YES | YES | Key-scoped delete: non-super_admin blocked from other-tenant prefixes (403). |
| USE+ROUTE | `/api/projects/:projectId/meta` | YES | YES method-aware (`metaScope`) | YES | YES | YES | Same `createMetaRoutes` factory as tenant meta; `:id` integer-guarded (`parseIntId`). |
| USE+ROUTE | `/api/tags`, `/projects/:projectId/tags` | YES | YES GET-public / mut-admin | YES | YES | YES | `tags.js:162,196,291` schemas; project-tenant match gate. |
| USE+ROUTE | `/api/audit` | YES | YES admin | YES | YES | YES | `audit.js:103,165` query+post schemas; POST cross-tenant forbidden for non-super_admin. |
| USE+ROUTE | `/api/pos-tables` | YES | YES dualRealm | YES | YES | YES | `pos-tables.js:140,174,225` schemas. Mutations admin-gated inside router per mount comment — in-router role check UNVERIFIED (file not read). |
| ROUTE | `/api/projects` (`/:id/meal-plans` + catalog) | YES | YES meal-plans GET-public / catalog GET-public+mut-admin | PARTIAL (F36) | PARTIAL (F36) | YES | Meal-plans: entity-scoped (project row → tenant), `:id` path param unvalidated beyond binding; catalog GET cross-tenant marketplace when host has no tenant (by design). Catalog writes validate (camps schemas). |
| USE+ROUTE | `/api/financials` | YES | YES admin | YES | YES | YES | `financials.js:118,142,203,267,347,389,411,476` schemas on all writes. |
| USE+ROUTE | `/api/hr` | YES | YES admin | YES | YES | YES | `hr.js` schemas on all writes (employees/leave/payroll/jobs/applicants). |
| USE+ROUTE | `/api/supply` | YES | YES admin | YES | YES | YES | `supply.js` schemas on all writes (warehouse/stock/transfer/PO/BOM/MO). |
| USE+ROUTE | `/api/crm` | YES | YES admin | YES | YES | YES | `crm.js` schemas on all writes (contacts/leads/opps/tasks/tickets/articles). |
| USE+ROUTE | `/api/storefront` | YES | YES mixed (F37) | YES | PARTIAL (F37) | YES | Public reads + guest cart/checkout writes only when `STOREFRONT_CART_ENABLED=true`, else admin. Cart add/update + admin CMS validate (zod); `POST /checkout` reads `sessionId/customerEmail/customerPhone/shippingAddress` manually, no zod; GET queries (`sessionId/userId/category/search/page/limit`) manual. |
| USE+ROUTE | `/api/ai` | YES | YES admin | YES | PARTIAL (F38) | YES | Math endpoints + price/automation/prediction CRUD validate (zod, `ai.js:209-528`); `workers-ai/*` (prompt/text presence only) and `state/sync` (`key` presence only) manual, no zod; missing `AI`/`STATE_DO` bindings → honest 503s. |

Row count: 70. NO cells: 62 across 38 findings (F1–F38). UNVERIFIED items: 4 (see § UNVERIFIED).

## Findings (every NO above, with file:line + one falsification attempt)

- **F1 `GET /`** — Auth/Tenant/Validate/Envelope NO. `backend/src/index.js:155`. Falsification: attempted to find JSON or tenant branching — handler is a static `c.html` banner with no input, DB, or auth surface; NOs are by-content-type, not gaps. => benign by design.
- **F2 `GET /healthz`** — Auth/Tenant/Envelope NO. `backend/src/index.js:163`. Falsification: checked for tenant-conditioned output — probes (`SELECT 1`, KV get, R2 presence) take no tenant input and expose only status strings; envelope is `jsonResponse` without `success` flag, so failure-shape uniformity does not hold here. => accepted (availability endpoint); note only.
- **F3 `GET /api/openapi.json`** — Auth/Tenant/Validate/Envelope NO. `backend/src/index.js:476`. Falsification: comment explicitly forbids the envelope wrapper (`$ref` passthrough). Static generated doc. => deliberate.
- **F4 `ALL /api/*`** — Auth/Tenant/Validate NO. `backend/src/index.js:897`. Falsification: verified no auth precedes it other than global `policyLimiter`; returning 404 before auth is the documented anti-enumeration posture. => deliberate.
- **F5 `GET /api/health` (Astro)** — Auth/Tenant NO, Validate/Envelope UNVERIFIED. `app/src/pages/api/health.ts`. Not read this pass. => UNVERIFIED.
- **F6 POS logins** — Auth NO (entry point), Validate NO. `backend/src/routes/pos/index.js:handlePosLoginRequest` (~line 170). Falsification: searched file for zod on login — only presence check `if (!identifier || !password)`; credential verification is DB+bcrypt (not a validation gap for injection; binds used). => low-risk; schema-absence only.
- **F7 Auth public entries** — Auth NO. `backend/src/api/auth.js` (login/refresh/register/forgot/reset/logout/auto-login branches). Falsification: confirmed each is a credential-issuing or credential-using entry that cannot require a prior session; forgot-password additionally rate-limited. => by design.
- **F8 `me` / `change-password`** — Auth non-standard (inline `verifyToken`, not `requireAuth`). `backend/src/api/auth.js` me + change-password branches. Falsification: verified both manually check header, signature, and `is_active`; deactivation-gap property holds. => equivalent enforcement, non-uniform mechanism.
- **F9 `POST /api/auth/auto-login`** — Validate NO. `backend/src/api/auth.js` auto-login branch (`if (!token)`). Falsification: token is an opaque single-use UUID compared by equality bind; no structured input to validate. => low-risk; schema-absence only.
- **F10 `GET /api/tenants*`** — Auth NO (public), Tenant filter NO, Validate NO (query). `backend/src/api/tenants.js` GET branches. Falsification: all filters are bound (`LIKE ?`); `parseInt(capacity)||0`; non-super writes impossible (POST 403s); public detail forces `status='active'`. => injection-safe; public-by-design.
- **F11 Super-admin surface Tenant/Validate-query NO** — `backend/src/index.js:287-297` mounts + `api/admin-{financials,payouts,hr,supply,crm,storefront,ai}.js`, `admin-health.js`, `admin-performance.js`, `admin-reports.js`, `admin.js`, `admin-settings.js`, `admin-subscriptions.js`, `admin-audit.js`, `feedback.js` router. Falsification: scope stamp is `tenantId:null` with `super_admin` role gate; cross-tenant reads are the stated purpose (pillar overviews); GET filters are bound. => by design.
- **F12 payouts/subscriptions write-vs-read split** — Validate PARTIAL. `admin-payouts.js:83`, `admin-subscriptions.js:140` validate writes; list GET filters manual. Falsification: confirmed no unvalidated write path in either file (only GETs lack schemas). => read-filter-only.
- **F13 CSV exports Envelope NO** — `admin-performance.js:207`, `admin-reports.js:253,263`, `admin-audit.js:177`. Falsification: each returns `text/csv` file downloads; JSON envelope cannot apply to a non-JSON content type; error paths still use `errorResponse`. => by content type.
- **F14 admin-reports generate/schedule Validate NO** — `backend/src/api/admin-reports.js` generate + schedule branches (`const { reportId, parameters, format } = body`). Falsification: `reportId` is checked against the `REPORT_TEMPLATES` allowlist (unknown → 400) and `schedule` presence-checked; no free-form SQL (reportId feeds a switch). => allowlist-mitigated.
- **F15 `POST /api/payments/webhook` Auth NO** — `backend/src/api/payments.js:handleStripeWebhook`. Falsification: handler body is a single unconditional 501 `errorResponse`; no DB/env access, so unauthenticated reachability has no effect. => dead endpoint.
- **F16 POS shifts open/close Validate NO** — `backend/src/routes/pos/index.js` shifts/open + shifts/close branches (`parseFloat` + manual checks). Falsification: values are coerced numerics used only in binds/arithmetic; negative/NaN rejected; no string flows into SQL. => low-risk.
- **F17 barcode `:code` Validate NO** — `backend/src/api/pos-barcode.js` (`if (!code)`). Falsification: `code` flows only into a bound `sku/barcode + tenant_id` SELECT; no format assumption downstream. => low-risk.
- **F18 public create-lead/feedback Tenant NULLABLE + leads POST Auth NO** — `backend/src/api/leads.js:createLead`, `api/feedback.js:createFeedback`, mounts `index.js:348,355,610-613`. Falsification: null-tenant insert is explicit (`resolvedTenantId = tenantId || null`, `tenantId || null`) and broadcast is skipped without tenant; tenant_id never taken from body. => deliberate (hostname-only attribution).
- **F19 meal-schedules GET/DELETE validation** — `backend/src/api/meal-schedules.js` (only line 89 `schedulePostSchema` confirmed by grep). File tail not read. => UNVERIFIED (POST YES confirmed).
- **F20 SSE stream** — Tenant PARTIAL (`scopeMode:'lenient'`, `index.js:441` gate), Validate NO (`tenantId` presence-only; `lastEventId` passthrough). Falsification: `tokenTypes:['stream']` rejects 24h JWTs; forged-token path ends at the DO, which per `index.js` comments enforces tenant bind + single-use jti burn; `lastEventId` rides query into the DO, not SQL. => mitigated downstream; leniency is byte-compat scope.
- **F21 reports GET queries Validate NO** — `backend/src/api/reports.js` (9 GETs). Falsification: all queries bind scope tenant; date params flow into bound comparisons; `parseInt(...)||default` guards most; worst case is a malformed range returning data or a caught 500 via `errorResponse` (envelope holds). => robustness-only.
- **F22 inventory GETs Validate NO** — `backend/src/api/inventory.js` low-stock/adjustments/reorder paths. Falsification: pagination clamped via `parsePagination`; queries bind tenant/org; POST (the only write) validates. => read-only.
- **F23 services manual-write Validate NO** — `backend/src/api/services.js`: `assign` (`assigned_worker_id` presence), availability POST (`available_date` presence), pricing PUT (`price_tier` allowlist), reviews POST (manual rating 1–5). Falsification: each has an ad-hoc check (allowlist/range/presence) and tenant-scoped existence pre-checks; SQL is bound with fixed columns. => checks-present-but-not-zod.
- **F24 marketplace public + query Validate** — Auth NO, GET-query NO. `backend/src/api/marketplace.js`. Falsification: `search`/`category` are bound; pagination clamped (12/50); tenant profile lookup forces `status='active'`; only write (`POST /reviews`) validates. => by design.
- **F25 onboarding Auth NO + status-token Validate NO** — `backend/src/api/onboarding.js`. Falsification: token is the auth (unguessable UUID, single-use consumed → NULL); writes validate; status lookup is a bound equality read returning non-secret wizard state. => token-as-credential design.
- **F26 inbox GET/DELETE Validate NO** — `backend/src/api/inbox.js` (`Invalid kind filter`, kind-equality on delete). Falsification: `kind` is allowlist-compared (`all/lead/booking`, `lead`-only delete) before any SQL; `status` flows into bound arm builders. => allowlist-mitigated.
- **F27 `/api/me` GET Auth NO** — `backend/src/api/tenants.js` meRoutes + `index.js:623-625` (`mePublicScope`). Falsification: GET still requires resolved tenant (400 otherwise) and returns only that tenant's public branding row; writes are admin-gated. => public-read by design (R-9).
- **F28 orders public reads Validate NO** — `backend/src/api/orders.js` `calculate-price` + `status/:ref`. Falsification: presence-checked; all values bound; status additionally requires exact email match (case-normalized) and returns 404 on mismatch (anti-enumeration). => low-risk.
- **F29 `POST /api/orders/bulk-delete` Validate NO** — `backend/src/api/orders.js:400` (`Array.isArray` check). Falsification: ids flow only into `IN (...)` bind placeholders; deletes tenant-scoped with inbox cascade. => low-risk.
- **F30 kitchen-status dual-realm Auth** — `backend/src/index.js` `ordersDualScope` + `orders.js` kitchen-status branch. Falsification: POS tokens resolve tenant via org mapping (not header), admin tokens via equals-scope; transition machine + tenant existence check apply to both. => deliberate (terminal workflow).
- **F31 order sub-action writes Validate NO** — `backend/src/api/orders.js` checkin/checkout/course/tip/split branches (manual `await c.req.json()` destructuring). Falsification: each has range/allowlist/type checks (courses `[0..3]`, statuses allowlist, tip numeric, split 1–20) and tenant-scoped order loads; SQL binds fixed columns. => checks-present-but-not-zod.
- **F32 availability Auth NO + Validate NO** — `backend/src/api/orders.js` `availabilityRoutes` (public mount `index.js:719-720`). Falsification: fully read-only, bound tenant + `NOT EXISTS` overlap guard, 60s header cache, no KV writes; malformed dates degrade to string comparison (availability over/under-report, no data leak across tenants). => by design; date-format leniency noted.
- **F33 public reservations Auth NO** — `backend/src/api/reservations.js` (public mount `index.js:728-730`). Falsification: schema-validated + server-side pricing (client prices stripped), room ownership asserted, guarded INSERT, idempotency dedupe. => public-by-design with strong controls.
- **F34 paymob webhook Validate NO (no zod)** — `backend/src/api/paymob-webhook.js`. Falsification: validation is cryptographic (raw-body HMAC over exact bytes, fail-closed 503/401) plus the signed amount/currency cross-check before any money write; order resolution is by embedded ref with tenant-scoped writes. => HMAC-as-validation.
- **F35 media GET/HEAD Auth NO + binary Envelope NO** — `backend/src/api/upload.js` `mediaRoutes`. Falsification: `sanitizeMediaKey` regex allowlist (`media/{tenant}/{uuid}.{ext}`, rejects `..`/null bytes); keys are unguessable UUIDs; public readability is the design (key-embedded tenant). Success body cannot carry a JSON envelope. => by design.
- **F36 projects catalog/meal-plans Tenant/Validate PARTIAL** — `backend/src/api/camps.js:campsRoutes` + `api/meal-plans.js`, mounts `index.js:795-826`. Falsification: cross-tenant catalog GET is the documented marketplace behavior when host has no tenant; mutations ride `catalogScope` admin branch; meal-plan `:id` binds into existence-checked project reads (miss → `[]`). => by design.
- **F37 storefront mixed Auth + checkout/GET-query Validate NO** — `backend/src/api/storefront.js` + mount `index.js:storefrontScope` (`STOREFRONT_CART_ENABLED` flag). Falsification: guest writes confined to cart/checkout paths and only when flag is `true` (clean rollback lever); checkout totals are server-computed from tenant-bound products; admin CMS writes validate; queries bound with clamped pagination. => flag-gated by design.
- **F38 AI workers-ai/state Validate NO** — `backend/src/api/ai.js` workers-ai + state branches. Falsification: bodies are forwarded to `env.AI` / `STATE_DO` SDK calls, never SQL; tenant checked first; missing bindings → honest 503 (no fake data). => low-risk.

## UNVERIFIED (could not reproduce or confirm within pass budget)

- U1: `GET /api/health` (Astro `app/src/pages/api/health.ts`) — Validate/Envelope cells; file not read.
- U2: `ALL /api/meal-schedules` GET + DELETE input handling — only POST schema confirmed (`meal-schedules.js:89`); tail of file not read.
- U3: `GET /api/orders/:id/payments` list shape/pagination — handler tail past line ~1220 not fully read (record-payment schema YES confirmed via grep at `orders.js:1225`).
- U4: `/api/pos-tables` in-router admin-only mutation gating — mount comment (`index.js:784-787`) claims role gating inside router; `pos-tables.js` not read (schemas confirmed via grep only).
- U5: pillar routers (`financials/hr/supply/crm`) GET-filter validation beyond write schemas — write schemas confirmed via grep; read-filter code not line-verified per route.
- U6: `POST /api/admin/reports/generate` `parameters`/`format` free-form pass-through to `generateReportData` — `reportId` allowlist confirmed; `parameters` consumption per template not traced.

## Coverage notes / incomplete

- Covered: all ~45 Pass-1 mount prefixes (70 table rows incl. sub-paths), all 5 questions per row from Read/Grep evidence. `backend/src/index.js` read in full; `response.js`, `resolveScope.js`, `requireAuth.js`, `tenant.js` read in full; 30+ handler files read in full or in the sections bearing on the five questions.
- Not exhaustively line-verified: long tails of `orders.js` (payments section), `meal-schedules.js`, `pos-tables.js`, `admin-{hr,supply,crm,storefront,ai,settings,subscriptions}.js` (mount+schema evidence via grep + index.js comments), `tenant-import.js` body beyond schemas, `camps.js` resource bodies beyond schemas (Pass 1 + grep coverage).
- No fixes applied. No D1 writes. No source modifications.
- Time-box: single pass; items above marked UNVERIFIED rather than asserted.

*End of Pass 2 routes audit.*
