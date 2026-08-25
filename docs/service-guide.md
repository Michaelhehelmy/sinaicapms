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

Services support custom fields via a JSON schema for booking forms:

```json
{
  "fields": [
    { "name": "group_size", "type": "number", "label": "Group Size", "min": 1, "max": 20 },
    { "name": "pickup_time", "type": "time", "label": "Preferred Pickup Time" },
    { "name": "dietary", "type": "select", "label": "Dietary Requirements", "options": ["None", "Vegetarian", "Vegan", "Halal"] }
  ]
}
```

This schema drives the dynamic booking form on the public portal.

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
| **Season** | Summer rate vs. winter rate |
| **Weekday/Weekend** | Different rates for peak days |
| **Group Size** | Discounts for larger parties |
| **Early Bird** | Advance booking discounts |

Each tier specifies a price override and the conditions under which it applies.

---

## Bookings Management

### Booking Status Lifecycle

Service bookings follow a status workflow:

| Status | Description |
|--------|-------------|
| **pending** | Awaiting confirmation from staff |
| **confirmed** | Booking accepted, slot reserved |
| **in-progress** | Service is being delivered |
| **completed** | Service finished successfully |
| **cancelled** | Booking cancelled by guest or staff |
| **no-show** | Guest did not appear |

### Worker Assignment

Assign staff members to service bookings:

1. Open the booking
2. Click **Assign Worker**
3. Select from available staff with the right skills
4. The worker receives the assignment in their dashboard

Worker assignments help track performance and manage scheduling.

### Viewing Bookings

The **Bookings** panel provides:

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

- View all reviews with average ratings
- Respond to guest feedback
- Flag inappropriate reviews
- Track review trends over time

Reviews appear on the public portal to help future guests choose services.

---

## Availability Calendar

### Viewing Availability

The availability calendar shows:

- **Green** — Available slots
- **Yellow** — Limited availability
- **Red** — Fully booked
- **Grey** — Unavailable (blocked dates)

### Managing Availability

1. Navigate to the **Availability** section
2. Select a service and date range
3. Block or unblock dates
4. Adjust capacity per slot
5. Save changes

Availability updates propagate to the public booking portal in real-time.
