# Frontend Completion Audit — 2026-08-26

## Executive Summary

Comprehensive audit of all frontend domains to identify hardcoded/mock data, missing API connections, anti-patterns, and gaps. **3,602 tests passing.** 53 admin panels, 39 public pages/components, 12 POS components audited.

### Overall Health

| Domain | GOOD | MODERATE | POOR | Critical Issues |
|--------|------|----------|------|-----------------|
| Tenant Admin Panels | 23 | 14 | 1 | BillingPanel entirely mocked |
| Public Frontend | 14 | 7 | 0 | Hardcoded filter dropdowns |
| POS Frontend | 10 | 2 | 0 | No offline support, no barcode, no tips |
| **TOTAL** | **47** | **23** | **1** | |

---

## WORKER A — Tenant Admin Panels (Poor/Moderate)

### CRITICAL: BillingPanel.tsx (Lines 1-145)
- **Entirely mocked.** `PLANS` array (lines 5-10) and `USAGE` object (lines 12-20) are hardcoded constants.
- Zero API calls anywhere in the file.
- "Next billing date" hardcoded to `"Sept 1, 2026"` (line 59).
- `$49/mo` price is a hardcoded string (line 57).
- "Contact Sales" button has no handler.
- **ACTION**: Replace with real subscription data from `/api/tenant/subscription` (needs backend endpoint creation).

### MODERATE: AnalyticsPanel.tsx (Lines 84-126)
- Uses `useState + useEffect + api.*` pattern instead of TanStack Query.
- Calls `api.getRevenueReport`, `api.getOccupancyReport`, `api.getTopProducts`, `api.getKitchenPerformance`.
- Uses `Promise.allSettled` (good error resilience) but no TanStack Query cache.
- **ACTION**: Migrate to TanStack Query hooks. Backend endpoints exist at `/api/reports/*`.

### MODERATE: ReportsPanel.tsx (Lines 44-115)
- Uses `useState + useEffect + api.*` pattern.
- Calls `api.getOccupancyReport`, `api.getRevenueReport`, `api.getBookingsReport`.
- **ACTION**: Migrate to TanStack Query hooks.

### MODERATE: StaffPanel.tsx (Lines 123-198)
- Uses `useState + useEffect + api.*` pattern.
- Pagination-aware (good) but no TanStack Query.
- **ACTION**: Migrate to TanStack Query hooks.

### MODERATE: HRPanel.tsx (Lines 111-164)
- 628-line panel, fully functional but uses `useState + useEffect + api.*`.
- Calls `api.getHrEmployees`, `api.getHrLeaveTypes`, `api.getHrLeaveRequests`, `api.getHrPayrollRuns`, `api.getHrJobPosts`.
- **ACTION**: Migrate to TanStack Query hooks.

### MODERATE: FinancialPanel.tsx (Lines 96-133)
- 591-line panel, uses `useState + useEffect + api.*`.
- **ACTION**: Migrate to TanStack Query hooks.

### MODERATE: SupplyPanel.tsx (Lines 46-100)
- Uses `useState + useEffect + api.request`.
- **ACTION**: Migrate to TanStack Query hooks.

### MODERATE: CRMPanel.tsx (Lines 140+)
- Uses `useState + useEffect + apiFetch` (direct, not through api.* functions).
- **ACTION**: Migrate to TanStack Query hooks, use api.* functions.

### MODERATE: StorefrontPanel.tsx (Lines 64-102)
- Uses `useState + useEffect + api.*`.
- **ACTION**: Migrate to TanStack Query hooks.

### MODERATE: PromotionsPanel.tsx (Lines 71-90)
- Uses `useState + useEffect + api.*`.
- **ACTION**: Migrate to TanStack Query hooks.

### MODERATE: AIPanel.tsx (Lines 109-135+)
- Uses `useState + useEffect + api.*`.
- **ACTION**: Migrate to TanStack Query hooks.

### MODERATE: ServicesPanel.tsx (Lines 56-92)
- Uses `useState + useEffect + api.*`.
- **ACTION**: Migrate to TanStack Query hooks.

### MODERATE: RatePlansPanel.tsx (Lines 60-81)
- Mixed: uses `useProductsQuery` but rate plans via `useState + useEffect`.
- **ACTION**: Migrate rate plans to TanStack Query.

### Super Admin Panels (all MODERATE — useState+useEffect)
- SuperTenantsPanel, SuperOrdersPanel, SuperHRPanel, SuperFinancialsPanel, SuperSupplyPanel, SuperCRMPanel, SuperStorefrontPanel, SuperAIPanel
- All use `getAdminTenants()` + `apiFetch()` pattern.
- **ACTION**: Migrate to TanStack Query hooks.

### SuperDashboardPanel.tsx (Line 150)
- `"Activity feed coming soon"` placeholder text.
- **ACTION**: Remove or implement activity feed.

---

## WORKER B — Admin Panels Consistency & CRUD

### Issues to Fix Across All Panels
1. **Missing CSV export** on: StaffPanel, HRPanel, FinancialPanel, SupplyPanel, CRMPanel, StorefrontPanel, PromotionsPanel, AIPanel
2. **Missing search/filter** on: StaffPanel (has pagination but no search), RatePlansPanel
3. **Inconsistent DataTable usage** — some panels use raw `<table>` instead of shared DataTable component
4. **Query invalidation** — ensure all CREATE/UPDATE/DELETE operations call `queryClient.invalidateQueries()`
5. **Soft-delete UI** — ensure deleted items are reflected immediately

### Panels Needing Export Buttons
- AnalyticsPanel (chart data export)
- ReportsPanel (report download)
- HRPanel (employee list, payroll export)
- FinancialPanel (journal entries, accounts export)
- SupplyPanel (inventory export)
- CRMPanel (contacts, opportunities export)
- StorefrontPanel (pages, blog posts export)
- PromotionsPanel (promotions export)
- AIPanel (predictions export)
- StaffPanel (staff list export)

---

## WORKER C — Public Frontend

### MODERATE: CampsSection.astro (Lines 64-87)
- **Hardcoded location filter**: Only "Sinai Peninsula" and "Dahab" (lines 64-68).
- **Hardcoded activity filter**: Only "Hiking", "Yoga", "Snorkeling", "Windsurfing" (lines 81-87).
- **ACTION**: Dynamically populate from tenant data. Extract unique locations/activities from the tenants array.

### MODERATE: MarketplaceDirectory.tsx (Line 187)
- **Broken "Try Again" button**: `onClick={() => setPage((p) => p)}` is a no-op.
- **ACTION**: Replace with `refetch()` from the query hook.

### MODERATE: about.astro (Lines 68-108)
- **Hardcoded feature cards**: "Eco-Friendly Lodging", "Expert Wilderness Guides", "Community Vibe" (lines 81-108).
- **Hardcoded mission text** (lines 73-76).
- **ACTION**: Either make configurable via tenant settings or remove hardcoded cards.

### MODERATE: MarketplaceHome.astro (Line 238)
- **Hardcoded `capacity: 50`** in onboarding form.
- **ACTION**: Add capacity field to the form or use a reasonable default.

### MODERATE: contact.astro (Lines 131-135)
- **Duplicated client-side API base URL** construction.
- **ACTION**: Extract to shared utility or use existing `getApiBase()`.

### MODERATE: TenantLanding.astro (Line 155)
- **Hardcoded fallback description**: "Experience premium summer camp programs..."
- **ACTION**: Use tenant's actual description fields.

### MODERATE: PublicLayout.astro (Lines 86, 95, 669)
- **Hardcoded fallback meta descriptions**.
- **ACTION**: Acceptable empty-state behavior, but review if tenant has description fields.

---

## WORKER D — POS Frontend

### CRITICAL: No Offline Support
- No service worker, no cart persistence, no checkout queue.
- Cart is React `useState` only — page refresh loses everything.
- **ACTION**: 
  1. Persist cart to `localStorage` with periodic sync
  2. Add offline queue for failed checkouts
  3. Register service worker for cache-first static assets

### CRITICAL: No Barcode Scanning
- Products only searchable by text input.
- **ACTION**: 
  1. Add `GET /api/pos/products/barcode/:code` backend endpoint
  2. Add barcode input field that auto-adds product to cart
  3. Support USB barcode scanner keyboard input

### HIGH: No Tips/Gratuity
- No tip input, no suggested percentages, no tip line on receipt.
- **ACTION**:
  1. Add tip input to CartPanel (Cash/Card/Split + Tip)
  2. Add suggested tip percentages (15%, 18%, 20%, Custom)
  3. Include tip on ReceiptModal
  4. Send tip data in order body

### MEDIUM: Type Safety (3 files)
- `CartPanel.tsx` line 71: `const body: any = {...}` — use `PosOrderCreateRequest`
- `ShiftDashboard.tsx` lines 13, 22: `any` casts — use `PosShiftCloseResponse`
- `ReceiptModal.tsx` line 24: `item: any` — use `Order.items` type
- **ACTION**: Replace all `any` with proper OpenAPI-generated types.

### LOW: Dead Code
- `CartPanel.tsx` lines 91-98: Unreachable `receiptOrder` state.
- **ACTION**: Remove dead code block.

### LOW: No Retry Buttons on Error States
- DashboardView, OrdersView, KitchenView, TableView all lack manual retry.
- **ACTION**: Add retry buttons that call `refetch()`.

---

## WORKER E — Integration & Testing

### Missing Backend Endpoints
1. **`GET /api/tenant/subscription`** — Tenant self-service billing (currently only super-admin CRUD exists)
2. **`GET /api/pos/products/barcode/:code`** — Barcode/SKU lookup for POS
3. **`GET /api/tenant/analytics`** — Tenant-level analytics (currently only reports exist)

### API Function Gaps
- 54 backend endpoints have NO corresponding frontend API function in `app/src/lib/api.ts`
- Most are admin-only endpoints that were added but never wired to frontend
- **ACTION**: Audit each and add missing API functions

### Shared Components
- `DateRangePicker`, `ChartCard`, `BarChart`, `LineChart`, `PieChart`, `MetricCard` — created in Super Admin transformation
- **ACTION**: Ensure these are used consistently across all panels

### Test Coverage
- AdminApp.test.tsx covers 16 super panels
- Need smoke tests for: BillingPanel, AnalyticsPanel, ReportsPanel
- Need integration tests for POS offline queue, barcode scanning

---

## Files to Modify (Estimated)

| Worker | Files | New Files |
|--------|-------|-----------|
| A | 15 admin panels | 1 billing endpoint |
| B | 10+ admin panels | 0 |
| C | 4 public files | 0 |
| D | 4 POS files | 0 |
| E | 3 backend files, api.ts | 2 backend endpoints, test files |

## Test Count Target
- Current: 3,602
- After completion: 3,602+ (no regressions)
