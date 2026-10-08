---
title: "Backlog: Void/Refund Next-Cycle Proposal"
aliases:
tags:
  - type/plan
  - audience/owner
  - domain/plans
  - domain/pos
  - status/proposal
created: 2026-09-21
updated: 2026-10-06
relates-to:
  - "[[09-plans/README]]"
  - "[[supermarket-guide]]"
  - "[[10-tenant-import/BLOCKED-pos-products-composite-pk]]"
  - "[[07-data/migrations]]"
code-references:
  - "backend/src/api/folios.js:337"
  - "backend/src/index.js:731"
  - "backend/src/api/orders.js:1382"
  - "backend/migrations/0120_add_tip_amount_to_pos_transactions.sql"
  - "backend/src/routes/pos/index.js"
  - "backend/src/routes/pos/index.js:806-810"
  - "backend/src/routes/pos/index.js:819"
  - "backend/src/routes/pos/index.js:1163-1308"
  - "backend/migrations/0004_pos.sql:144-149"
  - "backend/migrations/0112_drop_pos_tenant_id_defaults.sql:226-231"
  - "backend/src/api/reports.js"
  - "app/src/components/admin/ReportsPanel.tsx"
  - "app/src/components/admin/SuperReportsPanel.tsx"
  - "app/src/lib/api.ts"
  - "app/src/pages/"
  - "docs/01-architecture/ARCHITECTURE.md"
verified: never
---
# Backlog: Void/Refund Next-Cycle Proposal

Status: proposal only — no code changed.

## Current
- **`POST /api/pos/orders/:id/void` does NOT exist.** The POS router registers
  exactly **10** routes (`backend/src/routes/pos/index.js` — `auth/login`,
  `auth/refresh`, `products` GET, `orders` POST, `orders` GET, `orders/:id`,
  `dashboard`, `shifts/active`, `shifts/open`, `shifts/close`) and none of them
  is a void. The **only** void route in the backend is
  `foliosRoutes.post('/:id/void')` (`backend/src/api/folios.js:337`, mounted
  `index.js:731`) — an **admin-only folio status flip** to `'voided'` with no row
  deleted and charges retained, and it is gated on the folio being `open`
  (`folios.js:348`).
- The schema already anticipates the feature: `pos_transactions` carries
  `void_reason`, `voided_by`, `voided_at`, `refunded_amount`, `refunded_at`,
  `refunded_by` (`backend/migrations/0004_pos.sql:144-149`, carried forward by
  the 0112 rebuild at `:226-231`) — **and nothing in `backend/src` writes any of
  them** (`grep -rn 'void_reason|voided_by|refunded_amount|refunded_by'
  backend/src` → 1 hit, and it is `folio_charges.voided_at` in `folios.js:250`, a
  different table). The POS sale INSERT writes `status` and `payment_status` as
  the literal `'completed'` (`routes/pos/index.js:806,:810`).
- So the `status != 'voided'` filters at `routes/pos/index.js:1163,:1168,:1308`
  are **defensive exclusions for a value no writer produces**. They are not
  evidence that voids work.
- No partial refund, no Paymob refund call, no `refunds` ledger table.
- Booking-order tips persist (`PATCH /api/orders/:id/tip`, `orders.js:1382`);
  POS tips are receipt-only — see item 3, which has since shipped.

## Next cycle
1. `refunds` table (order_id, amount, reason, actor, created_at) + `POST /api/orders/:id/refund` (admin/manager, amount ≤ paid, idempotent key).
2. Paymob refund path behind `PM_ENABLED=true` only; mock path stays 501.
3. POS tip persistence: **DONE** — `backend/migrations/0120_add_tip_amount_to_pos_transactions.sql:35`
   added `tip_amount REAL DEFAULT 0` and the POS sale INSERT binds it
   (`routes/pos/index.js:819`). **Still open: surface in reports** —
   `tip_amount` appears in neither `reports.js` nor `admin-reports.js` nor
   `ReportsPanel.tsx`.
4. E-wallet/Instapay live only after ledger + webhook HMAC coverage; docs already mark planned-not-live.

## A11y / Perf notes
- F-A19 / F-A20 IDs do not exist in repo (DEEP_AUDIT uses C/W scheme) — no per-component commits to make.
- Island discipline is recorded in `docs/01-architecture/ARCHITECTURE.md` §3
  ("React 19 islands"): **9 public-facing island sites**, not 4 — `client:visible`
  ×6 (`TenantLanding.astro:203`, `marketplace.astro:14`, and the four storefront
  pages) + `client:load` ×3 (`BookPage.astro:45` `ReservationSummary`,
  `MenuPage.astro:48` `TenantMenu`, `PublicLayout.astro:778` debug-gated widget),
  plus 8 `client:only` SPA hosts; 17 directive sites total. Default
  `client:visible` for content islands, `client:load` only for above-fold primary
  interactive content. (This line previously said "4 islands" and cited a bare
  `ARCHITECTURE.md`, which no longer resolves from this folder.)
