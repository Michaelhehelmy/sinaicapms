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
- **Operator**: `POST /internal/check` (Bearer `REPORT_TOKEN`; empty body
  probes all, `{"target": "<name>"}` probes one) and `GET /` (Bearer
  `DASHBOARD_TOKEN` via `Authorization` header or `?token=`; dark mobile
  dashboard with status pill, per-target cards, sparklines, last-20 checks
  and last-20 reports).
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
wrangler secret put DASHBOARD_TOKEN
wrangler secret put ALERT_WEBHOOK_URL

# 4. Deploy. To deploy without the custom domain first, comment out the
#    [[routes]] block (pattern "status.sinaicamps.com"), deploy to
#    *.workers.dev, test, then add the domain later.
wrangler deploy

# 5. Verify.
curl https://status.sinaicamps.com/api/status
```

## 3. How to add a target

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

## 4. Cron interval

`[triggers] crons = [ "*/5 * * * *" ]` in `wrangler.toml` — the `scheduled`
handler (`runProbeCycle` → `evaluateAlerts`) runs **every 5 minutes**.
Change the expression and redeploy to adjust.

## 5. Telegram / Slack alerts

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

## 6. Troubleshooting

- `wrangler deploy` fails on the route: comment out the `[[routes]]`
  block (`pattern = "status.sinaicamps.com"`) and deploy to
  `*.workers.dev` first, then add the custom domain later.
- `database_id` placeholder: `wrangler.toml` ships with
  `database_id = "<owner pastes after wrangler d1 create>"` — replace it
  with the id from step 1 before deploying.
- Dashboard returns 401 JSON: `GET /` needs `DASHBOARD_TOKEN` as
  `Authorization: Bearer <token>` or `?token=<token>` (constant-time
  compare; missing/invalid → 401 by design).
- `/report/*` or `/internal/check` return 401: they take `REPORT_TOKEN`
  (Bearer only, no `?token=`); check `wrangler secret put REPORT_TOKEN`.
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
