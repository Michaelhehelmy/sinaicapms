---
title: "Service Management Guide"
aliases:
tags:
  - type/guide
  - audience/tenant-admin
  - domain/guides
  - domain/services
  - status/live
created: 2026-08-25
updated: 2026-10-06
relates-to:
  - "[[08-guides/README]]"
  - "[[02-api/API_SURFACE_MAP]]"
  - "[[98-history/worksheets/audit-2026-09-15-route-gaps]]"
code-references:
  - "backend/src/api/services.js:80"
  - "backend/src/index.js:579"
  - "app/src/components/admin/ServicesPanel.tsx"
  - "app/src/components/admin/ServiceBookingsPanel.tsx"
  - "backend/src/api/services.js:90"
  - "backend/src/api/services.js:143"
  - "backend/src/api/services.js:210"
  - "backend/src/api/services.js:318"
  - "backend/src/api/services.js:370"
  - "backend/src/api/services.js:441"
verified: never
---
# Service Management Guide

This guide covers setting up and managing bookable services in SinaiCamps — tours, activities, spa treatments, equipment rentals, and more.

---

## Service Definitions

### Creating a Service

Navigate to the **Services** section in the admin panel:

1. Click **Add Service**
2. Configure the service:
   - **Name** — Service name (e.g., "Desert Safari", "Snorkeling Trip")
   - **Description** — What the service includes
   - **Category** — Service type (adventure, wellness, transport, etc.)
   - **Duration** — Expected duration
   - **Location** — Where the service takes place
3. Save the service

### Custom Fields (JSON Schema)

Each service **definition** carries a `fields_schema` column holding a JSON array
of field descriptors. What exists, all verified in the tree:

- the column — `backend/migrations/0011_services.sql:15`
  `fields_schema JSON NOT NULL DEFAULT ('[]')`
- accepted and persisted — `backend/src/api/services.js:32`
  `fields_schema: z.any().optional()` (no shape validation), `INSERT` at `:101-103`,
  `UPDATE` at `:121-122`
- served to the public catalog — `services.js:454` (SELECT) and `:482` (`JSON.parse`
  of a string column) inside `GET /api/services/public/:slug` (`services.js:441`)
- typed on the client — `app/src/lib/api.ts:1641` `fieldsSchema: unknown`

**No renderer consumes it, and no booking form is generated from it.** That
sentence used to be here and was wrong:

- `fieldsSchema` has **zero** references under `app/src/components` or
  `app/src/pages` — the single declaration at `api.ts:1641` is all there is.
- **There is no public services page.** `app/src/pages/` has no `service*` route
  in any form, so `GET /api/services/public/:slug` has no page to be the backing
  data for. Its only client wrapper, `getPublicServiceCatalog`, was **deleted** in
  `5599675` ("prune dead exports … zero production/test callers") — a
  deliberate dead-code sweep, not an oversight.
- `bookingCreateSchema` (`services.js:50-56`) has **no** field for custom values
  (`service_item_id`, `customer_name`, `customer_phone`, `scheduled_date`,
  `notes` — that is the whole list), so a booking cannot carry a custom answer
  even if something rendered one.

So today `fields_schema` is **stored and returned, never used**: it is a schema
without a form, and a form is the missing half. Authoring descriptors changes
nothing a guest sees.

---

## Service Items

### Creating Bookable Items

Each service can have multiple bookable items with different pricing:

1. Select the parent service
2. Click **Add Item**
3. Configure the item:
   - **Name** — Item name (e.g., "Adult", "Child", "VIP")
   - **Base Price** — Standard price
   - **Pricing Tiers** — Seasonal or volume-based pricing
   - **Capacity** — Maximum bookings per slot
   - **Availability** — Days and times this item is offered
4. Save the item

### Pricing Tiers

Pricing tiers allow different rates based on conditions:

| Tier Type | Example |
|-----------|---------|
| **standard / premium / luxury** | `PUT /items/:id/pricing` with `price_premium` (live — no Season/Weekday/Group/Early Bird) |

Each tier specifies a price override and the conditions under which it applies.

---

## Bookings Management

### Booking Status Lifecycle

Service bookings follow a status workflow:

| Status | Description |
|--------|-------------|
| **pending** | Awaiting confirmation |
| **confirmed** | Accepted, slot reserved |
| **en_route** | Staff en route |
| **completed** | Finished |
| **canceled** | Cancelled (single-l spelling) |

### Worker Assignment

Assign staff members to service bookings:

1. Open the booking
2. Click **Assign Worker**
3. Select from available staff with the right skills
4. The worker assignment is stored on the booking (worker dashboard inbox UNVERIFIABLE)

Worker assignments help track performance and manage scheduling.

### Viewing Bookings

The **Service Bookings** panel provides:

- Calendar view of all upcoming services
- List view with filtering (by date, status, worker)
- Quick status updates
- Guest contact information
- Special notes and requirements

---

## Reviews

### Collecting Reviews

After a service is completed, guests can leave reviews:

- **Rating** — 1 to 5 stars
- **Comment** — Free-text feedback
- **Date** — Automatically recorded

### Managing Reviews

In the admin panel:

- View all reviews with average ratings (list + create only; public catalog excludes reviews — no Respond/Flag endpoints)

---

## Availability Calendar

### Viewing Availability

The availability calendar shows raw slots (`available_date/from/to/worker_id/is_available` via `GET /items/:id/availability`) — no color thresholds, no block/capacity endpoints.

### Managing Availability

1. Navigate to the **Availability** section (no dedicated Availability panel in the admin nav — UNVERIFIABLE as a named panel; slots via `GET /items/:id/availability`, calendar surface is Booking Calendar)
2. Select a service and date range (slot CRUD as-is — no block/unblock/capacity API)

Availability updates propagate to the public booking portal in real-time.
