# Restaurant Management Guide

This guide covers table management, reservations, kitchen workflow, and billing for restaurant operations in SinaiCamps.

---

## Table Management

### Creating Tables

Navigate to the **Tables** section in the admin panel:

1. Click **Add Table**
2. Configure the table:
   - **Name** — Table identifier (e.g., "Table 1", "Patio A")
   - **Capacity** — Maximum number of seats
   - **Section** — Assign to a section (Indoor, Outdoor, Private, etc.)
   - **Status** — Initial status (available, reserved, occupied, cleaning)
3. Save the table

### Sections

Organize tables into sections for logical grouping:

| Section | Description |
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

1. Open the **Reservations** panel
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
| **confirmed** | Reservation is active and table is held |
| **seated** | Guest has arrived and is seated |
| **completed** | Meal finished, table released |
| **released** | Reservation cancelled before seating |
| **no-show** | Guest did not arrive within the grace period |

---

## Kitchen Workflow

### Course Sequencing

Meals are organized into courses for kitchen management:

1. **Appetizer** — First course (starters, soups, salads)
2. **Main** — Second course (entrees, primary dishes)
3. **Dessert** — Final course (sweets, after-dinner items)

### Managing Orders

1. Orders arrive in the kitchen queue with course indicators
2. Kitchen staff mark courses as **preparing** → **ready** → **served**
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

Tips are added during payment processing:

1. Review the bill total
2. Add tip amount (manual entry or percentage preset)
3. Tip is included in the final charge
4. Tips are tracked in staff reports

### Payment Methods

| Method | Processing |
|--------|-----------|
| **Cash** | Enter amount, calculate change |
| **Card** | Process via card terminal |
| **E-Wallet** | Mobile payment (Vodafone Cash, etc.) |
| **Instapay** | Bank transfer via Instapay |
| **Tab** | Charge to room/reservation account |

All payment methods are recorded in the transaction log for reconciliation.
