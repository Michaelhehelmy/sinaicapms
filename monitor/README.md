# campmaster-monitor

Standalone Cloudflare Worker that watches SinaiCamps production, collects
error/feedback reports, and serves a mobile status dashboard.

Worker name: `campmaster-monitor` · entry `src/index.js` · route
`status.sinaicamps.com` (see `wrangler.toml`).

## 1. What it does

- **Cron probe** (`scheduled` in `src/index.js`): every run probes every entry
  in `TARGETS` (`src/targets.js`) with a per-target timeout (default 10 s,
  `User-Agent: campmaster-monitor/1.0`), writes one `checks` row per target
  (`src/db.js` `recordCheck`), then evaluates alert transitions
  (`evaluateAlerts`).
- **Alerting**: last 3 checks all fail + not already alerting → `down`
  webhook; last 3 checks all ok + currently alerting → `recovery` webhook;
  otherwise bookkeeping only (`alert_state` table).
- **Public status API**: `GET /api/status` (overall ok/degraded/down +
  per-target up/last_status/last_response_ms/uptime_24h/last_error),
  `GET /api/history?target=<name>&hours=<1–168, default 24>`.
- **Intake API**: `POST /report/error` + `POST /report/feedback` (Bearer
  `REPORT_TOKEN`, 60/min per-IP limit, 201 `{id, kind, status: "new"}`).
- **Operator**: `POST /internal/check` (session cookie from 6-digit PIN
  login OR Bearer `REPORT_TOKEN` for scripts; empty body probes all,
  `{"target": "<name>"}` probes one) and `GET /` (session cookie only —
  sign in at `GET /login` with `DASHBOARD_PIN` (6 digits, on-screen keypad); dark mobile
  dashboard with status pill, per-target cards, sparklines, last-20 checks
  and last-20 reports, plus a Log out button posting to `POST /logout`).
  The old `?token=` bookmark is deleted — query tokens never authenticate.
- **Schema** (`migrations/0001_init.sql`, D1 `campmaster-monitor-db`):
  `checks`, `reports`, `alert_state`.
- **Tests**: `tests/` (`alerts`, `check-logic`, `auth`, `api`) —
  `cd monitor && npx vitest run`.

## 2. Owner setup (run from `monitor/`)

Secrets are set via `wrangler secret put` only — never in `wrangler.toml`
(`[vars]` is intentionally empty) and never printed.

```bash
cd monitor

# 1. Create the D1 database, then paste the returned database_id into
#    wrangler.toml ([[d1_databases]] binding DB, database_name
#    "campmaster-monitor-db", migrations_dir "migrations").
wrangler d1 create campmaster-monitor-db

# 2. Apply the schema (0001_init.sql: checks, reports, alert_state).
wrangler d1 migrations apply campmaster-monitor-db --remote

# 3. Set secrets (values prompted interactively, never echoed).
wrangler secret put REPORT_TOKEN
wrangler secret put DASHBOARD_PIN
wrangler secret put ALERT_WEBHOOK_URL

# 4. Deploy. To deploy without the custom domain first, comment out the
#    [[routes]] block (pattern "status.sinaicamps.com"), deploy to
#    *.workers.dev, test, then add the domain later.
wrangler deploy

# 5. Verify.
curl https://status.sinaicamps.com/api/status
```

## 3. First login

1. Deploy with both secrets set (section 2).
2. Visit `https://status.sinaicamps.com/login` in a browser.
3. Enter the 6-digit dashboard PIN once — the server sets a signed
   `monitor_session` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/;
   Max-Age=43200`, 12 hours (or `Max-Age=7776000`, 90 days when Trust this device is checked), well under 4KB) and redirects to `/`.
4. Unauthenticated `GET /` redirects to `/login` (302). The old
   `?token=` bookmark no longer works by design.
5. Log out with the dashboard "Log out" button (`POST /logout` clears
   the cookie with `Max-Age=0`).
6. Missing/invalid `DASHBOARD_PIN` renders a "dashboard PIN not
   configured" page (set it via `wrangler secret put DASHBOARD_PIN`, exactly 6 digits).

`POST /login` is rate-limited (5 failed PIN attempts per 5 minutes per IP in D1 `login_attempts`, 429 `rate limit exceeded`; every attempt inserts one row with the outcome bit only, never the PIN)
and requires a CSRF header (`Origin` or `Referer`, else 400). Attempt rows
older than 1 hour are auto-cleared by the cron `scheduled()` handler
(`clearOldLoginAttempts`), so the gate table stays small with no manual cleanup.

## 4. Rotate the dashboard PIN

1. `wrangler secret put DASHBOARD_PIN` (new value prompted, never echoed).
2. Redeploy (`wrangler deploy` from `monitor/`).
3. All existing session cookies invalidate immediately (sessions are
   HMAC-signed with the PIN itself), so every operator signs in again.

## 5. REPORT_TOKEN for scripts (no browser login)

`POST /internal/check` accepts the session cookie OR
`Authorization: Bearer REPORT_TOKEN` — scripts use the Bearer path with
no cookie or CSRF header:

```bash
curl -X POST https://status.sinaicamps.com/internal/check \
  -H "Authorization: Bearer $REPORT_TOKEN" \
  -H 'Content-Type: application/json' -d '{}'
```

`REPORT_TOKEN` is also the Bearer for `POST /report/error` and
`POST /report/feedback`. It is set via `wrangler secret put REPORT_TOKEN`
only — never in `wrangler.toml`, never printed, never committed.

## 6. How to add a target

Targets live in code, not in the DB — no migration needed.

1. Edit the `TARGETS` array in `src/targets.js`:
   `{ name: '<id>', url: 'https://…', expect: 200, timeoutMs: 10000 }`.
   `expect` is the healthy status: a single number, an array of numbers,
   or `401` for endpoints that require auth (a 200 there would mean auth
   was bypassed).
2. Run `cd monitor && npx vitest run` (tests pin probe/alert behavior).
3. Run `wrangler deploy` from `monitor/`.

Alert state for the new target is created automatically on the first cron
evaluation (`alert_state` upsert).

## 7. Cron interval

`[triggers] crons = [ "*/5 * * * *" ]` in `wrangler.toml` — the `scheduled`
handler (`runProbeCycle` → `evaluateAlerts`) runs **every 5 minutes**.
Change the expression and redeploy to adjust.

## 8. Telegram / Slack alerts

Set the webhook destination via secret (never in `wrangler.toml`):

```bash
cd monitor
wrangler secret put ALERT_WEBHOOK_URL
```

- `ALERT_WEBHOOK_URL` is primary; `TELEGRAM_WEBHOOK_URL` is accepted as an
  alias (Telegram proxy URL or bot API endpoint) — see `getWebhookUrl` in
  `src/index.js`.
- Payload posted is JSON
  `{event, target, url, text, status_code, error_message, checked_at}`
  with `event` = `"down"` or `"recovery"` (see `sendAlert`).
- Point it at a Slack incoming webhook URL for Slack, or a Telegram bot
  API / proxy URL for Telegram.
- Missing/empty means alerts are state-tracked but never sent (silent
  skip — the cron run never crashes for lack of webhook config). A dead
  webhook endpoint likewise cannot fail the run (`sendAlert` never throws).

## 9. Troubleshooting

- `wrangler deploy` fails on the route: comment out the `[[routes]]`
  block (`pattern = "status.sinaicamps.com"`) and deploy to
  `*.workers.dev` first, then add the custom domain later.
- `database_id` placeholder: `wrangler.toml` ships with
  `database_id = "<owner pastes after wrangler d1 create>"` — replace it
  with the id from step 1 before deploying.
- Dashboard redirects to `/login`: `GET /` needs the `monitor_session`
  cookie from `POST /login` (`DASHBOARD_PIN`, constant-time compare;
  missing/invalid/expired → 302 to `/login` by design). The old
  `?token=` bookmark never authenticates.
- `/login` returns 500 "dashboard PIN not configured": set it via
  `wrangler secret put DASHBOARD_PIN` (exactly 6 digits) from `monitor/`, then redeploy.
- `/login` returns 429: the D1-backed 5-fails-per-5-minutes-per-IP gate fired
  (D1 `login_attempts` on `cf-connecting-ip` only; no KV writes, so it never
  touches the free-plan 1,000/day quota).
- `/login` or `/logout` return 400 `csrf required`: send `Origin` (or
  `Referer`) — browsers do this automatically on same-origin POSTs.
- `/report/*` return 401: they take `REPORT_TOKEN` (Bearer only, no
  `?token=`); check `wrangler secret put REPORT_TOKEN`.
- `/internal/check` returns 401: it takes the session cookie OR Bearer
  `REPORT_TOKEN` (scripts); check one of the two is valid.
- `/report/*` returns 429: the in-memory 60/min per-IP limiter fired
  (per-isolate Map on `cf-connecting-ip` only — same trade-off as the main
  backend's `RATE_LIMIT_KV_ENABLED="false"` fallback; no KV writes, so it
  never touches the free-plan 1,000/day quota).
- `/api/history` returns 400: `target` query param is required and must
  match a `TARGETS` name; `hours` is clamped to 1–168.
- No alerts arriving but status shows down: webhook secret missing
  (silent skip by design) or the 3-consecutive-failure threshold not yet
  reached — check `alert_state` rows.
- Never commit secrets, `.env` files, or token values; never add KV
  writes (free-plan quota).
