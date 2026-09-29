import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { TARGETS, matchesExpect } from './targets.js';
import * as db from './db.js';

const app = new Hono();

// /api/status and /api/history are intentionally public (hostnames and
// response times are not sensitive), so cross-origin reads are allowed.
app.use(
  '/api/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Probe one target with a hard timeout. Never throws — network failures,
// timeouts, and non-2xx handling all fold into the returned row.
export async function probeTarget(target, fetchFn = fetch) {
  const timeoutMs = target.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetchFn(target.url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'campmaster-monitor/1.0' },
    });
    const responseMs = Date.now() - started;
    const statusCode = res.status;
    return {
      statusCode,
      ok: matchesExpect(statusCode, target.expect) ? 1 : 0,
      responseMs,
      errorMessage: null,
    };
  } catch (err) {
    return {
      statusCode: null,
      ok: 0,
      responseMs: Date.now() - started,
      errorMessage: String(err?.message || err).slice(0, 500),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Probe every target concurrently and persist one `checks` row each.
// Alert evaluation happens after the writes (wired in a later change).
export async function runProbeCycle(env, fetchFn = fetch) {
  const settled = await Promise.all(
    TARGETS.map(async (target) => {
      const row = await probeTarget(target, fetchFn);
      await db.recordCheck(env.DB, { target: target.name, ...row });
      return { name: target.name, url: target.url, ...row };
    }),
  );
  return settled;
}

// Public aggregate status across all targets.
app.get('/api/status', async (c) => {
  const latest = await db.getLatestPerTarget(c.env.DB);
  const byTarget = new Map(latest.map((row) => [row.target, row]));
  const lastCheck = await db.getLastCheckTime(c.env.DB);
  const since = new Date(Date.now() - 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  const targets = [];
  for (const t of TARGETS) {
    const row = byTarget.get(t.name) ?? null;
    targets.push({
      name: t.name,
      url: t.url,
      up: row ? row.ok === 1 : false,
      last_status: row?.status_code ?? null,
      last_response_ms: row?.response_ms ?? null,
      uptime_24h: await db.getUptimeSince(c.env.DB, t.name, since),
      last_error: row?.error_message ?? null,
    });
  }

  const upCount = targets.filter((t) => t.up).length;
  const overall = upCount === targets.length ? 'ok' : upCount === 0 ? 'down' : 'degraded';
  return c.json({
    overall,
    checked_at: db.toIso(lastCheck),
    targets,
  });
});

// Public per-target history. `target` is required; hours defaults to 24 (max 168).
app.get('/api/history', async (c) => {
  const target = c.req.query('target');
  if (!target) return c.json({ error: 'target query param is required' }, 400);
  if (!TARGETS.some((t) => t.name === target)) return c.json({ error: 'unknown target' }, 400);

  let hours = parseInt(c.req.query('hours') ?? '24', 10);
  if (Number.isNaN(hours)) hours = 24;
  hours = Math.min(Math.max(hours, 1), 168);

  const checks = await db.getHistory(c.env.DB, target, hours, 500);
  return c.json({ target, hours, checks });
});

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error('monitor request failed', err?.message ?? err);
  return c.json({ error: 'internal error' }, 500);
});

// Webhook destination for down/recovery alerts. ALERT_WEBHOOK_URL is primary;
// TELEGRAM_WEBHOOK_URL is accepted as an alias (Telegram proxy URL or bot API
// endpoint). Set via `wrangler secret put` — never in wrangler.toml [vars].
// Missing/empty means alerts are state-tracked but never sent (silent skip:
// the cron run must never crash for lack of webhook config).
export function getWebhookUrl(env) {
  return env?.ALERT_WEBHOOK_URL || env?.TELEGRAM_WEBHOOK_URL || null;
}

// POST one alert payload. Resolves { sent:true } / { skipped:true } — never
// throws, so a dead webhook endpoint can't fail the cron run either.
export async function sendAlert(env, { target, url, event, statusCode, errorMessage }, fetchFn = fetch) {
  const webhookUrl = getWebhookUrl(env);
  if (!webhookUrl) return { skipped: true };
  const text =
    event === 'recovery'
      ? `✅ campmaster-monitor: ${target} RECOVERED (${url})`
      : `🔴 campmaster-monitor: ${target} is DOWN (${url})${statusCode != null ? ` — HTTP ${statusCode}` : ''}${errorMessage ? ` — ${errorMessage}` : ''}`;
  try {
    await fetchFn(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'campmaster-monitor/1.0' },
      body: JSON.stringify({
        event,
        target,
        url,
        text,
        status_code: statusCode ?? null,
        error_message: errorMessage ?? null,
        checked_at: new Date().toISOString(),
      }),
    });
    return { sent: true };
  } catch {
    return { skipped: true };
  }
}

// Evaluate alert transitions AFTER the probe rows are written:
//   - last 3 checks all fail + not already alerting → alerting=1, send "down"
//   - last 3 checks all ok + currently alerting → alerting=0, send "recovery"
//   - otherwise → consecutive_failures bookkeeping only, no webhook.
// `probeResults` scopes evaluation (subset of TARGETS); omit to evaluate all.
export async function evaluateAlerts(env, probeResults, fetchFn = fetch) {
  const names = (probeResults ?? []).map((r) => r.name);
  const list = names.length ? TARGETS.filter((t) => names.includes(t.name)) : TARGETS;
  const outcomes = [];
  for (const target of list) {
    const last3 = await db.getLastNChecks(env.DB, target.name, 3);
    const state = await db.getAlertState(env.DB, target.name);
    const latest = last3[last3.length - 1] ?? null;
    const consecutiveFailures = latest && !latest.ok ? (state?.consecutive_failures ?? 0) + 1 : 0;
    const last3Fail = last3.length >= 3 && last3.every((r) => !r.ok);
    const last3Ok = last3.length >= 3 && last3.every((r) => r.ok);
    const alerting = state?.alerting === 1;
    let event = null;
    if (last3Fail && !alerting) event = 'down';
    else if (last3Ok && alerting) event = 'recovery';
    const nextAlerting = event === 'down' ? 1 : event === 'recovery' ? 0 : alerting ? 1 : 0;
    await db.upsertAlertState(env.DB, target.name, {
      consecutiveFailures,
      alerting: nextAlerting === 1,
      lastAlertAt: event
        ? new Date().toISOString().slice(0, 19).replace('T', ' ')
        : (state?.last_alert_at ?? null),
    });
    let notified = false;
    if (event) {
      const res = await sendAlert(
        env,
        {
          target: target.name,
          url: target.url,
          event,
          statusCode: latest?.status_code ?? null,
          errorMessage: latest?.error_message ?? null,
        },
        fetchFn,
      );
      notified = !!res.sent;
    }
    outcomes.push({
      target: target.name,
      event,
      notified,
      alerting: nextAlerting === 1,
      consecutiveFailures,
    });
  }
  return outcomes;
}

// Cron entry: probe every target, store the rows, then evaluate alerts.
// Runs every 5 minutes via the [triggers] crons schedule in wrangler.toml.
async function scheduled(event, env, ctx) {
  const results = await runProbeCycle(env);
  await evaluateAlerts(env, results);
}

export default { fetch: app.fetch, scheduled };
export { app, scheduled };
