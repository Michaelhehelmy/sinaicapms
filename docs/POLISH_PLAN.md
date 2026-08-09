# SinaiCamps — Final Polish Plan (Locked)

> **Status**: Approved 2026-08-09 by Michael Helmy. All 4 waves, sequence below, Stripe mocked-but-safe, DB schema changes allowed, PWA/offline POS included, command palette deferred.
> **Rule of thumb**: waves must not regress the production E2E suite (`tenant 122/122`, cross-cutting `76 pass / 3 skip`).

## Scope decisions (user-approved)

| Decision | Choice |
| --- | --- |
| Waves | All 4 (correctness → marketplace/tenant → admin/POS → payments) |
| Stripe | Mock-but-safe only. No live gateway this pass. |
| Local payment methods | e-wallet (Vodafone Cash), Instapay, cash — recorded with `payment_status='pending'` + optional reference; manager verifies/voids later |
| DB schema | Migrations allowed (next: `0051+`) |
| PWA/offline POS | Included. Workbox vendored locally into `app/public` (no CDN) |
| Command palette | Deferred |
| Documentation | This file (`docs/POLISH_PLAN.md`) |

## Verified facts (source-of-truth anchors)

- POS tax is **client-only bug**: backend already computes org tax from `pos_organizations.tax_rate` (`backend/src/routes/pos/index.js:230-242`) and returns `tax_rate` on order create (`:304`). Frontend `CartPanel.tsx:27` hardcodes `0.1`.
- `POST /api/leads` already accepts `{ name, email, phone?, subject?, message?, source? }` (`backend/src/api/leads.js:11-18`) and broadcasts `new-lead` via SSE. Booking details fold into `message`.
- `idempotencyKey` on POS orders fully implemented (`0050_add_pos_idempotency.sql` + create flow `routes/pos/index.js:139-334`) — offline replay reuses it as-is.
- `GET /api/availability?tenantId=&checkIn=&checkOut=&productId=` exists and reads the `orders` table (`orders.js:590-636`; wired in `index.js:294,347`). Availability feedback for the public booking modal reuses it. **No new `bookings` table** — confirmed stays live in `orders`; public inquiries land in `leads`.
- `tenants.gallery_images` and `tenants.reviews` (JSON) exist (`0005_rich_branding.sql`). `reviews` table is new in 0052; backfill from `tenants.reviews`.
- `leads` table + `GET /api/leads` paginated + `PUT/DELETE /api/leads/:id` exist.
- Admin inbox SSE (`new-lead`, `new-booking`) via Broadcaster Durable Object already works.
- Payments are fully mocked: `payments.js:41` `pi_mock_` + client-supplied intent; `confirm` marks order paid with any string; webhook uses static header compare. → Wave 4 ledger.
- POS order create skips zod (`routes/pos/index.js:134-261`); N+1 product lookup; non-atomic stock deduction; `paymentMethod || 'cash'` at `:248`.
- Admin DataTable `pagination` prop is unused; AdminApp uses lazy panels + QueryClient 30s stale.
- `CampsSection.astro` double-fetches `/api/tenants/public` on DOMContentLoaded.
- i18n `en.json`/`ar.json` = 278 keys each, admin-heavy; marketplace pages hardcoded English; islands read lang from localStorage (LTR flash in RTL).
- `/pos` on the marketplace zone 404s **by design** (tenant-only); tenant hosts serve it. PWA SW must register only in the POS shell.

---

## Wave 1 — Correctness

| # | Change | Files |
| --- | --- | --- |
| 1.1 | Zone-aware nav: "Accommodations"/"Book Now" → `/camps` on marketplace, `/rooms` on tenant | `app/src/layouts/PublicLayout.astro` |
| 1.2 | Wire booking flow → `POST /api/leads` (on add + on WhatsApp send); keep wa.me fallback | `app/src/components/public/CampBooking.tsx`, `ReservationSummary.tsx` |
| 1.3 | Server-driven POS tax — expose `tax_rate` from POS login/products; render from it (remove hardcoded 0.1) | `backend/src/routes/pos/index.js`, `app/src/components/pos/views/CartPanel.tsx` |
| 1.4 | zod `posOrderSchema`: `paymentMethod` enum, items 1–100, amounts ≥ 0; reject unknown method; bulk product fetch (kill N+1) | `backend/src/routes/pos/index.js` |
| 1.5 | Atomic conditional stock deduction (`UPDATE … SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?`), 400 on 0 rows | `backend/src/routes/pos/index.js` |
| 1.6 | CampsSection double-fetch — skip client refetch when SSR rendered the grid | `app/src/components/public/CampsSection.astro` |
| 1.7 | Island language sync — pass SSR `lang` as prop (kills LTR flash) | `CampBooking.tsx`, `ReservationSummary.tsx`, `TenantMenu.tsx`, book/menu pages |
| 1.8 | Uniform error envelope + headers — route `sharedAuth` 401/403 through `errorResponse`; fix POS `{error}`-without-`success:false` | `backend/src/middleware/sharedAuth.js`, `routes/pos/index.js` |

## Wave 2 — Marketplace + Tenant portal

| # | Change | Files |
| --- | --- | --- |
| 2.1 | Photo-led camp cards (hero/gallery image, brand fallback) | `app/src/components/public/CampsSection.astro` |
| 2.2 | Price ("from X EGP/night") + rating chip on cards | `CampsSection.astro`, tenant payload |
| 2.3 | Data-driven filter facets + URL-synced filters (`pushState`) + sort | `CampsSection.astro`, `app/src/pages/camps.astro` |
| 2.4 | Availability feedback in booking modal via `/api/availability`; flag blocked dates | `CampBooking.tsx` |
| 2.5 | Camp-detail gallery (thumbnail strip + switcher from `gallery_images`) | `TenantLanding.astro` |
| 2.6 | Amenities list (from new `tenants.amenities`), review aggregate chip + count, FAQ accordion, breadcrumbs, contact card + map fallback | `TenantLanding.astro`, `app/src/pages/rooms/about/...` |
| 2.7 | SEO: per-page JSON-LD (`WebSite`/`ItemList`/`LodgingBusiness` with aggregateRating/offers/geo), canonical, hreflang en/ar, og:url/og:image, robots/sitemap cleanup | `PublicLayout.astro`, `index.astro`, `camps.astro`, `TenantLanding.astro`, `sitemap.xml.ts`, `robots.txt.ts` |
| 2.8 | Wrap Book/Menu pages in `PublicLayout` | `app/src/pages/.../BookPage.astro`, `MenuPage.astro` |
| 2.9 | Per-tenant branded 404 (primary color + logo) | `NotFoundPage.astro`, `ZoneGuard` |
| 2.10 | Perf: image width/height + aspect-ratio + lazy; font preload; eager islands → `client:idle/visible` | marketplace/tenant pages |

## Wave 3 — Admin + POS + backend security

| # | Change | Files |
| --- | --- | --- |
| 3.1 | Admin: live Dashboard via orders/leads SSE | `app/src/components/admin/DashboardPanel.tsx` |
| 3.2 | Admin: adopt `DataTable pagination` (Orders/Inbox/Meals/SuperOrders) + server paging | panels + `app/src/hooks/useQueryHooks.ts` |
| 3.3 | Admin: unify manual-fetch panels + legacy meals hooks onto `useQueryHooks`; RegisterPage uses shared inputs | `ReportsPanel`, `SuperTenantsPanel`, `SuperOrdersPanel`, `MealsPanel`, `MenuPanel`, `RegisterPage` |
| 3.4 | POS: sessionStorage cart (cashier-keyed) + restore; replace `window.location.href` nav with in-app routing | `app/src/components/pos/POSApp.tsx`, `CartPanel.tsx` |
| 3.5 | POS: mount dead `ReceiptModal` on every sale + Reprint from OrdersView | `CartPanel.tsx`, `OrdersView.tsx`, `ReceiptModal.tsx` |
| 3.6 | POS: void — `POST /api/pos/orders/:id/void` (manager-gated, stock restore, audit) + UI confirm | `backend/src/routes/pos/index.js`, `OrdersView.tsx` |
| 3.7 | POS: server-side order pagination (`?page&pageSize&status`) | `routes/pos/index.js`, `OrdersView.tsx` |
| 3.8 | POS: session handling — 401 → `/pos/login` toast redirect; per-identifier lockout; single login limiter | `app/src/lib/api.ts`, `backend/src/index.js`, `sharedAuth.js` |
| 3.9 | POS tender parity: quick-cash, custom amount, per-item discount, barcode input, keyboard shortcuts | `CartPanel.tsx`, `ProductsView.tsx`, `routes/pos/index.js` |
| 3.10 | **PWA/offline POS**: Workbox SW (vendored `workbox-sw.js` in `app/public`) caching `/api/pos/products` stale-while-revalidate, IndexedDB cart, offline order queue replayed via `idempotencyKey`; manifest + icons + registration in POS shell only | `app/public/service-worker.js`, `app/public/manifest.webmanifest`, `app/src/layouts/POSLayout.astro`, `app/src/pages/pos/[...rest]/index.astro` |
| 3.11 | POS design tokens + a11y: brand accent (kill indigo), modal focus trap/aria, icon `aria-label`s, pause poll on hidden tab | `POSLayout.astro`, `ProductsView.tsx`, `CartPanel.tsx`, `ReceiptModal.tsx`, `DashboardView.tsx` |
| 3.12 | Backend: SSE auth — short-lived single-use `/api/stream/token` instead of JWT in query string | `backend/src/index.js`, `sse.ts` |
| 3.13 | Backend: POS reports `GET /api/pos/reports/summary?from&to&groupBy` | `backend/src/routes/pos/index.js` (new module) |
| 3.14 | Backend: `KV_CACHE` — cache public marketplace GETs (5-min TTL) or remove binding | `backend/wrangler.toml`, marketplace handlers |

## Wave 4 — Payments (mock-but-safe + local methods)

| # | Change | Files |
| --- | --- | --- |
| 4.1 | **Intent ledger** (0053): `create-intent` records intent → `confirm` pays only when intent exists, matches order+tenant, amount == order total, status `created`; mark intent `paid` | `backend/src/api/payments.js`, migration |
| 4.2 | POS `paymentMethod` enum → `cash | card | ewallet | instapay | split`; ewallet/instapay record method + `payment_status='pending'` + optional reference; card stays mock via ledger | `routes/pos/index.js`, `CartPanel.tsx` |
| 4.3 | Webhook: constant-time secret compare; document future-only (real `stripe-signature` verification deferred) | `backend/src/api/payments.js` |

## DB Migrations (backend/migrations/)

| # | File | Change |
| --- | --- | --- |
| 0051 | `0051_add_amenities.sql` | `ALTER TABLE tenants ADD COLUMN amenities TEXT` (JSON array) |
| 0052 | `0052_create_reviews.sql` | `reviews` table (`tenant_id, author, rating, text, date, status approved|pending, created_at`); backfill from `tenants.reviews` JSON; `GET /api/tenants/:id/reviews` (approved only); rate-limited `POST /api/reviews` → pending; admin approve/reject |
| 0053 | `0053_payment_intents.sql` | `payment_intents` ledger (`order_id, amount, currency, status, created_at, confirmed_at`) |

## Tests to add

- Backend: zod POS-order validation (unknown method → 400), atomic stock (concurrent undersell), intent-ledger confirm (forged/mismatched/foreign intent rejected), reviews CRUD + public filter.
- Frontend: theme/amenities render, leads POST on booking, tax from server value, cart persistence/restore, POS method buttons, nav zone-awareness.
- E2E: marketplace nav no-404, camp-card photo+price, availability blocked dates, POS receipt/void/quick-cash, PWA SW registration, Arabic marketplace copy.

## Verification per wave

```bash
cd app && npx vitest run        # frontend unit
cd backend && npx vitest run    # backend unit
npx vitest run                  # root integration
npx playwright test             # local E2E
```

Production spot-run via `playwright.prod.config.ts` before final. Update `AGENT_LOGBOOK.md` on completion.

## Execution order

1. This document (done).
2. Migrations 0051–0053 built alongside their consumers; applied via deploy.
3. Wave 1 → verify → Wave 2 → verify → Wave 3 → verify → Wave 4 → full suite + logbook.
