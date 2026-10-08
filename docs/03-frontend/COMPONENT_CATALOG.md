---
title: "SinaiCamps — Component Catalog"
aliases:
  - COMPONENT_CATALOG
  - Component Catalog
tags:
  - type/inventory
  - audience/developer
  - domain/frontend
  - status/needs-refresh
created: 2026-08-13
updated: 2026-10-06
relates-to:
  - "[[PERF_BASELINE]]"
  - "[[ARCHITECTURE]]"
  - "[[03-frontend/README]]"
  - "[[TESTING]]"
code-references:
  - "app/src/components/ui/LineChart.tsx:9-14"
  - "app/src/components/ui/RechartsLine.tsx:19-22"
  - "app/src/components/ui/SafeImage.astro:16-57"
  - "app/src/components/admin/AdminApp.tsx:60-107"
  - "app/src/components/admin/AdminShell.tsx:20 (client:only host, not a panel)"
  - "app/src/components/admin/BrowserAIPanel.tsx:18"
  - "app/src/components/pos/POSApp.tsx:7"
  - "app/src/components/pos/views/DashboardView.tsx:1"
  - "app/src/components/pos/views/TableView.tsx:1-317 (undocumented 317-line floor grid)"
  - "app/src/components/public/ZoneGuard.astro"
  - "app/src/hooks/ (5 files: useAdminData, usePosQueries, useQueryHooks, useSseInbox, useSseOrders)"
  - "app/src/stories/ (10 story files; none of the 8 named here)"
  - "app/src/lib/utils.ts:106"
verified: never
---

# SinaiCamps — Component Catalog

All paths relative to `app/src/`. Styling is Tailwind CSS v4; `cn()` comes from `lib/utils.ts`. Every interactive primitive ships keyboard + focus-visible + `aria` support.

## 1. UI primitives — `components/ui/` (20 actual, 2026-09-21)

> Truth 2026-09-21: 20 files on disk. 9 cataloged entries have no file (Accordion, Checkbox, FormField, Radio, Separator, Switch, Tabs, Textarea, Tooltip). 3 present files were undocumented (LineChart, RechartsLine, icons).

| Component | Kind | Accessibility notes |
| --- | --- | --- |
| `Accordion.tsx` | Interactive | `button` triggers, `aria-expanded`/`aria-controls`, `role="region"` panels, single/multiple modes, chevron rotation |
| `Badge.tsx` | Display | — |
| `Button.tsx` | Interactive | Focus ring, variants (primary/secondary/danger/ghost), `asChild` support |
| `Card.tsx` | Layout | — |
| `Checkbox.tsx` | Form | Native input + label via `useId`, `aria-describedby` for error/desc, disabled state |
| `ConfirmDialog.tsx` | Overlay | Modal confirm with focus management |
| `DataTable.tsx` | Table | Sortable columns, row actions, empty state |
| `EmptyState.tsx` | Display | Icon + title + description + action |
| `ErrorBoundary.tsx` | Boundary | Catches render errors, fallback UI |
| `FormField.tsx` | Form | Composes label + control + hint + error; `useId`-generated ids wired via `htmlFor`/`aria-describedby` |
| `FormModal.tsx` | Overlay | Modal with form layout |
| `Input.tsx` | Form | `aria-invalid` + `aria-describedby` on error |
| `LoadingSpinner.tsx` | Display | `role="status"` |
| `Modal.tsx` | Overlay | `role="dialog"`, Escape close, focus trap |
| `Radio.tsx` | Form | `RadioGroup` (`role="radiogroup"`) + `RadioItem`; native radios share one `name` → arrow-key nav + roving focus for free; supports controlled (`value`) and uncontrolled (`defaultValue`) |
| `SafeImage.astro` | Image | Normalizes remote URLs, runs `getImage` (sharp), falls back to plain `<img>` on failure |
| `Select.tsx` | Form | Label + error + helper; optional searchable/placeholder; grouped options |
| `Separator.tsx` | Display | Decorative default (`role="none"`), semantic opt-in `role="separator"` |
| `Skeleton.tsx` | Display | Loading placeholders |
| `StatCard.tsx` | Display | Metric + label + delta |
| `StatusTag.tsx` | Display | Status-colored tag |
| `Switch.tsx` | Form | `role="switch"` + `aria-checked`, Space/Enter toggles via native button |
| `Tabs.tsx` | Interactive | Tablist/tab/tabpanel ARIA pattern |
| `Textarea.tsx` | Form | `aria-invalid` + `aria-describedby` |
| `Toast.tsx` | Feedback | Toast container + provider |
| `Tooltip.tsx` | Interactive | Hover + focus triggers, `aria-describedby`, Escape close, 300ms delay, no pointer-events trap |

**Form composition** — prefer `FormField` + the form primitives over hand-rolled wrappers:

```tsx
<FormField label="Camp name" htmlFor="name" hint="Shown publicly" required>
  <Input id="name" />
</FormField>
```

## 2. Admin — `components/admin/` (63 files on disk, all `.tsx`)

**The enumeration below is right and the count was wrong** (`find app/src/components/admin -type f | wc -l` → **63**). It names **25** files and **all 25 exist**; the other **38** are undocumented here, so treat this section as a partial list, not an inventory. Re-derive the denominator before quoting it.

`AdminApp.tsx` + panels: `BookingCalendar`, `CampsPanel`, `DashboardPanel`, `InboxPanel`, `ListingWizard` (+ `PhotosStep`), `LowStockPanel`, `MealsPanel`, `MenuPanel`, `MenuPlannerPanel`, `OrdersPanel`, `PasswordPanel`, `PlanningPanel`, `RatePlansPanel`, `ReportsPanel`, `RoomsPanel`, `SettingsPanel`, `StaffPanel`, `SuperDashboardPanel`, `SuperOrdersPanel`, plus auth pages (`ForgotPasswordPage`, `RegisterPage`, `ResetPasswordPage`) and `icons.tsx`.

The 38 undocumented files, by family — the growth is in the *super-admin* and *finance* surfaces, which is exactly where a reader should look before assuming a panel is missing:

| Family | Files |
|---|---|
| Super-admin | `SuperAIPanel`, `SuperCRMPanel`, `SuperFinancialsPanel`, `SuperHRPanel`, `SuperReportsPanel`, `SuperStorefrontPanel`, `SuperSupplyPanel`, `SuperTenantsPanel` |
| Finance / billing | `BillingPanel`, `FinancialPanel`, `PaymentReceipt`, `SubscriptionsPanel` |
| Folios / receipts | `FoliosPanel`, `FolioDetail`, `FolioReceipt`, `RecordPaymentModal` |
| Services / supply | `ServicesPanel`, `ServiceBookingsPanel`, `SupplyPanel`, `ProjectItemsPanel` |
| CRM / AI | `AIPanel`, `BrowserAIPanel`, `CRMPanel` |
| Analytics / audit / system | `AnalyticsPanel`, `AuditLogPanel`, `SystemHealthPanel`, `SystemSettingsPanel`, `FeedbackPanel` |
| Tenancy | `TenantDrilldown`, `TenantImportPanel`, `TenantPerformancePanel`, `UsersPanel` |
| Shell / misc | `AdminShell`, `DynamicForm`, `CashDeskPanel`, `PromotionsPanel`, `StorefrontPanel` |

`AdminShell.tsx` is the `client:only="react"` host that `AdminApp` renders inside — it is the app shell, not a panel, which is why the two are counted separately above.

All data flows through **TanStack Query** (`useQueryHooks`/`useAdminData`) — no raw `fetch`, no `window.*` globals. Re-verify with `grep -rn "fetch('" app/src/components/admin` → **0**.

## 3. POS — `components/pos/` (11 view files under `views/`)

8 named + 3 undocumented: `CartPanel`, `DashboardView`, `LoginView`, `OrdersView`, `ProductsView`, `ReceiptModal`, `ShiftDashboard`, `ShiftOverlay`, **plus `KitchenView`, `ProjectPicker`, `TableView`** (`ls app/src/components/pos/views/ | wc -l` → **11**). `KitchenView` and `TableView` are the restaurant floor path (`TableView` is a 317-line interactive floor grid), `ProjectPicker` is the multi-project switcher.

Outside `views/`, `components/pos/` holds `POSApp.tsx`, `PosShell.tsx` (the `client:only="react"` host) and `types.ts`.

## 4. Public — `components/public/`

Zone-aware landing/browsing surfaces: `TenantLanding`, `MarketplaceHome`, `CampsSection`, `ZoneGuard`, `CampBooking`, `ReservationSummary`, `TenantMenu`, `BookPage`, `MenuPage`, `CampDetail`/`CampCard`, contact forms. Tenant pages hang on `load` in dev (logo/favicon → dead `localhost:8001`) — E2E uses `waitUntil: 'domcontentloaded'`.

## 5. Hooks — `hooks/` (5 files, verified)

| Hook | Purpose |
| --- | --- |
| `useAdminData` | Auth-aware admin data context |
| `usePosQueries` | POS-side TanStack Query hooks (the `/api/pos/*` counterpart to `useQueryHooks`) |
| `useQueryHooks` | TanStack Query hooks generated per endpoint group |
| `useSseInbox` | SSE-backed inbox feed |
| `useSseOrders` | SSE-backed live orders feed |

**There is no `useApiError`.** It was previously listed here and does not exist in `app/src/hooks/` or anywhere under `app/src` — the "5" was right by coincidence while the membership was wrong, and `usePosQueries` was missing. `ls app/src/hooks/` → exactly these five files.

## 6. Layouts & pages

- Layouts: `layouts/PublicLayout.astro`, `AdminLayout.astro`, `POSLayout.astro`.
- Pages: marketplace home (`index.astro`), `/camps`, `/camp/[id]/`, tenant pages, admin SPA host (`admin/[...rest]/`), POS SPA host (`pos/[...rest]/`).

## 7. Stories — 10, and none of them are the "8 a11y stories"

`app/src/stories/` holds **10** Storybook files: `Badge`, `Button`, `Card`, `DataTable`, `EmptyState`, `Input`, `LoadingSpinner`, `Modal`, `StatCard`, `Toast` (`find app -name "*.stories.*" -not -path "*/node_modules/*" | wc -l` → **10**).

**The 8 stories this section previously named — Checkbox, Radio, Switch, Textarea, FormField, Separator, Tooltip, Accordion — were never realised.** Their components were added in `5d11305` and **deleted in `69311ce`** ("65 tables → 34 tables, 30 dead tables dropped"), a deliberate dead-code sweep, and the stories went with them. All eight are among the 9 cataloged `components/ui/` entries §1 already flags as having no file. `stories/` mirrors the primitives that survived, not the ones the T9 expansion proposed.
