# SinaiCamps — Manual Testing Roadmap

## Login Credentials

| Role | Email / Identifier | Password | Access Level |
|---|---|---|---|
| **Super Admin** | `admin@sinaicamps.com` | `sinairoot` | Global — all tenants, all panels |
| **Tenant Admin** | `e2e-admin@test.com` | `TestPass123!` | Single tenant (acaciacamp) |
| **POS User** | `cashier` | `pass1234` | POS terminal only |

**Login URL:** `https://sinaicamps.com/admin`
**POS URL:** `https://acaciacamp.com/pos`

---

## PART 1 — Super Admin (Platform-Wide)

### Step 1: Login
1. Go to `/admin`
2. Enter `admin@sinaicamps.com` / `sinairoot`
3. Click **Sign In**
4. **Verify:** Sidebar shows 3 tabs under "Super Admin" section — **Super Dashboard**, **Tenants**, **All Orders**
5. **Verify:** Top bar shows purple **"Global Operator Mode"** badge

---

### Step 2: Super Dashboard (`#tab=super_dashboard`)
| # | Action | Expected Result |
|---|---|---|
| 2.1 | View dashboard stats | Total tenants, total orders, total revenue cards displayed |
| 2.2 | Click "View All Tenants" | Navigates to Tenants tab |
| 2.3 | Click "View All Orders" | Navigates to All Orders tab |

---

### Step 3: Tenants Management (`#tab=super_tenants`)
| # | Action | Expected Result |
|---|---|---|
| 3.1 | View tenant list | All tenants shown with name, subdomain, custom domain, status |
| 3.2 | Click **+ Create Tenant** | Form modal opens |
| 3.3 | Fill form: name, subdomain, location, admin email/password, type | Fields accept input |
| 3.4 | Submit new tenant | Tenant appears in list, admin account created |
| 3.5 | Click **Edit** on existing tenant | Edit modal opens with pre-filled data |
| 3.6 | Change tenant name/type | Save succeeds, list updates |
| 3.7 | Click **Deactivate** on active tenant | Status changes to inactive |
| 3.8 | Click **Activate** on inactive tenant | Status changes back to active |
| 3.9 | Click **Delete** on a test tenant | Confirmation dialog, then removed from list |
| 3.10 | Click **Drill Down** arrow on a tenant | Enters tenant context, sidebar switches to tenant admin panels |
| 3.11 | Verify drill-down context shows active camp badge | Camp name badge visible in top bar |
| 3.12 | Click **Back** to return to super admin | Returns to Super Admin panels |

---

### Step 4: All Orders (`#tab=super_reservations`)
| # | Action | Expected Result |
|---|---|---|
| 4.1 | View order list | Shows orders across ALL tenants |
| 4.2 | Filter/search by tenant | Only matching tenant orders shown |
| 4.3 | Click on an order row | Order details expand or open |
| 4.4 | Update order status | Status badge updates, toast confirms |
| 4.5 | Pagination works (if > 20 orders) | Next/prev page loads correctly |

---

### Step 5: Admin User Management (inside Tenants drill-down)
| # | Action | Expected Result |
|---|---|---|
| 5.1 | Create a new admin for a tenant | Form validates email/password/role |
| 5.2 | Set role to `admin` (tenant admin) | Saved, appears in list |
| 5.3 | Set role to `super_admin` | Saved, shows super_admin badge |
| 5.4 | Edit an admin (change name/role) | Update succeeds, toast confirms |
| 5.5 | Deactivate an admin | Status badge changes to inactive |
| 5.6 | Delete a non-super_admin admin | Confirmation, then removed |
| 5.7 | Attempt to delete a super_admin | **Blocked** with error "Cannot modify super_admin" |

---

### Step 6: Create Tenant Admin (prerequisite for Part 2)
| # | Action | Expected Result |
|---|---|---|
| 6.1 | In Tenants panel, click **+ Create Tenant** | Modal opens |
| 6.2 | Fill: Name = "Test Camp", subdomain = "testcamp" | Fields accepted |
| 6.3 | Set admin email = `testcamp-admin@test.com`, password = `Test1234!` | Credentials set |
| 6.4 | Submit | Tenant created with admin account |
| 6.5 | Verify admin can login at `/admin` with those credentials | Login succeeds, tenant panels load |

---

## PART 2 — Tenant Admin (Single Tenant)

### Step 7: Login as Tenant Admin
1. Go to `/admin`
2. Enter `e2e-admin@test.com` / `TestPass123!`
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

## PART 3 — POS System (Point of Sale)

### Step 24: Login as POS User
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

## PART 4 — Public Pages (No Auth Required)

### Step 29: Marketplace Home (`/`)
| # | Action | Expected Result |
|---|---|---|
| 29.1 | Visit `/` | Marketplace loads showing all camps |
| 29.2 | Click on a camp card | Navigates to camp detail page |
| 29.3 | Search/filter camps | Filtering works |
| 29.4 | No console errors | Console clean |

---

### Step 30: Camp Detail Pages
| # | Action | Expected Result |
|---|---|---|
| 30.1 | Visit `/camp/acaciacamp` | Camp page loads with name, description, images |
| 30.2 | View rooms section | Room types with prices displayed |
| 30.3 | Click "Book Now" | Booking form or modal opens |
| 30.4 | Visit `/camp/acaciacamp/menu` | Menu page shows meals by category |
| 30.5 | Visit `/camp/acaciacamp/book` | Booking form page loads |

---

### Step 31: Registration (`/register`)
| # | Action | Expected Result |
|---|---|---|
| 31.1 | Visit `/register` | Registration form loads |
| 31.2 | Fill all fields | Fields accept input |
| 31.3 | Submit valid registration | Success message with login link |
| 31.4 | Submit duplicate email | Error message shown |
| 31.5 | Submit with missing required fields | Validation errors shown |

---

## PART 5 — Cross-Cutting Concerns

### Step 32: Authentication and Security
| # | Action | Expected Result |
|---|---|---|
| 32.1 | Visit `/admin` while logged out | Redirected to login |
| 32.2 | Login with wrong password | Error toast shown |
| 32.3 | Login with valid credentials | Dashboard loads |
| 32.4 | Refresh page while logged in | Session persists (JWT in localStorage) |
| 32.5 | Visit `/admin` with expired token | Redirected to login |
| 32.6 | Click Logout | Session cleared, redirected to login |
| 32.7 | Attempt access after logout (back button) | Redirected to login |

---

### Step 33: Responsive Design
| # | Action | Expected Result |
|---|---|---|
| 33.1 | Resize to mobile (< 768px) | Sidebar collapses, hamburger menu appears |
| 33.2 | Click hamburger menu | Sidebar slides in |
| 33.3 | Navigate on mobile | Panels load correctly |
| 33.4 | Resize to tablet (768-1024px) | Sidebar persistent, content adjusts |
| 33.5 | Resize to desktop (> 1024px) | Full sidebar visible |

---

### Step 34: Error Handling
| # | Action | Expected Result |
|---|---|---|
| 34.1 | Disconnect network (DevTools offline) | Graceful error messages, no white screen |
| 34.2 | Reconnect network | Data refreshes automatically |
| 34.3 | Submit form with invalid data | Validation errors shown (no 500 errors) |
| 34.4 | Navigate to non-existent route | 404 page shown |

---

## Quick Reference: All Admin Panel Tabs

### Super Admin (3 tabs)
| Tab ID | Label | Purpose |
|---|---|---|
| `super_dashboard` | Super Dashboard | Platform-wide stats |
| `super_tenants` | Tenants | Manage all tenants + admins |
| `super_reservations` | All Orders | Orders across all tenants |

### Tenant Admin (15 tabs)
| Tab ID | Label | Purpose |
|---|---|---|
| `dashboard` | Dashboard | Tenant stats and quick actions |
| `camps` | Camps | Manage camp locations |
| `rooms` | Rooms | Manage room types and pricing |
| `rateplans` | Rate Plans | Seasonal and special pricing |
| `reservations` | Orders | Guest bookings and status |
| `inbox` | Inbox | Contact form leads and messages |
| `calendar` | Booking Calendar | Visual booking grid |
| `meals` | Meals | Food and beverage items |
| `menu-planner` | Menu Planner | Weekly meal scheduling |
| `menu` | Menu Page | Public menu preview |
| `planning` | Planning | Upcoming capacity view |
| `reports` | Reports | Revenue and analytics |
| `low-stock` | Low Stock | Inventory alerts |
| `staff` | Staff | Staff management |
| `settings` | Settings | Tenant config and password |

### POS (4 tabs)
| Tab ID | Label | Purpose |
|---|---|---|
| `dashboard` | Dashboard | Today's sales overview |
| `products` | Products | POS product catalog |
| `orders` | Orders | Transaction history |
| `shift` | Shift | Open/close shifts, cash reconciliation |

---

## Test Execution Order

For the fastest path through the full system:

1. **Part 1** (Super Admin) -> Steps 1-6
2. **Part 4** (Public Pages) -> Steps 29-31 (no auth, can run parallel)
3. **Part 2** (Tenant Admin) -> Steps 7-23
4. **Part 3** (POS) -> Steps 24-28
5. **Part 5** (Cross-Cutting) -> Steps 32-34
