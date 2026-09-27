# P5 Staging Walkthrough — Unified Cart (live)

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
