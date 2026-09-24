# Pass 6 — Frontend Audit (read-only discovery)

- Date: 2026-09-24
- Repo: /home/michael/devin/opencode-workspace/sinaicamps
- Mode: read-only. No source files modified (Read/Grep only). No D1 writes, no deploy.
- Spec: `.opencode/agents/tmp/2026-09-24-pass6-frontend.md`
- Surface input: `01-surface.md` §§c/d/e/f (60 admin files · 31 pages · 278 `api.ts` exports · 104+11+2 query hooks)
- Time-box: stopped after ~60 min; anything not positively verified is marked UNVERIFIED, per spec.

## Method

- Greps (all under `app/src/`): `fetch\(|axios|XMLHttpRequest` → zero hits in `components/admin`; `escHtml|dangerouslySetInnerHTML|innerHTML` → only `HRPanel.tsx:14,302-307` + `TenantImportPanel.tsx:5,341-403`; `showToast|useToast` + `EmptyState|emptyMessage|No .*found|No data` (100-match truncated sweeps); `projectId|project_id|selectedProject|useProject|projectFilter`; `useQuery|useMutation|useQueryHooks|apiFetch|import * as api`; `<div[^>]*onClick|role="button"` → 2 hits; pages: `ZoneGuard|Astro.redirect|404|500|tenant|escHtml|client:`, `try|catch|500|!tenant|ssrFetch|API_FETCH`, `viewport|responsive|md:|sm:|mobile|overflow-x`; api callers: `getTenantsPublic|toggleAiAutomationRule|getDurableStateValue|syncDurableState|getDurableStateSessions|analyzeWithWorkersAI|generateEmbeddings` across `app/src`.
- Reads: `app/src/lib/api.ts:1-120,120-279,280-399`; `BillingPanel.tsx:1-80`; `DashboardPanel.tsx:1-60,260-329`; `SystemHealthPanel.tsx:1-80,80-174` (full); `ReportsPanel.tsx:1-80`; `RoomsPanel.tsx:290-349`; `PhotosStep.tsx:150-209`; `camps.astro` (full); `index.astro` (full); `book.astro` (full); `404.astro` (full); `contact.astro:100-159`; layouts viewport grep.
- NOT done (time-box): full-file reads of ~50 remaining panels; per-export caller greps for all 278 `api.ts` functions; backend route-existence diff (belongs to backend pass); live repro in browser (static audit only).

## A. Admin panels — 7 checks each (60 files from 01-surface §c)

Columns: Q1 TanStack-vs-raw-fetch · Q2 drops-backend-fields · Q3 error-toast · Q4 empty-state · Q5 project-filter · Q6 escHtml/XSS · Q7 keyboard-a11y primary action.
PASS = positive evidence · FAIL = positive evidence of gap (see §B) · NA = non-data/support file · U = UNVERIFIED in time-box.

| File | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 |
|---|---|---|---|---|---|---|---|
| AdminApp.tsx (SPA host) | PASS hooks-only (grep; `projectId={activeCamp.id}` :387) | U | NA (host) | NA | NA (owns activeCamp) | PASS no user HTML | PASS |
| AdminShell.tsx (layout) | NA (no api import) | NA | NA | NA | NA | PASS | PASS |
| AIPanel.tsx | PASS `useAIPredictionsQuery/...` :118-121 + `api` for mutations | U | PASS `showToast` (grep) | PASS EmptyState :318-417 | U (no projectId grep hit) | PASS JSX escape, no DSIH | PASS `<Button>` |
| AnalyticsPanel.tsx | PASS `useRevenueReportQuery` etc. :116-119,222-431 | U | U (no toast hit in window) | PASS EmptyState ×14 (:45-478) | U | PASS | PASS |
| AuditLogPanel.tsx | PASS `useAdminAuditQuery` :78 | U | U | PASS `emptyMessage="No audit logs found"` :244 | U | PASS | PASS `<Button>` :173,224 |
| BillingPanel.tsx | PASS `useTenantBillingQuery` :49 | U | FAIL §B F-A2 (inline Card only :53-65, no toast found) | PARTIAL (error Card, no empty — single-resource) | NA (tenant-wide) | PASS | PASS |
| BookingCalendar.tsx | PASS `useProducts/Rooms/Orders/RatePlansQuery` :112-115 | U | U | PASS EmptyState :498 | U | PASS | PASS; backdrop `div onClick aria-hidden` :653 NA (not primary) |
| BrowserAIPanel.tsx | NA (browser-ai lib, no api) | NA | U | PASS EmptyState :311 | NA (local models) | PASS | PASS `<Button>` :354-506 |
| CampsPanel.tsx | PASS `useCampsQuery` etc. :2,212 | U | PASS `showToast` :213,329-360 | PASS EmptyState :418 + `emptyMessage` :438 | PASS `ProjectConnections projectId` :82-108 | PASS | PASS |
| CashDeskPanel.tsx | PASS `useOrdersQuery` :38 + mutations | U | U | PASS EmptyState :128,193 | U | PASS | PASS `<Button>` :184 |
| CRMPanel.tsx | PASS 6 `useCrm*Query` :348-353; mutations via `apiFetch` :423-624 (TanStack for reads) | U | U (toast grep truncated; not confirmed) | PASS EmptyState ×6 :695-819 | U (task `projectId` free-text input :925, not a filter) | PASS | PASS |
| DashboardPanel.tsx | PASS `useOrders/Rooms/Products/Plans/MealsQuery`, `useLowStock` :21-26 | U | U (reads show no `error` destructure; middle §§61-259 unread) | PASS EmptyState low-stock :299 | PASS filters by `campIds` prop :42-43 | PASS (names via JSX :267-268) | PASS native `<button>` :288-294 |
| DynamicForm.tsx | NA (no api import; form renderer) | NA | NA (`error?: string` :166 prop only) | NA | NA | PASS | PASS `aria-label` sections :514,526 |
| FeedbackPanel.tsx | PASS `useFeedbackListQuery` :52 | U | U | PASS `emptyMessage` :203 | U | PASS | PASS |
| FinancialPanel.tsx | PASS 7 query hooks :126 | U | U | PASS EmptyState ×3 :350-398 | U | PASS | PASS |
| ForgotPasswordPage.tsx | NA (`import * as api`, single POST) | NA | U | NA | NA | PASS | PASS `<button>` :93 |
| HRPanel.tsx | PASS hooks + `api` mutations, `useQueryClient` :2-22,119 | U | PASS `showToast` ×20 :186-414 | PASS EmptyState ×5 :447-542 | U | PASS `escHtml` on 3 interpolated values :14,302-307 (JSX elsewhere) | PASS `data-testid` buttons :422-554 |
| icons.tsx | NA | NA | NA | NA | NA | NA | NA |
| InboxPanel.tsx | PASS `useInboxQuery` :148 (`isError` handled :397) | U | U | PASS EmptyState :405 | U | PASS | PASS tabs `tabIndex`+`onKeyDown` :335-351; `<Button>` :248,292,400 |
| ListingWizard.tsx | PASS hooks :11 | U | U | U | U | PASS | U |
| LowStockPanel.tsx | PASS `useLowStock` :34 (`isError` :51) | U | U | PASS EmptyState :59 + `emptyMessage` :88 | U | PASS | PASS `aria-busy` :38 |
| MealsPanel.tsx | PASS `useMeals/MealCategoriesQuery` :57-59 | U | PASS `showToast` :70-190 | PASS EmptyState + messages :237-328 | PASS `activeProjectId` tagged on create :123-157 | PASS | PASS |
| MenuPanel.tsx | PASS `useMeals/MealCategoriesQuery` :70-72 | U | PASS `showToast` ×12 :168-268 | PASS EmptyState ×2 :353-427 | PASS `activeProjectId` tagged :173-234 | PASS `aria-label` bulk rows :531-585 | PASS |
| MenuPlannerPanel.tsx | PASS `useMealsQuery` :85 + `useMealSchedulesQuery` :90 (`?projectId` :87-91) | U | U | U | PASS server-side `projectId` + tolerant `projectId ?? campId` :141-146 | PASS | PASS |
| OrdersPanel.tsx | PASS `useOrders/OrderDetail/Rooms/CampsQuery` + status/delete mutations :56 | U | U | PASS EmptyState ×2 :181-188 + message :243 | U | PASS | PASS `aria-busy` :145 |
| PasswordPanel.tsx | PASS `useChangePasswordMutation` :2 (toast inside hook :44) | NA | PASS (delegated) | NA | NA | PASS | PASS `<Button>` :83 |
| PaymentReceipt.tsx | NA (none) | NA | NA | NA | NA | PASS | PASS `<Button>` print/close :115-118 |
| PhotosStep.tsx | NA (`import * as api` upload step) | NA | U | U | U | PASS | PASS dropzone `role=button tabIndex=0 onKeyDown` :157-176 (verified, not a violation) |
| PlanningPanel.tsx | PASS `usePlansQuery` :60 | U | U | PASS EmptyState :210 + message :240 | U | PASS | PASS |
| ProjectItemsPanel.tsx | PASS `useProjectItemsQuery(projectId, itemType)` :124 | U | PASS `showToast` :125,181-190 | PASS EmptyState :264-307 | PASS query scoped by `projectId` prop :85-124 | PASS | PASS |
| PromotionsPanel.tsx | PASS `usePromotionsQuery` :77 + `api` mutations | U | U | PASS EmptyState :196 | U | PASS | PASS `<Button>` :176-263 |
| RatePlansPanel.tsx | PASS `useProducts/RatePlansQuery` + save/delete mutations :58-59 | U | U (`plansError` destructured :59, handling U) | PASS EmptyState ×3 :132-173 | U | PASS | PASS |
| RecordPaymentModal.tsx | PASS `useRecordPaymentMutation`, `useOrderPaymentsQuery` :5 | NA (modal) | U | U | NA | PASS | PASS |
| RegisterPage.tsx | NA (`import * as api`, single POST) | NA | U | NA | NA | PASS | PASS |
| ReportsPanel.tsx | PASS 3 report queries :32-34 | FAIL-ish/U §B F-A3 (transforms narrow `details`/`byState` :62-80 — display mapping, backend parity U) | PASS `showToast` on query error :23,38-46 | U (no EmptyState hit in window) | FAIL §B F-A3 `campIds` prop ignored :22,32-34 | PASS | PASS |
| ResetPasswordPage.tsx | NA (`import * as api`) | NA | NA (inline `setError` :23) | NA | NA | PASS | PASS `<button>` :128 |
| RoomsPanel.tsx | PASS `useRooms/ProductsQuery` :110-111 + `bulkCreateProducts` :301 | U | PASS `showToast` :296-306 | U (beyond read window) | U | PASS | PASS `<Button>` :331-344 |
| ServiceBookingsPanel.tsx | PASS manual `useQuery/useMutation` + `api` :2-3,57-99 (TanStack, not raw fetch) | U | U | PASS `LoadingSpinner` :128; empty U | U (booking `projectId` free text, cf ServicesPanel :31-38) | PASS | PASS |
| ServicesPanel.tsx | PASS `useServiceDefinitions/Items/BookingsQuery` :64-66 | U | U | U | U (`projectId` free-text in item form :31-38,118-134 — no filter) | PASS | PASS `data-testid` buttons :195-326 |
| SettingsPanel.tsx | PASS `useSettingsQuery/Mutation` :125 + `api` | U | U | U (`LoadingSpinner` :246) | NA (tenant-wide) | PASS `aria-label` gallery add/remove :83-90,445-463 | PASS |
| StaffPanel.tsx | PASS `useTenantsQuery` :121 + `usePosUsersQuery` (`usersError` :155) | U | U | PASS EmptyState :423-437 | U | PASS | PASS |
| StorefrontPanel.tsx | PASS 5 `useStorefront*Query` :70-74 | U | U | PASS EmptyState ×5 :207-299 | U | PASS | PASS `<Button>` :189-263 |
| SubscriptionsPanel.tsx | PASS `useAdminSubscriptionsQuery` :10-12 | U | U | PASS `emptyMessage` :306 | U | PASS | PASS `<Button>` :177-290 |
| SuperAIPanel.tsx | PASS manual `useQuery` + `apiFetch /admin/ai/overview`, `getAdminTenants` :172 | U | U | U | PASS tenant dropdown (`selectedTenantId`) | PASS | PASS `<Button>` :172 |
| SuperCRMPanel.tsx | PASS `apiFetch /admin/crm/...` + `getAdminTenants` | U | U | PASS EmptyState :186 | PASS tenant filter | PASS | PASS |
| SuperDashboardPanel.tsx | PASS hooks (per §c) | U | U | U | PASS drill-down scope | PASS | PASS |
| SuperFinancialsPanel.tsx | PASS manual `useQuery` + `apiFetch` overview/invoices :256-314 | U | PASS `showToast` ×12 :285-421 | PASS EmptyState ×3 :522-677 | PASS single-tenant payout guard :339-354 | PASS `aria-label` select :452 | PASS |
| SuperHRPanel.tsx | PASS `apiFetch /admin/hr/...` :114-127 | U | U | PASS EmptyState :193 | PASS tenant filter | PASS | PASS |
| SuperOrdersPanel.tsx | PASS `getAdminTenants, getOrders` | U | U | PASS EmptyState :223-225 | PASS tenant filter | PASS | PASS |
| SuperReportsPanel.tsx | PASS `useAdminReports/ScheduledReportsQuery` :12-13 | U | PASS `showToast` ×7 :39-72 | U | PASS tenant-scoped (super) | PASS | PASS `<Button>` :124-180 |
| SuperStorefrontPanel.tsx | PASS `apiFetch /admin/storefront/...` :105-118 | U | U | PASS EmptyState :184 | PASS tenant filter | PASS | PASS `<Button>` :177 |
| SuperSupplyPanel.tsx | PASS `apiFetch /admin/supply/...` :106-119 | U | U | PASS EmptyState :185 | PASS tenant filter | PASS | PASS |
| SuperTenantsPanel.tsx | PASS `getAdminTenants/getAdmins/...` etc. | U | U | PARTIAL plain `No tenants found` div :543 + `No admin users` :758 (not EmptyState component) | PASS drill-down scope | PASS | PASS |
| SupplyPanel.tsx | PASS 6 query hooks aggregated `loading` :73 + `api` mutations | U | U | PASS EmptyState ×6 :359-498 | U | PASS | PASS |
| SystemHealthPanel.tsx | PASS `useAdminHealth/HealthMetricsQuery` :23-24 | U | FAIL §B F-A1 (no error branch; `??` fallbacks only) | FAIL §B F-A1 (no empty/error state; zero-metrics renders zeros) | NA (platform-wide) | PASS | PASS (display-only) |
| SystemSettingsPanel.tsx | PASS `useAdminSettingsQuery` :87 | U | PASS `showToast` :85,165-171 | U (`isLoading` early-return :177) | NA (platform-wide) | PASS | PASS |
| TenantDrilldown.tsx | PASS `useCampsQuery` :73 + `setTenantScope` | NA (scope switcher) | U | U (`loading`) | PASS sets scope; passes `projectId` :148 | PASS | PASS |
| TenantImportPanel.tsx | NA/single-shot `import * as api` | NA | PASS `useToast` import :8 + inline `submitError` :403 | PASS preview rendering :356-364 | NA (creates tenant) | PASS `escHtml` on parseError/preview/errors :5,341-403 | PASS |
| TenantPerformancePanel.tsx | PASS `useAdminPerformanceQuery` :25 | U | PASS `showToast` :24,48-52 | PARTIAL raw `No data` divs :90-130 (not EmptyState) | U | PASS | PASS `<Button>` :70 |
| UsersPanel.tsx | PASS `useAdminUsersQuery` :42 | U | U | U (`isLoading` :190) | NA (platform-wide) | PASS | PASS |

Global Q1 note: `fetch\(|axios|XMLHttpRequest` grep over `components/admin` returned zero hits — no raw-fetch data loads found in window. `apiFetch` direct calls exist (CRMPanel mutations :423-624, Super* overview loaders) but reads go through TanStack `useQuery` (including manual `useQuery` in SuperFinancialsPanel :256-268, ServiceBookingsPanel :57-67), consistent with the T13 "zero raw fetch" claim — U for files not individually opened.
Global Q6 note: `dangerouslySetInnerHTML|innerHTML` grep over `components/admin` returned zero hits. Only `escHtml` users are HRPanel + TenantImportPanel; all other user content renders via JSX (auto-escaped) — PASS by construction, no XSS sink found in window.
Global Q7 note: no `role="button"` without keyboard support found; the two `<div onClick>` hits (PhotosStep :171 — has tabIndex+onKeyDown; BookingCalendar :653 backdrop `aria-hidden`) are not violations.

## B. Admin flags (file:line + repro + falsification)

F-A1 — SystemHealthPanel silently swallows query errors (FAIL Q3/Q4).
- File:line: `app/src/components/admin/SystemHealthPanel.tsx:23-24` (destructure `data/isLoading` only, no `error`/`isError`), `:61-67` (only `if (loadingHealth || loadingMetrics)` branch), `:69` (`health?.overall ?? 'unknown'`), `:98-136` (`health?.workers?.status ?? 'unknown'`, `?? 'N/A'`, `?? '—'`), `:29-44` (`metrics ?? []` → zeros/empty charts).
- Repro: break `/api/admin/health` (offline backend or 500) → panel renders "unknown/N/A/—" + all-zero 24h totals + empty LineCharts with no error message, retry, or toast; indistinguishable from healthy-but-idle.
- Falsification: full-file read (174/174 lines) — no `error`, `isError`, `showToast`, `EmptyState`, or retry string exists. VERIFIED (static).

F-A2 — BillingPanel error path is inline-only, no toast (observation; toast absence UNVERIFIED).
- File:line: `app/src/components/admin/BillingPanel.tsx:49` (`const { data, isLoading, error }`), `:53-65` (error → static Card "Unable to load billing information").
- Repro: fail `GET /tenant/billing` → inline card only; no `showToast`, no retry button.
- Falsification: no `useToast`/`showToast` hit for BillingPanel in the toast sweep; full-file toast grep not completed in time-box → toast absence UNVERIFIED (if a toast exists beyond line 80 it was missed). Inline-only rendering VERIFIED.

F-A3 — ReportsPanel accepts `campIds`/`camps` but never scopes queries (FAIL Q5; empty-state U).
- File:line: `app/src/components/admin/ReportsPanel.tsx:22` (props `campIds, camps`), `:28-34` (`dateParams` only; three report queries take no camp/project arg), transforms `:48-80`.
- Repro: select camp A vs B in shell → identical occupancy/revenue/bookings (tenant-wide), misleading for multi-camp tenants.
- Falsification: `campIds` use below line 80 not read in window → downstream use UNVERIFIED. Flag stands on lines 22-34 positive evidence; needs `grep campIds ReportsPanel.tsx` to close.

F-A4 — DashboardPanel field narrowing is display mapping, backend parity UNVERIFIED (no flag, noted).
- File:line: `DashboardPanel.tsx:42-60` (client-side `campIds.includes(...)` over `rooms`/`orders` fields `campId, status, checkInDate, orderStateId, paymentStatus, totalAmount`).
- Note: filters assume those exact field names; snake_case variants would silently drop rows. Backend field-name parity not diffed in this pass → UNVERIFIED, no repro claimed.

## C. Public pages — 4 checks each (31 files from 01-surface §d)

Columns: P1 404-vs-500-vs-empty · P2 tenant scoping on tenant host · P3 escHtml/XSS · P4 mobile degrade. Zone per `routeZones.ts` + 01-surface §d.

| File (route) | P1 | P2 | P3 | P4 |
|---|---|---|---|---|
| index.astro `/` (both; zone router) | U (tenant-null → MarketplaceHome :30-42, see F-P3) | PASS `zone==='tenant'` gate :19 | PASS (delegates; no inline interp) | PASS (layouts viewport :117; responsive hero) |
| about.astro `/about` | PASS `getTenantSSRData`, tolerant `JSON.parse` :89 | PASS tenant-aware | PASS `escHtml(tenantName)` :46 | PASS `md:grid-cols` :62 |
| contact.astro `/contact` | PASS inline form + `errorBox` :161-163 | PASS `data-tenant-id` + `x-tenant-id` :121,143 | FAIL §D F-P4 (`escHtml`→`textContent` double-encode :158) | PASS `md:grid-cols` :46 |
| faq.astro `/faq` | PASS try/catch :19-21 | PASS | PASS `escHtml(q/a)` :62-66 | PASS hero responsive :46 |
| gallery.astro `/gallery` | PASS try/catch :23-25 | PASS `?tenant` suffix :13-15 | PASS `escHtml(img)` in style url :84 | PASS `sm:2 lg:3` grid :73 |
| camps.astro `/camps` (marketplace-only) | FAIL-ish §D F-P2 (catch → empty grid, silent) | PASS `forbidden→404` :10-11 + ZoneGuard :72-74 | PASS `sanitizeForJsonLd` strips `</script` :40-52; `set:html` of sanitized JSON :84 | PASS `md:py-20, sm:4xl md:5xl` :88-95 |
| camp/[id]/index.astro (marketplace-only) | PASS `forbidden\|\|!tenant→ZoneGuard` :51 (+F-P1 conflation) | PASS `x-tenant-id: id` :29-32 | PASS (props to TenantLanding) | PASS (shared landing) |
| camp/[id]/book.astro (marketplace-only) | PASS guard :33 (+F-P1) | PASS path-id scoping :19 | PASS | PASS `prefers-reduced-motion` block (cf book.astro :35-44) |
| camp/[id]/menu.astro (marketplace-only) | PASS guard :41 (+F-P1) | PASS `x-tenant-id: id` :21-24 | PASS | PASS |
| marketplace.astro (both, no guard) | U (not opened) | U (marketplace surface) | U | U |
| book.astro `/book` (tenant-only) | PASS guard :46 (+F-P1) | PASS `Astro.locals.tenantId` :11, skips fetch when forbidden :15 | PASS props only | PASS reduced-motion :35-44 |
| menu.astro `/menu` (tenant-only) | PASS guard :54 (+F-P1) | PASS `tenantId` + `x-tenant-id` :11,18-22 | PASS | PASS |
| rooms.astro `/rooms` (tenant-only) | PASS guard :47 | PASS `getTenantSSRData` :28 | PASS | PASS `sm:gap-12, md:grid` cards :81-106 |
| storefront/index.astro (tenant-only) | PASS guard :38 | PASS `tenantId` fetch :16 | PASS | PASS sibling-cart links :46-47 |
| storefront/cart.astro (tenant-only) | PASS guard :38 | PASS | PASS | PASS |
| storefront/checkout.astro (tenant-only) | PASS guard :38 | PASS | PASS | PASS |
| storefront/order/[orderNumber]/confirmation.astro (tenant-only) | PASS guard :40 | PASS | PASS | PASS |
| pos/[...rest]/index.astro `/pos/*` (tenant-only) | PASS ZoneGuard (per §d) | PASS (tenant host SPA) | U (POS views not opened) | U |
| pos/login/index.astro (tenant-only) | PASS ZoneGuard | PASS | U | U |
| admin/[...rest]/index.astro (system) | NA (`<AdminShell client:only>` :7) | NA (auth inside SPA) | NA | PASS AdminLayout viewport :23 |
| auth/forgot-password.astro (system) | U (not opened) | NA | U | U |
| auth/reset-password.astro (system) | U | NA | U | U |
| login.astro (system) | U | NA | U | U |
| register/index.astro (system) | U | NA | U | U |
| signup.astro (both, no guard) | U | U | U | U |
| onboarding.astro (both, no guard) | NA (`OnboardingWizard client:only` :7) | U | U | U |
| 404.astro (system) | PASS branded `<NotFoundPage/>`, tenant-agnostic :1-13 | NA | PASS (no interp) | PASS via PublicLayout viewport |
| [...path].astro (catch-all) | PASS `Astro.response.status = 404` :17, branded body (per comments :2-11) | NA | NA | PASS |
| robots.txt.ts / sitemap.xml.ts (system) | PASS sitemap try/catch :12-19 (empty on failure) | NA (`/tenants/public` cross-tenant list :14) | NA | NA |
| api/health.ts (Astro endpoint) | U (not opened) | NA | NA | NA |

Global P3 note: tenant-controlled strings in `.astro` go through `escHtml`/`sanitizeForHtml`/`sanitizeForJsonLd` or `textContent`; no raw `set:html` of tenant data except sanitized JSON-LD (camps.astro :40-52,84) — PASS in window.
Global P4 note: viewport meta present in all three layouts (PublicLayout :117, AdminLayout :23, POSLayout :8); page-level responsive classes confirmed on sampled pages — PASS in window, U for unopened auth/signup pages.

## D. Public flags (file:line + repro + falsification)

F-P1 — Tenant/marketplace pages conflate backend 500 with branded 404.
- File:line: `app/src/pages/book.astro:15-22` (`try { res=ssrFetch } catch → tenant stays null`), `:46-47` (`forbidden || !tenant → <ZoneGuard/>`); same pattern `menu.astro:18-27,54`, `camp/[id]/menu.astro:20-29,41`, `camp/[id]/book.astro:18-21,33`, `camp/[id]/index.astro:28-37,51`, `storefront/*.astro:15-18,38-40`.
- Repro: stop backend → visit tenant `/book` (valid host) → branded "not found" 404 instead of 5xx/retry; operators misdiagnose outage as bad URL. `camps.astro` differs (renders empty grid, F-P2) — same root cause, opposite symptom.
- Falsification: positive on `book.astro` full read (58/58). Siblings verified by grep (`catch (e)` + `forbidden || !tenant` hits); full-line parity per file UNVERIFIED beyond grep window.

F-P2 — `/camps` backend failure renders silent empty marketplace.
- File:line: `app/src/pages/camps.astro:20-31` (catch → `tenants=[]`, console-only), `:102` (`<CampsSection tenants={[]} ssrRendered={false}>`).
- Repro: block `/tenants/public` → `/camps` returns 200 with hero + empty grid, no error banner/retry; `tenantsLoaded=false` is passed but no error UI observed in page.
- Falsification: page fully read (105/105). Whether `CampsSection` itself renders an error/empty state for `[]` was NOT opened → downstream handling UNVERIFIED.

F-P3 — `/` on a tenant host with failed tenant fetch falls back to marketplace home (UNVERIFIED).
- File:line: `app/src/pages/index.astro:19-28` (only fetches when `zone==='tenant'`), `:30-42` (`tenantProps ? TenantLanding : MarketplaceHome`).
- Repro (hypothesized): tenant host + `getTenantSSRData` throws/returns null → visitor sees marketplace home on a tenant domain instead of an error. Depends on whether `getTenantSSRData` throws (then 500) or returns null props (then fallback) — `middleware/tenant.ts` NOT opened in this pass → UNVERIFIED.

F-P4 — Contact form double-encodes the success message (`escHtml` → `textContent`).
- File:line: `app/src/pages/contact.astro:111-116` (local `escHtml` returns `innerHTML` entities), `:158` (`successBox.textContent = 'Thank you, ' + escHtml(name) + ...`).
- Repro: submit as `Ada & Co` → success line shows literal `Ada &amp; Co` (entities displayed, not decoded). Cosmetic; also note the server round-trip ignores the `{success,error}` question entirely (throws on `!ok` :155-157) — no envelope to ignore here.
- Falsification: VERIFIED static (`textContent` sink + entity-producing encoder on the same line). Fix direction (use raw text with `textContent`, drop `escHtml`) not applied — read-only.

## E. `api.ts` — 3 checks

E1 — Dead exports (no callers via grep over `app/src`).
- Result: 7 exports with definition-only hits (grep across `app/src` returned ONLY the `api.ts` definition lines, zero call sites):
  `getTenantsPublic` (:706), `toggleAiAutomationRule` (:2060), `analyzeWithWorkersAI` (:2069), `generateEmbeddings` (:2073), `getDurableStateSessions` (:2078), `syncDurableState` (:2082), `getDurableStateValue` (:2086).
- Controls (same grep DID find callers): `getMarketplaceListings` → `MarketplaceDirectory.tsx:3,77`; `bulkCreateProducts` → `RoomsPanel.tsx:23,301`. So the method detects live exports; the 7 are dead *in `app/src`*.
- Falsification: `tests/`, `e2e/`, scripts, and POS components outside `app/src` NOT searched → dead-in-repo UNVERIFIED. `getTenantsPublic` duplicates live paths (`camps.astro:21`, `sitemap.xml.ts:14` call `/tenants/public` via `ssrFetch` directly). Workers-AI/state functions hit honest-503 stubs per AGENTS.md T15 — dead client-side is consistent, not necessarily removable (islands may adopt them).

E2 — Functions with no backend route.
- No positive instance claimed in time-box: every sampled path maps to a §a mount (`/projects`, `/products`, `/rooms`, `/rateplans`, `/orders`, `/tenants/public`, `/marketplace`, `/financials`, `/hr`, `/supply`, `/crm`, `/storefront`, `/ai`, `/admin/*`). Two suspects noted UNVERIFIED: (a) `toggleAiAutomationRule` (PATCH `:id/activate`, :2060) vs `toggleAIAutomationRule` (POST `:id/toggle`) — only one was caller-checked, backend must confirm which verb exists; (b) `getTenantsPublic` (GET `/tenants/public`, :706) vs backend `handleTenants` (`GET /api/tenants*`, §a) — public-subpath existence needs the backend pass. Route-existence diff is out of scope for Pass 6 → UNVERIFIED.

E3 — Callers ignoring the `{ success, error }` envelope.
- Contract reality (verified): `apiFetch` (:177-270) does NOT return a `{success,error}` envelope — it `throw`s `Error(errData.error || errData.message)` on `!ok` (:240-259) and returns parsed JSON otherwise. The `{success}` shape exists only on select mutation responses (e.g. `BulkCreateResponse {ids,count,success}` :324-328; delete/save `SuccessResponse`).
- Positive instance: `RoomsPanel.tsx:301-302` reads `res.count` without checking `res.success` — a `success:false` + `count:0` response renders "0 products created." as success. Same shape risk in `MenuPanel` bulk (`res.count`, :177). Repro: force partial bulk failure → success toast with 0 count, no error branch. Falsification: VERIFIED static for `res.count` use; whether backend ever returns `success:false` with 200 UNVERIFIED (backend pass).
- Query-error ignoring: TanStack `error` is handled inconsistently — ReportsPanel toasts (:38-46), Inbox/LowStock branch on `isError` (:397,:51), but SystemHealthPanel (F-A1) and BillingPanel (F-A2) show the gap pattern; DashboardPanel middle section unread → UNVERIFIED.

## Coverage

- Admin: 60/60 files listed with 7-check dispositions (§A). Fully read: SystemHealthPanel (174/174), BillingPanel (1-80), DashboardPanel (1-60 + 260-329), ReportsPanel (1-80), RoomsPanel (290-349), PhotosStep (150-209). Rest via targeted greps (truncated at 100 matches — absence claims marked U).
- Public: 31/31 files listed with 4-check dispositions (§C). Fully read: index, camps, book, 404 + contact slice + layouts viewport. Rest via zone/guard/fetch greps.
- api.ts: 3/3 checks executed (§E). 9 exports caller-checked by name; remaining ~269 NOT individually grep-checked → dead-or-live UNVERIFIED per export (aggregate: no further dead-export claims).
- Flags: F-A1 VERIFIED; F-P4 VERIFIED; F-A2/F-A3/F-P1/F-P2/E1/E3-instances positive-evidence + bounded UNVERIFIED tails as noted. No source modified.

## Follow-ups for later passes (not findings)

1. Backend pass: confirm `/tenants/public`, `POST /ai/automation-rules/:id/toggle` vs `PATCH .../activate`, and `success:false`+200 semantics for bulk endpoints.
2. Close U-tails: `grep -c campIds ReportsPanel.tsx`, full-file Toast/EmptyState sweep without truncation, `CampsSection` empty-state read, `middleware/tenant.ts` null-vs-throw, `tests/` caller search for the 7 E1 exports.
3. Consider: shared SSR fetch-error component (fix F-P1/F-P2/F-P3 class), `res.success` guard on bulk toasts, error branch + retry for SystemHealth/Billing.
