# SinaiCamps — Component Catalog

All paths relative to `app/src/`. Styling is Tailwind CSS v4; `cn()` comes from `lib/utils.ts`. Every interactive primitive ships keyboard + focus-visible + `aria` support.

## 1. UI primitives — `components/ui/` (26)

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

## 2. Admin — `components/admin/` (25 files)

`AdminApp.tsx` + panels: `BookingCalendar`, `CampsPanel`, `DashboardPanel`, `InboxPanel`, `ListingWizard` (+ `PhotosStep`), `LowStockPanel`, `MealsPanel`, `MenuPanel`, `MenuPlannerPanel`, `OrdersPanel`, `PasswordPanel`, `PlanningPanel`, `RatePlansPanel`, `ReportsPanel`, `RoomsPanel`, `SettingsPanel`, `StaffPanel`, `SuperDashboardPanel`, `SuperOrdersPanel`, plus auth pages (`ForgotPasswordPage`, `RegisterPage`, `ResetPasswordPage`) and `icons.tsx`.

All data flows through **TanStack Query** (`useQueryHooks`/`useAdminData`) — no raw `fetch`, no `window.*` globals.

## 3. POS — `components/pos/` (8 views)

`CartPanel`, `DashboardView`, `LoginView`, `OrdersView`, `ProductsView`, `ReceiptModal`, `ShiftDashboard`, `ShiftOverlay` + supporting files.

## 4. Public — `components/public/`

Zone-aware landing/browsing surfaces: `TenantLanding`, `MarketplaceHome`, `CampsSection`, `ZoneGuard`, `CampBooking`, `ReservationSummary`, `TenantMenu`, `BookPage`, `MenuPage`, `CampDetail`/`CampCard`, contact forms. Tenant pages hang on `load` in dev (logo/favicon → dead `localhost:8001`) — E2E uses `waitUntil: 'domcontentloaded'`.

## 5. Hooks — `hooks/` (5)

| Hook | Purpose |
| --- | --- |
| `useAdminData` | Auth-aware admin data context |
| `useApiError` | Normalizes API error responses for forms/toasts |
| `useQueryHooks` | TanStack Query hooks generated per endpoint group |
| `useSseInbox` | SSE-backed inbox feed |
| `useSseOrders` | SSE-backed live orders feed |

## 6. Layouts & pages

- Layouts: `layouts/PublicLayout.astro`, `AdminLayout.astro`, `POSLayout.astro`.
- Pages: marketplace home (`index.astro`), `/camps`, `/camp/[id]/`, tenant pages, admin SPA host (`admin/[...rest]/`), POS SPA host (`pos/[...rest]/`).

## 7. Stories

`stories/` mirrors the UI primitives — 8 new a11y stories were added with the T9 expansion (Checkbox, Radio, Switch, Textarea, FormField, Separator, Tooltip, Accordion) alongside the pre-existing set.
