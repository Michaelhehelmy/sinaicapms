# P5 Staging Walkthrough — Unified Cart (live)

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
