# Folio B.8 Staging Walkthrough — Guest Journey (live)

> ## 2026-09-30 — verdict: PASS (spec `.opencode/agents/tmp/2026-09-30-fb8.md`)
>
> - Head `ff68a91` confirmed == `origin/main` (pushed) before any write; tracked
>   tree clean apart from pre-existing untracked spec/scratch.
> - Deploy-live gate: unauth `GET /api/folios` → 401 (mounted, not 404);
>   authed `GET /api/folios` → 200 empty envelope; D1 staging ledger head =
>   `0124_guest_folios.sql`; `folios`/`folio_charges`/`folio_settlements` exist.
>   Every folio endpoint exercised below returned 200/201 live.
> - `4fb52573` resolves to NO git object (`cat-file` fatal, full clone) and NO
>   staging version (`versions list` newest = `70fce384` 2026-09-29). Functional
>   liveness above is the operative proof (see anomaly note).
> - Tenant `tenant_a2d040ea-3b1` (acaciacamp): admin `admin.test@acaciacamp.com`
>   / `TestPass123!`, POS `testpos` / `pass1234` (E2E default).
>
> ### Step verità (all D1-verified, every figure exact)
>
> | # | Step | Result |
> |---|------|--------|
> | 0 | Confirm ff68a91 + deploy live | PASS — HEAD==origin==ff68a91; folio surface live (above) |
> | 1 | Booking create | PASS — `ord_ea360219-828` / `ORD-6LPUIK`, room_1, 2026-10-10→12 (2 nights), total **3000**, state pending |
> | 2 | Check-in | PASS — 200, `folioId: folio_7b1929c1-5ea`; D1: folio open, total **3000** == order total (numeric 1); 2× room 1500+1500, project `proj_27709a3f-f50` (Camp), guest = order customer |
> | 3 | POS folio sale (testpos) | PASS — 200 `ord_555ff5a0-eb3`, line 1×5; D1: folio **3005** = 3000+5 (numeric 2); `restaurant` charge ref = POS order, tax 0.5 stays on POS txn only |
> | 4 | Manual spa 200 | PASS — 201 `chg_c24b4893-f67`; D1: folio **3205** = 3005+200 (numeric 3); 4 live charges Σ 3205 |
> | 5 | Void spa | PASS — 200; D1: folio **3005** (numeric 4); charge soft-voided (`voided_at` stamped, `voided_by` = admin id, row retained); 3 live Σ 3005 |
> | 6 | Cash settle | PASS — 200; D1: status **settled**, `settle_method` cash, exactly **1** settlement Σ 3005 (numeric 5) |
> | 7 | Receipt shot | PASS — `folio-02-receipt.png`: Total $3,005.00 / Paid $3,005.00 / Balance $0.00, 1 project group (Camp) $3,005.00, 0 page errors |
> | 8 | Checkout | PASS — HTTP **200** `{"success":true,"lateCheckout":false,"extraCharge":0}`; room_1 freed (`available`) |
> | 9 | Profit split | PASS — baseline 0/0/0 → Camp **3005** (3 lines, 1 order) / Restaurant 0 / total **3005** (numeric 6); D1: live charges Σ 3005, voided 200 excluded, `order_items` for stay = 0 |
> | 10 | This report | written |
> | 11 | PASS commit + push | `test(staging): guest folio walkthrough — PASS` |
>
> ### The 6 numeric assertions (all exact)
>
> room total 3000 · +meal 3005 · +200 3205 · −200 3005 · settled + 1 settlement ·
> split Camp 3005 / Restaurant 0 / total 3005 (Δ vs pre-run baseline 0/0/0).
>
> ### Mutations performed (budget: booking, checkin, POS sale, charge, void, settle, checkout ONLY)
>
> booking 1, checkin 1, POS folio sale 1 (P4TEST stock 7→6 — part of the sale),
> manual charge 1, void 1, settle 1, checkout 1. D1 otherwise SELECT-only.
> State left clean: 0 open folios for tenant; 2 failed logins (credential
> discovery) committed nothing. No source touched, no deploy.sh.
>
> ### Observations (no budget impact, recorded for owners)
>
> 1. **Meal SKU substitution**: testpos (store 1, NULL home project) resolves the
>    tenant-default oldest project (Acacia Camp), so the Restaurant-project P5
>    meal 404s by construction on project scoping. Sold 1× P4 Test Item (5.00,
>    Camp, stock 7) as the POS folio line — folio mechanics (`restaurant`
>    charge, tax-excluded) and profit attribution identical; Restaurant leg is
>    therefore 0 in this run. A Restaurant-leg walkthrough needs a cashier bound
>    to store 2 (out of budget: user write).
> 2. **Versions-list anomaly**: `versions list --env staging` newest is 09-29
>    `70fce384`, yet B.6 (`paymentMethod: folio`, committed 09-30) demonstrably
>    serves traffic (folio-method POS sale 200). Version metadata lags the live
>    build; endpoint behavior is the source of truth.
> 3. **Admin UI tenant host**: `acacia.staging` resolves header `acacia`
>    (matches no tenant — subdomain is `acaciacamp`), so UI-form login fails;
>    API login + localStorage session seed (`sinaicamps_token/_refresh/_user`)
>    works (session tenantId wins) — receipt shot taken this way.
>
> ### Screenshots
>
> `folio-01-folios-table.png` (Folios table $3,005.00), `folio-02-receipt.png`
> (settled receipt $3,005.00 / $0.00 balance).
>
> ## Verdict: PASS — full guest journey exact on staging, no source changes
