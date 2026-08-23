# SinaiCamps Enhancement Audit

**Date:** 2026-08-07
**Author:** @orchestrator
**Status:** Complete Audit

---

## Executive Summary

The SinaiCamps platform has completed its foundational architecture (Admin SPA with 15 TanStack Query panels, 8-view POS, Marketplace with zone routing, and 3,500+ tests). This audit identifies **all remaining enhancements** across the full codebase, categorized by effort, impact, and dependencies.

---

## Current State

| Layer | Status |
|-------|--------|
| **Frontend (Admin SPA)** | 15 panels, TanStack Query, SSE wiring |
| **Frontend (POS)** | 8 views, code-split, Zustand cart |
| **Frontend (Public)** | 3-island Astro, zone-aware routing |
| **Backend API** | 9 modules + 8 POS routes |
| **Database** | 53 migrations, ~60 tables (24 dead) |
| **Tests** | 2,285 unit + 566 E2E |
| **Deployment** | Unified deploy.sh, Cloudflare Pages + Workers |

---

## Enhancement Map

### 🔴 CRITICAL — Core Gaps

| # | Enhancement | Category | Effort | Impact | Files |
|---|------------|----------|--------|--------|-------|
| 1 | **7 orphaned POS API functions** — frontend calls handlers that don't exist on backend | Backend | Easy | Critical | `backend/src/routes/pos/posRoutes.js`, `app/src/lib/api.ts` |
| 2 | **24 dead POS tables** — schema bloat, confusion, wasted migration slots | Database | Medium | Critical | `backend/migrations/` |
| 3 | **POS void/refund flow** — no way to cancel or refund orders | Backend+Frontend | Medium | Critical | `backend/src/routes/pos/posRoutes.js`, `app/src/components/pos/OrderView.tsx` |
| 4 | **Email notification service** — removed as dead code, never rebuilt | Backend | Hard | Critical | `backend/src/` (new module) |

### 🟠 HIGH — Feature Completeness

| # | Enhancement | Category | Effort | Impact | Files |
|---|------------|----------|--------|--------|-------|
| 5 | **POS real-time order notifications** — Broadcaster DO exists, SSE client exists, not wired | Backend+Frontend | Medium | High | `backend/src/services/broadcaster.js`, `app/src/hooks/useSseOrders.ts` |
| 6 | **POS reports/analytics** — stub endpoint, no aggregation queries | Backend+Frontend | Medium | High | `backend/src/routes/pos/posRoutes.js`, `app/src/components/pos/Reports.tsx` |
| 7 | **POS customer management** — `pos_customers` table exists but dead | Backend+Frontend | Medium | High | `backend/src/routes/pos/posRoutes.js`, `app/src/components/pos/Customers.tsx` |
| 8 | **POS inventory management** — `pos_inventory` table exists but dead | Backend+Frontend | Medium | High | `backend/src/routes/pos/posRoutes.js`, `app/src/components/pos/Inventory.tsx` |
| 9 | **POS staff management** — `pos_users` table exists, minimal backend support | Backend+Frontend | Medium | High | `backend/src/routes/pos/posRoutes.js`, `app/src/components/pos/Staff.tsx` |
| 10 | **Admin calendar view** — BookingCalendar.tsx is basic, needs full calendar | Frontend | Medium | High | `app/src/components/admin/BookingCalendar.tsx` |
| 11 | **Bulk order operations** — check-in/out, status change, export | Backend+Frontend | Medium | High | `backend/src/api/orders.js`, `app/src/components/admin/OrdersPanel.tsx` |
| 12 | **Stripe payment integration** — webhook stubs exist, no real flow | Backend+Frontend | Hard | High | `backend/src/api/payments.js`, `app/src/lib/api.ts` |
| 13 | **Admin activity audit log viewer** — `pos_audit_logs` table exists but dead | Backend+Frontend | Medium | High | `backend/src/api/admin.js`, new panel |

### 🟡 MEDIUM — Polish & DX

| # | Enhancement | Category | Effort | Impact | Files |
|---|------------|----------|--------|--------|-------|
| 14 | **Receipt reprinting** — receipt template exists in POSApp.tsx, needs standalone component | Frontend | Easy | Medium | `app/src/components/pos/Receipt.tsx` (new) |
| 15 | **Admin dashboard stat cards** — some use hardcoded placeholders | Frontend | Easy | Medium | `app/src/components/admin/DashboardPanel.tsx` |
| 16 | **Deployment health checks** — add response time + uptime monitoring | DevOps | Easy | Medium | `deploy.sh` |
| 17 | **Multi-language translation admin panel** — `product_lang`/`category_lang` tables exist | Backend+Frontend | Hard | Medium | new panel |
| 18 | **Real-time admin dashboard updates via SSE** — wiring exists for inbox/orders, not dashboard | Backend+Frontend | Medium | Medium | `app/src/hooks/useSseInbox.ts` |
| 19 | **Inventory stock tracking with deductions on sales** — needs trigger or service logic | Backend+DB | Medium | Medium | `backend/src/routes/pos/posRoutes.js`, migration |
| 20 | **Recipe/ingredient management** — `pos_recipe_ingredients` table exists, 1 backend ref | Backend+Frontend | Medium | Medium | `backend/src/routes/pos/posRoutes.js` |

### 🟢 LOW — Nice-to-Have

| # | Enhancement | Category | Effort | Impact | Files |
|---|------------|----------|--------|--------|-------|
| 21 | **POS mobile mode / PWA** — service worker, offline support | Frontend+DevOps | Very Hard | Medium | `app/public/manifest.json`, service worker |
| 22 | **Customer loyalty program** — `pos_loyalty_programs` table exists but dead | Backend+Frontend | Hard | Low | new module |
| 23 | **AI-powered demand forecasting** — future feature | Backend+Frontend | Very Hard | Low | new module |
| 24 | **Advanced analytics with charts and export** — needs chart library | Frontend | Hard | Low | new component |
| 25 | **Multi-tenant POS with store-level isolation** — `pos_stores` table exists but dead | Backend+Frontend | Very Hard | Low | major refactor |

---

## Detailed Enhancement Specifications

### Enhancement #1: 7 Orphaned POS API Functions

**Problem:** Frontend `app/src/lib/api.ts` defines 7 functions that POST/PUT/DELETE to `/pos/*` endpoints that don't exist on the backend:

```
posCreateCustomer     → POST /pos/customers          (404)
posCreateOrderItem    → POST /pos/orders/:id/items    (404)
posDeleteOrderItem    → DELETE /pos/orders/:id/items/:itemId (404)
posGetOrderItem       → GET /pos/orders/:id/items/:itemId  (404)
posGetOrderItems      → GET /pos/orders/:id/items    (404)
posGetProductCategories → GET /pos/products/categories (404)
posUpdateOrderItem    → PUT /pos/orders/:id/items/:itemId  (404)
```

**Solution:**
1. Add route handlers in `backend/src/routes/pos/posRoutes.js` for each
2. `posCreateCustomer` → INSERT into `customers` table (reuse existing)
3. `posCreateOrderItem` → INSERT into `pos_transaction_items` (validate order exists, recalculate totals)
4. `posDeleteOrderItem` → DELETE + recalculate
5. `posGetOrderItems` → SELECT from `pos_transaction_items` WHERE order_id = ?
6. `posGetOrderItem` → SELECT single item
7. `posGetProductCategories` → SELECT DISTINCT category from `pos_products`
8. `posUpdateOrderItem` → UPDATE quantity/price + recalculate

**Files:**
- `backend/src/routes/pos/posRoutes.js` — add 7 route handlers
- `backend/src/routes/pos/__tests__/posRoutes.test.js` — add tests

**Effort:** Easy (1-2 hours)
**Impact:** Critical — removes 7 silent failures

---

### Enhancement #2: Dead POS Table Cleanup

**Problem:** 24 tables from migration 0010 are never queried:

```
pos_organizations, pos_stores, pos_user_sessions, pos_audit_logs,
pos_categories, pos_brands, pos_suppliers, pos_product_variants,
pos_inventory, pos_stock_movements, pos_stock_adjustments,
pos_stock_adjustment_items, pos_customers, pos_customer_addresses,
pos_loyalty_programs, pos_loyalty_transactions, pos_payments,
pos_payment_methods, pos_refunds, pos_return_items, pos_returns,
pos_quotes, pos_quote_items, pos_work_orders
```

**Solution:**
- **Option A (Recommended):** Create migration 0054 to DROP all 24 dead tables
- **Option B:** Keep `pos_audit_logs`, `pos_customers`, `pos_inventory`, `pos_stock_movements` for future use (4 tables), drop the rest (20 tables)

**Files:**
- `backend/migrations/0054_drop_dead_pos_tables.sql` (new)
- `backend/migrations/SCHEMA_DIRECTION_PLAN.md` — update status

**Effort:** Medium (30 min + testing)
**Impact:** Critical — reduces schema from ~60 to ~36 tables

---

### Enhancement #3: POS Void/Refund Flow

**Problem:** No way to void or refund POS orders. Once created, orders are immutable.

**Solution:**
1. **DB Migration 0055:** Add `void_reason TEXT`, `voided_at TEXT`, `refunded_at TEXT`, `refund_amount REAL` to `pos_transactions`
2. **Backend:** Add `POST /pos/orders/:id/void` and `POST /pos/orders/:id/refund` endpoints
3. **Frontend:** Add "Void" and "Refund" buttons to OrderDetail view with confirmation dialog
4. **Business Rules:**
   - Void: Only for today's orders, sets status to 'voided', records reason
   - Refund: Partial or full, records amount, does NOT restock inventory (manual process)

**Files:**
- `backend/migrations/0055_pos_void_refund.sql` (new)
- `backend/src/routes/pos/posRoutes.js` — add void/refund handlers
- `app/src/components/pos/OrderView.tsx` — add Void/Refund UI
- `backend/src/routes/pos/__tests__/posRoutes.test.js` — add tests

**Effort:** Medium (4-6 hours)
**Impact:** Critical — essential for POS operations

---

### Enhancement #4: Email Notification Service

**Problem:** Email sending was removed as dead code (backend had nodemailer + SMTP). No transactional emails for bookings, password resets, or leads.

**Solution:**
1. **Option A (Recommended):** Use Cloudflare Email Workers (free tier: 100 emails/day)
2. **Option B:** Use Resend API (free tier: 100 emails/day)
3. **Backend Module:** Create `backend/src/services/emailService.js`
4. **Templates:** Booking confirmation, password reset, lead notification, admin alert
5. **Integration Points:**
   - `POST /api/orders` → send booking confirmation
   - `POST /api/auth/forgot-password` → send reset link
   - `POST /api/leads` → send lead notification to admin
   - `POST /api/admin/tenants` → send welcome email

**Files:**
- `backend/src/services/emailService.js` (new)
- `backend/src/api/auth.js` — integrate password reset email
- `backend/src/api/orders.js` — integrate booking confirmation
- `backend/src/api/leads.js` — integrate lead notification
- `backend/wrangler.toml` — add email binding
- `app/src/lib/api.ts` — no changes (backend-only)

**Effort:** Hard (8-12 hours)
**Impact:** Critical — essential for user experience

---

### Enhancement #5: POS Real-Time Order Notifications

**Problem:** Broadcaster DO exists (`backend/src/services/broadcaster.js`), SSE client exists (`app/src/hooks/useSseOrders.ts`), but they're not wired for POS orders.

**Solution:**
1. **Backend:** In `posCreateOrder` handler, after inserting order, broadcast via Broadcaster DO
2. **Frontend:** POS app subscribes to SSE channel `pos-orders-{tenantId}`
3. **UI:** Show toast notification when new order arrives, auto-refresh order list

**Files:**
- `backend/src/routes/pos/posRoutes.js` — add broadcast after order creation
- `backend/src/services/broadcaster.js` — verify channel naming
- `app/src/hooks/useSseOrders.ts` — verify POS subscription
- `app/src/components/pos/OrderView.tsx` — add toast on new order

**Effort:** Medium (3-4 hours)
**Impact:** High — real-time POS experience

---

### Enhancement #6: POS Reports/Analytics

**Problem:** `GET /pos/reports` returns empty object `{}`. No aggregation queries.

**Solution:**
1. **Backend:** Add SQL aggregation queries for:
   - Daily/weekly/monthly revenue
   - Top selling products
   - Sales by category
   - Sales by payment method
   - Hourly sales distribution
2. **Frontend:** Enhance Reports.tsx with date range picker and charts (use `recharts` or `chart.js`)

**Files:**
- `backend/src/routes/pos/posRoutes.js` — add report aggregation queries
- `app/src/components/pos/Reports.tsx` — add date picker and charts
- `app/package.json` — add chart library dependency

**Effort:** Medium (6-8 hours)
**Impact:** High — essential for business insights

---

### Enhancement #7: POS Customer Management

**Problem:** `GET /pos/customers` returns `{ customers: [] }`. `pos_customers` table exists but is dead.

**Solution:**
1. **Backend:** Implement full CRUD for `customers` table (reuse existing `customers` table, not `pos_customers`)
2. **Frontend:** Enhance Customers.tsx with:
   - Customer list with search
   - Add/edit customer form
   - Customer order history
   - Link customer to order at checkout

**Files:**
- `backend/src/routes/pos/posRoutes.js` — add customer CRUD handlers
- `app/src/components/pos/Customers.tsx` — enhance UI
- `app/src/components/pos/Cart.tsx` — add customer selection

**Effort:** Medium (4-6 hours)
**Impact:** High — essential for CRM

---

### Enhancement #8: POS Inventory Management

**Problem:** `GET /pos/inventory` returns `{ inventory: [] }`. `pos_inventory` table exists but is dead.

**Solution:**
1. **Backend:** Implement inventory CRUD with stock tracking
2. **Frontend:** Enhance Inventory.tsx with:
   - Stock level display
   - Stock adjustment form (manual + on sale)
   - Low stock alerts
   - Stock movement history

**Files:**
- `backend/src/routes/pos/posRoutes.js` — add inventory handlers
- `app/src/components/pos/Inventory.tsx` — enhance UI
- `backend/migrations/0056_pos_inventory.sql` (optional, if restructuring needed)

**Effort:** Medium (6-8 hours)
**Impact:** High — essential for stock management

---

### Enhancement #9: POS Staff Management

**Problem:** `GET /pos/staff` returns `{ staff: [] }`. `pos_users` table exists with minimal backend support.

**Solution:**
1. **Backend:** Implement staff CRUD with role management
2. **Frontend:** Enhance Staff.tsx with:
   - Staff list with roles
   - Add/edit staff form
   - Role-based permissions display
   - Shift history per staff member

**Files:**
- `backend/src/routes/pos/posRoutes.js` — add staff CRUD handlers
- `app/src/components/pos/Staff.tsx` — enhance UI

**Effort:** Medium (4-6 hours)
**Impact:** High — essential for HR management

---

### Enhancement #10: Admin Calendar View

**Problem:** `BookingCalendar.tsx` is a basic month view with dots. No drag-drop, no room view, no week view.

**Solution:**
1. **Frontend:** Enhance with:
   - Week/day/month views
   - Drag-drop booking rescheduling
   - Room-based swim lanes
   - Color-coded by status
   - Quick booking from calendar

**Files:**
- `app/src/components/admin/BookingCalendar.tsx` — major refactor
- `app/src/components/admin/CalendarView.tsx` (new, if splitting)

**Effort:** Medium (8-10 hours)
**Impact:** High — essential for operations

---

### Enhancement #11: Bulk Order Operations

**Problem:** No way to check-in/out multiple orders, change status in bulk, or export.

**Solution:**
1. **Backend:** Add `POST /api/orders/bulk` endpoint for:
   - Bulk status change
   - Bulk check-in/out
   - Bulk export (CSV)
2. **Frontend:** Add checkboxes to OrdersPanel, bulk action dropdown

**Files:**
- `backend/src/api/orders.js` — add bulk endpoint
- `app/src/components/admin/OrdersPanel.tsx` — add bulk UI

**Effort:** Medium (4-6 hours)
**Impact:** High — essential for efficiency

---

### Enhancement #12: Stripe Payment Integration

**Problem:** Webhook stubs exist (`backend/src/api/payments.js`) but no real Stripe flow.

**Solution:**
1. **Backend:** Implement Stripe Checkout Sessions, webhooks for payment events
2. **Frontend:** Redirect to Stripe Checkout, handle return
3. **Database:** Add `stripe_session_id` to orders table

**Files:**
- `backend/src/api/payments.js` — implement Stripe integration
- `backend/wrangler.toml` — add STRIPE_SECRET_KEY secret
- `app/src/pages/camp/[id]/book.astro` — add Stripe checkout button

**Effort:** Hard (10-14 hours)
**Impact:** High — essential for payments

---

### Enhancement #13: Admin Activity Audit Log Viewer

**Problem:** `pos_audit_logs` table exists but is dead. No way to view admin actions.

**Solution:**
1. **Backend:** Log all admin actions (create/update/delete) to `pos_audit_logs`
2. **Frontend:** New AdminLog panel with:
   - Action list with filters (user, action, date)
   - Action detail view
   - Export to CSV

**Files:**
- `backend/src/api/admin.js` — add audit logging middleware
- `app/src/components/admin/AdminLog.tsx` (new)
- `app/src/pages/admin/[...rest].astro` — add route

**Effort:** Medium (6-8 hours)
**Impact:** High — essential for compliance

---

### Enhancement #14: Receipt Reprinting

**Problem:** Receipt template exists in POSApp.tsx but is not a standalone component.

**Solution:**
1. **Frontend:** Extract receipt into `Receipt.tsx` component
2. **Add:** Print button to OrderView
3. **Add:** Receipt history in order detail

**Files:**
- `app/src/components/pos/Receipt.tsx` (new)
- `app/src/components/pos/OrderView.tsx` — add print button

**Effort:** Easy (1-2 hours)
**Impact:** Medium — nice for operations

---

### Enhancement #15: Admin Dashboard Stat Cards

**Problem:** Some stat cards use hardcoded placeholders.

**Solution:**
1. **Backend:** Add aggregation endpoints for dashboard stats
2. **Frontend:** Wire stat cards to real data

**Files:**
- `backend/src/api/admin.js` — add dashboard stats endpoint
- `app/src/components/admin/DashboardPanel.tsx` — wire to API

**Effort:** Easy (2-3 hours)
**Impact:** Medium — polish for admin experience

---

### Enhancement #16: Deployment Health Checks

**Problem:** Health checks are basic curl requests.

**Solution:**
1. **deploy.sh:** Add response time measurement, uptime tracking, error rate monitoring
2. **Add:** Post-deploy smoke test suite

**Files:**
- `deploy.sh` — enhance health check section

**Effort:** Easy (1-2 hours)
**Impact:** Medium — better deployment reliability

---

### Enhancement #17: Multi-Language Translation Admin Panel

**Problem:** `product_lang`, `category_lang`, `meal_categories_lang`, `meal_lang` tables exist but no UI to manage translations.

**Solution:**
1. **Backend:** Add CRUD endpoints for translation tables
2. **Frontend:** New Translations panel with:
   - Language selector
   - Translation grid (source → target)
   - Import/export CSV
   - Auto-translate (optional, via API)

**Files:**
- `backend/src/api/admin.js` — add translation endpoints
- `app/src/components/admin/Translations.tsx` (new)
- `app/src/pages/admin/[...rest].astro` — add route

**Effort:** Hard (10-14 hours)
**Impact:** Medium — essential for multi-language support

---

### Enhancement #18: Real-Time Admin Dashboard Updates via SSE

**Problem:** SSE wiring exists for inbox/orders, not dashboard.

**Solution:**
1. **Backend:** Broadcast dashboard stat changes (new order, new lead)
2. **Frontend:** DashboardPanel subscribes to SSE, auto-updates stats

**Files:**
- `backend/src/api/admin.js` — add broadcast after stat changes
- `app/src/components/admin/DashboardPanel.tsx` — subscribe to SSE

**Effort:** Medium (3-4 hours)
**Impact:** Medium — nice for real-time dashboard

---

### Enhancement #19: Inventory Stock Tracking with Deductions

**Problem:** No automatic stock deduction on POS sales.

**Solution:**
1. **Backend:** In `posCreateOrder`, after inserting items, decrement `pos_products.stock_quantity`
2. **Add:** Low stock alert threshold per product
3. **Add:** Stock movement logging

**Files:**
- `backend/src/routes/pos/posRoutes.js` — add stock deduction logic
- `backend/src/routes/pos/__tests__/posRoutes.test.js` — add tests

**Effort:** Medium (3-4 hours)
**Impact:** Medium — essential for inventory accuracy

---

### Enhancement #20: Recipe/Ingredient Management

**Problem:** `pos_recipe_ingredients` table exists, 1 backend ref, no UI.

**Solution:**
1. **Backend:** Add CRUD for recipe ingredients
2. **Frontend:** Add recipe editor to product management

**Files:**
- `backend/src/routes/pos/posRoutes.js` — add recipe endpoints
- `app/src/components/pos/Products.tsx` — add recipe section

**Effort:** Medium (4-6 hours)
**Impact:** Medium — useful for food service

---

### Enhancement #21: POS Mobile Mode / PWA

**Problem:** No mobile optimization, no offline support.

**Solution:**
1. **Frontend:** Add service worker for offline caching
2. **Add:** Web app manifest for installability
3. **Add:** Responsive breakpoints for mobile POS

**Files:**
- `app/public/manifest.json` (new)
- `app/public/sw.js` (new)
- `app/src/components/pos/POSApp.tsx` — add responsive styles

**Effort:** Very Hard (20+ hours)
**Impact:** Medium — essential for mobile POS

---

### Enhancement #22: Customer Loyalty Program

**Problem:** `pos_loyalty_programs` and `pos_loyalty_transactions` tables exist but dead.

**Solution:**
1. **Backend:** Implement points accrual and redemption
2. **Frontend:** Loyalty dashboard, points balance display

**Files:**
- `backend/src/routes/pos/posRoutes.js` — add loyalty endpoints
- `app/src/components/pos/Customers.tsx` — add loyalty section

**Effort:** Hard (10-14 hours)
**Impact:** Low — nice for retention

---

### Enhancement #23: AI-Powered Demand Forecasting

**Problem:** No predictive analytics.

**Solution:**
1. **Backend:** Use historical sales data to predict demand
2. **Frontend:** Forecasting dashboard with charts

**Files:**
- `backend/src/services/forecasting.js` (new)
- `app/src/components/admin/Forecasting.tsx` (new)

**Effort:** Very Hard (40+ hours)
**Impact:** Low — future feature

---

### Enhancement #24: Advanced Analytics with Charts

**Problem:** No chart visualization in admin.

**Solution:**
1. **Frontend:** Add `recharts` or `chart.js` dependency
2. **Add:** Revenue chart, booking trend chart, occupancy chart

**Files:**
- `app/package.json` — add chart library
- `app/src/components/admin/DashboardPanel.tsx` — add charts

**Effort:** Hard (8-10 hours)
**Impact:** Low — nice for insights

---

### Enhancement #25: Multi-Tenant POS with Store-Level Isolation

**Problem:** `pos_stores` table exists but dead. POS is org-level, not store-level.

**Solution:**
1. **Database:** Add `store_id` to `pos_transactions`, `pos_products`, `pos_shifts`
2. **Backend:** Add store-level filtering to all POS queries
3. **Frontend:** Store selector in POS app

**Files:**
- `backend/migrations/0057_pos_store_isolation.sql` (new)
- `backend/src/routes/pos/posRoutes.js` — add store filtering
- `app/src/components/pos/POSApp.tsx` — add store selector

**Effort:** Very Hard (30+ hours)
**Impact:** Low — future feature

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)
- [ ] Enhancement #1: Fix 7 orphaned POS API functions
- [ ] Enhancement #2: Clean up 24 dead POS tables
- [ ] Enhancement #3: POS void/refund flow
- [ ] Enhancement #19: Inventory stock tracking

### Phase 2: Feature Completeness (Week 2-3)
- [ ] Enhancement #5: POS real-time order notifications
- [ ] Enhancement #6: POS reports/analytics
- [ ] Enhancement #7: POS customer management
- [ ] Enhancement #8: POS inventory management
- [ ] Enhancement #9: POS staff management

### Phase 3: Admin Polish (Week 4)
- [ ] Enhancement #10: Admin calendar view
- [ ] Enhancement #11: Bulk order operations
- [ ] Enhancement #13: Admin activity audit log viewer
- [ ] Enhancement #15: Admin dashboard stat cards
- [ ] Enhancement #18: Real-time admin dashboard updates

### Phase 4: Integrations (Week 5-6)
- [ ] Enhancement #4: Email notification service
- [ ] Enhancement #12: Stripe payment integration
- [ ] Enhancement #17: Multi-language translation admin panel

### Phase 5: Advanced Features (Week 7+)
- [ ] Enhancement #14: Receipt reprinting
- [ ] Enhancement #16: Deployment health checks
- [ ] Enhancement #20: Recipe/ingredient management
- [ ] Enhancement #21: POS mobile mode / PWA
- [ ] Enhancement #22: Customer loyalty program

### Phase 6: Future Features (Backlog)
- [ ] Enhancement #23: AI-powered demand forecasting
- [ ] Enhancement #24: Advanced analytics with charts
- [ ] Enhancement #25: Multi-tenant POS with store-level isolation

---

## Effort Summary

| Effort Level | Count | Total Hours (Est.) |
|--------------|-------|-------------------|
| Easy | 4 | 6-9 hours |
| Medium | 13 | 60-85 hours |
| Hard | 6 | 56-78 hours |
| Very Hard | 3 | 90+ hours |
| **Total** | **26** | **212-272 hours** |

---

## Dependencies

```
Enhancement #1 (POS API fixes) → No dependencies
Enhancement #2 (Dead tables) → No dependencies
Enhancement #3 (Void/refund) → Depends on #1
Enhancement #4 (Email) → No dependencies
Enhancement #5 (POS SSE) → No dependencies
Enhancement #6 (POS reports) → Depends on #1
Enhancement #7 (POS customers) → Depends on #1
Enhancement #8 (POS inventory) → Depends on #1, #2
Enhancement #9 (POS staff) → Depends on #1
Enhancement #10 (Calendar) → No dependencies
Enhancement #11 (Bulk ops) → No dependencies
Enhancement #12 (Stripe) → Depends on #4
Enhancement #13 (Audit log) → Depends on #2
Enhancement #14 (Receipt) → No dependencies
Enhancement #15 (Dashboard stats) → No dependencies
Enhancement #16 (Health checks) → No dependencies
Enhancement #17 (Translations) → Depends on #2
Enhancement #18 (Real-time dashboard) → No dependencies
Enhancement #19 (Stock tracking) → Depends on #1
Enhancement #20 (Recipes) → Depends on #1
Enhancement #21 (PWA) → No dependencies
Enhancement #22 (Loyalty) → Depends on #7
Enhancement #23 (AI forecasting) → Depends on #6
Enhancement #24 (Charts) → No dependencies
Enhancement #25 (Store isolation) → Depends on #2
```

---

## Recommendations

1. **Start with Phase 1** — These are critical fixes that unblock everything else
2. **Enhancement #1 is the highest priority** — It's the easiest fix with the highest impact
3. **Enhancement #2 should follow immediately** — Reduces schema confusion for all future work
4. **Enhancement #4 (email) can be deferred** — It's hard but not blocking other features
5. **Phase 6 features are backlog** — Only implement if requested by users

---

*Audit complete. Ready to spawn tmp agents for implementation.*