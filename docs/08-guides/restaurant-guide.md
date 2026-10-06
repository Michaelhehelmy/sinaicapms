---
title: "Restaurant Management Guide"
aliases:
tags:
  - type/guide
  - audience/tenant-admin
  - domain/guides
  - domain/restaurant
  - status/live
created: 2026-08-25
updated: 2026-10-06
relates-to:
  - "[[08-guides/README]]"
  - "[[supermarket-guide]]"
  - "[[02-api/API_SURFACE_MAP]]"
  - "[[98-history/sessions/ADMIN_REPAIR_REPORT_2026_09_14]]"
code-references:
  - "backend/src/api/pos-tables.js:129"
  - "backend/src/api/reservations.js:231"
  - "backend/src/routes/pos/index.js:1098"
  - "backend/src/index.js:798"
  - "backend/migrations/legacy/0069_restaurant_tables.sql"
  - "app/src/components/pos/views/TableView.tsx"
  - "app/src/components/pos/views/KitchenView.tsx"
  - "app/src/components/pos/views/OrdersView.tsx"
  - "app/src/lib/api.ts:1177"
  - "backend/src/index.js:339"
verified: never
---
# Restaurant Management Guide

This guide covers table management, reservations, kitchen workflow, and billing for restaurant operations in SinaiCamps.

---

## Table Management

### Creating Tables

Open the **Tables** view in the POS terminal (POSApp `tables` view — there is no Tables panel in the admin nav):

1. Click **Add Table**
2. Configure the table:
   - **Name** — Table identifier (e.g., "Table 1", "Patio A")
   - **Capacity** — Maximum number of seats
   - **Section** — Assign to a section (Indoor, Outdoor, Private, etc.)
   - **Status** — Initial status (available, reserved, occupied, cleaning)
3. Save the table

### Sections

Organize tables into sections (free-text label, e.g. Indoor, Outdoor…):

| Section example | Description |
|---------|-------------|
| **Indoor** | Main dining area tables |
| **Outdoor** | Patio and terrace seating |
| **Private** | VIP or private dining rooms |
| **Bar** | Bar counter seating |

Sections help staff quickly locate tables and manage seating flow.

### Table Status

Tables follow a status lifecycle:

| Status | Description |
|--------|-------------|
| **available** | Table is clean and ready for guests |
| **reserved** | Table is held for an upcoming reservation |
| **occupied** | Guests are currently seated |
| **cleaning** | Table is being cleaned after guest departure |

---

## Reservations

### Making a Reservation

1. Open the **Orders** panel (nav id `reservations`)
2. Click **New Reservation**
3. Fill in details:
   - **Guest Name** — Party name or lead guest
   - **Phone** — Contact number
   - **Date & Time** — Reservation date and time
   - **Party Size** — Number of guests
   - **Table** — Auto-suggested based on party size, or manually assigned
   - **Notes** — Special requests (e.g., birthday, dietary needs)
4. Confirm the reservation

### Releasing a Reservation

Reservations can be released (cancelled) before the scheduled time:

1. Open the reservation
2. Click **Release**
3. The table status returns to **available**
4. The reservation is marked as **released**

### Reservation Statuses

| Status | Description |
|--------|-------------|
| **reserved** | Reservation active via PATCH /:id/reserve |
| **available** | Freed via PATCH /:id/release (only-if-reserved) — no auto-suggest, no grace period |

---

## Kitchen Workflow

### Course Sequencing

Meals are organized into courses for kitchen management:

1. **Appetizer** — First course (starters, soups, salads)
2. **Main** — Second course (entrees, primary dishes)
3. **Dessert** — Final course (sweets, after-dinner items)

### Managing Orders

1. Orders arrive in the kitchen queue with course indicators
2. Kitchen staff mark per-item course as **pending → served → completed** (order-level `kitchen_status` is separate: preparing → ready → served)
3. Each course progresses independently
4. The table's order is complete when all courses are served

### Kitchen Display

The kitchen view shows:
- Pending orders grouped by table
- Course status for each item
- Time elapsed since order placement
- Priority flags for rush orders

---

## Billing

### Split Bills

Split a table's bill by items or evenly:

**By Items:**
1. Open the table's order
2. Click **Split Bill**
3. Assign each item to a guest or sub-bill
4. Process each sub-bill separately

**Evenly:**
1. Open the table's order
2. Click **Split Bill** → **Split Evenly**
3. Enter the number of splits
4. Process each portion

### Tips

Tips persist on booking orders (PATCH /orders/:id/tip); POS tips persist to `pos_transactions.tip_amount` (0120, sale binds `tipAmount || 0`) and show on the immediate receipt — not broken out in Reports (no tip handling in `admin-reports.js`).

1. Review the bill total
2. Add tip amount (manual entry or percentage preset)
3. Tip is included in the final charge

### Payment Methods

| Method | Processing |
|--------|-----------|
| **Cash** | Enter amount, calculate change |
| **Card** | Process via card terminal |
| **Split** | cash+card split (live) — Tab not implemented (use split or separate order + PATCH /orders/:id/split) |

All payment methods are recorded in the transaction log for reconciliation.
