# AUDIT_FRONTEND_FINDINGS.md — Read-Only Frontend Code Quality Audit

**Repo**: SinaiCamps · **Scope**: `app/src` (Astro 5 + React 19 + TanStack Query + Tailwind v4)
**Date**: 2026-09-05 · **Mode**: READ-ONLY — no files modified
**Context read**: `AGENTS.md`, `AGENT_LOGBOOK.md`
**Verification commands**: `npx tsc --noEmit` (426 errors captured), ripgrep/grep corpus scans, file reads.

---

## 1. Component Inventory (`app/src/components/`, 108 files)

| Directory | Files | Components |
|---|---|---|
| `admin/` | 53 `.tsx` | AdminApp + 52 panels/hosts (AdminApp, AIPanel, AnalyticsPanel, AuditLogPanel, BillingPanel, BookingCalendar, CampsPanel, CRMPanel, DashboardPanel, DynamicForm, FinancialPanel, ForgotPasswordPage, HRPanel, InboxPanel, ListingWizard, LowStockPanel, MealsPanel, MenuPanel, MenuPlannerPanel, OrdersPanel, PasswordPanel, PhotosStep, PlanningPanel, ProjectItemsPanel, PromotionsPanel, RatePlansPanel, RegisterPage, ReportsPanel, ResetPasswordPage, RoomsPanel, ServiceBookingsPanel, ServicesPanel, SettingsPanel, StaffPanel, StorefrontPanel, SubscriptionsPanel, SuperAIPanel, SuperCRMPanel, SuperDashboardPanel, SuperFinancialsPanel, SuperHRPanel, SuperOrdersPanel, SuperReportsPanel, SuperStorefrontPanel, SuperSupplyPanel, SuperTenantsPanel, SupplyPanel, SystemHealthPanel, SystemSettingsPanel, TenantDrilldown, TenantPerformancePanel, UsersPanel, icons.tsx) |
| `pos/` | 12 (1 `.tsx` + 1 `.ts` + 10 views) | POSApp, types.ts, views/{CartPanel, DashboardView, KitchenView, LoginView, OrdersView, ProductsView, ReceiptModal, ShiftDashboard, ShiftOverlay, TableView} |
| `public/` | 13 (6 `.tsx` + 7 `.astro`) | CampBooking, MarketplaceDirectory, OnboardingWizard, ReservationSummary, SignupPage, TenantMenu, BookPage.astro, CampsSection.astro, MarketplaceHome.astro, MenuPage.astro, NotFoundPage.astro, TenantLanding.astro, ZoneGuard.astro |
| `ui/` | 26 (25 `.tsx` + 1 `.astro`) | Badge, BarChart, BulkActions, Button, Card, ChartCard, ConfirmDialog, DataTable, DateRangePicker, EmptyState, ErrorBoundary, ExportButton, FormModal, LoadinsSpinner→LoadingSpinner, MetricCard, Modal, PieChart, SafeImage.astro, Select, Skeleton, StatCard, StatusTag, Toast, icons.tsx, Input, LineChart |
| `shell/` | 4 `.tsx` | AppSidebar, AppTopbar, LoginForm, MobileBottomNav |
| `layout/`, `tables/`, `forms/`, `feedback/` | 0 | Directories exist in AGENTS.md structure but are empty in the tree — documented structure drifts from reality (layout/shell split was collapsed into `shell/`) |

### 1a. DEAD COMPONENTS — zero imports anywhere in `app/src` (flag as cleanup candidates)

These are exercised **only by their own test suites**; no production code imports them.

| Component | Path | Only references |
|---|---|---|
| **BarChart** ⛔ | `app/src/components/ui/BarChart.tsx` | `tests/unit/ui-misc-components.test.tsx` |
| **BulkActions** ⛔ | `app/src/components/ui/BulkActions.tsx` | `tests/unit/ui-misc-components.test.tsx` |
| **ChartCard** ⛔ | `app/src/components/ui/ChartCard.tsx` | `tests/unit/chart-card.test.tsx` |
| **DateRangePicker** ⛔ | `app/src/components/ui/DateRangePicker.tsx` | `tests/unit/ui-misc-components.test.tsx` (also has unlabeled inputs, §10) |
| **ExportButton** ⛔ | `app/src/components/ui/ExportButton.tsx` | `tests/unit/ui-misc-components.test.tsx` |
| **MetricCard** ⛔ | `app/src/components/ui/MetricCard.tsx` | `tests/unit/ui-misc-components.test.tsx` |
| **PieChart** ⛔ | `app/src/components/ui/PieChart.tsx` | `tests/unit/PieChart.test.tsx` |
| **useApiError** ⛔ (hook) | `app/src/hooks/useApiError.ts` | No production refs (known-dead per AGENT_LOGBOOK T5) |
| **useFilterState** ⛔ (hook) | `app/src/hooks/useFilterState.ts` | No production refs (only its own tests) |

**Not dead (verified)**: `SafeImage.astro` (used by TenantLanding, MarketplaceHome, CampsSection, rooms.astro), all 53 admin files (panels wired into `AdminApp.tsx`; `DynamicForm`/`PhotosStep`/`ListingWizard` used by `CampsPanel.tsx`; `TenantDrilldown` used by `SuperTenantsPanel.tsx`; `ForgotPasswordPage`/`RegisterPage`/`ResetPasswordPage` mounted by `pages/auth/*.astro` island scripts), and `useAdminData.ts` (types still imported by 10+ panels).

> The BarChart / PieChart / ChartCard / MetricCard set is particularly suspicious — the charting that *is* rendered in panels (AnalyticsPanel, DashboardPanel) uses hand-rolled SVG, not these components. 7 dead primitives + 2 dead hooks = **9 dead files** awaiting a cleanup pass.

---

## 2. Hydration & XSS Risks

### 2a. 8-digit hex `#RRGGBBAA` inline styles — ✅ CLEAN
Scanned every `.tsx`/`.astro` in `app/src` for `#[0-9a-fA-F]{8}` → **zero matches**. The historical React-18 hydration landmine (CampBooking.tsx `#2e7d3208`) is gone; `CampBooking.tsx:419/425` and the remaining inline colors use `rgba()` / solid hex.

**Informational (not a hydration bug)**: alpha-appended hex built by string concat exists in *non-React* Astro SSR/inline-script styles — these nodes are never React-hydrated so they are safe, but they perpetuate the discouraged pattern:
- `app/src/pages/camps.astro:89` — `linear-gradient(135deg, ${primaryColor}0D 0%, ${primaryColor}1E 100%)`
- `app/src/components/public/CampsSection.astro:285` — `${color}cc`; `:295` — `background-color:${color}1A`

### 2b. `dangerouslySetInnerHTML` / React `innerHTML` — ✅ CLEAN
**Zero** `dangerouslySetInnerHTML` and **zero** `innerHTML` inside React components (`.tsx`). The only `innerHTML` writes are the legacy public-page inline `<script>` blocks in `CampsSection.astro:248/263/267/301` (filters/skeletons) and `MarketplaceHome.astro:204` (template read). **These are properly escaped** — `escHtml()` is applied to every interpolated tenant field (name, description, activities, location, color, URL, img src/alt) at `CampsSection.astro:276-296`. ✅ No XSS vector found there.

---

## 3. T13 Compliance — Raw `fetch()` in components (must use `@/lib/api`)

Scanned all `app/src/components/**` for raw `fetch(`.

| Severity | Location | What it does |
|---|---|---|
| **MEDIUM (violates T13 letter)** | `app/src/components/admin/AuditLogPanel.tsx:86` | Only component doing a raw `fetch()` + bare `localStorage.getItem('admin_access_token')` (:85). Used to download the audit CSV **blob** — `apiFetch` cannot return a blob, so it is *functionally* justified — but it bypasses the `@/lib/api` contract, reads storage directly instead of `session.ts`, and duplicates auth-header wiring. Recommend an `exportAuditLog()` in `lib/api.ts` (the function already exists as `exportAdminPerformance` for the same pattern in TenantPerformancePanel) and a `session`-sourced token. |
| LOW | `app/src/components/public/MarketplaceHome.astro:239` | Inline `<script>` POSTs `/tenants` via `window.__API_BASE` — duplicates `api.ts:564 createTenant()`. Legacy inline-script path; data bypasses `@/lib/api`. |
| LOW | `app/src/components/public/CampsSection.astro:252` | Inline `<script>` GETs `/tenants/public` via `window.__API_BASE` — duplicates `api.ts:560 getTenantsPublic()`. Same legacy inline-script pattern. |

All `refetch()` hits are TanStack Query invalidation (compliant). POS views use the typed `usePosQueries` hooks. **The rest of the T13 migration held: zero raw `fetch` data loads in React components except AuditLogPanel's blob download.**

---

## 4. T5 Fix Verification — `useErrorToast` deferral ✅ PASS

`app/src/hooks/useQueryHooks.ts:131-146`:
```ts
function useErrorToast() {
  const { showToast } = useToast();
  return (message: string, err: unknown) => {
    ...
    setTimeout(() => {
      showToast(`${message}: ${msg}`, 'error');
    }, 0);
  };
}
```
The `showToast` call is wrapped in `setTimeout(..., 0)` (lines 142-144), moving the setState out of TanStack v5's `throwOnError` render phase. ✅ T5 fix verified intact. A scan of every `throwOnError` callback in `app/src` found **no other non-deferred setState** in render-phase callbacks — the super-admin render-loop crash vector is fully closed.

---

## 5. React Anti-Patterns

### 5a. Frozen `useState(() => readSession())` gates (Phase-7 lesson) — present, MITIGATED (LOW)

The documented anti-pattern is a *frozen initializer that nothing updates*, breaking SPA (pushState) navigation. Both occurrences are the *corrected* pattern (frozen init for synchronous bootstrap **plus** reactive setters in the auth handlers):

| Location | Initializer | Reactive fix in place? |
|---|---|---|
| `app/src/lib/auth.tsx:43` | `useState<AuthUser | null>(() => session.getUser('admin'))` | ✅ `login()` → `setUser(userData)` :96; `logout()` → `setUser(null)` :119; `validate()` effect → :61/:67 |
| `app/src/components/pos/POSApp.tsx:132-133` | `session.getUser('pos')` / `session.getAccessToken('pos')` | ✅ `handleLogin()` → `setToken(t)/setUser(u)` :207-208; `handleLogout()` → `setToken(null)/setUser(null)` :216-217 |

**Soft finding (LOW)**: two *non-reactive* storage reads in render:
- `app/src/components/admin/AdminApp.tsx:399` — `token={session.getAccessToken('admin') ?? undefined}` read inline during render (not from auth context) → a stale token can be passed to `InboxPanel` if the shell re-renders without a remount.
- `app/src/components/admin/BookingCalendar.tsx:172` — `const accessToken = session.getAccessToken('admin')` read in render body for the SSE gate → would not reactively flip if token changes in-session.
Both are benign under the current reload-style login flow but are exactly the class of code the Phase-7 lesson warns about.

### 5b. setState-during-render — ✅ CLEAN
No setState in render bodies or in non-deferred `throwOnError` callbacks (see §4). All `setX()` hits are inside event handlers / `useEffect` (verified on the loud setState inventory: LoginForm, ReservationSummary `:148` is inside `useEffect`, Select, SignupPage, ResetPasswordPage, etc.).

### 5c. `key={index}` on mapped lists — LOW (sporadic)
28 hits across 12 files. Majority are skeletons/static/placeholder lists where index keys are acceptable (`DataTable` skeleton rows, `LoadingSpinner`, `Skeleton`). Real-data lists using index keys where item order/survival can change:
- `app/src/components/public/ReservationSummary.tsx:345,358` — reservation items + meal-plan lines (item identity mutates via removeItem/quantity edits).
- `app/src/components/admin/FinancialPanel.tsx:561,595`, `SupplyPanel.tsx:545,564`, `AIPanel.tsx:431`, `BillingPanel.tsx:35`, `ReportsPanel.tsx:143,177,206` — row/entry lists keyed by index.
Recommend stable entity keys (`id`) on any list that can be re-sorted/filtered (DataTable-driven panels can reorder server-side).

### 5d. Prop mutation — ✅ not found
No `props.x =` / in-place mutation of props or downward-mutation patterns surfaced in the scan.

---

## 6. TypeScript (`tsc --noEmit`) Error Analysis

**Command**: `cd app && npx tsc --noEmit` → **exit 2**, **422 error raws capture → 426 `error TS` lines** (multi-line errors inflate diff; counts below are exact `error TS` lines).

### 6a. Distribution by directory

| Directory | `error TS` lines |
|---|---|
| **`tests/`** | **329** (77%) |
| **`src/` (incl ambiguities)** | **97** (23%) |
| — `src/` excluding stories | 90 |
| — `src/stories/Modal.stories.tsx` | 7 |
| **Total** | **426** |

### 6b. Errors by TS code (exact counts)

| TS error | Count | Meaning |
|---|---|---|
| **TS2322** | 85 | Type not assignable (strict prop mismatch) |
| **TS18048** | 70 | `'opts' is possibly 'undefined'` |
| **TS2345** | 62 | Argument not assignable to parameter |
| **TS2339** | 44 | Property does not exist |
| **TS7006** | 33 | Parameter implicitly `any` |
| **TS2352** | 30 | Suspicious type conversion |
| **TS18046** | 25 | `'X' is of type 'unknown'` |
| **TS2786** | 13 | `'BrokenComponent' cannot be used as a JSX component` |
| **TS2571** | 13 | Object is of type `unknown` |
| **TS2353** | 12 | Object literal may only specify known properties |
| TS2554 | 11 | Expected N arguments but got N |
| TS2790 | 5 | `delete` operand must be optional |
| TS2739 | 5 | Missing properties in type |
| TS2561 | 4 | Object literal may only specify known properties (destructure) |
| TS2532 | 4 | Object possibly `undefined` |
| TS2783/2741/2740/2367/2551/2304 | 9 | misc |

### 6c. Top 10 message patterns (normalized) with representative files

| # | Pattern | Count | Representative files (most recent/most weighted) |
|---|---|---|---|
| 1 | `'opts' is possibly 'undefined'` | ~67 | `tests/unit/api-extended.test.ts` (60), `tests/unit/lib/api-refresh.test.ts` (10) — test-only strict-null on fetch mock opts |
| 2 | `'result.current' is of type 'unknown'` | 21 | `tests/unit/useQueryHooks-extra2.test.tsx` (13), `useQueryHooks-extra.test.tsx` (6), `useQueryHooks-cov-push.test.tsx` (2) |
| 3 | `Argument of type '(row: Record<string,unknown>, i: number) => JSX.Element' not assignable to '(value: unknown, index: number, array: unknown[]) => Element'` | 19 | `tests/unit/OrdersPanel.test.tsx`, `tests/unit/components/admin/system.test.tsx`, `supply-storefront.test.tsx`, `supply-panel-extra.test.tsx` |
| 4 | `Type 'Mock<Procedure\|Constructable>' not assignable to '(photos: WizardPhoto[]) => void'` | 18 | `tests/unit/CampsPanel-related` fixture mocks |
| 5 | `'X' cannot be used as a JSX component` (BrokenComponent) | 13 | `tests/unit/ErrorBoundary.test.tsx` (9), `error-boundary.test.tsx` (4) |
| 6 | `Object is of type 'unknown'` (TS2571) | 13 | `tests/unit/admin/MealsPanel.test.tsx` (6), `tests/unit/components/admin/hr-financial.test.tsx` (5), `hr-panel-extra.test.tsx` (2) |
| 7 | `Expected N arguments, but got N` (TS2554) | 11 | hook-call signature drift in `useQueryHooks-extra*.test.tsx` |
| 8 | `Property 'fn' does not exist on type 'number'` | 10 | `tests/setup.ts` (7), `tests/unit/utils-extended.test.ts` (3) — `vi.fn()` misuse |
| 9 | `Parameter 't'/'sum'/'m' implicitly has an 'any' type` (TS7006) | ~28 | **src**: `src/components/admin/TenantPerformancePanel.tsx:32-34` (17), `SystemHealthPanel.tsx:30-49` (6), `SuperReportsPanel.tsx` (6); tests: `RatePlansPanel.test.tsx` (1) |
| 10 | `Conversion of type ... may be a mistake (TS2352)` | 30 | `tests/unit/api-extended.test.ts` (12), `api-bulk.test.ts` (3), `useQueryHooks-extra*.test.tsx` (4), `ServiceBookingsPanel.tsx:70`, `RatePlansPanel.tsx:69` |

### 6d. Production `src/` hotspots (90 errors)
- `src/components/admin/TenantPerformancePanel.tsx` — **22** (TS7006 implicit-any on `metrics.revenue`, `metrics.bookings` etc., lines 32-34)
- `src/components/admin/SystemHealthPanel.tsx` — **20** (TS2339 `Property 'metrics'/'workers'/'kv' does not exist on type '{}'` at :26, null-shape destructuring)
- `src/components/admin/SuperReportsPanel.tsx` — **10**
- `src/components/admin/SubscriptionsPanel.tsx` — **9**
- `src/components/admin/AuditLogPanel.tsx` — **7** (TS2339 `Property 'data'/'page'/'total' does not exist on type '{}'` :246-265 — untyped query result shape)
- `src/stories/Modal.stories.tsx` — **7**
- 2 each: `src/hooks/useSseOrders.ts`, `useSseInbox.ts`, `OnboardingWizard.tsx`, `StorefrontPanel.tsx`, `StaffPanel.tsx` (`PosRole` mis-assignment :309), `RatePlansPanel.tsx` (:69 TS2352, :90 `Product['name']` optionality), `HRPanel.tsx`
- 1 each: `ShiftOverlay.tsx`, `SystemSettingsPanel.tsx`, `SuperTenantsPanel.tsx`, `ServiceBookingsPanel.tsx`, `AnalyticsPanel.tsx`

> **Takeaway**: 77% of errors are test-fixture type drift (untyped `vi.mock` payloads, `opts` handling, mock fn signatures). The 90 production `src/` errors are concentrated in four newer super-admin panels (TenantPerformance/SystemHealth/SuperReports/Subscriptions) and are all **nullable-shape / implicit-any issues on untyped query results** — none are runtime-unsafe today, but they mask real contract drift (e.g. `RatePlansPanel:69` conversion, `ServiceBookingsPanel:70` `id: number` vs `string`).

---

## 7. Zone-Guard & Island Compliance

### 7a. Zone guards — mostly ✅ (2 minor deviations)

Every guarded page uses the **template ternary** `{ forbidden ? <ZoneGuard /> : (...) }` and sets `Astro.response.status = 404`; **no page does a frontmatter `return` of JSX**. Tenant fetch is correctly skipped when forbidden on:
- ✅ `camp/[id]/index.astro:27` (`if (!forbidden) { … ssrFetch('/tenants/'+id) … }`)
- ✅ `book.astro:15` (`if (!forbidden) { … ssrFetch … }`)
- ✅ `menu.astro:17` (`if (!forbidden) { … ssrFetch … }`)
- ✅ `pos/login/index.astro` & `pos/[...rest]/index.astro` ternaries

**Deviations (LOW — unnecessary SSR fetch on a forbidden route, exactly the "skip the tenant fetch" guidance):**
- ⚠️ `app/src/pages/rooms.astro:17` — `getTenantSSRData(...)` runs **unconditionally**, before the `forbidden` ternary at :30. On the marketplace zone this still fetches tenant data via the backend.
- ⚠️ `app/src/pages/camps.astro:20-31` — `/tenants/public` fetch runs unconditionally (no `if (!forbidden)` guard) even though the route is marketplace-only and renders ZoneGuard when forbidden.

### 7b. Public islands — ⚠️ **4 islands** (documented rule says 3)

| Island | File:line | Directive | Status |
|---|---|---|---|
| CampBooking | `TenantLanding.astro:203` | `client:visible` | ✅ documented |
| ReservationSummary | `BookPage.astro:45` | `client:load` | ✅ documented |
| TenantMenu | `MenuPage.astro:48` | `client:load` | ✅ documented |
| **MarketplaceDirectory** | `pages/marketplace.astro:14` | `client:load` | ⚠️ **4th island** — `app/src/pages/marketplace.astro` (a real route) mounts `MarketplaceDirectory` with `client:load`. Either the "only 3 islands" rule needs amending or this should be `client:visible`. |

No `client:only` / `client:idle` / `client:media` islands exist.

---

## 8. `app/src/lib/utils.ts` — escHtml / normalizeAssetUrl ✅

- `escHtml()` **exists** (`utils.ts:3-13`) and escapes `& < > " '`; used **67 times** across src, including every user-data interpolation in the innerHTML-building public scripts (CampsSection/MarketplaceHome) and TenantMenu line-items.
- `normalizeAssetUrl()` **exists** (`utils.ts:31-70`): strips loopback/private hosts, drops non-http(s) protocols (blocks `javascript:`/`data:`), upgrades `http→https`; used **39 times** (all `logo_url`/`hero`/`imageUrl` render sites — TenantLanding, MarketplaceHome, CampsSection, rooms.astro, camps.astro json-ld). ✅ Contract holds.
- **Bonus hardening already present** (`camps.astro:40-52`): `sanitizeForJsonLd()` strips `</script>` from tenant fields before `set:html` into `ld+json` — good.

---

## 9. Accessibility Spot-Check

Well-labeled overall (`Modal` close btn, `AppTopbar` nav toggle, `DataTable` search/pagination/select-all, `CampBooking` steppers, `Select` search-box all carry `aria-label`; shared `Input.tsx` renders an accessible `<label>`). **Findings:**

| Severity | Location | Issue |
|---|---|---|
| **MEDIUM** | `app/src/components/public/TenantMenu.tsx:289` | Search `<Input>` passes no `label` and no `aria-label` — **unlabeled** text field (placeholder only). `Input.tsx` only renders a `<label>` when the `label` prop is present. |
| LOW | `app/src/components/ui/DateRangePicker.tsx:91,98` | Two `<input type="date">` with **no label / aria-label** (dead component, so blast radius ~0, but fix-or-delete) |
| LOW | `app/src/components/admin/MenuPlannerPanel.tsx:316` | Remove-meal `×` button uses `title="Remove meal"` instead of `aria-label` (title is weaker for accessible-name + keyboard announcement) |
| LOW | `app/src/components/public/SignupPage.tsx:137-156,169` | Inputs are wrapped in `<label>` text but **not programmatically associated** (no `htmlFor`/`id` pairs) — visually labeled, screen-reader-ambiguous |
| ✅ | POS `CartPanel.tsx:163` | Close `×` correctly uses `aria-label="Close cart"` |

---

## 10. Severity Roll-Up

| Sev | Finding | Location |
|---|---|---|
| **MED** | Raw `fetch()` + bare `localStorage` in admin component (T13 deviation, functionally justified for blob download but out of contract) | `AuditLogPanel.tsx:85-86` |
| **MED** | Unlabeled search input on tenant menu | `TenantMenu.tsx:289` |
| **MED*** | 4th public island (`client:load`) beyond documented 3 | `pages/marketplace.astro:14` *(rule-drift, easy fix)* |
| LOW | 9 dead files (7 ui primitives + 2 hooks) kept alive by tests only | ui/{BarChart,BulkActions,ChartCard,DateRangePicker,ExportButton,MetricCard,PieChart}.tsx, hooks/{useApiError,useFilterState}.ts |
| LOW | Unconditional tenant/public fetch on forbidden routes | `rooms.astro:17`, `camps.astro:20` |
| LOW | Non-reactive `session.getAccessToken()` reads in render | `AdminApp.tsx:399`, `BookingCalendar.tsx:172` |
| LOW | `key={index}` on mutable data lists | ReservationSummary, FinancialPanel, SupplyPanel, AIPanel, BillingPanel, ReportsPanel |
| LOW | title-not-aria-label buttons, unassociated signup labels, dead DateRangePicker inputs | see §9 |
| INFO | Alpha-suffixed hex in non-React Astro styles (safe, but style-drift) | `camps.astro:89`, `CampsSection.astro:285,295` |
| ✅ | **T5 `setTimeout(0)` toast fix** | `useQueryHooks.ts:142-144` |
| ✅ | **Zero 8-digit-hex React inline styles; zero `dangerouslySetInnerHTML`** | whole `app/src` |
| ✅ | **Zero render-phase setState** outside deferred toast | whole `app/src` |
| ✅ | escHtml / normalizeAssetUrl present & applied to user data | `utils.ts:3,31`; 67/39 call sites |
| ⚠️ | **426 open `tsc --noEmit` errors** (329 tests / 90 non-story src / 7 stories); src hotspots: TenantPerformancePanel(22), SystemHealthPanel(20), SuperReportsPanel(10), SubscriptionsPanel(9), AuditLogPanel(7) | see §6 |

**Bottom line**: The three historically dangerous frontend bugs (T3 render-loop, T5 toast deferral, 8-digit-hex hydration) are all **confirmed fixed and holding**. The open debt is ✗ quality currency — 426 tsc errors (mostly test fixtures) plus ~35 low/med hygiene findings concentrated in dead components and four newer super-admin panels. Nothing in the audit is a live production runtime bug.