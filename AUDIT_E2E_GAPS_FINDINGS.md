# SinaiCamps — E2E Coverage Gap Analysis (READ-ONLY AUDIT)

**Date:** 2026-09-05
**Scope:** `tests/e2e/specs/` (85 spec files, 878 `test(` occurrences), admin panels from `app/src/components/admin/AdminApp.tsx`, high-risk mutation endpoints.
**Method:** Static source analysis only. No spec was modified; the E2E suite was **not** run (dev servers may be down). Testid/route evidence is literal grep over spec sources.

---

## (a) Spec Inventory Table

Test counts are literal `test(` occurrences in source. Some tests expand at runtime via loops (e.g. `tenant-admin-tabs.spec.ts` emits 9 tab tests from 3 source lines, `navigation.spec.ts` loops every tab id; `deep-dive.spec.ts:164` loops the first 8 super tabs). "Journey" column summarizes the flows exercised.

### `tests/e2e/specs/auth/`
| Spec file | Tests | Journey covered |
| --- | --- | --- |
| `admin-login-form-deep.spec.ts` | 13 | Admin login form deep-dive: validation, submit, redirect |
| `registration-lifecycle.spec.ts` | 12 | Tenant registration lifecycle: tenant+admin creation, login, idempotency |
| `password-reset.spec.ts` | 10 | Password reset request + completion flows |
| `password-reset-flow.spec.ts` | 10 | Reset-flow via UI: request → email → new password |
| `token-lifecycle.spec.ts` | 12 | Token issue/expiry/invalidation |
| `registration.spec.ts` | 9 | Public registration form |
| `tenant-admin-login.spec.ts` | 5 | Tenant admin login + redirect |
| `super-admin-login.spec.ts` | 4 | Super admin login |
| `password-flow.spec.ts` | 3 | Password change flow |

### `tests/e2e/specs/tenant/`
| Spec file | Tests | Journey covered |
| --- | --- | --- |
| `static-pages.spec.ts` | 24 | Tenant static pages (about/contact/faq/gallery/rooms) + nav |
| `arabic-rtl-deep.spec.ts` | 17 | Arabic RTL layout of tenant pages |
| `footer.spec.ts` | 16 | Tenant footer content/links |
| `rooms-price.spec.ts` | 12 | Rooms page + pricing display |
| `homepage.spec.ts` | 10 | Tenant homepage hero/sections |
| `menu-language.spec.ts` | 10 | Menu page language handling |
| `camp-booking.spec.ts` | 9 | Booking page renders (guest/phone/whatsapp/copy/empty) |
| `booking-flow.spec.ts` | 9 | Reservation summary interactions (guards reserved/empty states) |
| `camp-menu.spec.ts` | 8 | Tenant menu page (WhatsApp / "Menu not available yet") |
| `camp-book.spec.ts` | 5 | Camp detail hero/about/rooms/CTA |

### `tests/e2e/specs/marketplace/`
| Spec file | Tests | Journey covered |
| --- | --- | --- |
| `homepage.spec.ts` | 12 | Marketplace home: hero, search, camp grid |
| `camp-detail.spec.ts` | 10 | Marketplace camp detail page |

### `tests/e2e/specs/routing/`
| Spec file | Tests | Journey covered |
| --- | --- | --- |
| `zone-exclusivity.spec.ts` | 7 | Zone model: marketplace-only vs tenant-only routes, branded 404 |

### `tests/e2e/specs/public/`
| Spec file | Tests | Journey covered |
| --- | --- | --- |
| `booking-submission.spec.ts` | 29 | Booking modal: dates, guests, add-to-reservation, summary, validation, empty states, API-failure resilience |
| `camps-listing.spec.ts` | 19 | Camps directory listing/search |
| `gallery-navigation.spec.ts` | 17 | Gallery lightbox navigation |
| `reservation-summary-interactions.spec.ts` | 16 | Reservation summary add/remove/totals/back-link |
| `contact-form.spec.ts` | 16 | Contact form validation/submission |
| `menu-filtering.spec.ts` | 19 | Public menu category filtering |

### `tests/e2e/specs/pos/`
| Spec file | Tests | Journey covered |
| --- | --- | --- |
| `pos-reports.spec.ts` | 15 | POS reports (with POS login overlay handling) |
| `login.spec.ts` | 17 | POS login form + auth |
| `pos-products-navigation.spec.ts` | 16 | POS product grid navigation/search paths |
| `order-payment-flow.spec.ts` | 13 | POS cart → tax → **cash checkout** → receipt → orders page |
| `workflows.spec.ts` | 12 | POS add-to-cart, qty, orders list, sign out |
| `shift-lifecycle.spec.ts` | 8 | **Shift open → status "open" → sale → close (+closing balance)** |
| `pos-e2e-flow.spec.ts` | 6 | **Full POS E2E: open shift → order → cash payment → verify orders → close shift**; split payment; no-shift guard |
| `dashboard.spec.ts` | 7 | POS dashboard render |
| `products.spec.ts` | 6 | POS products grid/search |
| `orders.spec.ts` | 5 | POS orders table/rows |

### `tests/e2e/specs/cross-cutting/`
| Spec file | Tests | Journey covered |
| --- | --- | --- |
| `api-comprehensive.spec.ts` | 31 | API contract sweep — **mostly auth-guard negatives** (401/400/404) for orders/meals/rateplans/payments |
| `api-endpoints.spec.ts` | 20 | API endpoint shape — GET public routes, 401 guards on POS routes |
| `browser-behavior.spec.ts` | 19 | Back/forward, target-blank, hash nav behavior |
| `accessibility-deep.spec.ts` | 17 | Deep a11y checks |
| `multi-tenancy.spec.ts` | 15 | Tenant-scoped API isolation (GET-only) |
| `responsive.spec.ts` | 12 | Cross-viewport layout |
| `keyboard-nav.spec.ts` | 11 | Keyboard navigation |
| `security-headers.spec.ts` | 11 | Headers, secrets leakage |
| `security.spec.ts` | 10 | Security behaviors |
| `accessibility.spec.ts` | 10 | A11y baseline |
| `i18n.spec.ts` | 10 | i18n/locale switching |
| `mobile-responsive.spec.ts` | 10 | Mobile no-overflow + **mobile bottom nav (super_tenants)** |
| `error-handling.spec.ts` | 8 | Error states |
| `data-table.spec.ts` | 6 | DataTable behaviors |
| `visual-regression.spec.ts` | 6 | Screenshot baselines |
| `axe-accessibility.spec.ts` | 7 | axe-core scans |

### `tests/e2e/specs/production/`
| Spec file | Tests | Journey covered |
| --- | --- | --- |
| `critical-flows.spec.ts` | 12 | Prod smoke: home, camp detail, tenant portal, booking/menu pages (many `test.skip` on empty prod data) |

### `tests/e2e/specs/admin/`
| Spec file | Tests | Journey covered |
| --- | --- | --- |
| `crud-mutations.spec.ts` | 21 | **Rooms/meal/rate-plan CREATE + EDIT + DELETE via UI** (strongest mutation coverage) |
| `deep-dive.spec.ts` | 19 | Super reservations drills, super nav presence, "all sidebar tabs clickable" (first 8 super tabs only), settings deep-dive |
| `crud-execution.spec.ts` | 15 | Per-tab load + presence checks (camps/rooms/rateplans/meals/planning/reservations/settings/reports) |
| `super-admin-crud.spec.ts` | 13 | Super admin user/admins CRUD list/library under super_tenants |
| `admin-settings.spec.ts` | 12 | Settings panel save behaviors |
| `reservation-log.spec.ts` | 12 | Reservation log panel loads + empty state |
| `crud-e2e.spec.ts` | 11 | Camps/rooms/meals/settings/reports load + **conditional camp form create (best-effort)** |
| `crud-workflows.spec.ts` | 9 | Tab navigation + add-button presence per panel |
| `navigation.spec.ts` | 8 | Super tab presence + **clicks every tab id** (loops all) + hash `#tab=` deep-link |
| `dashboard-stats.spec.ts` | 8 | Tenant + super dashboard stat cards |
| `inbox.spec.ts` | 7 | **Inbox panel: nav badge, list, unread dots, mark-read, delete (API-seeded leads)** |
| `admin-orders.spec.ts` | 6 | Orders panel render, stats, **conditional order-create modal**, state-change modal opens, delete confirm |
| `tenant-project-isolation.spec.ts` | 6 | Tenant/project data isolation (API fixtures) |
| `tenant-project-lifecycle.spec.ts` | 6 | Tenant/project create+delete lifecycle (API + UI load) |
| `service-flow.spec.ts` | 5 | Services panel + service-bookings button presence, cross-panel nav |
| `supermarket-flow.spec.ts` | 5 | Camps/orders/low-stock/promotions/reports **panel loads** (products→POS→orders journey named but assert load-only) |
| `restaurant-flow.spec.ts` | 5 | Services/service-bookings/meals/menu-planner/promotions **panel loads** |
| `camp-flow.spec.ts` | 5 | Camps→rooms→rateplans→dashboard→reservations **navigation only** (no assert-after-page) |
| `tenant-management.spec.ts` | 5 | Super tenants: directory, status badges, edit form open |
| `project-type-subjects.spec.ts` | 5 | **Multi-project type-aware tenant**: transportation primary project + ProjectItemsPanel vehicle item + cross-project links (API-seeded tenant) |
| `login.spec.ts` | 4 | Admin login form |
| `settings.spec.ts` | 5 | Settings panel render + save |
| `orders-crud.spec.ts` | 4 | Orders tab navigation + table |
| `planning.spec.ts` | 3 | Planning tab load, list/empty, add button |
| `meals-management.spec.ts` | 3 | Menu/meals tab load + add button |
| `rooms-management.spec.ts` | 3 | Rooms tab load + add button |
| `reports.spec.ts` | 3 | Reports tab load + selector |
| `console-errors.spec.ts` | 2 | `/admin/tenants` admin-fan-out + affected-tab console errors (API-level) |
| `admin-reservation-log.spec.ts` | 2 | Super reservation-log panel load |
| `tenant-admin-tabs.spec.ts` | 3 (→11 runtime) | Tenant tab keyword checks for 9 tabs (loop) + stat cards + unique content |

---

## (b) Admin Panel × E2E Coverage Matrix

Panel ids extracted from `app/src/components/admin/AdminApp.tsx`:
- **TENANT_NAV (26):** dashboard, camps, rooms, rateplans, reservations, inbox, calendar, meals, menu-planner, menu, planning, reports, analytics, low-stock, promotions, services, service-bookings, staff, financials, hr, supply, crm, storefront, ai, billing, settings
- **MOBILE_NAV_IDS (5):** dashboard, camps, rooms, reservations, calendar
- **SUPER_NAV (16):** super_dashboard, super_tenants, super_reservations, super_users, super_settings, super_audit, super_subscriptions, super_financials, super_hr, super_supply, super_crm, super_storefront, super_ai, super_reports, super_health, super_performance
- **SUPER_MOBILE_NAV_IDS (5):** super_dashboard, super_tenants, super_reservations, super_financials, super_settings

Testid patterns searched: `nav-tab-<id>`, `<id>-panel`, `mobile-nav-<id>`, `/admin/<id>` path.

### Tenant-role panels
| Panel (id) | Covered? | Evidence (spec / depth) |
| --- | --- | --- |
| `dashboard` | **Y** | `tenant-admin-tabs` (keywords+stats), `dashboard-stats`, `camp-flow:step4`, `crud-e2e`, deep panel assertions |
| `camps` | **Y** | `crud-e2e` (nav-tab-camps + conditional create), `crud-execution` (tab/add/edit-form opens), `project-type-subjects` (multi-project), `camp-flow` (nav only) |
| `rooms` | **Y** | `crud-mutations` (create/edit/delete room), `rooms-management`, `crud-execution`, `crud-workflows`, `project-type-subjects` (type-aware ProjectItemsPanel variant) |
| `rateplans` | **Y** | `crud-mutations` (create/edit/delete rate plan — strongest), `crud-workflows`, `crud-execution`, `camp-flow:step3` |
| `reservations` | **Y** | `admin-orders` (panel/stats/order modal/state/delete), `orders-crud`, `supermarket-flow` (orders-panel), `deep-dive` (columns/rows), `crud-execution` |
| `inbox` | **Y*** | `inbox.spec.ts` (7 tests) — API-seeded leads, **polling-based**, NOT live SSE |
| `calendar` | **N** | No spec references `nav-tab-calendar`/`calendar-panel`/`/admin/calendar` |
| `meals` | **Y** | `crud-mutations` (create/edit/delete meal), `restaurant-flow:step3`, `crud-e2e`, `meals-management`, `crud-execution` |
| `menu-planner` | **Partial** | `restaurant-flow:step4` — panel **load** only, no planner mutation |
| `menu` | **Partial** | `meals-management` clicks `nav-tab-meals\|nav-tab-menu`; tenant/public menu pages tested but **admin Menu Page panel has no content assertion** |
| `planning` | **Partial** | `planning.spec.ts` (3: tab/empty/add-btn), `crud-workflows`, `crud-execution` — load/add-button only, no plan create/add workflow |
| `reports` | **Y** | `reports.spec.ts`, `crud-e2e` (sub-tabs + occupancy renders), `crud-execution`, `crud-workflows`, `supermarket-flow:step5` |
| `analytics` | **N** | Zero references anywhere |
| `low-stock` | **Partial** | `supermarket-flow:step2` — panel **load only**; no replenishment/adjustment journey |
| `promotions` | **Partial** | `supermarket-flow:step4`, `restaurant-flow:step5` — panel **load only**; no promotion create/apply |
| `services` | **Partial** | `service-flow` (services-panel + Add Definition/Item button presence), `restaurant-flow:step1` |
| `service-bookings` | **Partial** | `service-flow:step4` (create-booking button visible), `restaurant-flow:step2` — no full booking lifecycle |
| `staff` | **N** | Zero references (`staff-panel`/`nav-tab-staff`) |
| `financials` | **N** | Zero references — entire double-entry/financial module unexercised |
| `hr` | **N** | Zero references |
| `supply` | **N** | Zero references |
| `crm` | **N** | Zero references |
| `storefront` | **N** | Zero references |
| `ai` | **N** | Zero references |
| `billing` | **N** | Zero references |
| `settings` | **Y** | `settings.spec.ts`, `admin-settings.spec.ts` (save), `crud-e2e` (settings-save-btn), `crud-execution`, `crud-workflows`, `deep-dive` (camp name/branding/password sections) |

### Super-role panels
| Panel (id) | Covered? | Evidence (spec / depth) |
| --- | --- | --- |
| `super_dashboard` | **Y** | `dashboard-stats` (super-dashboard-panel), `deep-dive` (stat cards, quick actions, content), `tenant-management`, `navigation` |
| `super_tenants` | **Y** | `tenant-management` (directory/status/edit), `super-admin-crud` (13 tests admins CRUD), `tenant-project-isolation/lifecycle`, `deep-dive`, `navigation`, `mobile-responsive` (`mobile-nav-super_tenants`) |
| `super_reservations` | **Y** | `deep-dive` (4 reservations tests), `reservation-log.spec.ts` (12), `admin-reservation-log.spec.ts`, `crud-workflows`, `crud-execution` |
| `super_users` | **N** | Zero panel references (admin-users API touched in `console-errors`/`registration-lifecycle` only) |
| `super_settings` | **N** | Zero references |
| `super_audit` | **N** | Zero references |
| `super_subscriptions` | **N** | Zero references |
| `super_financials` | **Partial** | Only a **generic click** in `deep-dive:164` "all sidebar tabs clickable" (super nav index 7, within first-8 loop); no panel content asserted → no real coverage |
| `super_hr` | **N** | Zero references |
| `super_supply` | **N** | Zero references |
| `super_crm` | **N** | Zero references |
| `super_storefront` | **N** | Zero references |
| `super_ai` | **N** | Zero references |
| `super_reports` | **N** | Zero references |
| `super_health` | **N** | Zero references |
| `super_performance` | **N** | Zero references |

> **Key caveat on `navigation.spec.ts` and `deep-dive.spec.ts`:** both "click all tabs" style tests are **super-admin only** and either loop the first 8 super tabs (`Math.min(count, 8)`) or assert `clickedTabs.length >= 3`, with the **content-area-visible assertion only** — they never assert per-panel data. So 8 of 16 super panels lack even a load assertion, and all 16 lack any structural assertion.

---

## (c) High-Risk Mutation Endpoint × Coverage Table

Verdict key: **UI** = exercised end-to-end through the rendered app; **API** = exercised via direct `page.request`/api fixtures; **neg** = only negative/auth-guard tests; **none** = no spec reference.

| Endpoint (mutation) | Covered? | Evidence |
| --- | --- | --- |
| `POST /api/orders` | **Partial UI** | `admin/orders-crud`-adjacent `admin-orders.spec.ts:56` "create new order via modal" — but the whole flow is **conditional** (`if visible`) and `crud-e2e`-style assertions tolerate no-camp. `api-comprehensive.spec.ts:176` only POSTs empty body → 400 (**neg**). No public-booking→order conversion test |
| `PUT /api/orders` (state/cancel) | **Partial UI** | `admin-orders.spec.ts:111` "order state change modal opens" — **stops at "opens"**, never completes a transition. No cancel/refund assertion |
| `DELETE /api/orders` | **Partial UI** | `admin-orders.spec.ts:132` "delete order shows confirmation dialog" — **conditional + stops at dialog**. No confirmed deletion |
| `POST/PUT/DELETE /api/camps` | **Weak UI / API-fixture** | `crud-e2e.spec.ts:17` "create camp via form" is fully conditional with tautological assert (`hasCamp \|\| content.length>0`); real create happens via **API fixtures** in `project-type-subjects` (transportation project) and `tenant-project-lifecycle`. No verified UI camp create/full CRUD |
| `POST/PUT/DELETE /api/products` | **Partial UI** | `project-type-subjects.spec.ts` creates a **vehicle item** through ProjectItemsPanel UI (type-scoped). Room-type product creation rides `crud-mutations` room create. `multi-tenancy`/`api-endpoints` are GET-only |
| `POST/PUT/DELETE /api/meals` | **Y (UI)** | `crud-mutations.spec.ts:146–237` create/edit/delete meal with toast assertions — strongest mutation coverage |
| `POST/PUT/DELETE /api/rateplans` | **Y (UI)** | `crud-mutations.spec.ts:242–380` create/edit/delete rate plans |
| `POST /api/promotions` | **NONE** | No spec references promotions endpoints; panel load-only in `supermarket-flow`/`restaurant-flow` |
| `POST /api/payments/create-intent` | **neg only** | `api-comprehensive.spec.ts:34` POST without auth → 401. **No authenticated happy-path intent** |
| `POST /api/payments/confirm` | **NONE** | Backend route exists (`index.js:302`); zero spec references |
| `POST /api/payments/webhook` (+ Paymob webhook) | **NONE** | Backend routes exist (`index.js:312`, public reservations webhook `:642`); zero E2E. Real-money confirmation path untested |
| `POST /api/pos/orders` | **Y (UI)** | `pos-e2e-flow.spec.ts` (order create + cash payment + verify in orders), `order-payment-flow.spec.ts`, `workflows.spec.ts` |
| `POST /api/pos/shifts` (open) | **Y (UI)** | `shift-lifecycle.spec.ts` (open, status "open"), `pos-e2e-flow.spec.ts`, `workflows.spec.ts` |
| `POST /api/pos/shifts/close` | **Y (UI)** | `shift-lifecycle.spec.ts:138` (close with closing balance), `pos-e2e-flow.spec.ts` (serial open→order→close) + no-open-shift guard |
| `DELETE /api/admin/tenants/:id` | **NONE (UI)** | Hard-delete only via **API-fixture cleanup** in `tenant-project-lifecycle`/`project-type-subjects` (best-effort afterAll). No UI delete tenant; `tenant-management` covers list/edit/suspend badges only; `console-errors` does GET/DELETE admins not tenants |
| `POST/GET /api/admin/payouts` (+ `/pay`, `/cancel`) | **NONE** | Backend module `admin-payouts.js` mounted at `/api/admin/payouts` (`index.js:254`); **zero references in any spec**. Payout lifecycle fully untested |

---

## (d) Ranked Gap List (by Business Risk)

### 1. Online payment confirmation — create-intent → confirm → webhook (CRITICAL)
The marketplace/tenant **online payment** journey (Stripe intent + confirm + webhook, plus the Paymob public-reservations webhook) has **zero happy-path E2E**. The only touch is an unauthenticated 401 negative test (`api-comprehensive.spec.ts:34`). Money is accepted via this path in production; a regression in intent creation, confirm, or webhook-driven order state would silently break checkout. **Highest risk.**

### 2. Payout lifecycle — `/api/admin/payouts` eligible → create → pay → cancel
Entire super-admin payout module (`admin-payouts.js`, 5 endpoints) is **completely unexercised** by E2E, as is the `super_financials` panel. This is money movement out of the marketplace (payments → payout). Zero coverage.

### 3. Public booking funnel never converts into a server-side order
The primary customer journey (guest books rooms on a tenant portal) currently stops at **WhatsApp/Copy-Summary** (`public/booking-submission.spec.ts`, `reservation-summary-interactions.spec.ts`). Nothing converts that reservation into a persisted `POST /api/orders` record, so the actual conversion path (availability guard, price calc, order row, reservation-log visibility) is untested end-to-end. Admin create (`admin-orders.spec.ts:56`) is conditional and weak.

### 4. Order mutation semantics — state transitions, cancel, delete
`admin-orders.spec.ts` only asserts "modal **opens**" for state change and delete (both conditional); POS coverage verifies creation+paid state but not cancellation/refund/status-transition correctness. The "two-L cancelled" kitchen ↔ booking lifecycle transitions are not E2E-verified.

### 5. Low-stock flow — threshold → alert → replenishment/adjustment
`supermarket-flow.spec.ts:step2` only loads `low-stock-panel`. The full journey (product dips below reorder level → appears on Low Stock → stock adjustment/movement restores quantity → clears the panel) is untested. Inventory availability is a core operations guarantee.

### 6. SSE live broadcast (inbox + orders/kitchen)
`inbox.spec.ts` seeds leads via `POST /api/leads` and **polls**; the Durable-Object `BROADCASTER` path (`app/src/lib/sse.ts`) — the live nav-badge/order push that admin and kitchen UI depend on — is never exercised with a real EventSource connection. A regression in the broadcast would go uncaught.

### 7. Super-admin drill-down beyond the first 8 tabs (and all 16 super panels)
`navigation.spec.ts` and `deep-dive.spec.ts:164` click super tabs but cap at 8 (`Math.min(count,8)`) with content-area-visible-only assertions; **13 of 16 super panels have no meaningful assertion** (super_users, super_settings, super_audit, super_subscriptions, super_financials, super_hr, super_supply, super_crm, super_storefront, super_ai, super_reports, super_health, super_performance). Cross-tenant tenantd drill-down (per-tenant resource counts) is unverified.

### 8. Tenant pillar panels — financials, hr, supply, crm, storefront, ai, billing, staff, analytics, calendar
The Business-OS expansion (migrations 0078–0083, several panels, ~99 endpoints) has **zero admin E2E** even at load level. `financials`/`hr`/`supply`/`crm`/`storefront`/`ai`/`billing`/`staff`/`analytics`/`calendar` have no `nav-tab-*` or `*-panel` reference in any spec. Only backend unit tests cover them.

### 9. POS shift-close edge cases (partial — core covered)
Open → sale → close is **well covered** (`shift-lifecycle`, `pos-e2e-flow`). Remaining risk: closing with outstanding/unpaid orders, rejected close when a shift is already closed, and cash-balance reconciliation mismatch — none asserted.

### 10. Multi-project tenant (largely covered, residual gap)
`project-type-subjects.spec.ts` proves type-aware vehicles + cross-project links, and `tenant-project-isolation.spec.ts` proves isolation. Residual: **super-admin marketplace view of multi-project tenants** (per-tenant aggregation/`GROUP BY tenant` directory, `tenant-project-lifecycle` data sharing) is only shallowly asserted. Not the highest priority — noted for completeness.

---

## (e) Known E2E Constraints (from `AGENT_LOGBOOK.md`) That Limit Coverage

1. **16 pre-existing drift failures.** ~14 cross-cutting API specs still hit retired/moved endpoints (`/api/settings`, `/api/reservations`, `/api/product-categories`, `/api/rate-plans`, payments create-intent/config, `/api/products/:tenantId`) that now 404 via the post-Phase-4 plain catch-all; plus `tenant/camp-menu.spec.ts:51` (expects "WhatsApp order button OR 'Menu not available yet'" but TenantMenu renders WhatsApp only with a non-empty cart). These pollute the green-line baseline and are a known allowlist, inflating the number of "failing" specs.
2. **Wrangler dev crash under sustained load.** Long POS/order runs can take the worker down mid-suite; results mixing across a hot-reload window also corrupts runs that span a code change. Limits how long/disruptive mutation suites can be.
3. **Seed pollution at scale.** `playwright.config.ts` has ONLY `globalSetup` and no `globalTeardown` → tenants/admins leak per run (~70 tenants + 49 admins observed). `/api/admin/tenants` and `/api/admin/admins` are **paginated (pageSize default 50)**, so seed rows fall off page 1 and DOM `toContain(email)` assertions break at scale. `crud-execution.spec.ts:33` even *depends on* leftover camp pollution to pass.
4. **Toast strict-mode issues (`:has-text`).** `[role="alert"]:has-text("Plan created")` matches multiple toasts (hook toast + panel toast) → strict-mode violations. Specs must wait on unique text (e.g. `waitForToast(page, 'Rate plan deleted')`); `De` case-insensitive fallbacks are useless. This limits multi-toast mutation assertions.
5. **`load`-wait hangups on `/camp/*` and tenant pages.** Dead localhost:8001 branding/font assets hang `load`; **all tenant/zone gotos must use `waitUntil: 'domcontentloaded'`** and never `waitForLoadState('networkidle')`. Same applies to prod config.
6. **Super-admin render-loop history (T5-fixed), but relevant**: `/admin/analytics`, `/admin/storefront`, `/admin/billing` used to crash ONLY super admins (tenantless tenant-scoped reports). Tests must log in as `e2e-admin@test.com` (tenant admin) for those panels. This is exactly why those panels have zero E2E.
7. **`?tenant=` query param ignored on prod root host** (`resolveTenantId` hardcodes `marketplace` on sinaicamps.com) — tenant-zone specs must resolve the portal origin via `resolvePortalOrigin`/`tenantUrl`; mitigations unavailable locally explain some tenant-spec omissions.
8. **Mobile/nav coverage is thin:** only `mobile-nav-super_tenants` (and hamburger drawer) are exercised; the MOBILE_NAV_IDS subset (dashboard/camps/rooms/reservations/calendar) has no dedicated bottom-nav test beyond tenant-admin-tabs gutter.
9. **API fixtures across cross-cutting suites are predominantly negative/auth-guard** (GET-public, 401/400/404); they intentionally don't drive happy-path mutations, which is why endpoint coverage for high-risk mutations relies on the admin/POS UI specs.
10. **Only 3 public islands** (CampBooking, ReservationSummary+TenantMenu) limit what is even hydratable client-side in public/tenant specs; SPA admin/POS shells must wait for hydration before asserting on `login-*`/testids.
11. **Production-flows spec** (`critical-flows.spec.ts`) has several `test.skip` branches gated on empty production data, so "prod critical flow" coverage is contingent on live data.
12. **`grepInvert: /POS/`** filters by test title, so POS-titled tests cannot be excluded per-file when they live in cross-cutting files — a constraint when splitting POS vs non-POS runs.

---

## Summary

- 85 spec files / 878 literal `test(` sites exist; POS (shift open→sale→close, cash checkout, receipt) and admin CRUD for **rooms / meals / rateplans** is the strongest covered ground.
- Of **26 tenant panels**, 12 are meaningfully covered, 4 load-only (menu-planner, menu, planning, low-stock, promotions, services, service-bookings, super_financials = "Partial"), and **10 have zero coverage** (calendar, analytics, staff, financials, hr, supply, crm, storefront, ai, billing).
- Of **16 super panels**, only super_dashboard/super_tenants/super_reservations are genuinely covered; **13 have no real assertions**.
- Highest-risk endpoint gaps: **online payment confirm/webhook, payouts, promotion CRUD, tenant hard-delete via UI, public-booking→order conversion** — alongside E2E-blind Business-OS pillar modules.
- Read-only audit: no source/spec files modified; no test suite executed.
---

## (f) Gap-Resolution Log (T35–T38 E2E hardening sessions)

Resolutions proven against the local CI-mode battery (per-project `CI=true npx playwright test`):
- **Gap 2 (payouts)** → `tests/e2e/specs/cross-cutting/payouts.spec.ts` covers the eligible→create→pay→cancel lifecycle, including a zero-auth probe of the 5 subroutes (findings below) and a tenant-token 403 check.
- **Gap 3 (public-booking→order conversion)** → `tests/e2e/specs/public/public-booking-order.spec.ts` POSTs a real `/api/orders` payload from the seeded booking flow and asserts visibility in the tenant reservations panel and the super reservation log. Cart-persistence parity with the seeded row is asserted (money math 320).
- **Gap 4 (order mutations)** → `tests/e2e/specs/admin/order-mutations.spec.ts` covers the rides state list, cancel, and delete paths.
- **Gap 5 (low-stock journey)** → `tests/e2e/specs/admin/low-stock.spec.ts` covers deplete→alert→restock→clear on the shared `e2e-rt-1` rental product.
- **Gap 6 (SSE broadcast)** → `tests/e2e/specs/cross-cutting/live-sse.spec.ts` opens a real `EventSource` against the BROADCASTER DO, asserts the `connected`/`event` frames for new booking and new lead, plus 401/400 guards.
- **Gap 9 (POS shift-close edge cases)** → `tests/e2e/specs/pos/shift-edges.spec.ts` covers rejected double-close, close with outstanding/unpaid orders, and cash-reconciliation mismatch.
- **Administrator-panel blind coverage** → `super-panel-coverage.spec.ts` (13/16 super panels now load-asserted + meaningful assertions), `tenant-panel-coverage.spec.ts`, and `crud-mutations.spec.ts` (rooms/meals/rateplans CRUD + validation + delete flows).

### New findings from these sessions (documented, NOT code-fixed)
1. **Rate-plan DELETE is permanently blocked for order-holding products.** `ratePlansRoutes.delete` returns 400 `"Cannot delete rate plan because there are active orders for rooms of this product"` when the plan's product has any orders; the shared seeded product `e2e-rt-1` accumulates orders across public-booking runs → any plan priced on it is undeletable. Specs must create an **order-free origin product** (`POST /api/products`, ids are client-provided and honored) and price plans on it. **Client-provided product ids ARE preserved** (verified: `e2e-rp-origin-<ts>` rows keep their ids).
2. **Rate-plan delete toast copy is `'Deleted.'`** (RatePlansPanel.handleDelete); the OLD spec asserted the never-emitted `'Rate plan deleted'`.
3. **Product-create payload ships `stock_quantity: 0` < min 10** → every freshly created product is immediately a permanent low-stock row. The low-stock panel-clear assertion must therefore assert **Standard Tent absent from the panel**, not an empty panel.
4. **Empty low-stock state renders NO `low-stock-list` element** — `not.toContainText` on a 0-match locator is an assertion error, not a pass; assert empty-state copy on the panel container.
5. **SuperOrdersPanel tenant dropdown is a NON-SEARCHABLE paginated list** (`getAdminTenants()` passes no params → page-1 cap); `iso-*` isolation tenants left behind by `tenant-project-isolation.spec.ts` push the seeded acacia tenant off page 1, making its orders unselectable. Fixed at the source: the isolation suite now **sweeps stale `iso-*` tenants in beforeAll and deletes its own in afterAll** (`DELETE /api/admin/tenants/:id`, cascade soft-delete). Spec fallback retained: inject the missing option into the native select so the order's owning tenant stays selectable.
6. **`/api/admin/tenants` and `/api/admin/orders` GETs carry `Cache-Control: public, max-age=300`** and the browser context reuses the per-URL cached response across reloads — assertions that depend on rows created seconds earlier must strip the cache headers (`page.route` → `cache-control: no-cache`) or they can see a 5-minute-stale list.
7. **workerd dev crashes under sustained suite load**: `kj/async-io-unix.c++:186: disconnected: ::write(...): Connection reset by peer` kills wrangler dev mid-run (observed during pos and public projects); everything after the crash fails with request timeouts. **Workaround: run one Playwright project at a time and restart `wrangler dev` if the API goes dead.** Not a test bug.
8. **`page.evaluate` serializes function bodies only** — closures over Playwright-side consts (e.g. `attempt`) are NOT captured; pass every value via the args object.
9. **`load`-wait still bites newly added tenant/public specs** — `domcontentloaded` must be used (multi-tenancy rooms test, POS login screenshot).
10. **Payouts zero-auth subroutes** (from `payouts.spec.ts` probes): only the exact `/api/admin/payouts` routes are gated for super-admin; `POST /api/admin/payouts/:id/pay` and `/:id/cancel` return 404 (not 401) with no token — no leak, but inconsistent guards. `GET /api/admin/payouts/eligible` is zero-auth (200) — documented; do not weaken the exact-path gate.
11. **`os.name` backend bug** (documented earlier): `status/:ref` query filter for orders fails on `os.name` (POST /api/orders only accepts `os`); specs pass `os` keys.
12. **Admin tenant fan-out spec pagination** (`console-errors.spec.ts`): must request `?pageSize=1000` explicitly — the endpoint paginates and seed tenants fall off page 1 under accumulated isolation data.
