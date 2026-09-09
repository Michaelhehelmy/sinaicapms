# SinaiCamps — Tester Guide (Human-Testing Phase)

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
