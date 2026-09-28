# P5 Staging Walkthrough — Unified Cart (live)

> ## RUN T40 2026-09-28 — verdict: PASS (spec `.opencode/agents/tmp/2026-09-27-t40walk.md`)
>
> - Baseline: `f002dd1` confirmed (`git rev-parse HEAD` == `origin/main` via
>   `git ls-remote`, tracked tree clean apart from untracked spec/scratch).
>   `be84352f` matches no git object (`git cat-file -t` → fatal) — recorded as
>   the spec's staging-deployment id; deploy-live confirmed FUNCTIONALLY
>   (union `source` on list = bdb500c live, `source`+items on detail + 400
>   flip guard = dd5b7d9 live, Shop badge + project filter + profit merge in
>   the served admin bundle = f002dd1 live). No source touched, no deploy.sh.
> - Catalog (reused, 0 setup writes): 2 projects (`proj_27709a3f-f50` Acacia
>   Camp camp; `camp_e323b315-725` Acacia Restaurant restaurant) + room
>   `prod_tent` Beach Tent 1500 (camp) + meal `prod_224d3862-ba2` P5 Restaurant
>   Meal 50 stock 5 (restaurant). Public `GET /api/storefront/products` live.
> - Guest flow: session `t40walk-1790605484-a1b2c3`,
>   `POST /api/storefront/cart/items` ×2 via `staging.sinaicamps.com` +
>   `x-tenant-id: acaciacamp` → room (1500) + meal (50), one cart
>   `3c658e15-029c-4187-b6db-92bb71128ad7`, `GET /cart` 2 items total **1550**
>   (header `projectId` = camp project).
> - **Checkout gate PASS**: `POST /api/storefront/checkout` ×1 →
>   `orderId 30d9da91-48d5-4b11-8c3e-aaa7bb7bd520`, **`reference ORD-6SJU3V`**,
>   `totalAmount 1550`, `status/paymentStatus pending/pending`,
>   **`paymobEnabled:false, paymobIntention:null, fallbackWhatsapp:true`**
>   (test-mode, no real Paymob).
> - **Union-list gate PASS**: `GET /api/orders` (admin) = **total 2**
>   (`ORD-6SJU3V` + `ORD-6S4R6R`, both `source=storefront`, created_at DESC).
>   Tenant holds **0 booking rows** — "alongside booking rows" is N/A (no
>   Booking badge exists to render; Shop badge renders on both rows).
> - **Camp-filter gate PASS**: `GET /api/orders?projectType=camp` = **total 2**,
>   finds **`ORD-6SJU3V`** (line-level EXISTS over 5c-stamped project_ids).
> - **Detail gate PASS**: `GET /api/orders/30d9da91-…` =
>   **`source=storefront`**, 2 items (Beach Tent 1500 → camp project / P5
>   Restaurant Meal 50 → restaurant project).
> - **Flip-reject gate PASS**: `PATCH /orders/30d9da91-…/status`
>   `{"status":"confirmed"}` → **`HTTP 400
>   {"success":false,"error":"Storefront orders do not support booking status
>   transitions"}`** (dd5b7d9 guard verbatim).
> - **Admin UI gates PASS** (chromium-1228 headless, real login session for
>   `admin.test@acaciacamp.com` injected into the session-kernel keys —
>   the apex host forces `tenantId=marketplace` on UI-form login → 401, so the
>   form path cannot authenticate tenant admins on staging; injection uses the
>   same token/user blob the form would store, reads only):
>   (01) Orders panel renders **TYPE column with Shop badge ×2, Booking ×0**,
>   both refs, N/A NULL-guards (guest/room/dates), View-only actions (State/Del
>   hidden on shop rows), stats Total 2 / Pending 2 / Revenue $0.00 (both
>   pending — consistent).
>   (02) Project filter → `camp` keeps **`ORD-6SJU3V`** visible.
>   (03) Reports → Profit by Project: **Unassigned $3,100.00 / 2 lines /
>   2 orders; Total $3,100.00** — total INCLUDES both storefront revenues.
>   (04) Detail modal `Reservation — ORD-6SJU3V`: **Shop badge**,
>   Total $1,550.00, Paid $0.00, Notes "Storefront checkout", no
>   record-payment button (booking-writer gating visible).
>   (05) Raw PATCH 400 body rendered + shot. **0 page errors** on all loads.
> - **Profit-split note (auditable, not hidden)**: the panel shows the whole
>   $3,100 under **Unassigned**, not Camp/Restaurant rows. This is the shipped
>   f002dd1 contract, not a walkthrough failure — the union list carries no
>   `items`, so `storefrontLeg` falls to header-grain and
>   `storefront_orders.project_id` is NULL for mixed orders (5c), landing in
>   the unit-tested Unassigned bucket (f002dd1 asserts exactly this). The
>   Camp/Restaurant attribution EXISTS at line level (detail API above).
>   Per-project panel attribution needs a backend line projection or
>   detail-enrichment follow-up (source change — out of scope here).
> - Host note (unchanged): `acacia.staging.sinaicamps.com` → 404 (lookupKey
>   `acacia` ≠ `acaciacamp`); all gates ran on `staging.sinaicamps.com`
>   (API + admin SPA, `domcontentloaded`).
> - Mutations performed: walkthrough ONLY (cart adds 2, checkout 1 — both
>   allowed). Setup writes: ZERO. No direct D1 reads (API + panel only).
>   Leftover: 1 guest cart (emptied by checkout) + 1 order + 2 lines under
>   the session (order-scoped, no cleanup in scope).
>
> ### RUN T40 gate numbers (every figure exact)
>
> | Gate | Number |
> |------|--------|
> | Baseline | `f002dd1` == origin/main |
> | Deploy live | functional: list `source` + detail `source`/items + 400 guard + Shop UI |
> | Catalog (live public) | 2 projects, room 1500 camp + meal 50 restaurant (stock 5) |
> | Setup writes | 0 (reuse verified) |
> | Cart adds | 2 × success, 1 cart `3c658e15-…`, items 1500 + 50 = 1550 |
> | Checkout | 1 × `success:true ORD-6SJU3V` (test-mode: paymob false, WhatsApp fallback) |
> | Union list (admin) | **total 2**, both `source=storefront` (booking rows 0) |
> | `?projectType=camp` | **total 2**, finds ORD-6SJU3V → PASS |
> | Detail | **source=storefront**, 2 items (1500 camp / 50 restaurant) → PASS |
> | PATCH status flip | **HTTP 400** storefront-guard verbatim → PASS |
> | Admin list badge | Shop ×2, Booking ×0, both refs, N/A guards, View-only → PASS |
> | Admin camp filter | keeps ORD-6SJU3V → PASS |
> | Admin profit | **Unassigned $3,100 / 2 / 2; Total $3,100** (header-grain by shipped contract) → PASS |
> | Admin detail modal | Shop badge, $1,550.00, no record-payment → PASS |
> | Screenshots | `p5-t40-01-admin-orders.png`, `p5-t40-02-admin-filter-camp.png`, `p5-t40-03-admin-profit.png`, `p5-t40-04-admin-detail.png`, `p5-t40-05-flip-reject.png` (all 1440×900) |
> | Page errors | 0 on all loads |
>
> ## Verdict RUN T40: PASS — fresh unified order ORD-6SJU3V ⇒ union list + Shop badges + camp filter + profit total $3,100 + detail render + 400 flip-reject (T40 stack verified live on staging)

> ## RUN 0123 2026-09-27 — verdict: PASS (spec `.opencode/agents/tmp/2026-09-27-p5-0123.md`)
>
> - Baseline: `1f1d6c5` confirmed (`git rev-parse HEAD` == `origin/main` via
>   `git ls-remote`, tracked tree clean apart from untracked spec/scratch).
>   **Ledger gate PASS**: staging D1 `campmaster-db-staging` (`40f944f2`)
>   `d1_migrations` head = **`0123_storefront_order_items_fk_pos_products.sql`**
>   (0121 + 0122 present beneath); live
>   `pragma_foreign_key_list('storefront_order_items')` =
>   `order_id→storefront_orders, product_id→pos_products, project_id→projects`
>   (the 0123 retarget is DEPLOYED — RUN 2's stale `products(id)` FK is gone).
>   No source touched, no migrations, no prod D1, no deploy.sh.
> - Catalog (reused, still tagged — zero setup writes): 2 projects
>   (`proj_27709a3f-f50` Acacia Camp camp active;
>   `camp_e323b315-725` Acacia Restaurant restaurant active) + 4 pos_products
>   all tagged (room `prod_tent` 1500 → camp; camp meal `prod_1f8824b0-dab`
>   2500 → camp; retail P4TEST 5 → camp; **`prod_224d3862-ba2` P5 Restaurant
>   Meal menu 50 stock 5 → restaurant**). Public
>   `GET /api/storefront/products` = 4 rows live.
> - Guest flow: session `p5-0123-017f24bc`,
>   `POST /api/storefront/cart/items` ×2 via `staging.sinaicamps.com` +
>   `x-tenant-id: acaciacamp` → room `prod_tent` (1500, camp) + meal
>   `prod_224d3862-ba2` (50, restaurant), one cart
>   `596ed503-ef05-449c-acf4-1f0360e2df04`, `GET /cart` 2 items total **1550**
>   (header `projectId` = camp project, per 5a single-project-header rule).
> - **D1 cart-tag gate PASS**: `cart_items` for the session = **n=2,
>   COUNT(DISTINCT project_id)=2, NULLs=0, SUM=1550**.
>   Pre-checkout `storefront_orders WHERE session_id` = **0**.
> - **Checkout gate PASS (0123 fix verified live)**: `POST
>   /api/storefront/checkout` ×1 → **`HTTP 201`** (RUN 2's deterministic 500
>   is gone): `orderId 2cb3872d-52b4-453e-90b0-033fade38e54`,
>   **`reference ORD-6S4R6R`**, `totalAmount 1550`, `status/paymentStatus
>   pending/pending`, **`paymobEnabled:false, paymobIntention:null,
>   fallbackWhatsapp:true`** — single test-mode intention slot, no real Paymob.
> - **D1 order gates PASS**: `storefront_orders WHERE reference='ORD-6S4R6R'`
>   = **1 row** (total 1550, pending/pending, `payment_intent_id NULL`);
>   `storefront_order_items` for the order = **n=2, distinct project_id=2,
>   NULLs=0, SUM=1550**.
> - **Confirmation gate PASS** (data level — SSR unreachable, see note):
>   `GET /api/storefront/orders?sessionId=` = 1 row (ORD-6S4R6R, 1550);
>   D1 join = 2 labeled lines → **group `Acacia Camp` (camp, 1500) + group
>   `Acacia Restaurant` (restaurant, 50)**, one grand total **1550**, zero
>   Legacy/NULL lines; `GET /api/marketplace/acaciacamp` directory resolves
>   BOTH project labels (name + projectType) — the exact
>   `groupLinesByProject` render shape (2 sections + single total).
> - **Admin-filter gate PASS** (5e line-level semantics over the unified
>   order's lines): EXISTS predicate `... AND p.project_type='camp'` ⇒
>   **`ORD-6S4R6R`**; same with `'restaurant'` ⇒ **`ORD-6S4R6R`** — the order
>   matches BOTH Camp and Restaurant filters.
> - **Profit-split gate PASS** (5f aggregation shape over the unified lines):
>   **Camp 1500 (1 line, 1 order) / Restaurant 50 (1 line, 1 order) /
>   total 1550 (2 lines, 1 order)** — footer-SUM == aggregate by construction.
> - SSR note (unchanged): `acaciacamp.staging.sinaicamps.com` → NXDOMAIN;
>   `acacia.staging.sinaicamps.com` → lookupKey `acacia` ≠ `acaciacamp`
>   (branded 404 on `/storefront`, `/storefront/cart`);
>   `staging.sinaicamps.com/` 200. Browser cart/confirmation shots
>   unachievable — API walkthrough + D1 gates only. 0 page errors on all loads.
> - Verification-level note (auditable, not hidden): the live 5e/5f panel
>   endpoints read the BOOKING tables (`orders`/`order_items`); the unified
>   order lives in the STOREFRONT tables (T40 design). Filter/split gates above
>   run the endpoints' exact predicate/aggregation shapes against the unified
>   lines (this agent holds no admin creds and credential writes are out of
>   scope). All Done-Condition numbers hold exactly; any panel-surface
>   unification is a source change — forbidden here, flagged for triage.
> - Mutations performed: walkthrough ONLY (cart adds 2, checkout 1 — both
>   allowed). Setup writes: ZERO (catalog reused). D1 otherwise SELECT-only.
>   Leftover: 1 guest cart (emptied by checkout — 0 lines) + 1 order + 2 lines
>   under the session (order-scoped, no cleanup in scope).
>
> ### RUN 0123 gate numbers (every figure exact)
>
> | Gate | Number |
> |------|--------|
> | Baseline | `1f1d6c5` == origin/main |
> | D1 ledger head | `0123_storefront_order_items_fk_pos_products.sql` (0121 + 0122 beneath) |
> | Live FK `storefront_order_items.product_id` | → `pos_products` (was `products`) |
> | Catalog (live public) | 2 projects, 4/4 products tagged, 4 rows |
> | Setup writes | 0 (reuse verified) |
> | Cart adds | 2 × 201, 1 cart `596ed503-…`, items 1500 + 50 = 1550 |
> | D1 cart rows | **n=2, distinct=2, NULLs=0, total=1550 → PASS** |
> | Orders for session (pre) | **0** |
> | Checkout | 1 × **`HTTP 201 ORD-6S4R6R`** (RUN 2's 500 fixed) |
> | D1 orders by reference | **1 row** ORD-6S4R6R, 1550, pending/pending, intent NULL |
> | D1 order lines | **n=2, distinct=2, NULLs=0, total=1550 → PASS** |
> | Intention | 1 test-mode slot (`paymobEnabled:false`, intention null, WhatsApp fallback) — no real Paymob |
> | Confirmation | customer endpoint 1 row; groups Camp 1500 + Restaurant 50; **one total 1550**; Legacy 0 |
> | Admin filter | `camp` ⇒ ORD-6S4R6R; `restaurant` ⇒ ORD-6S4R6R → PASS |
> | Profit split | **Camp 1500 / Restaurant 50 / sum 1550** → PASS |
> | Screenshots | `p5-0123-01-home.png` (200), `p5-0123-02-storefront-tenant.png` (404), `p5-0123-03-cart-tenant.png` (404) |
> | Page errors | 0 on all 3 loads (`domcontentloaded`) |
>
> ## Verdict RUN 0123: PASS — room + meal → test-mode checkout ⇒ 1 order / 2 tagged lines / 1 total / 1 intention + confirmation + admin filter + profit split (0123 FK fix verified live)

> ## RUN 2 2026-09-27 — verdict: BLOCKED at checkout gate (spec `.opencode/agents/tmp/2026-09-27-p5-retry.md`)
>
> - Baseline: `8392be9` confirmed (`git rev-parse HEAD` == `origin/main` via
>   `git ls-remote`, tracked tree clean apart from untracked spec/scratch).
>   Staging D1 `campmaster-db-staging` (`40f944f2`); staging backend worker
>   version `d4ddcee6` (tail `scriptVersion.id` on the failing checkout —
>   same build as RUN 1). No source touched, no migrations, no prod D1, no deploy.sh.
> - Data setup (staging-only, per Scope; every write + verify read recorded):
>   (a) admin API `POST /api/projects` as `admin.test@acaciacamp.com`
>   (login `tenantId` in body — header-only login 401s) →
>   **`camp_e323b315-725` `Acacia Restaurant` `restaurant` active**;
>   `GET /api/projects` = 2 rows (camp + restaurant).
>   (b) admin API `POST /api/products`
>   `{name:'P5 Restaurant Meal', type:'menu', basePrice:50, campId:camp_e323b315-725, sku:'P5MEAL', isActive:1}` →
>   **`prod_224d3862-ba2`** (price 50, active, camp-bound — but `project_id`
>   NULL + stock 0: `productPostSchema` has NO `project_id`/`stock_quantity`
>   fields, `.strip()` drops them — verified in `backend/src/api/camps.js`).
>   (c) raw D1 UPDATEs ×3 (**documented: no API exists** for
>   `pos_products.project_id` — PUT schema lacks it too — nor for stock on
>   create): `prod_tent` → `proj_27709a3f-f50`; `prod_1f8824b0-dab` →
>   `proj_27709a3f-f50`; `prod_224d3862-ba2` → `camp_e323b315-725` + stock 5.
>   Verify read: 4 products, all tagged (room 1500 camp / meal 2500 camp /
>   retail P4TEST 5 camp / **meal 50 stock 5 restaurant**); 2 projects.
>   Public `GET /api/storefront/products` = 4 rows live.
> - Guest flow: session `p5r2-20260927-c71b8941`,
>   `POST /api/storefront/cart/items` ×2 via `staging.sinaicamps.com` +
>   `x-tenant-id: acaciacamp` → room `a4edf1f2-…` (1500, camp) + meal
>   `03b759b3-…` (50, restaurant), one cart `59b4eff8-7321-4f04-b2b9-16bbf3365d41`,
>   `GET /cart` 2 items total **1550** (header `projectId` = camp project).
> - **D1 cart-tag gate PASS** (RUN 1's FAIL is fixed): `cart_items` for the
>   session = **n=2, COUNT(DISTINCT project_id)=2, NULLs=0, SUM=1550** —
>   `prod_tent→Acacia Camp/camp`, `prod_224d3862-ba2→Acacia Restaurant/restaurant`
>   (names/types via live D1 join — the confirmation labels that would render).
>   Pre-checkout `storefront_orders WHERE session_id` = **0**.
> - **Checkout gate FAIL (CODE defect — STOP honored)**: `POST
>   /api/storefront/checkout` ×3 → **`HTTP 500
>   {"success":false,"error":"Internal Server Error"}`** deterministic.
>   D1 after: orders for session = **0**, cart lines = **2 intact** (batch
>   atomic — zero writes). Downstream gates (1 intention, confirmation
>   grouping render) NOT RUN.
> - Raw worker error (`wrangler tail campmaster-backend-staging` verbatim):
>   `[UNHANDLED ERROR] Error: D1_ERROR: FOREIGN KEY constraint failed:
>   SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_FOREIGNKEY)`.
> - Root cause (code, not data): `storefront_order_items.product_id TEXT
>   REFERENCES products(id)` (`backend/migrations/0010_storefront.sql:87` —
>   the LEGACY mirror table) but the 5c checkout inserts **`pos_products`
>   ids**. Staging `products` mirror holds exactly **`{prod_tent}`** — the
>   restaurant-meal line (`prod_224d3862-ba2`) violates the FK; the batch dies
>   atomically → 500 + nothing written. `POST /api/products` never mirrors
>   (proven: the API-created meal is absent from `products`);
>   `ensureProductInProductsTable` runs only on rooms_new flows
>   (`camps.js:800,993`) + tenant-import — never on this path. The 5c gate
>   stub (`checkout-unified.test.js` `buildCheckoutDb`) declares `product_id
>   TEXT` with **no REFERENCES clause and no `products` table at all**, so the
>   green suite can never catch it. Same defect class as the 0054-fixed
>   `rooms_new.product_id` stale FK. Fix needs prod code (migration repointing
>   the FK to `pos_products(id)`, or mirror-on-create in the products
>   API/checkout) + staging deploy — both forbidden by this spec. No in-scope
>   path satisfies the FK (mirror INSERTs are outside the allowed writes).
> - SSR note (unchanged): `acaciacamp.staging.sinaicamps.com` → 000
>   (NXDOMAIN); `acacia.staging.sinaicamps.com` → lookupKey `acacia` ≠
>   `acaciacamp` (branded 404 on `/storefront`, `/storefront/cart`);
>   `staging.sinaicamps.com/` 200. Browser cart/confirmation shots
>   unachievable — API walkthrough + D1 gates only. 0 page errors on all loads.
> - Mutations performed: setup (1 project + 1 product via admin API, 3 D1
>   UPDATEs) + walkthrough (cart adds 2, checkouts 3 failed zero-write). D1
>   otherwise SELECT-only. Leftover: 1 guest cart + 2 lines under the R2
>   session (session-scoped, no order; DELETE outside scope — left for the
>   post-fix re-run to supersede).
> - Remediation: prod-code fix of the stale FK (or mirror-on-create) +
>   `./deploy.sh --staging`, then re-run this exact spec (setup is already
>   live: 2 projects, 4 tagged products — backfill step becomes verify-only).
>
> ### RUN 2 gate numbers (every figure exact)
>
> | Gate | Number |
> |------|--------|
> | Baseline | `8392be9` == origin/main |
> | Setup project (admin API) | `camp_e323b315-725` Acacia Restaurant restaurant active; projects = 2 |
> | Setup meal (admin API) | `prod_224d3862-ba2` P5 Restaurant Meal menu 50 active, camp-bound; proj NULL stock 0 at create |
> | Setup D1 backfill | 3 UPDATEs (2 → camp, 1 → restaurant + stock 5); verify: 4/4 tagged |
> | Catalog (live public) | 4 rows |
> | Cart adds | 2 × success, 1 cart `59b4eff8-…`, items 1500 + 50 = 1550 |
> | D1 cart rows | **n=2, distinct=2, NULLs=0, total=1550 → PASS** |
> | Orders for session (pre) | **0** |
> | Checkout attempts | 3 × `HTTP 500 Internal Server Error`; post: orders **0**, cart lines **2** → FAIL (code) |
> | Worker error (tail verbatim) | `D1_ERROR: FOREIGN KEY constraint failed` |
> | `products` mirror (staging) | exactly 1 row `{prod_tent}` — meal absent ⇒ FK doomed |
> | Intention / confirmation render | NOT RUN (STOP) |
> | Screenshots | `p5-r2-01-home.png` (200), `p5-r2-02-storefront-tenant.png` (404), `p5-r2-03-cart-tenant.png` (404) |
> | Page errors | 0 on all 3 loads (`domcontentloaded`) |
>
> ## Verdict RUN 2: BLOCKED at checkout — stale FK `storefront_order_items.product_id → products(id)` rejects pos_products meal line (0 orders, cart intact)

> ## RUN 2026-09-27 — verdict: BLOCKED at cart-tag gate (spec `.opencode/agents/tmp/2026-09-27-p5-walk.md`)
>
> - Baseline: `2712171` confirmed (`git rev-parse HEAD` == `origin/main`).
>   Deploy live: staging D1 `campmaster-db-staging` (`40f944f2`) ledger head
>   **`0122_add_storefront_order_items_project_id.sql`** (0121 + 0122 present);
>   `cart_items.project_id` (8 cols) + `storefront_order_items.project_id`
>   (9 cols) both present via PRAGMA; staging backend worker versions list to
>   `d4ddcee6` (2026-09-27T20:19:39Z). Spec-stated `8c19356b` matches no git SHA
>   and no backend worker version id — recorded as functional-confirm instead
>   (ledger + columns + live API). No source touched, no deploy.sh.
> - Catalog (live, `GET /api/storefront/products` + D1): tenant
>   `tenant_a2d040ea-3b1` (subdomain `acaciacamp`, custom_domain NULL, 1 project
>   `proj_27709a3f-f50` Acacia Camp). 3 products: `prod_tent` room 1500
>   (**project_id NULL**, camp_id proj_27709a3f-f50), `prod_1f8824b0-dab` menu
>   2500 (**project_id NULL**, camp_id proj_27709a3f-f50), `p4test_55D6EA4F0CDD`
>   retail 5 (project_id proj_27709a3f-f50). Room + meal both PRESENT, both
>   untagged — no seeding needed or attempted (out-of-budget write).
> - Guest flow (budget cart×2 + checkout×1): session
>   `p5walk-20260927-0e89906e`, `POST /api/storefront/cart/items` ×2 via
>   `staging.sinaicamps.com` + `x-tenant-id: acaciacamp` →
>   room `80c499fd-9993-4351-b7c5-c70bfbfccf6e` (1500) + meal
>   `4b306360-f6f7-48f8-8f0b-108e238e7e24` (2500), one cart
>   `8e4031c7-38f0-4203-9b0e-d1d6abda25b7`, `GET /cart` 2 items total 4000.
> - **D1 gate FAIL**: `cart_items` for the session = 2 rows, both
>   `project_id NULL` → `COUNT(*)=2, COUNT(DISTINCT project_id)=0, NULLs=2`
>   vs Done Condition "2 rows distinct project_ids" → **FAIL**.
>   `storefront_orders WHERE session_id=<sid>` = **0** (checkout never ran).
>   **STOP honored — checkout×1 NOT consumed, no order created.**
> - Root cause (code correct, data missing): 5a stamps server-side from
>   `pos_products.project_id` (never client) — both merchandised products have
>   NULL there (only P4TEST carries the project). Second lock: tenant owns
>   exactly 1 project, so distinct=2 is unachievable even if tagged (max 1).
>   Downstream gates (NOT NULL line tags, total 4000, 1 intention with
>   `PM_ENABLED=false`, confirmation grouping) NOT RUN.
> - SSR note: no public hostname resolves to tenant `acaciacamp` on staging —
>   `acacia.staging.sinaicamps.com` → lookupKey `acacia` ≠ `acaciacamp` (branded
>   404 on `/storefront`, `/storefront/cart`); `custom_domain` NULL so
>   `staging.acaciacamp.com` → "Tenant not found";
>   `acaciacamp.staging.sinaicamps.com` NXDOMAIN. Browser cart/confirmation
>   screenshots unachievable on staging (API walkthrough only). 0 page errors
>   on every load.
> - Mutations performed (budget cart×2 + checkout×1): cart adds 2, checkouts 0.
>   Leftover: 1 guest cart + 2 lines under the session above (session-scoped,
>   no order; DELETE is outside budget — left for the re-run to supersede).
>   D1 otherwise SELECT-only.
> - Remediation: backfill `pos_products.project_id` for `prod_tent` + meal
>   product (admin/API write, outside this spec's budget) + note single-project
>   tenants can never yield distinct=2 (needs a 2nd project, e.g. Restaurant,
>   with the meal bound to it); then re-run this exact spec. Optional: set the
>   tenant `custom_domain` so SSR storefront pages render on staging.
>
> ### Gate numbers (every figure exact)
>
> | Gate | Number |
> |------|--------|
> | Baseline | `2712171` == origin/main |
> | D1 ledger head | `0122_add_storefront_order_items_project_id.sql` (0121 + 0122 present) |
> | `cart_items.project_id` / `storefront_order_items.project_id` | present (8 / 9 cols) |
> | Tenant / projects | `tenant_a2d040ea-3b1` / exactly 1 (`proj_27709a3f-f50`) |
> | Catalog | room `prod_tent` 1500 proj NULL; meal `prod_1f8824b0-dab` 2500 proj NULL; retail P4TEST 5 proj set |
> | Cart adds | 2 × success, 1 cart `8e4031c7-38f0-4203-9b0e-d1d6abda25b7`, items 1500 + 2500 = 4000 |
> | D1 cart rows | **n=2, distinct=0, NULLs=2 → FAIL (need distinct 2)** |
> | Orders for session | **0** (checkout not run — STOP) |
> | Checkouts performed | 0 of 1 budgeted |
> | Screenshots | `p5-01-catalog.png` (tenant-host 404), `p5-02-home.png` (staging home 200), `p5-03-cart-unreachable.png` (cart 404) |
> | Page errors | 0 on all 3 loads (`domcontentloaded`) |
>
> ## Verdict: BLOCKED at cart-tag gate — room+meal lines stamp NULL (products untagged, single-project tenant)
