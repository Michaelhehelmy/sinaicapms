---
title: "Camp Management Guide"
aliases:
tags:
  - type/guide
  - audience/tenant-admin
  - domain/guides
  - domain/camps
  - status/live
created: 2026-08-25
updated: 2026-10-06
relates-to:
  - "[[08-guides/README]]"
  - "[[07-data/migrations]]"
  - "[[02-api/API_SURFACE_MAP]]"
code-references:
  - "backend/src/api/camps.js:196"
  - "backend/src/api/meal-plans.js"
  - "backend/migrations/legacy/0054_fix_room_rate_plan_fk_to_pos_products.sql"
  - "backend/src/index.js:483"
  - "app/src/components/admin/CampsPanel.tsx"
  - "app/src/components/admin/RoomsPanel.tsx"
  - "app/src/lib/api.ts"
  - "app/src/components/public/CampBooking.tsx"
  - "backend/src/api/camps.js:273"
  - "backend/src/api/camps.js:752"
  - "backend/src/api/camps.js:900-916"
  - "backend/src/api/camps.js:947-964"
  - "backend/src/api/orders.js:488-492"
  - "backend/src/api/orders.js:1166"
  - "backend/src/api/orders.js:1304"
  - "backend/src/api/orders.js:1338"
  - "backend/src/api/paymob-webhook.js:33"
  - "backend/migrations/0115_rooms_new_tenant_not_null_fk.sql:91"
verified: never
---
# Camp Management Guide

This guide covers how to set up and manage a camp in SinaiCamps — from creating rooms to handling bookings and managing pricing.

---

## Setting Up a Camp

### 1. Create a Camp

Navigate to the admin dashboard at `/admin`. The **Projects** panel (nav label; code id `camps`) lets you create and manage camp entries:

1. Click **Add Camp** in the Projects panel
2. Fill in the required fields:
   - **Name** — Display name (e.g., "Acacia Camp")
   - **Location** — Geographic location
   - **Capacity** — Maximum number of guests
   - **Description** — Brief description of the camp
3. Save the camp entry

Each camp gets a unique ID and a subdomain for its public portal (e.g., `acaciacamp.sinaicamps.com`).

### 2. Create Rooms (Product Types)

Rooms represent bookable unit types within a camp:

1. Navigate to the **Rooms** panel
2. Click **Add Room**
3. Configure the room:
   - **Name** — Room type name (e.g., "Deluxe Tent", "Family Cabin")
   - **Capacity** — Number of guests this room type accommodates
   - **Base Price** — Default nightly rate
   - **Description** — Room features and amenities
4. Associate the room with a camp

### 3. Set Pricing with Rate Plans

Rate plans define pricing for specific date ranges (seasonal pricing):

1. Navigate to the **Rate Plans** panel
2. Click **Add Rate Plan**
3. Configure the plan:
   - **Name** — Plan name (e.g., "Summer 2026", "Holiday Special")
   - **Room** — Select the associated room type
   - **Price Per Night** — Nightly rate for this period
   - **Start Date** — When the rate takes effect
   - **End Date** — When the rate expires
4. Save the rate plan

Multiple rate plans can overlap; precedence logic UNVERIFIABLE — `GET rate-plans` returns all plans.

---

## Managing Bookings

### Viewing Reservations

The **Orders** panel (nav id `reservations`) shows all booking activity:

- Filter by date range, status, or guest name
- Click any reservation to view full details
- **No export.** `OrdersPanel.tsx` has no export control, and no report route
  under `/api/reports` or `/api/orders` emits CSV or a file — the only CSV in the
  backend is the super-admin report-job handler
  (`backend/src/api/admin-reports.js:249-270`).

### Check-In Process

1. Locate the reservation in the Orders panel
2. Verify guest identity and booking details
3. Click **Check In** to update the status
4. The room moves to `occupied` — `PATCH /api/orders/:id/checkin`
   (`backend/src/api/orders.js:1166`) writes `status` **and** `room_status` at
   `:1291`. The room was `reserved` only if its order had been moved to
   `confirmed`; assigning a `room_id` to an order directly also lands it
   `occupied` (`:1288-1293`).

### Check-Out Process

1. Open the completed reservation
2. Review any additional charges (minibar, services)
3. Click **Check Out**
4. `PATCH /api/orders/:id/checkout` (`orders.js:1304`) sets `room_status` to
   **`available`** and `cleaning_status` to `dirty` in one statement
   (`:1338`) — it does **not** pass the room through `cleaning`
5. Housekeeping clears `cleaning_status` via `PATCH /api/rooms/:id/cleaning`
   (`backend/src/api/camps.js:900`), which touches `cleaning_status` only. The
   room is already `available`, so there is no status flip to wait on.

---

## Room Status Lifecycle

`rooms_new` carries **two** independent lifecycle columns, and conflating them is
the single most common misreading of this table.

| Column | Who writes it | Values |
|---|---|---|
| `room_status` | booking lifecycle (automatic) **and** the manual status endpoint | `available`, `reserved`, `occupied`, `cleaning`, `out_of_service` |
| `cleaning_status` | the cleaning endpoint only | `dirty`, `in_progress`, `clean`, `inspected` |

### The booking-driven cycle (automatic)

```
available → reserved → occupied → cleaning
```

`ROOM_STATUS_BY_ORDER_STATUS` (`backend/src/api/orders.js:488-492`) is the whole
table — one entry per order state, `pending` and unknown states leave the room
untouched:

| Order state | `room_status` becomes | Where |
|---|---|---|
| `confirmed` | `reserved` | `orders.js:573` (also `paymob-webhook.js:33` on payment) |
| `checked_in` | `occupied` | `orders.js:1291` — `PATCH /api/orders/:id/checkin` also writes the legacy `status` column |
| `checked_out` | `cleaning` | `orders.js:573` via the same map |
| `cancelled` | `available` | `orders.js:578-590`, **guarded** — only when no other non-cancelled booking still holds the room; writes both columns |

Order **deletion** also frees the room, same guard (`orders.js:452-463`), and the
`status != 'voided'` folio filters at `reports.js:493` keep voided folios out.

### The manual endpoint (admin override)

`PATCH /api/rooms/:id/status` (`backend/src/api/camps.js:946-961`) accepts **five**
values — `camps.js:952`:

```js
const allowed = ['available', 'reserved', 'occupied', 'cleaning', 'out_of_service'];
```

and writes **both** `status` and `room_status` (`:955`). `out_of_service` is
**manual-only**: no booking state maps to it, so it is reachable only through this
endpoint. The `status` column has **no** DB `CHECK` — the five-value list above is
the only enumeration that exists.

### `cleaning_status` is a separate axis, and it never moves the room

`PATCH /api/rooms/:id/cleaning` (`camps.js:900-916`) writes **only**
`cleaning_status`, against its own four-value list (`camps.js:906`). This column
**is** enforced by the schema (`CHECK(cleaning_status IN ('dirty','in_progress',
'clean','inspected'))`, e.g. `0115_rooms_new_tenant_not_null_fk.sql:91`), so a wider
value is a 500 rather than a silent drop.

Two consequences worth knowing before you follow the walkthrough above:

- **Checkout does not route through `cleaning`.** `PATCH /api/orders/:id/checkout`
  (`orders.js:1304`) writes `status='available'`, `room_status='available'` **and**
  `cleaning_status='dirty'` in one statement (`orders.js:1338`). A guest who
  checks out therefore leaves the room `available`, not `cleaning`; `cleaning`
  only appears when an order is moved to `checked_out` through
  `PATCH /api/orders/:id/status`.
- **Nothing converts a cleaned room back to `available`.** No writer couples the
  two columns — marking a room `clean` leaves `room_status` wherever it was. The
  only writers that set `available` are the cancel path, the delete path, the
  checkout path and the manual status endpoint, all listed above.

---

## Admin Panel Navigation

The admin dashboard is organized into panels accessible via the sidebar:

| Panel | Purpose |
|-------|---------|
| **Dashboard** | Overview stats (occupancy, revenue, recent activity) |
| **Projects** (nav label; code id `camps`) | Camp profiles and settings |
| **Rooms** | Room type management |
| **Rate Plans** | Pricing and seasonal rates |
| **Orders** (nav id `reservations`) | Booking/order management (single panel — no separate Orders row) |
| **Staff** | Staff accounts and roles |
| **Meals** | Menu and meal plan management |
| **Low Stock + Supply + Promotions** | Stock tracking (no single Inventory panel) |
| **Reports** | Revenue and occupancy analytics |
| **Settings** | Camp-level configuration |

Each panel supports full CRUD operations via the admin API. All changes are persisted immediately to D1.
