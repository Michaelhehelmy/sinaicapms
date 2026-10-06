# SinaiCamps — Tester Guide (Human-Testing Phase)

> Truth 2026-09-21: credentials + `?debug=1` + zone hosts verified against `scripts/seed-test-users.js` and `routeZones.ts`; sub-tabs not individually re-verified.

This is the guide for **testers**. It covers the debug **Feedback widget**, the surfaces you are allowed to test, and your login credentials.

> **Boundary (read first):** Only the owner tests the **super admin dashboard** (Global Operator Mode: Tenants, All Orders, Users, System Settings, Audit Log, Subscriptions, Financials, HR, Supply Chain, CRM, Storefront, AI, Reports, System Health, Performance, Feedback). Your accounts below **cannot** open it — if you ever see a "Global Operator Mode" sidebar, log out and report it in the Feedback widget instead of poking around.

---

## 1. Your Test Credentials

Your accounts are created for you by the owner (`scripts/seed-test-users.js`). You log in with:

| Surface | Email | Password | Notes |
| --- | --- | --- | --- |
| Camp admin (`acaciacamp`) | `admin.test@acaciacamp.com` | `TestPass123!` | Tenant admin — Dashboard, Bookings, Rooms, Menu, Inventory, Users (tenant), Settings |
| POS cashier | `pos.test@acaciacamp.com` | hit **Sign In** with a blank password? **No** — POS login is by **username** `testpos` / password `pass1234` | POS terminal only |
| Public visitor | no login | — | All public/tenant pages |

> If you are a public tester you do NOT need credentials — everything from step 2 works without logging in.

---

## 2. The Debug Feedback Widget

A floating button (bottom-right of the screen) opens **"Report a testing finding"**. It captures:

- **Screenshot** — automatic capture of the current screen (downscaled; embedded in the report)
- **Message** — what happened (required)
- **Type** — `bug` (it's broken) / `missing` (something's not there) / `flow` (confusing to use)
- **Personal point of view** — optional: who you are and what you were doing

### Where the widget appears

| Surface | How to open it |
| --- | --- |
| Admin dashboard (`sinaicamps.com/admin`) | Always visible once you log in as the camp admin |
| POS terminal (`acaciacamp.com/pos`) | Always visible once you log in as the POS cashier |
| **Public pages** (marketplace + tenant sites) | Hidden by default → open the page with `?debug=1` once (e.g. `https://acaciacamp.com/rooms?debug=1`). It sets a 30-day cookie, then the widget shows on every page of that site. |

### Sending a useful report

1. Click the button, pick the **Type**, write what happened (be specific: page, step, what you expected vs. what you saw).
2. Optionally add your point of view.
3. Send. Your report lands in the owner's **Feedback** panel — you don't see it yourself.

---

### Test execution order (merged from the retired `TESTING_ROADMAP.md`, 2026-10-06)

For the fastest path through the full system:

1. **Part 1** (Super Admin) -> Steps 1-6
2. **Part 4** (Public Pages) -> Steps 29-31 (no auth, can run parallel)
3. **Part 2** (Tenant Admin) -> Steps 7-23
4. **Part 3** (POS) -> Steps 24-28
5. **Part 5** (Cross-Cutting) -> Steps 32-34

## 3. What to Test (checklist)

### Public / Marketplace (`sinaicamps.com`)
- Home page hero + camps listing (`/camps`), camp detail (`/camp/acaciacamp` — Rooms, Menu, Book)
- Booking flow: pick dates → room → confirm → checkout on a tenant host (e.g. `acaciacamp.com/book`)
- Tenant pages on a tenant custom domain: `/about`, `/rooms`, `/gallery`, `/contact`, `/faq`
- Every page on **mobile width** (the widget is touch-friendly)

### Admin (`acaciacamp.com/admin` — as the camp admin)
- Sidebar panels: Dashboard, Bookings, Rooms, Menu, Inventory, Users, Settings
- Create / edit / delete a room, menu item, or booking — confirm it persists after refresh
- Confirm the Feedback widget button is present and submits (the owner reviews it)

### POS (`acaciacamp.com/pos` — as `testpos`)
- Log in as `testpos` / `pass1234`
- Add items to a cart, create an order, apply a payment, open the drawer/end-of-day
- Check the POS grid matches the seeded products (room types + meals)

---

## 4. Notes

- The widget works with no login on public pages — the report is tagged "public". On admin/POS it attaches your logged-in identity automatically.
- Screenshots are embedded in the report (base64 JPEG) — no separate upload needed.
- The public widget is invisible to normal visitors — only people who know `?debug=1` see it.
- If a report fails to send, the widget shows an error — retry; if it persists, note the exact URL + browser to the owner.

---

## Appendix — detailed action → expected tables (steps 7–31, merged from `TESTING_ROADMAP.md`)

### Step 7: Login as Tenant Admin
1. Go to `/admin`
2. Enter the camp-admin credentials from **§1** (`admin.test@acaciacamp.com` / `TestPass123!`).
   :warning: the retired `TESTING_ROADMAP.md` named `e2e-admin@test.com` here — that account does
   not exist in `scripts/seed-test-users.js`; §1 is the live truth.
3. Click **Sign In**
4. **Verify:** Sidebar shows 15 tabs (Dashboard through Settings)
5. **Verify:** Top bar shows camp badge (e.g. "Acacia Camp")
6. **Verify:** No "Super Admin" section in sidebar

---

### Step 8: Dashboard (`#tab=dashboard`)
| # | Action | Expected Result |
|---|---|---|
| 8.1 | View stat cards | Total rooms, active reservations, revenue, occupancy % |
| 8.2 | Click a quick-action link | Navigates to the correct panel |
| 8.3 | Charts render (if present) | No blank charts, no JS errors in console |

---

### Step 9: Camps (`#tab=camps`)
| # | Action | Expected Result |
|---|---|---|
| 9.1 | View camp list | Shows tenant's camps with name, location, capacity |
| 9.2 | Click **+ Add Camp** | Form modal opens |
| 9.3 | Fill: name, location, capacity | Fields accept input |
| 9.4 | Submit new camp | Camp appears in list, toast confirms |
| 9.5 | Click **Edit** on camp | Edit modal opens with pre-filled data |
| 9.6 | Change name/capacity | Save succeeds, list updates |
| 9.7 | Click **Delete** on camp | Confirmation dialog, then removed |

---

### Step 10: Rooms (`#tab=rooms`)
| # | Action | Expected Result |
|---|---|---|
| 10.1 | View room list | Shows room types with name, capacity, base price |
| 10.2 | Click **+ Add Room** | Form modal opens |
| 10.3 | Select camp from dropdown | Camp selector works |
| 10.4 | Fill: name, capacity, base price | Fields accept input |
| 10.5 | Submit new room | Room appears in list, toast confirms |
| 10.6 | Click **Edit** on room | Edit modal opens with pre-filled data |
| 10.7 | Change price | Save succeeds, list updates |
| 10.8 | Click **Delete** on room | Confirmation dialog, then removed |

---

### Step 11: Rate Plans (`#tab=rateplans`)
| # | Action | Expected Result |
|---|---|---|
| 11.1 | View rate plan list | Shows plans with name, product, price/night, dates |
| 11.2 | Click **+ Add Rate Plan** | Form modal opens |
| 11.3 | Select product from dropdown | Product selector shows available rooms |
| 11.4 | Fill: name, price, start date, end date | Fields accept input |
| 11.5 | Submit new plan | Plan appears in list, toast confirms |
| 11.6 | Click **Edit** on plan | Edit modal opens with pre-filled data |
| 11.7 | Change price/dates | Save succeeds, list updates |
| 11.8 | Click **Delete** on plan | Confirmation dialog, then removed |

---

### Step 12: Orders (`#tab=reservations`)
| # | Action | Expected Result |
|---|---|---|
| 12.1 | View order list | Shows reservations with guest name, room, dates, status |
| 12.2 | Filter by status (pending/confirmed/checked-in/checked-out) | List filters correctly |
| 12.3 | Click on order row | Order details panel or modal opens |
| 12.4 | Update order status | Status badge updates, toast confirms |
| 12.5 | Search by guest name | Matching orders shown |
| 12.6 | Pagination (if > 20 orders) | Next/prev works |

---

### Step 13: Inbox (`#tab=inbox`)
| # | Action | Expected Result |
|---|---|---|
| 13.1 | View inbox | Shows contact form submissions and lead messages |
| 13.2 | Unread badge count | Badge shows correct unread count |
| 13.3 | Click on a message | Message opens, marked as read |
| 13.4 | Reply/forward (if implemented) | Action succeeds |
| 13.5 | Delete message | Removed from list |

---

### Step 14: Booking Calendar (`#tab=calendar`)
| # | Action | Expected Result |
|---|---|---|
| 14.1 | View calendar | Month view shows booked dates |
| 14.2 | Navigate months (prev/next) | Calendar updates to correct month |
| 14.3 | Click on a date | Shows bookings for that date |
| 14.4 | Color coding | Different statuses show different colors |
| 14.5 | Click on a booking | Opens order details or reservation panel |

---

### Step 15: Meals (`#tab=meals`)
| # | Action | Expected Result |
|---|---|---|
| 15.1 | View meals list | Shows meals with name, category, price, active status |
| 15.2 | Click **+ Add Meal** | Form modal opens |
| 15.3 | Fill: name, category, price, description | Fields accept input |
| 15.4 | Submit new meal | Meal appears in list, toast confirms |
| 15.5 | Click **Edit** on meal | Edit modal opens with pre-filled data |
| 15.6 | Change name/price | Save succeeds, list updates |
| 15.7 | Click **Delete** on meal | Confirmation dialog, then removed |
| 15.8 | Toggle active/inactive | Status badge updates |

---

### Step 16: Menu Planner (`#tab=menu-planner`)
| # | Action | Expected Result |
|---|---|---|
| 16.1 | View planner grid | Shows days x meal types (breakfast/lunch/dinner) |
| 16.2 | Assign a meal to a day/slot | Meal appears in the grid cell |
| 16.3 | Remove a meal from a slot | Cell clears |
| 16.4 | Save changes | Toast confirms, data persists on reload |

---

### Step 17: Menu Page (`#tab=menu`)
| # | Action | Expected Result |
|---|---|---|
| 17.1 | View menu preview | Shows how the public menu page looks |
| 17.2 | Meals grouped by category | Correct category headers |
| 17.3 | Images load (if set) | No broken image placeholders |
| 17.4 | Prices display correctly | Currency formatting correct |

---

### Step 18: Planning (`#tab=planning`)
| # | Action | Expected Result |
|---|---|---|
| 18.1 | View planning overview | Shows upcoming reservations, availability |
| 18.2 | Date range selector works | Filters correctly |
| 18.3 | Capacity view | Shows occupancy for each room type |

---

### Step 19: Reports (`#tab=reports`)
| # | Action | Expected Result |
|---|---|---|
| 19.1 | View revenue report | Shows total revenue, booking count |
| 19.2 | Date range filter | Report updates for selected period |
| 19.3 | Export/download (if implemented) | File downloads correctly |
| 19.4 | Charts render | No blank charts, correct data |

---

### Step 20: Low Stock (`#tab=low-stock`)
| # | Action | Expected Result |
|---|---|---|
| 20.1 | View low stock items | Shows items below threshold |
| 20.2 | Set threshold (if implemented) | Threshold saves |
| 20.3 | Mark item as restocked | Item removed from low stock list |

---

### Step 21: Staff (`#tab=staff`)
| # | Action | Expected Result |
|---|---|---|
| 21.1 | View staff list | Shows staff with name, role, status |
| 21.2 | Add new staff member | Form opens, fields accept input |
| 21.3 | Submit staff | Staff appears in list |
| 21.4 | Edit staff | Update succeeds |
| 21.5 | Deactivate staff | Status badge changes |
| 21.6 | Delete staff | Confirmation, then removed |

---

### Step 22: Settings (`#tab=settings`)
| # | Action | Expected Result |
|---|---|---|
| 22.1 | View tenant settings | Shows camp name, subdomain, domain, contact info |
| 22.2 | Edit camp name | Save succeeds, header updates |
| 22.3 | Edit contact info (phone, email, address) | Save succeeds |
| 22.4 | Change subdomain | Save succeeds (verify with page reload) |
| 22.5 | Password change section visible | PasswordPanel rendered below settings |

---

### Step 23: Change Password (`#tab=settings`, PasswordPanel)
| # | Action | Expected Result |
|---|---|---|
| 23.1 | Enter current password | Field accepts input |
| 23.2 | Enter new password (8+ chars) | Field accepts input |
| 23.3 | Confirm new password | Fields match |
| 23.4 | Submit | Toast confirms, can login with new password |
| 23.5 | Login with old password | **Fails** (expected) |
| 23.6 | Login with new password | **Succeeds** |

---

### Part 3 — POS System (Point of Sale)

### Step 24: Login as POS User (use `testpos` / `pass1234` per **§1**)
1. Go to `https://acaciacamp.com/pos`
2. Enter `cashier` / `pass1234`
3. Click **Sign In**
4. **Verify:** POS dashboard loads with sidebar showing: **Dashboard**, **Products**, **Orders**, **Shift**
5. **Verify:** User name shown in top bar

---

### Step 25: POS Dashboard (`/pos#tab=dashboard`)
| # | Action | Expected Result |
|---|---|---|
| 25.1 | View today's stats | Orders count, revenue, items sold |
| 25.2 | Recent orders list | Shows today's transactions |
| 25.3 | Quick action buttons work | Navigate to correct views |

---

### Step 26: POS Products (`/pos#tab=products`)
| # | Action | Expected Result |
|---|---|---|
| 26.1 | View product list | Shows items with name, price, stock |
| 26.2 | Search products | Filtering works correctly |
| 26.3 | Click on product | Product details or edit opens |
| 26.4 | Add to order (if POS cart) | Item added to current order |

---

### Step 27: POS Orders (`/pos#tab=orders`)
| # | Action | Expected Result |
|---|---|---|
| 27.1 | View today's orders | Shows current shift orders |
| 27.2 | Click on order | Order details expand |
| 27.3 | Filter by status | Correct filtering |
| 27.4 | Void/refund (if permitted) | Action succeeds with confirmation |

---

### Step 28: POS Shift (`/pos#tab=shift`)
| # | Action | Expected Result |
|---|---|---|
| 28.1 | View shift status | Shows "No Active Shift" or current shift info |
| 28.2 | Click **Open Shift** | Modal opens to enter opening cash |
| 28.3 | Enter opening cash amount (e.g. 500) | Field accepts input |
| 28.4 | Confirm open | Shift opens, status shows "OPEN" |
| 28.5 | Verify shift timer running | Elapsed time updates |
| 28.6 | Process an order (Products -> add to cart -> checkout) | Order completes, counts toward shift |
| 28.7 | Click **Close Shift** | Modal shows expected vs actual cash |
| 28.8 | Enter actual closing cash | Field accepts input |
| 28.9 | Confirm close | Shift closes, summary shows |
| 28.10 | Verify shift in history | Closed shift appears in shift history |

---
