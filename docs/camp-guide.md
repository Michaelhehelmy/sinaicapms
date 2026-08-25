# Camp Management Guide

This guide covers how to set up and manage a camp in SinaiCamps — from creating rooms to handling bookings and managing pricing.

---

## Setting Up a Camp

### 1. Create a Camp

Navigate to the admin dashboard at `/admin`. The **Camps** panel lets you create and manage camp entries:

1. Click **Add Camp** in the camps panel
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

Multiple rate plans can overlap; the most specific (date-matching) plan takes precedence.

---

## Managing Bookings

### Viewing Reservations

The **Reservations** panel shows all booking activity:

- Filter by date range, status, or guest name
- Click any reservation to view full details
- Export reservation data for external reporting

### Check-In Process

1. Locate the reservation in the Reservations panel
2. Verify guest identity and booking details
3. Click **Check In** to update the status
4. The room status transitions from `reserved` to `occupied`

### Check-Out Process

1. Open the completed reservation
2. Review any additional charges (minibar, services)
3. Click **Check Out**
4. The room status transitions from `occupied` to `cleaning`
5. Once cleaning is confirmed, the room returns to `available`

---

## Room Status Lifecycle

Rooms follow a four-state lifecycle:

```
available → reserved → occupied → cleaning → available
```

| Status | Description |
|--------|-------------|
| **available** | Room is ready for new bookings |
| **reserved** | Room is booked but guest has not arrived |
| **occupied** | Guest is currently staying in the room |
| **cleaning** | Guest has checked out; room is being prepared |

Transitions are triggered automatically by booking actions and can be manually overridden by admin users.

---

## Admin Panel Navigation

The admin dashboard is organized into panels accessible via the sidebar:

| Panel | Purpose |
|-------|---------|
| **Dashboard** | Overview stats (occupancy, revenue, recent activity) |
| **Camps** | Camp profiles and settings |
| **Rooms** | Room type management |
| **Rate Plans** | Pricing and seasonal rates |
| **Reservations** | Booking management |
| **Orders** | Guest orders and charges |
| **Staff** | Staff accounts and roles |
| **Meals** | Menu and meal plan management |
| **Inventory** | Stock tracking |
| **Reports** | Revenue and occupancy analytics |
| **Settings** | Camp-level configuration |

Each panel supports full CRUD operations via the admin API. All changes are persisted immediately to D1.
