# Pass 1 — Surface Inventory (map only, no findings)

- Date: 2026-09-24
- Repo: /home/michael/devin/opencode-workspace/sinaicamps
- Mode: read-only. No source files touched, no D1 writes, no deploy.
- Spec: `.opencode/agents/tmp/2026-09-24-pass1-surface.md`
- Sections a–h below correspond to spec Steps 1–8.

Counts at a glance:

| Section | What | Count |
|---|---|---|
| a | `app.*` calls in `backend/src/index.js` (938 lines) | 191 |
| a | Distinct route prefixes mounted | ~45 (+ `/`, `/healthz`, `/api/*` fallback) |
| b | Handler files `backend/src/api/*.js` | 56 |
| b | Handler files `backend/src/routes/` | 2 (`pos/index.js`, `registry.js`) |
| c | Files `app/src/components/admin/*.tsx` | 60 |
| d | Files `app/src/pages/**/*` | 31 |
| e | `export function` in `app/src/lib/api.ts` (2664 lines) | 278 (incl. `apiFetch`, `request`, 3 scope helpers) |
| e | Endpoint functions with literal path arg | ~230 (remainder: conditional-path save*/upload/export helpers) |
| f | Hooks in `useQueryHooks.ts` | 104 `export function` |
| f | Hooks in `usePosQueries.ts` | 11 exports (9 hooks + `posKeys` + types) |
| f | Hooks in `useSseOrders.ts` / `useSseInbox.ts` | 1 each (`useSseOrders`, `useSseInbox`) |
| f | Hooks in `useAdminData.ts` | 0 (types/interfaces only, 11 exports) |
| g | Tables in current `backend/migrations/*.sql` (27 files) | 119 non-underscore (133 incl. `_guard`/`_new` temp) |
| g | Files in `backend/migrations/legacy/` | 99 + README.md |
| h | Cron triggers / queues / `scheduled(` in backend | 0 |

---

## a. Route mounts — `backend/src/index.js`

Global: `app.use('*', cors(...))` (index.js:122, single CORS source of truth);
`app.use('/api/*', policyLimiter())` (index.js:146, global rate-limit policy table);
`GET /` (index.js:155, HTML banner); `GET /healthz` (index.js:163, DB+KV+R2 checks);
`GET /api/openapi.json` (index.js:476, `buildOpenApiDocument` from `routes/registry.js`);
`ALL /api/*` 404 fallback (index.js:897). All `/api/*` also served under `/api/v1/*`
via path-rewrite in `export default fetch` (index.js:916-937); unversioned alias gets
Sunset headers (`withSunset`).

| METHOD + PATH | Handler file:line | Auth middleware | Tenant scope |
|---|---|---|---|
| POST /api/auth/pos-login | routes/pos/index.js:handlePosLoginRequest (index.js:210) | self-contained POS handler | POS realm |
| ALL /api/auth/* | api/auth.js:handleAuthRoute (index.js:212) | inside handler | varies per action |
| [use+route] /api/tenants/:tenantId/meta | api/meta.js:tenantMetaRoutes (index.js:230-232) | resolveScope GET-public / mutations-admin + tenantAwareLimiter | tenant (path param) |
| [use+route] /api/tenants/import | api/tenant-import.js (index.js:247-250) | resolveScope roles super_admin+admin, requireTenant:false, requireTenantHint:false + limiter | requester tenant or orphaned (identity mode) |
| POST /api/tenants | api/tenants.js:handleTenants (index.js:254) | inside handler | create |
| GET /api/tenants | api/tenants.js:handleTenants (index.js:255) | inside handler | list |
| GET /api/tenants/* | api/tenants.js:handleTenants (index.js:256) | inside handler | varies |
| [use+route] /api/admin/financials | api/admin-financials.js (index.js:287) | superAdminAuth (requireAuth realm admin, roles super_admin) | cross-tenant (tenantId:null) |
| [use+route] /api/admin/payouts | api/admin-payouts.js (index.js:288) | superAdminAuth | cross-tenant |
| [use+route] /api/admin/hr | api/admin-hr.js (index.js:289) | superAdminAuth | cross-tenant |
| [use+route] /api/admin/supply | api/admin-supply.js (index.js:290) | superAdminAuth | cross-tenant |
| [use+route] /api/admin/crm | api/admin-crm.js (index.js:291) | superAdminAuth | cross-tenant |
| [use+route] /api/admin/storefront | api/admin-storefront.js (index.js:292) | superAdminAuth | cross-tenant |
| [use+route] /api/admin/ai | api/admin-ai.js (index.js:293) | superAdminAuth | cross-tenant |
| [use+route] /api/admin/audit | api/admin-audit.js (index.js:294) | superAdminAuth | cross-tenant |
| [use+route] /api/admin/settings | api/admin-settings.js (index.js:295) | superAdminAuth | cross-tenant |
| [use+route] /api/admin/subscriptions | api/admin-subscriptions.js (index.js:296) | superAdminAuth | cross-tenant |
| [use+route] /api/admin/feedback | api/feedback.js (index.js:297) | superAdminAuth | cross-tenant |
| ALL /api/admin/health[/*] | api/admin-health.js (index.js:310-311) | inside handler | admin |
| ALL /api/admin/performance[/*] | api/admin-performance.js (index.js:312-313) | inside handler | admin |
| ALL /api/admin/reports[/*] | api/admin-reports.js (index.js:314-315) | inside handler | admin |
| [use+route] /api/tenant/billing | api/tenant-billing.js (index.js:319-322) | resolveScope() admin + limiter | tenant |
| ALL /api/admin[/\*] | api/admin.js:handleAdminRoute (index.js:325-326) | inside handler (super-admin) | cross-tenant |
| POST /api/payments/webhook | api/payments.js:handleStripeWebhook (index.js:332) | Stripe signature (no JWT) | n/a |
| [route] /api/pos | routes/pos/index.js:posRoutes (index.js:338) | self-contained POS auth inside | POS org/tenant |
| [use+route] /api/pos/products/barcode | api/pos-barcode.js (index.js:340-341) | resolveScope dualRealm | tenant |
| POST /api/contact | api/leads.js:createLead (index.js:348, Sunset alias of POST /api/leads) | resolveScope public | public (hostname) |
| POST /api/feedback | api/feedback.js:createFeedback (index.js:355) | resolveScope public | public (hostname) |
| ALL /api/meal-schedules[/\*] | api/meal-schedules.js (index.js:360-373) | requireAuth realm admin + getTenant() | tenant (getTenant) |
| ALL /api/pos-users[/\*] | api/pos-users.js (index.js:383-396) | requireAuth realm admin roles super_admin+admin requireTenant:false | tenant (getTenant; super_admin cross) |
| [use+route] /api/stream/token | api/stream-token.js (index.js:411-413) | resolveScope roles admin+super_admin requireTenantHint:false | tenant |
| GET /api/stream/orders | Broadcaster DO via sseOrdersGate (index.js:441) | requireAuth realm admin tokenTypes:[stream] allowQueryToken | tenant (query tenantId) |
| [use+route] /api/reports | api/reports.js (index.js:482-485) | resolveScope() + limiter | tenant |
| [use+route] /api/inventory | api/inventory.js (index.js:489-492) | resolveScope() + limiter | tenant |
| [use+route] /api/price-overrides | api/priceOverrides.js (index.js:497-500) | resolveScope() + limiter | tenant |
| [use+route] /api/plans | api/others.js:plansRoutes (index.js:504-507) | resolveScope() + limiter | tenant (camp ownership) |
| [use+route] /api/meal-categories | api/meal-categories.js (index.js:518-521) | GET-public / mutations-admin + limiter | tenant |
| [use+route] /api/categories | api/categories.js (index.js:531-534) | GET-public / mutations-admin + limiter | tenant |
| [use+route] /api/meals | api/meals.js (index.js:544-547) | GET-public / mutations-admin + limiter | tenant |
| [use+route] /api/promotions | api/promotions.js (index.js:563-566) | GET-public + POST /apply public / rest admin + limiter | tenant |
| [use+route] /api/services | api/services.js (index.js:575-578) | GET /public/:slug public / rest admin + limiter | tenant |
| [use+route] /api/marketplace | api/marketplace.js (index.js:583-585) | resolveScope public (no limiter line) | public |
| [use→route] /api + /api/public + /api/onboarding | api/onboarding.js (index.js:589-593) | resolveScope public | public |
| [use+route] /api/inbox | api/inbox.js (index.js:597-600) | resolveScope() + limiter | tenant |
| [use+route] /api/leads | api/leads.js (index.js:610-613) | POST-public / rest admin + limiter | tenant |
| [use+route] /api/me | api/tenants.js:meRoutes (index.js:623-625) | GET-public / PUT,PATCH-admin + limiter | tenant |
| camps alias /api/camps* | api/camps-alias.js:registerCampsAlias (index.js:641) | catalogScope (GET-public / mutations-admin) + limiter | tenant (sunset 2026-10-23) |
| [use+route] /api/products | api/camps.js:productsRoutes (index.js:649-652) | GET-public / mutations-admin + limiter | tenant |
| [use+route] /api/rooms | api/camps.js:roomsRoutes (index.js:660-663) | GET-public / mutations-admin + limiter | tenant |
| [use+route] /api/rateplans | api/camps.js:ratePlansRoutes (index.js:671-674) | GET-public / mutations-admin + limiter | tenant |
| [use+route] /api/projects/links | api/project-links.js (index.js:680-683) | resolveScope() admin + limiter | tenant |
| [use+route] /api/projects/items | api/project-items.js (index.js:689-692) | resolveScope() admin + limiter | tenant |
| [use+route] /api/orders | api/orders.js:ordersRoutes (index.js:712-715) | public: GET status/:ref + calculate-price; dual: PATCH kitchen-status; rest admin + limiter | tenant |
| [use+route] /api/availability | api/orders.js:availabilityRoutes (index.js:719-720) | resolveScope public | public |
| [use+route] /api/public/reservations | api/reservations.js (index.js:728-730) | resolveScope public | public (hostname) |
| POST /api/public/paymob/webhook | api/paymob-webhook.js (index.js:734) | HMAC inside handler | public |
| [use+route] /api/upload | api/upload.js:uploadRoutes (index.js:740-742) | resolveScope() admin + limiter | tenant |
| [use+route] /api/media | api/upload.js:mediaRoutes (index.js:748-750) | GET/HEAD-public / rest admin | key-embedded tenant |
| [use+route] /api/projects/:projectId/meta | api/meta.js:projectMetaRoutes (index.js:759-761) | metaScope GET-public / mutations-admin + limiter | tenant+project |
| [use+route] /api/tags | api/tags.js:tagsRoutes (index.js:767-769) | GET-public / mutations-admin + limiter | tenant |
| [use+route] /api/projects/:projectId/tags | api/tags.js:projectTagsRoutes (index.js:771-773) | catalogScope + limiter | tenant+project |
| [use+route] /api/audit | api/audit.js:auditRoutes (index.js:776-778) | resolveScope() admin + limiter | tenant |
| [use+route] /api/pos-tables | api/pos-tables.js (index.js:784-787) | resolveScope dualRealm + limiter | tenant |
| [use+route] /api/projects (:id/meal-plans) | api/meal-plans.js (index.js:795-796) | resolveScope public | tenant+project |
| [use+route] /api/projects | api/camps.js:campsRoutes (index.js:823-826) | catalogScope guarded to bare/:id + limiter guard | tenant (GET cross-tenant marketplace when host has no tenant) |
| [use+route] /api/financials | api/financials.js (index.js:831-834) | resolveScope() + limiter | tenant |
| [use+route] /api/hr | api/hr.js (index.js:838-841) | resolveScope() + limiter | tenant |
| [use+route] /api/supply | api/supply.js (index.js:845-848) | resolveScope() + limiter | tenant |
| [use+route] /api/crm | api/crm.js (index.js:852-855) | resolveScope() + limiter | tenant |
| [use+route] /api/storefront | api/storefront.js (index.js:879-882) | GET-public (+guest cart/checkout when STOREFRONT_CART_ENABLED=true) / rest admin + limiter | tenant |
| [use+route] /api/ai | api/ai.js (index.js:886-889) | resolveScope() + limiter | tenant |

---

## b. Handler files — `backend/src/api/` (56) + `backend/src/routes/` (2)

`backend/src/api/` — filename → key exports → mounted at (see §a):

| File | Key exports | Mount |
|---|---|---|
| admin.js | handleAdminRoute (+4 schemas) | ALL /api/admin* |
| admin-audit.js | adminAuditRoutes | /api/admin/audit |
| admin-ai.js | router (default) | /api/admin/ai |
| admin-crm.js | router (default) | /api/admin/crm |
| admin-financials.js | router (default) | /api/admin/financials |
| admin-health.js | handleAdminHealthRoute | ALL /api/admin/health* |
| admin-hr.js | router (default) | /api/admin/hr |
| admin-payouts.js | router (default) | /api/admin/payouts |
| admin-performance.js | handleAdminPerformanceRoute | ALL /api/admin/performance* |
| admin-reports.js | handleAdminReportsRoute | ALL /api/admin/reports* |
| admin-settings.js | adminSettingsRoutes | /api/admin/settings |
| admin-storefront.js | router (default) | /api/admin/storefront |
| admin-subscriptions.js | adminSubscriptionsRoutes | /api/admin/subscriptions |
| admin-supply.js | router (default) | /api/admin/supply |
| ai.js | router + calculateDynamicPrice, linearRegression, detectAnomalies | /api/ai |
| audit.js | auditRoutes + logAudit (+3 schemas/consts) | /api/audit |
| auth.js | handleAuthRoute (+6 schemas) | ALL /api/auth/* |
| camps.js | campsRoutes (default) + productsRoutes + roomsRoutes + ratePlansRoutes (+7 schemas/consts) | /api/projects, /api/products, /api/rooms, /api/rateplans |
| camps-alias.js | registerCampsAlias, campsAliasSunset | /api/camps* alias |
| categories.js | categoriesRoutes (+2 schemas) | /api/categories |
| crm.js | router (default) | /api/crm |
| feedback.js | feedbackRoutes (default) + createFeedback | POST /api/feedback; /api/admin/feedback |
| financials.js | router (default) | /api/financials |
| hr.js | router (default) | /api/hr |
| inbox.js | inboxRoutes (default) + inboxReadSchema | /api/inbox |
| inventory.js | inventoryRoutes (default) | /api/inventory |
| leads.js | leadsRoutes (default) + createLead + broadcastNewLead | /api/leads; POST /api/contact |
| marketplace.js | router (default) | /api/marketplace |
| meal-categories.js | mealCategoriesRoutes (+2 schemas) | /api/meal-categories |
| meal-plans.js | mealPlanRoutes (default) | /api/projects (:id/meal-plans) |
| meal-schedules.js | handleMealSchedulesRoute + schedulePostSchema | ALL /api/meal-schedules* |
| meals.js | mealsRoutes (+3 schemas) | /api/meals |
| meta.js | tenantMetaRoutes + projectMetaRoutes (+3 schemas, loadProjectMeta) | /api/tenants/:id/meta, /api/projects/:id/meta |
| onboarding.js | onboardingRoutes (default) | /api, /api/public, /api/onboarding |
| orders.js | ordersRoutes (default) + availabilityRoutes (+6 schemas, broadcastNewBooking) | /api/orders, /api/availability |
| others.js | plansRoutes (+2 schemas) | /api/plans |
| payments.js | handleStripeWebhook (+2 schemas) | POST /api/payments/webhook |
| paymob-webhook.js | handlePaymobWebhook | POST /api/public/paymob/webhook |
| pos-barcode.js | barcode (default router) | /api/pos/products/barcode |
| pos-tables.js | posTablesRoutes (+4 schemas/consts) | /api/pos-tables |
| pos-users.js | handlePosUsersRoute + scopeTenant (+5 schemas/consts) | ALL /api/pos-users* |
| priceOverrides.js | priceOverridesRoutes (default) | /api/price-overrides |
| project-items.js | projectItemsRoutes (+3 schemas/consts) | /api/projects/items |
| project-links.js | projectLinksRoutes (+1 schema) | /api/projects/links |
| promotions.js | router (default) (+3 schemas) | /api/promotions |
| reports.js | reportsRoutes (default) | /api/reports |
| reservations.js | reservationsRoutes (+1 schema) | /api/public/reservations |
| services.js | router (default) | /api/services |
| storefront.js | router (default) | /api/storefront |
| stream-token.js | streamToken (default router) | /api/stream/token |
| supply.js | router (default) | /api/supply |
| tags.js | tagsRoutes + projectTagsRoutes (+3 schemas) | /api/tags, /api/projects/:id/tags |
| tenant-billing.js | tenantBillingRoutes | /api/tenant/billing |
| tenant-import.js | tenantImportRoutes (default) + importTenantManifest | /api/tenants/import |
| tenants.js | handleTenants + meRoutes (default) (+2 schemas) | POST/GET /api/tenants*, /api/me |
| upload.js | uploadRoutes (default) + mediaRoutes (+4 helpers/consts) | /api/upload, /api/media |

`backend/src/routes/` — 2 files:

| File | Contents | Used by |
|---|---|---|
| routes/pos/index.js | posRoutes + handlePosLoginRequest; 57 `.get/.post/.put/.patch/.delete/.all/.use/.route` calls | mounted at /api/pos (index.js:338); POST /api/auth/pos-login (index.js:210) |
| routes/registry.js | buildOpenApiDocument (0 route mounts) | GET /api/openapi.json (index.js:476) |

---

## c. Admin panels — `app/src/components/admin/` (60 files)

20 files use `import * as api`; named/type-only imports listed per file.
"What it manages" is the filename-derived area (map only).

| File | Manages | API import |
|---|---|---|
| AdminApp.tsx | admin SPA host/router | (hooks; no direct api import) |
| AdminShell.tsx | admin shell/layout | (no direct api import) |
| AIPanel.tsx | tenant AI | `import * as api` |
| AnalyticsPanel.tsx | analytics | `import type { KitchenTrend }` |
| AuditLogPanel.tsx | audit log | `exportAuditLog` |
| BillingPanel.tsx | tenant billing | (via hooks; no direct import line) |
| BookingCalendar.tsx | booking calendar | (via hooks) |
| BrowserAIPanel.tsx | browser AI models | (browser-ai lib, no api import) |
| CampsPanel.tsx | projects/camps | `import type { ProjectLink }` (+ hooks) |
| CashDeskPanel.tsx | cash desk/payments | (via hooks: useRecordPaymentMutation etc.) |
| CRMPanel.tsx | tenant CRM | `apiFetch` + `import * as api` |
| DashboardPanel.tsx | tenant dashboard | (via hooks) |
| DynamicForm.tsx | dynamic forms | (no api import) |
| FeedbackPanel.tsx | feedback reports | `getFeedback` + Feedback* types |
| FinancialPanel.tsx | tenant financials | `import * as api` |
| ForgotPasswordPage.tsx | forgot password | `import * as api` |
| HRPanel.tsx | tenant HR | `import * as api` |
| icons.tsx | icons | (none) |
| InboxPanel.tsx | unified inbox | `import * as api` |
| ListingWizard.tsx | listing wizard | (no direct api import) |
| LowStockPanel.tsx | low stock | (via useLowStock hook) |
| MealsPanel.tsx | meals | `import * as api` |
| MenuPanel.tsx | menu | `import * as api` + `bulkCreateMeals` |
| MenuPlannerPanel.tsx | meal schedules | `createMealSchedule, deleteMealSchedule` |
| OrdersPanel.tsx | orders | (via hooks) |
| PasswordPanel.tsx | password | (via useChangePasswordMutation) |
| PaymentReceipt.tsx | receipt | (none) |
| PhotosStep.tsx | photos step | `import * as api` |
| PlanningPanel.tsx | planning | `import * as api` |
| ProjectItemsPanel.tsx | project items | `import type { ProjectItem }` (+ hooks) |
| PromotionsPanel.tsx | promotions | `import type { Promotion }` + `import * as api` |
| RatePlansPanel.tsx | rate plans | (via hooks) |
| RecordPaymentModal.tsx | record payment | (via mutation hook) |
| RegisterPage.tsx | register | `import * as api` |
| ReportsPanel.tsx | reports | (via hooks) |
| ResetPasswordPage.tsx | reset password | `import * as api` |
| RoomsPanel.tsx | rooms | `bulkCreateProducts` (+ hooks) |
| ServiceBookingsPanel.tsx | service bookings | `import * as api` + `import type { ServiceBooking }` |
| ServicesPanel.tsx | services | `import * as api` + Service* types |
| SettingsPanel.tsx | tenant settings | `import * as api` |
| StaffPanel.tsx | POS staff | `import * as api` |
| StorefrontPanel.tsx | tenant storefront | `import * as api` |
| SubscriptionsPanel.tsx | subscriptions | `updateAdminSubscription, cancelAdminSubscription, resumeAdminSubscription` |
| SuperAIPanel.tsx | super AI overview | `apiFetch, getAdminTenants` |
| SuperCRMPanel.tsx | super CRM overview | `apiFetch, getAdminTenants` |
| SuperDashboardPanel.tsx | super dashboard | (via hooks) |
| SuperFinancialsPanel.tsx | super financials + payouts | `apiFetch, getAdminTenants, getAdminPublicPayments, getAdminPayouts, getAdminPayout, createAdminPayout, markAdminPayoutPaid, cancelAdminPayout` + payout types |
| SuperHRPanel.tsx | super HR overview | `apiFetch, getAdminTenants` |
| SuperOrdersPanel.tsx | super orders | `getAdminTenants, getOrders` |
| SuperReportsPanel.tsx | super reports | `generateAdminReport, createAdminScheduledReport, deleteAdminScheduledReport` |
| SuperStorefrontPanel.tsx | super storefront | `apiFetch, getAdminTenants` |
| SuperSupplyPanel.tsx | super supply | `apiFetch, getAdminTenants` |
| SuperTenantsPanel.tsx | tenants hub | `updateAdminTenant, getAdminTenants, getAdmins, updateAdminUser, createAdminUser, deleteAdminUser, createTenant` |
| SupplyPanel.tsx | tenant supply | `import * as api` |
| SystemHealthPanel.tsx | system health | (via useAdminHealth* hooks) |
| SystemSettingsPanel.tsx | platform settings | `updateAdminSettings` |
| TenantDrilldown.tsx | tenant drill-down | `setTenantScope` (+ hooks) |
| TenantImportPanel.tsx | tenant import | `import * as api` |
| TenantPerformancePanel.tsx | tenant performance | `exportAdminPerformance` |
| UsersPanel.tsx | admin users | `updateAdminUser, deleteAdminUser` |

---

## d. Public pages — `app/src/pages/` (31 files)

Zone per `app/src/lib/routeZones.ts`: marketplace-only = `/camps /camp /camp/*`;
tenant-only = `/pos /pos/*`, `/menu /book /rooms`, `/storefront /storefront/*`;
system (both) = `/admin /api /auth /register /login /robots.txt /sitemap.xml /404 /_astro /favicon`;
both zones = `/ /about /contact /faq /gallery` (+ marketplace page, onboarding, signup).
13 of 31 pages reference `ZoneGuard`.

| File | Route | Zone |
|---|---|---|
| index.astro | `/` | both |
| about.astro | `/about` | both |
| contact.astro | `/contact` | both |
| faq.astro | `/faq` | both |
| gallery.astro | `/gallery` | both |
| camps.astro | `/camps` | marketplace-only (ZoneGuard) |
| camp/[id]/index.astro | `/camp/:id` | marketplace-only (ZoneGuard) |
| camp/[id]/book.astro | `/camp/:id/book` | marketplace-only (ZoneGuard) |
| camp/[id]/menu.astro | `/camp/:id/menu` | marketplace-only (ZoneGuard) |
| marketplace.astro | `/marketplace` | both (marketplace surface, no guard) |
| book.astro | `/book` | tenant-only (ZoneGuard) |
| menu.astro | `/menu` | tenant-only (ZoneGuard) |
| rooms.astro | `/rooms` | tenant-only (ZoneGuard) |
| storefront/index.astro | `/storefront` | tenant-only (ZoneGuard) |
| storefront/cart.astro | `/storefront/cart` | tenant-only (ZoneGuard) |
| storefront/checkout.astro | `/storefront/checkout` | tenant-only (ZoneGuard) |
| storefront/order/[orderNumber]/confirmation.astro | `/storefront/order/:orderNumber/confirmation` | tenant-only (ZoneGuard) |
| pos/[...rest]/index.astro | `/pos/*` SPA | tenant-only (ZoneGuard) |
| pos/login/index.astro | `/pos/login` | tenant-only (ZoneGuard) |
| admin/[...rest]/index.astro | `/admin/*` SPA | system (both) |
| auth/forgot-password.astro | `/auth/forgot-password` | system (both) |
| auth/reset-password.astro | `/auth/reset-password` | system (both) |
| login.astro | `/login` | system (both) |
| register/index.astro | `/register` | system (both) |
| signup.astro | `/signup` | both (no guard) |
| onboarding.astro | `/onboarding` | both (no guard) |
| 404.astro | `/404` | system (both) |
| [...path].astro | catch-all | both (renders 404) |
| robots.txt.ts | `/robots.txt` | system (both) |
| sitemap.xml.ts | `/sitemap.xml` | system (both) |
| api/health.ts | `/api/health` (Astro endpoint) | system (both) |

---

## e. Endpoints — `app/src/lib/api.ts` (278 exports; ~230 with literal paths)

`API_BASE`: local → `http://localhost:8787/api/v1`; sinaicamps hosts → `/api/v1`;
else → `https://sinaicamps.com/api/v1`. Realm: `/pos/*` + `/auth/pos-*` → pos, else admin.
`PUT/POST*` = conditional `editId ? PUT : POST`. Backend handler = §a mount by prefix.

Auth & session: `login` POST /auth/login; `logout` POST /auth/logout;
`getAuthMe` GET /auth/me; `forgotPassword` POST /auth/forgot-password;
`resetPassword` POST /auth/reset-password; `changePassword` POST /auth/change-password;
`registerUser` POST /auth/register; `posLogin` POST /auth/pos-login → api/auth.js, routes/pos.

Catalog: `getCamps` GET /projects; `getCamp` GET /projects/${id};
`saveCamp` PUT/POST* /projects[/:id]; `deleteCamp` DELETE /projects/:id(?tenantId=);
`getProducts` GET /products; `saveProduct` PUT/POST* /products[/:id];
`bulkCreateProducts` POST /products/bulk; `deleteProduct` DELETE /products/:id;
`getRooms` GET /rooms; `saveRoom` PUT/POST* /rooms[/:id]; `deleteRoom` DELETE /rooms/:id;
`getRatePlans` GET /rateplans; `saveRatePlan` PUT/POST* /rateplans[/:id];
`deleteRatePlan` DELETE /rateplans/:id → api/camps.js.

Orders: `getOrders` GET /orders+qs; `getOrder` GET /orders/:id;
`getOrderStatus` GET /orders/status/:ref?email=; `saveOrder` PUT/POST* /orders[/:id];
`updateOrderStatus` PATCH /orders/:id/status; `recordPayment` POST /orders/:id/record-payment;
`getOrderPayments` GET /orders/:id/payments; `deleteOrder` DELETE /orders/:id;
`bulkDeleteOrders` POST /orders/bulk-delete; `calculatePrice` GET /orders/calculate-price+qs;
`updateKitchenStatus` PATCH /orders/:id/kitchen-status → api/orders.js.
`getAvailability` GET /availability+qs → availabilityRoutes.

Menu: `getCategories` GET /categories; `getCategory` GET /categories/:id;
`saveCategory` PUT/POST* /categories[/:id]; `deleteCategory` DELETE /categories/:id;
`getMeals` GET /meals+qs; `getMeal` GET /meals/:id; `saveMeal` PUT/POST* /meals[/:id];
`deleteMeal` DELETE /meals/:id; `bulkCreateMeals` POST /meals/bulk;
`getMealCategories` GET /meal-categories+qs; `saveMealCategory` PUT/POST* /meal-categories[/:id];
`deleteMealCategory` DELETE /meal-categories/:id; `getMealSchedules` GET /meal-schedules+qs;
`createMealSchedule` POST /meal-schedules; `deleteMealSchedule` DELETE /meal-schedules/:id;
`getPlans` GET /plans; `getPlan` GET /plans/:id; `savePlan` PUT/POST* /plans[/:id];
`deletePlan` DELETE /plans/:id → api/categories.js, api/meals.js, api/meal-categories.js,
api/meal-schedules.js, api/others.js.

Reports: `getOccupancyReport` GET /reports/occupancy; `getRevenueReport` GET /reports/revenue+qs;
`getBookingsReport` GET /reports/bookings+qs; `getAnalyticsLowStock` GET /reports/low-stock;
`getTopProducts` GET /reports/top-products+qs; `getKitchenPerformance` GET /reports/kitchen-performance+qs;
`getRevenueBreakdown` GET /reports/revenue-breakdown+qs; `getCustomerMetrics` GET /reports/customer-metrics+qs;
`getSeasonalComparison` GET /reports/seasonal → api/reports.js.

Tenant: `getMe` GET /me; `updateBranding` PATCH /me → tenants.js meRoutes;
`getTenantBilling` GET /tenant/billing → api/tenant-billing.js;
`getTenants` GET /tenants; `getTenantsPublic` GET /tenants/public;
`createTenant` POST /tenants; `importTenantManifest` POST /tenants/import → api/tenants.js, api/tenant-import.js.

Super-admin: `getAdminStats` GET /admin/stats; `getAdminTenants` GET /admin/tenants+qs;
`updateAdminTenant` PATCH /admin/tenants/:id; `deleteAdminTenant` DELETE /admin/tenants/:id;
`getAdmins` GET /admin/admins+qs; `createAdminUser` POST /admin/admins;
`deleteAdminUser` DELETE /admin/admins/:id; `updateAdminUser` PATCH /admin/admins/:id;
`bulkSuspendTenants` POST /admin/tenants/bulk/suspend;
`bulkActivateTenants` POST /admin/tenants/bulk/activate;
`bulkDeleteTenants` POST /admin/tenants/bulk/delete → api/admin.js.
`getAdminSettings` GET /admin/settings; `updateAdminSettings` PUT /admin/settings;
`getAdminSubscriptions` GET /admin/subscriptions+qs; `updateAdminSubscription` PUT /admin/subscriptions/:id;
`cancelAdminSubscription` POST /admin/subscriptions/:id/cancel;
`resumeAdminSubscription` POST /admin/subscriptions/:id/resume;
`getAdminReports` GET /admin/reports; `getAdminScheduledReports` GET /admin/reports/scheduled;
`generateAdminReport` POST /admin/reports/generate; `createAdminScheduledReport` POST /admin/reports/schedule;
`deleteAdminScheduledReport` DELETE /admin/reports/scheduled/:id;
`getAdminPerformance` GET /admin/performance; `exportAdminPerformance` GET /admin/performance (blob);
`getAdminHealth` GET /admin/health; `getAdminHealthMetrics` GET /admin/health/metrics;
`getAdminAudit` GET /admin/audit+qs.
`getSuperFinancialsOverview` GET /admin/financials/overview;
`getSuperInvoices` GET /admin/financials/invoices?page&limit;
`getAdminPublicPayments` GET /admin/financials/public-payments+qs;
`getAdminPayoutEligible` GET /admin/payouts/eligible+qs; `getAdminPayouts` GET /admin/payouts+qs;
`getAdminPayout` GET /admin/payouts/:id; `createAdminPayout` POST /admin/payouts;
`markAdminPayoutPaid` POST /admin/payouts/:id/pay; `cancelAdminPayout` POST /admin/payouts/:id/cancel;
`getSuperHROverview` GET /admin/hr/overview; `getSuperEmployees` GET /admin/hr/employees?page&limit;
`getSuperSupplyOverview` GET /admin/supply/overview;
`getSuperPurchaseOrders` GET /admin/supply/purchase-orders?page&limit;
`getSuperCRMOverview` GET /admin/crm/overview; `getSuperContacts` GET /admin/crm/contacts?page&limit;
`getSuperOpportunities` GET /admin/crm/opportunities?page&limit;
`getSuperStorefrontOverview` GET /admin/storefront/overview;
`getSuperStorefrontProducts` GET /admin/storefront/products?page&limit;
`getSuperAIOverview` GET /admin/ai/overview; `getSuperPredictions` GET /admin/ai/predictions?page&limit.

POS/staff: `getPosUsers` GET /pos-users+qs; `createPosUser` POST /pos-users;
`updatePosUser` PATCH /pos-users/:id; `deletePosUser` DELETE /pos-users/:id;
`resetPosUserPassword` POST /pos-users/:id/reset-password → api/pos-users.js.
`posGetDashboard` GET /pos/dashboard; `posGetProducts` GET /pos/products;
`posGetOrders` GET /pos/orders; `posGetOrder` GET /pos/orders/:id;
`posCreateOrder` POST /pos/orders; `posGetActiveShift` GET /pos/shifts/active;
`posOpenShift` POST /pos/shifts/open; `posCloseShift` POST /pos/shifts/close → routes/pos.
`getPosTables` GET /pos-tables; `createPosTable` POST /pos-tables;
`updatePosTable` PUT /pos-tables/:id; `updatePosTableStatus` PATCH /pos-tables/:id/status;
`deletePosTable` DELETE /pos-tables/:id → api/pos-tables.js.

Leads/inbox: `saveLead` POST /leads; `getLeads` GET /leads+qs; `updateLead` PUT /leads/:id;
`deleteLead` DELETE /leads/:id → api/leads.js. `getInbox` GET /inbox+qs;
`markInboxRead` PATCH /inbox/read; `deleteInboxLead` DELETE /inbox/lead/:id → api/inbox.js.
`createPublicReservation` POST /public/reservations → api/reservations.js.

Inventory/pricing/media: `getLowStock` GET /inventory/low-stock+qs;
`getPriceOverrides` GET /price-overrides+qs; `setPriceOverrides` PUT /price-overrides;
`deletePriceOverride` DELETE /price-overrides?productId&date;
`upload` POST /upload (FormData, no-JSON branch) → api/inventory.js, api/priceOverrides.js, api/upload.js.

Projects: `getProjectMeta` GET /projects/:id/meta; `setProjectMeta` POST /projects/:id/meta;
`updateProjectMeta` PUT /projects/:id/meta/:metaId; `deleteProjectMeta` DELETE /projects/:id/meta/:metaId;
`reorderProjectMeta` PATCH /projects/:id/meta/reorder → api/meta.js.
`getProjectItems` GET /projects/items+qs; `saveProjectItem` PUT/POST* /projects/items[/:id];
`deleteProjectItem` DELETE /projects/items/:id → api/project-items.js.
`getProjectLinks` GET /projects/links+qs; `createProjectLink` POST /projects/links;
`deleteProjectLink` DELETE /projects/links/:id → api/project-links.js.
`getTags` GET /tags+qs; `createTag` POST /tags; `getProjectTags` GET /projects/:id/tags;
`addProjectTags` POST /projects/:id/tags; `removeProjectTag` DELETE /projects/:id/tags/:tagId → api/tags.js.
`getProjectMealPlans` GET /projects/:id/meal-plans → api/meal-plans.js.
`getAuditLog` GET /audit+qs; `exportAuditLog` GET /audit/export (blob) → api/audit.js.

Promotions/services: `getPromotions` GET /promotions+qs; `savePromotion` PUT/POST* /promotions[/:id];
`deletePromotion` DELETE /promotions/:id; `applyPromotions` POST /promotions/apply → api/promotions.js.
`getServiceDefinitions` GET /services/definitions; `saveServiceDefinition` PUT/POST* /services/definitions[/:id];
`deleteServiceDefinition` DELETE /services/definitions/:id; `getServiceItems` GET /services/items;
`saveServiceItem` PUT/POST* /services/items[/:id]; `deleteServiceItem` DELETE /services/items/:id;
`getServiceBookings` GET /services/bookings+qs; `createServiceBooking` POST /services/bookings;
`updateBookingStatus` PATCH /services/bookings/:id/status;
`assignServiceWorker` PATCH /services/bookings/:id/assign → api/services.js.

Onboarding/marketplace: `signupTenant` POST /public/signup;
`getOnboardingStatus` GET /onboarding/status/:token; `completeOnboarding` POST /onboarding/setup;
`updateOnboardingTenant` POST /onboarding/tenant → api/onboarding.js.
`getMarketplaceListings` GET /marketplace+qs; `getMarketplaceCategories` GET /marketplace/categories
→ api/marketplace.js.

Financials: `getFinancialAccounts` GET /financials/accounts; `createFinancialAccount` POST /financials/accounts;
`updateFinancialAccount` PUT /financials/accounts/:id; `deleteFinancialAccount` DELETE /financials/accounts/:id;
`getFinancialJournals` GET /financials/journals; `createFinancialJournal` POST /financials/journals;
`getJournalEntries` GET /financials/journal-entries+qs; `createJournalEntry` POST /financials/journal-entries;
`postJournalEntry` POST /financials/journal-entries/:id/post; `getFinancialInvoices` GET /financials/invoices+qs;
`createFinancialInvoice` POST /financials/invoices; `updateInvoiceStatus` PATCH /financials/invoices/:id/status;
`createPayment` POST /financials/payments; `getTaxRates` GET /financials/tax-rates;
`createTaxRate` POST /financials/tax-rates; `getTenantPayouts` GET /financials/payouts;
`processPayment` POST /financials/process-payment; `confirmFinancialPayment` POST /financials/confirm-payment
→ api/financials.js.

HR: `getHrEmployees` GET /hr/employees; `createHrEmployee` POST /hr/employees;
`updateHrEmployee` PUT /hr/employees/:id; `deleteHrEmployee` DELETE /hr/employees/:id;
`getHrLeaveTypes` GET /hr/leave-types; `createHrLeaveType` POST /hr/leave-types;
`getHrLeaveRequests` GET /hr/leave-requests; `createHrLeaveRequest` POST /hr/leave-requests;
`approveHrLeaveRequest` PATCH /hr/leave-requests/:id/approve; `getHrPayrollRuns` GET /hr/payroll/runs;
`createHrPayrollRun` POST /hr/payroll/runs; `postHrPayrollRun` POST /hr/payroll/runs/:id/post;
`getHrJobPosts` GET /hr/job-posts; `createHrJobPost` POST /hr/job-posts;
`createHrApplicant` POST /hr/applicants → api/hr.js.

Supply: `getSupplyWarehouses` GET /supply/warehouses; `getSupplyStock` GET /supply/stock+qs;
`getSupplyTransfers` GET /supply/stock-transfers; `getSupplyPurchaseOrders` GET /supply/purchase-orders;
`getSupplyBoms` GET /supply/boms; `getSupplyManufacturingOrders` GET /supply/manufacturing-orders → api/supply.js.

CRM: `getCrmContacts` GET /crm/contacts+qs; `getCrmLeads` GET /crm/leads;
`getCrmOpportunities` GET /crm/opportunities; `getCrmTasks` GET /crm/tasks+qs;
`getCrmTickets` GET /crm/tickets; `getCrmKnowledgeArticles` GET /crm/knowledge-articles;
`saveCrmKnowledgeArticle` PUT/POST* /crm/knowledge-articles[/:id] → api/crm.js.

Storefront: `getStorefrontProducts` GET /storefront/products+qs;
`getStorefrontProduct` GET /storefront/products/:id;
`getStorefrontCart` GET /storefront/cart?sessionId=; `addToStorefrontCart` POST /storefront/cart/items;
`updateStorefrontCartItem` PUT /storefront/cart/items/:id;
`removeStorefrontCartItem` DELETE /storefront/cart/items/:id;
`checkoutStorefront` POST /storefront/checkout; `getStorefrontOrders` GET /storefront/orders?sessionId=;
`getStorefrontPages` GET /storefront/admin/pages; `saveStorefrontPage` PUT/POST* /storefront/admin/pages[/:id];
`deleteStorefrontPage` DELETE /storefront/admin/pages/:id;
`getStorefrontBlogPosts` GET /storefront/admin/blog; `saveStorefrontBlogPost` PUT/POST* /storefront/admin/blog[/:id];
`deleteStorefrontBlogPost` DELETE /storefront/admin/blog/:id;
`saveStorefrontBlogCategory` PUT/POST* /storefront/admin/blog-categories[/:id];
`deleteStorefrontBlogCategory` DELETE /storefront/admin/blog-categories/:id;
`getStorefrontBlogCategories` GET /storefront/admin/blog-categories → api/storefront.js.

AI: `getAiPredictions` GET /ai/predictions+qs; `createAiPrediction` POST /ai/predictions;
`getAiDynamicPrice` POST /ai/dynamic-price; `getAiAnomaly` POST /ai/anomaly;
`runAIForecast` POST /ai/forecast; `getAiPriceRules` GET /ai/price-rules;
`createAIPriceRule` POST /ai/price-rules; `updateAIPriceRule` PUT /ai/price-rules/:id;
`deleteAIPriceRule` DELETE /ai/price-rules/:id; `getAiAutomationRules` GET /ai/automation-rules;
`createAIAutomationRule` POST /ai/automation-rules; `updateAIAutomationRule` PUT /ai/automation-rules/:id;
`toggleAIAutomationRule` POST /ai/automation-rules/:id/toggle;
`toggleAiAutomationRule` PATCH /ai/automation-rules/:id/activate;
`getAiAutomationLogs` GET /ai/automation-logs;
`analyzeWithWorkersAI` POST /ai/workers-ai/analyze; `generateEmbeddings` POST /ai/workers-ai/embeddings;
`getDurableStateSessions` GET /ai/state/sessions; `syncDurableState` POST /ai/state/sync;
`getDurableStateValue` GET /ai/state/sync/:key → api/ai.js (workers-ai/state are 503 stubs per AGENTS.md).

Feedback: `submitFeedback` POST /feedback; `getFeedbackList` GET /admin/feedback+qs;
`getFeedback` GET /admin/feedback/:id; `updateFeedbackStatus` PATCH /admin/feedback/:id → api/feedback.js.

Helpers (no endpoint): `setTenantScope`, `getTenantScope`, `getTenantId`, `apiFetch`, `request`.

---

## f. Hooks — `app/src/hooks/` (5 files)

`useQueryHooks.ts` — 104 hooks. Query hooks → endpoint (§e) → sample consumers
(consumer counts via `grep -rl <hook> app/src`):

- useCampsQuery → getCamps → 6 files (CampsPanel, AdminApp, BookingCalendar…)
- useProductsQuery → getProducts; useRoomsQuery → getRooms; useRatePlansQuery → getRatePlans
- useOrdersQuery → getOrders → 5 files (OrdersPanel, CashDeskPanel, InboxPanel…);
  useOrderDetailQuery → getOrder; useOrderPaymentsQuery/useCashDeskPayments → getOrderPayments
- useMealsQuery → getMeals; useMealCategoriesQuery → getMealCategories;
  useMealSchedulesQuery → getMealSchedules
- usePlansQuery → getPlans; useSettingsQuery → getMe (/me)
- useLowStock → getLowStock; useAvailabilityQuery → getAvailability;
  usePriceOverridesQuery → getPriceOverrides
- useAdminStatsQuery → getAdminStats → 2 files; useTenantsQuery → getAdminTenants;
  useAdminUsersQuery → getAdmins; useAdminAuditQuery → getAdminAudit
- useInboxQuery → getInbox → 2 files (InboxPanel…); useInboxUnreadQuery → getInbox pageSize=1
- useOccupancyReportQuery/useRevenueReportQuery/useBookingsReportQuery →
  getOccupancyReport/getRevenueReport/getBookingsReport
- useTopProductsQuery/useKitchenPerformanceQuery/useAnalyticsLowStockQuery/
  useRevenueBreakdownQuery/useCustomerMetricsQuery/useSeasonalComparisonQuery → reports endpoints
- usePromotionsQuery → getPromotions; useServiceDefinitionsQuery/useServiceItemsQuery/
  useServiceBookingsQuery → services endpoints; usePosUsersQuery → getPosUsers
- useHrEmployeesQuery/useHrLeaveTypesQuery/useHrLeaveRequestsQuery/useHrPayrollRunsQuery/
  useHrJobPostsQuery → HR endpoints
- useFinancialAccountsQuery/useFinancialJournalsQuery/useFinancialJournalEntriesQuery/
  useFinancialInvoicesQuery/useFinancialPaymentsQuery/useFinancialTaxRatesQuery/
  useFinancialPayoutsQuery → financials endpoints
- useSupplyWarehousesQuery/useSupplyStockQuery/useSupplyTransfersQuery/
  useSupplyPurchaseOrdersQuery/useSupplyBomsQuery/useSupplyManufacturingOrdersQuery → supply endpoints
- useCrmContactsQuery/useCrmLeadsQuery/useCrmOpportunitiesQuery/useCrmTasksQuery/
  useCrmTicketsQuery/useCrmKnowledgeArticlesQuery → CRM endpoints
- useStorefrontPagesQuery/useStorefrontBlogPostsQuery/useStorefrontBlogCategoriesQuery/
  useStorefrontCartsQuery/useStorefrontOrdersQuery → storefront admin endpoints
- useAIPredictionsQuery/useAIPriceRulesQuery/useAIAutomationRulesQuery/useAIAutomationLogsQuery → AI endpoints
- useProjectMetaQuery/useProjectItemsQuery/useProjectLinksQuery → project meta/items/links endpoints
- useTenantBillingQuery → getTenantBilling; useFeedbackListQuery → getFeedbackList;
  useAdminHealthQuery/useAdminHealthMetricsQuery/useAdminPerformanceQuery/
  useAdminReportsQuery/useAdminScheduledReportsQuery/useAdminSettingsQuery/
  useAdminSubscriptionsQuery → admin endpoints
- Mutations (useSave*/useDelete*/useUpdate*/useRecordPaymentMutation/useMarkInboxReadMutation/
  useDeleteInboxLeadMutation/useChangePasswordMutation/useUpdateSettingsMutation/
  useUpdateFeedbackStatusMutation/useCreateProjectLinkMutation/useDeleteProjectLinkMutation/
  useSaveProjectMetaMutation/useSaveProjectItemMutation/useDeleteProjectItemMutation/
  useSetPriceOverrideMutation/useDeletePriceOverrideMutation/useCashDeskPayments) →
  corresponding save*/delete*/mutation endpoints; consumers are the panels in §c.

`usePosQueries.ts` — 11 exports: `posKeys`; `usePosDashboard` → posGetDashboard (2 files);
`usePosProducts` → posGetProducts; `usePosOrders` → posGetOrders; `usePosActiveShift` → posGetActiveShift;
`useOpenShiftMutation`/`useCloseShiftMutation` → posOpenShift/posCloseShift;
`useEnrichedOrders`; `usePosTables` → getPosTables; `useCreateTableMutation`;
`useUpdateTableStatusMutation`; `useUpdateKitchenStatusMutation` → POS views
(`app/src/components/pos/views/*`).

`useSseOrders.ts` — `useSseOrders` → GET /api/stream/orders (SSE) → 3 files.
`useSseInbox.ts` — `useSseInbox` → inbox SSE stream → 2 files.
`useAdminData.ts` — 0 hooks; 11 type exports
(Camp, Product, Room, Order, RatePlan, Plan, TenantSettings, Meal, Category, MealCategory, MealSchedule).

---

## g. Tables — `backend/migrations/` baseline

27 current files (0001_core…0014_seed + 0100…0113) + 99 legacy files.
119 distinct non-underscore tables in current migrations
(133 CREATE TABLE names incl. `_guard*`/`*_new*` migration temp tables).
Purpose = owning migration file. tenant_id?/project_id? = presence in the CREATE TABLE
block of the first-creating file (ALTER-added columns not re-checked per table).
Last-touched = highest-numbered current migration mentioning the table
(CREATE or ALTER); legacy history not traced per table.

Core/tenants/projects (0001_core.sql): tenants (no tenant_id, no project_id);
admins (tenant); projects (tenant); project_items (tenant+project);
project_links (tenant+project); project_meta (project, no tenant);
project_tags (project, no tenant); tags (tenant); tenant_meta (tenant); audit_log (tenant);
languages (neither). Last-touched: 0001 except project_items/project_links/tags (0107 vicinity
via *_new guards — see below).

Orders (0002_orders.sql): orders (tenant); order_items (neither at create; project_id added
0102/0106 via order_items_new); order_discounts (tenant); order_state, order_state_lang (neither);
customers (tenant). Last-touched: orders 0113 (index); order_items 0106; order_discounts 0112.

Products/catalog (0003_products.sql): products (tenant); product_camps (neither);
plans_new (tenant); rate_plans_new (tenant); rooms_new (tenant); price_overrides (neither at create).
P2 guards: *_new_new tables (0107) add project_id to pos_products/rooms/rate_plans/meal/inventory
families. Last-touched: 0107/0111/0112.

POS (0004_pos.sql): pos_users (tenant); pos_products (tenant);
pos_transactions, pos_transaction_items, pos_customers (tenant);
pos_stores (neither at create; project_id 0101); pos_shifts, pos_tables,
pos_recipe_ingredients (tenant); pos_organizations (neither); tenant_org_mapping (tenant).
Last-touched: 0112 (pos_transactions_new/pos_customers_new/tenant defaults).

Menu (0005_menu.sql): categories, meals, meal_categories, meal_schedules (tenant);
meal_lang, meal_categories_lang, category_lang (neither). P2: 0108 adds project_id to meals.
Last-touched: 0108.

CRM/inbox/feedback (0006_crm.sql): contacts, crm_leads, leads, inbox, inbox_reads,
knowledge_articles, opportunities, tickets (tenant); time_entries (tenant);
ticket_comments (neither); feedback (tenant). Last-touched: 0006 (feedback also legacy 0097).

HR (0007_hr.sql): employees, leave_types, leave_requests, leave_balances,
payroll_runs, job_posts, applicants (tenant); payroll_lines (neither). Last-touched: 0007.

Supply (0008_supply.sql): warehouses, stock_quant, stock_transfers, purchase_orders,
boms, manufacturing_orders, inventory_adjustments (tenant); bom_lines, purchase_order_lines,
entry_lines? (no — financials), (neither for lines). Last-touched: 0008 (inventory_adjustments 0107).

Financials (0009_financials.sql): accounts, journals, journal_entries, invoices,
payments, tax_rates (tenant); invoice_lines, entry_lines, exchange_rates (neither).
payment_records (tenant, 0110). Last-touched: 0110.

Storefront (0010_storefront.sql): pages, blog_posts, blog_categories, storefront_orders,
carts (tenant); cart_items, storefront_order_items (neither). Last-touched: 0010 (carts 0103 project_id).

Services (0011_services.sql): service_definitions, service_bookings, service_items,
service_availability, service_reviews (tenant); service_items also project_id.
promotions (tenant). Last-touched: 0011.

AI (0012_ai.sql): predictions, price_rules, automation_rules, automation_logs (tenant).
Last-touched: 0012.

Marketplace (0013_marketplace.sql): marketplace_payments, marketplace_payouts,
marketplace_reviews (tenant); marketplace_reviews also project_id;
marketplace_project_categories (project, no tenant); marketplace_categories,
platform_settings, subscription_plans, tenant_subscriptions (tenant_subscriptions: tenant).
Last-touched: 0013.

Seed (0014_seed.sql): no tables (seed rows).

Project-id rollout (0100–0113): 0100 order/project nullable columns; 0101 pos_stores.project_id;
0102 order_items.project_id nullable; 0103 carts.project_id; 0104 default projects provision;
0105 order_items backfill; 0106 enforce NOT NULL order_items; 0107 enforce NOT NULL other tables
(*_new tables with project_id); 0108 meals.project_id; 0110 payment_records create;
0111 project SET NULL fix; 0112 drop pos tenant defaults; 0113 orders customer index.

Legacy: 99 files (0001_init…0099_normalize_marketplace_payouts_ids) — full CREATE/ALTER
history superseded by the 0001–0014 baseline; not traced per table in this pass.

---

## h. Scheduled / cron

- `backend/wrangler.toml`: no `triggers` / `cron` / `scheduled` / queue bindings
  (bindings: DB D1, KV_CACHE, RATE_LIMIT_KV, MEDIA_BUCKET R2, BROADCASTER Durable Object).
- `grep scheduled\( backend/src/`: no matches (no Worker scheduled handler).
- `grep queue backend/src/*.js backend/src/api/*.js`: no queue bindings us
ed.
- `waitUntil`: only `backend/src/durable/broadcaster.js:35,314,319-320`
  (DO `state.ctx.waitUntil(keepAlive)` for the SSE keep-alive loop) and a code comment in
  `backend/src/api/orders.js:83` (notes the handler has no `ctx.waitUntil`).
- In-memory scheduling only: `backend/src/api/admin-reports.js:84,303-323`
  (`scheduledReports` Map with create/list/delete via /api/admin/reports/scheduled —
  process-local, not a cron).
- `scheduled_date` in `backend/src/api/services.js` is a booking date column, not a scheduler.

---

*End of Pass 1 surface map. No findings, no opinions.*
