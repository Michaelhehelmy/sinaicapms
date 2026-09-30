# Folio Restaurant-Leg Verification (staging, commit 12)

- Date: 2026-09-30 UTC
- Spec: `.opencode/agents/tmp/2026-09-30-frest.md` (task `folio-rest-leg`)
- Baseline: `cce74f8` confirmed pushed (`git rev-parse HEAD` == `git ls-remote origin HEAD` == `cce74f8`; tracked tree clean apart from pre-existing untracked spec/scratch) before any write.
- Target: `https://staging.sinaicamps.com` (reachability: `GET /api/openapi.json` → 200; unauth `GET /api/folios` → 401 mounted, not 404).
- Scope: staging only. Steps 1–4 per mission, in order. Writes: folio create (none open) + ONE charge post. Nothing else. No source touched, no deploy.sh.
- Credentials: acacia admin JWT obtained via login (`admin.test@acaciacamp.com`, tenant `acaciacamp` → `tenant_a2d040ea-3b1`), used from `chmod 600` files, never printed, **shredded after** (zero `eyJ` strings in this file — user id `adm_291a0396-a73` only).

## Step 1 — Restaurant project check (no write)

`GET /api/projects` → 2 projects. Restaurant project **present**:

- `camp_e323b315-725` / "Acacia Restaurant" / `projectType: restaurant` / `status: active` (created 2026-09-27, P5 walkthrough staging project).
- Camp: `proj_27709a3f-f50` / "Acacia Camp" / `projectType: camp`.

No project create performed (spec: create via admin UI only if absent — not absent, documented here).

## Step 2 — Open folio (one allowed create)

`GET /api/folios?status=open` → `open: 0, settled: 1, voided: 0` (the settled one is the B.8 walkthrough folio `folio_7b1929c1-5ea`). No open folio, so:

`POST /api/folios` `{"notes":"restaurant-leg probe (frest)"}` → **HTTP 201**:

```json
{"success":true,"id":"folio_c3277f3d-0a7","status":"open","guestId":null,"primaryOrderId":null,"totalAmount":0}
```

## Step 3 — ONE restaurant charge post

`POST /api/folios/folio_c3277f3d-0a7/charges` `{"source":"restaurant","description":"Seafood platter","quantity":1,"unitPrice":50,"projectId":"camp_e323b315-725"}` → **HTTP 201**:

```json
{"success":true,"id":"chg_a7e74b03-270","folioId":"folio_c3277f3d-0a7","source":"restaurant","description":"Seafood platter","quantity":1,"unitPrice":50,"totalPrice":50,"totalAmount":50}
```

Folio detail confirms the line: `projectId camp_e323b315-725`, `postedAt 2026-09-30 07:16:42`, `voidedAt null`; folio `totalAmount 50`, `status open`.

## Step 4 — GET revenue-breakdown full JSON (verbatim)

`GET /api/reports/revenue-breakdown?days=30` → **HTTP 200**:

```json
{
  "days": 30,
  "byProductType": [
    {"type": "room", "revenue": 3000, "orderCount": 2},
    {"type": "menu", "revenue": 100, "orderCount": 2},
    {"type": "retail", "revenue": 20, "orderCount": 2}
  ],
  "byPaymentMethod": [
    {"method": "storefront", "revenue": 3100, "count": 2},
    {"method": "cash", "revenue": 16.5, "count": 1},
    {"method": "folio", "revenue": 5.5, "count": 1}
  ],
  "accommodation": {"revenue": 3000, "orderCount": 1}
}
```

Note: revenue-breakdown splits by product-type / payment-method (POS + storefront legs), never by project — the project split lives in `GET /api/reports/profit` (B.7 folio leg, commit `ff68a91`). Profit JSONs below are the verdict surface.

## Verdict surface — GET profit (verbatim)

`GET /api/reports/profit?days=30` → **HTTP 200**:

```json
{
  "start": "2026-08-31",
  "end": "2026-09-30",
  "byProject": [
    {"projectId": "proj_27709a3f-f50", "projectName": "Acacia Camp", "projectType": "camp", "revenue": 6005, "lineCount": 5, "orderCount": 3},
    {"projectId": "camp_e323b315-725", "projectName": "Acacia Restaurant", "projectType": "restaurant", "revenue": 150, "lineCount": 3, "orderCount": 3}
  ],
  "total": {"totalRevenue": 6155, "totalLines": 8, "totalOrders": 4}
}
```

The 30-day Restaurant=150 decomposes exactly by date window (reads only):

- `GET /api/reports/profit?start=2026-09-30&projectId=camp_e323b315-725` → Restaurant **50**, 1 line, 1 order (today only — exactly our `chg_a7e74b03-270`).
- `GET /api/reports/profit?start=2026-09-27&projectId=camp_e323b315-725` → Restaurant **150**, 3 lines, 3 orders — the extra 2 lines / 100 predate today (P5 leftovers on the restaurant project, non-folio legs; only 2 folios exist tenant-wide and the B.8 folio's live charges are Camp-pinned + its spa line is voided).

So: **Restaurant=50 separated** — not 0, not absorbed into Camp (Camp 6005 = B.8 3005 + a second 3000 stay; our 50 sits only in the restaurant bucket via the folio leg's `project_id` pin).

## Mutations performed (budget)

Project create 0 (existed) · folio create 1 (`folio_c3277f3d-0a7`, left open by design) · charge post 1 (`chg_a7e74b03-270`, 1×50 Seafood platter) · logins 1. D1 otherwise untouched; no source, no deploy.sh, no KV writes. JWT shredded.

## Verdict: PASS — restaurant charge attributed to the Restaurant project, separated from Camp
