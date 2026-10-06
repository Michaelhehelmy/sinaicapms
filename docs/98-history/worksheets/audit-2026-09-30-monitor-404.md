---
title: "Audit — monitor custom-domain 404 (2026-09-30, read-only, no fixes)"
aliases:
tags:
  - type/worksheet
  - audience/developer
  - domain/operations
  - status/done
created: 2026-09-30
updated: 2026-10-06
relates-to:
  - "[[98-history/worksheets/README]]"
  - "[[RUNBOOK]]"
  - "[[98-history/sessions/AGENT_LOGBOOK_HISTORY]]"
code-references:
  - "monitor/wrangler.toml"
  - "backend/wrangler.toml"
  - "monitor/src/index.js:665"
  - "backend/src/utils/response.js:87"
  - "backend/src/index.js:908"
verified: never
---
# Audit — monitor custom-domain 404 (2026-09-30, read-only, no fixes)

Tmp agent `mon-b1-diagnose` per `.opencode/agents/tmp/2026-09-30-mnb1.md`.
Baseline confirmed pushed before write: `git rev-parse HEAD` == `git rev-parse origin/main` == `0f3ddab85c618c5e3daec9b07b85d38d52b42c24` (branch `main`, 0 ahead/behind). No code/config touched; no deploy; no dashboard changes.

## 1. Config reads

`monitor/wrangler.toml`: `name = "campmaster-monitor"`, `main = "src/index.js"`, one route block —
`pattern = "status.sinaicamps.com"`, `custom_domain = true` (no `zone_name`, root path only, no path suffix).

`backend/wrangler.toml` production routes (the zone wildcard check, read-only):
`pattern = "sinaicamps.com/api/*"` + `pattern = "*.sinaicamps.com/api/*"`, both `zone_name = "sinaicamps.com"`.
The wildcard covers `status.sinaicamps.com/api/*`.

## 2. Live probes (custom domain, 2026-09-30 ~15:10–15:13 UTC)

| URL | Result | Body head |
| --- | --- | --- |
| `GET https://status.sinaicamps.com/api/status` | **404** (repeatable, ~1.0–1.3 s) | `{"success":false,"error":"API endpoint not found"}` |
| `GET https://status.sinaicamps.com/api/history?target=production&hours=24` | **404** | `{"success":false,"error":"API endpoint not found"}` (same) |
| `GET https://status.sinaicamps.com/` | **302**, `location: /login`, empty body | — |
| `GET https://status.sinaicamps.com/login` | **200** `text/html` | Monitor login page (`<title>Sign in — SinaiCamps Status</title>`, keypad + trust-device copy — byte-matches `buildLoginHtml` in `monitor/src/index.js`) |
| DNS `status.sinaicamps.com` | Cloudflare anycast (104.21.72.218, 172.67.155.160, IPv6) — proxied, TLS valid | — |

Not probed (recorded absence, owner action): `workers.dev` baseline — no `*.workers.dev` hostname for `campmaster-monitor` exists anywhere in-repo, and the sandbox cannot reach the Cloudflare API (see §3), so the workers.dev URL is undiscoverable read-only. Owner: `curl https://campmaster-monitor.<account>.workers.dev/api/status` (expect 200 `{overall,…}`).

## 3. Wrangler CLI (recorded absence + dashboard owner-action)

- `wrangler deployments list --config wrangler.toml` → `fetch failed` (sandbox→api.cloudflare.com egress blocked; `wrangler whoami` fails identically). Bound entity serving traffic cannot be confirmed from here.
- `wrangler domains list` / `wrangler custom-domains list` → `Unknown arguments` on wrangler 4.144.0 (no such subcommand).
- Owner dashboard action: Workers & Pages → `campmaster-monitor` → Settings → Domains & Routes — confirm `status.sinaicamps.com` Enabled, and check whether any other worker (notably `campmaster-backend`) lists a route covering this hostname.

## 4. Body fingerprint (decisive)

- Observed `/api/*` 404 envelope `{success:false, error}` is the backend's `errorResponse` (`backend/src/utils/response.js:87`) served by its catch-all `app.all('/api/*', () => errorResponse('API endpoint not found', 404))` (`backend/src/index.js:908`).
- The monitor's own 404 is a different shape — `c.json({ error: 'not found' }, 404)` (`monitor/src/index.js:665`, no `success` key) — and was NEVER observed.
- The backend's `GET /` serves a "SinaiCamps API" HTML page (`backend/src/index.js:156`) — NEVER observed; observed `/` → 302 `/login` is the monitor's session-gated dashboard handler, and `/login` serves the monitor's exact login HTML.
- Therefore on one hostname two workers split traffic by path: `/api/*` → `campmaster-backend`, everything else → `campmaster-monitor`.

## 5. Verdict — Option 2 (route shadowing by backend wildcard)

Candidate root causes (parent-task Options 1–5 reconstructed; no Options list exists in-repo):

- **Option 1 — custom domain not attached to the monitor at all.** REFUTED: `/` (302 → `/login`) and `/login` (200, monitor login HTML) prove the `status.sinaicamps.com` custom-domain binding on `campmaster-monitor` is live.
- **Option 2 — overlapping backend wildcard route shadows `/api/*`.** CONFIRMED: backend production route `*.sinaicamps.com/api/*` (zone `sinaicamps.com`) matches `status.sinaicamps.com/api/*` and outranks the monitor's root-path custom-domain route for those URLs; the 404 body is byte-identical to the backend catch-all, while non-`/api` paths reach the monitor. This is the split-brain observed in §2+§4.
- **Option 3 — stale/wrong deployment serving.** REFUTED: `/login` serves current monitor code (keypad + 90-day trust-device copy per `buildLoginHtml`).
- **Option 4 — DNS misconfiguration.** REFUTED: resolves to Cloudflare anycast, valid TLS, requests reach Cloudflare Workers (both workers respond per Host+path routing).
- **Option 5 — monitor app-level router bug.** REFUTED: monitor's `GET /api/status` is public and unconditional (`monitor/src/index.js:76`); its own 404 shape never appears on the wire.

**Verdict: Option 2.** `status.sinaicamps.com/api/*` is served by `campmaster-backend` (404 `API endpoint not found` from its `/api/*` catch-all), not by `campmaster-monitor`, because the backend's `*.sinaicamps.com/api/*` zone route wins over the monitor's root-path custom-domain route for `/api/*` paths.

Suggested remediation (NOT applied — read-only spec; owner/deployer action): narrow or except the backend wildcard (e.g. remove `*.sinaicamps.com/api/*` reliance for the `status` host, or add an explicit higher-specificity route binding `status.sinaicamps.com/api/*` → `campmaster-monitor`), then re-verify `curl https://status.sinaicamps.com/api/status` returns 200 `{overall,…}` and re-run `wrangler deployments list` from a network with Cloudflare API access.
