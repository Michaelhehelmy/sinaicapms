# Admin Panel & Storefront Improvements Report — 2026-09-14

Scope: repair of broken/fake/mock logic across the admin panels, honest
retirement of dead payment paths, and delivery of the missing public
storefront shop UI (Shop → Cart → Checkout → Confirmation).

All checks green on this report:
- Backend unit suite: **2106/2106** (81 files) + coverage thresholds pass
- Frontend unit suite: **3310/3310** (134 files)
- `astro build`: clean (server output, Cloudflare adapter)

---

## 1. Admin tabs — what was broken and what changed

### Users
- **B1** – Replace fake `user.slug` property with the real `username` field
  (generated from `first_name`/`last_name`).
- **B2** – User manager now boots from a real `getUsersList` API call instead
  of empty placeholder state.

### Rooms
- **B3** – Rooms manager now truly loads `getCampRooms` data into the table
  (previous code rendered a static empty list), and unit tests assert rows.

### Services
- **B4** – Services manager now calls `getServiceBookings`; table + modal
  wired to real data.
- **B5** – Service booking modal opens with the real booking object.
- **Skills/roles**: services and users interplay cleaned so managers use the
  actual API contract.

### Orders
- **B6** – Orders dashboards no longer silently fall back to fake stats —
  they surface the real error state from `errorResponse` (`{ success, error }`).
- **B7** – Reference/number resolution now reads the real `reference` field
  from orders instead of made-up concatenations.

### Financials
- **B8** – Revenue panel wired to the real financials API (`getFinancialSummary`
  et al.) with per-category breakdown — previously a static mock dashboard.
- **B9** – Billing panel fixes: `Number(plan.price)` conversion (the API
  returns price as a string, and the old code compared `price < 0` on a
  string), plus the plan-object shape now matches the API contract.
- **B10** – Ledger/mutations now use `amount` (not the mythical `value` field).

### CRM
- **B11** – CRM knowledge-article save (`saveCrmKnowledgeArticle`) now sends
  the exact body the backend expects (`{ title, content, category, tags,
  isPublished }`) with correct PUT/POST routing; confirmation toast and
  list refresh follow the real response.
- **B12** – CRM lead resolution uses the real `contact_name` / `service_name`
  fields.

### HR
- **B13** (`escHtml` half) – Payslip download no longer injects raw
  period/status strings into a `data:text/csv` URL — values are HTML-escaped
  via the shared `escHtml()` helper.
- **B14** – Settings panel dead write-only state removed (`heroAuto`,
  `galleryDirty`).

### AI / Settings / Reports / Promotions / Analytics
- **A1–A6** – Mock-until-real paths replaced with alive error handling:
  panels that previously did nothing on failure now surface a readable
  error and keep working state consistent (input validated before the
  AI/Durable-Object binding check so users get validation errors rather
  than opaque 503s).
- TS type fixes along the way: `BillingPanel` (`Number(plan.price)`),
  `CRMPanel` (namespace import), `OrdersPanel` (modal guard for missing
  order).

### XSS hardening (cross-cutting)
- User-generated data now passes through `escHtml()` in the payslip
  download path; admin globals no longer hold raw user text in
  executable contexts.

---

## 2. Backend honesty pass (A6) — retired mock paths

- **`/api/payments/webhook`** (old mock-Stripe webhook) is **retired**:
  it now returns a permanent `501` explaining that Stripe webhooks are no
  longer used — the real, HMAC-verified webhook is
  `POST /api/public/paymob/webhook`. It never touches `orders` or any other
  table (regression-tested in `backend/tests/payments-webhook.test.js`).
- **`openapi.json`** and **`app/src/lib/api-types.ts`** regenerated to mark
  the retirement (summary + 501 response schema).
- **Real Paymob notification URL fix**: `storefront.js` and `reservations.js`
  used `notificationUrl: <origin>/api/payments/webhook` (the retired mock).
  This was a live bug — Paymob callbacks were hitting the retired handler
  and getting 401'd. Both now point to `/api/public/paymob/webhook`.
- New migration `0098_storefront_paymob.sql` adds `payment_intent_id` to
  `storefront_orders` so Paymob intention IDs persist and can be matched
  by the webhook.
- Storefront checkout now mirrors the reservation flow: creates a real
  Paymob intention when configured, otherwise saves the order as `pending`
  with `fallbackWhatsapp: true`.
- Service/POS contract fix: `getScope(c)` now reads `c.get('scope')`
  (the production contract); tests updated to mount middleware the same
  way instead of the legacy `c.set('tenantId', …)`.

---

## 3. New: Public storefront shop UI (was missing)

The storefront backend endpoints existed but had **no customer-facing UI**.
This report adds the tenant-only shop flow:

- **Routes** (all tenant-only in `routeZones.ts`, branded 404 on the
  marketplace zone):
  - `/storefront` — product catalog
  - `/storefront/cart` — cart
  - `/storefront/checkout` — checkout
  - `/storefront/order/[orderNumber]/confirmation` — confirmation
- **`app/src/lib/storefrontSession.ts`** — per-tenant session ID managed in
  localStorage, plus cart-broadcast helper so multiple tabs stay in sync.
- **Islands** (Astro `client:load`):
  - `ShopCatalog.tsx` — product grid, search (debounced), pagination,
    add-to-cart, inline toast
  - `StorefrontCart.tsx` — quantity +/−, remove, live totals (react-query
    mutations)
  - `StorefrontCheckout.tsx` — customer form; on success opens the Paymob
    Accept iframe when enabled (token fetched from `accept.paymob.com`),
    otherwise the WhatsApp fallback link (`wa.me` with order ref + total)
    for pending orders
  - `StorefrontConfirmation.tsx` — looks the order up by session and shows
    pending/confirmed states
- **`api.ts`** — `checkoutStorefront` return type annotated with
  `paymentMethods` so the iframe integration-id is typed.

---

## 4. Verification

| Gate | Result |
| --- | --- |
| `cd backend && npx vitest run` | 2106/2106 pass |
| backend coverage thresholds (83/72/89/89) | pass (86.67/75.81/92.96/91.58) |
| `cd app && npx vitest run` | 3310/3310 pass |
| `cd app && npx astro build` | clean |

Pre-existing (not introduced here, verified by `git stash`): 8 `tsc --noEmit`
errors in `SuperTenantsPanel.tsx`, `CampBooking.tsx`, `useQueryHooks.ts`,
`DebugFeedbackWidget.test.tsx` that exist on `main` too.

---

## 5. Deploy

`./deploy.sh` was NOT run. It is the only remaining step and affects
production (Worker + D1 migrations + Workers frontend). Requires explicit approval.