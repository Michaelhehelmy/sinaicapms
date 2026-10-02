import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { TARGETS, matchesExpect } from './targets.js';
import * as db from './db.js';
import {
  SESSION_COOKIE,
  SESSION_DEFAULT_MAX_AGE,
  SESSION_TRUSTED_MAX_AGE,
  parseCookie,
  signSession,
  verifySession,
  buildSessionCookie,
  clearSessionCookie,
} from './auth.js';

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

// --- Public read cache (in-memory, 20s TTL) ---
//
// PERFORMANCE (2026-09-30): the dashboard polls /api/status once plus
// /api/history once per card on every refresh, and each poll re-ran the same
// D1 aggregates. Even on the 60s interval that is 1 + N reads per viewer per
// minute, multiplied by however many dashboards are open. A short TTL collapses
// every read inside one window onto a single D1 query and takes that fan-out
// back out of the picture.
//
// 20s is deliberately shorter than the 5-minute probe cron, so the cache can
// never serve data older than one full probe run — it only absorbs duplicate
// reads and bursty multi-viewer traffic, it does not change what the dashboard
// shows.
//
// Best-effort by design, and deliberately NOT KV: per-isolate Map on
// globalThis, so a cold isolate simply queries (same trade-off as the report
// rate limiter above). A KV write per public read would burn the free plan's
// 1,000 writes/day quota, which is exactly the outage documented in AGENTS.md.
//
// Errors are NEVER cached: `producer` throws → nothing is stored, so the next
// request retries D1 rather than pinning a transient failure for 20s.
export const PUBLIC_CACHE_TTL_MS = 20_000;

// Bound on the history fan-out (N targets * 3 window sizes); a dashboard that
// asks for more still gets correct answers, just from D1.
const PUBLIC_CACHE_MAX_ENTRIES = 256;

function publicCacheStore() {
  if (!globalThis.__monitorPublicCache) globalThis.__monitorPublicCache = new Map();
  return globalThis.__monitorPublicCache;
}

// Drop every cached public read. Exported so tests can isolate themselves (each
// test builds its own D1 stub) and so a deploy can never inherit a stale entry
// from a recycled isolate.
export function clearPublicCache() {
  publicCacheStore().clear();
}

// Read-through cache. `key` is 'status' or `history:<target>|<hours>`.
// Returns the cached payload when it is younger than TTL, otherwise awaits
// `producer()` and stores the resolved value. Entries older than the TTL are
// never returned (and are dropped on the next write).
export async function withPublicCache(key, producer, now = Date.now()) {
  const store = publicCacheStore();
  const hit = store.get(key);
  if (hit && now - hit.at < PUBLIC_CACHE_TTL_MS) return hit.value;

  // Throws propagate to the route (500) with nothing written to the store.
  const value = await producer();

  if (store.size >= PUBLIC_CACHE_MAX_ENTRIES) {
    for (const [k, entry] of store) {
      if (now - entry.at >= PUBLIC_CACHE_TTL_MS) store.delete(k);
    }
    while (store.size >= PUBLIC_CACHE_MAX_ENTRIES) {
      store.delete(store.keys().next().value);
    }
  }
  store.set(key, { value, at: now });
  return value;
}

// Public aggregate status across all targets.
app.get('/api/status', async (c) => {
  // Cache the finished payload, not the per-target query results: one entry for
  // the whole aggregate, so concurrent viewers share a single D1 read.
  const payload = await withPublicCache('status', async () => {
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
    return {
      overall,
      checked_at: db.toIso(lastCheck),
      targets,
    };
  });
  return c.json(payload);
});

// Public per-target history. `target` is required; hours defaults to 24 (max 168).
app.get('/api/history', async (c) => {
  // Validate BEFORE the cache so a 400 is never stored under any key.
  const target = c.req.query('target');
  if (!target) return c.json({ error: 'target query param is required' }, 400);
  if (!TARGETS.some((t) => t.name === target)) return c.json({ error: 'unknown target' }, 400);

  let hours = parseInt(c.req.query('hours') ?? '24', 10);
  if (Number.isNaN(hours)) hours = 24;
  hours = Math.min(Math.max(hours, 1), 168);

  // Keyed by the normalized target|hours so `/api/history?target=x&hours=07`
  // and `?hours=7` share one entry.
  const payload = await withPublicCache(`history:${target}|${hours}`, async () => {
    const checks = await db.getHistory(c.env.DB, target, hours, 500);
    return { target, hours, checks };
  });
  return c.json(payload);
});

// --- A.4 API + dashboard (append-only; A.3 routes/helpers above untouched) ---

// Constant-time string compare over UTF-8 bytes (length folded into the diff
// so short/long guesses take the same path). Guards REPORT_TOKEN /
// DASHBOARD_PIN against timing side-channels. Never throws.
export function timingSafeEqual(provided, expected) {
  const a = new TextEncoder().encode(String(provided ?? ''));
  const b = new TextEncoder().encode(String(expected ?? ''));
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return len > 0 && diff === 0;
}

// Extract the credential from an `Authorization: Bearer <token>` header.
// Returns null when missing or malformed (never throws).
export function getBearerToken(header) {
  const m = /^Bearer (.+)$/.exec(String(header ?? '').trim());
  if (!m) return null;
  const token = m[1].trim();
  return token ? token : null;
}

// True when the request header carries `expected` (constant-time). Fail-closed:
// missing header, malformed scheme, empty token, or unconfigured `expected`
// all deny.
export function isAuthorizedToken(header, expected) {
  if (!expected) return false;
  const provided = getBearerToken(header);
  if (!provided) return false;
  return timingSafeEqual(provided, expected);
}

// In-memory 60/min per-IP limiter for /report/*. Per-isolate Map on globalThis
// (same trade-off as the main backend's RATE_LIMIT_KV_ENABLED="false" fallback:
// per-isolate, resets on restart — acceptable for an intake endpoint on the
// free plan, where a KV write per request would exhaust the 1,000/day quota).
// Only cf-connecting-ip is trusted (not spoofable x-forwarded-for).
export const REPORT_RATE_LIMIT = 60;
export const REPORT_RATE_WINDOW_MS = 60_000;

function reportRateStore() {
  if (!globalThis.__monitorReportRate) globalThis.__monitorReportRate = new Map();
  return globalThis.__monitorReportRate;
}

// Returns { allowed, count, limit }. Exported for tests.
export function checkReportRateLimit(ip, now = Date.now()) {
  const store = reportRateStore();
  const windowStart = Math.floor(now / REPORT_RATE_WINDOW_MS) * REPORT_RATE_WINDOW_MS;
  if (store.size > 2000) {
    for (const key of store.keys()) {
      const w = Number(key.slice(key.lastIndexOf(':') + 1));
      if (Number.isFinite(w) && w < windowStart) store.delete(key);
    }
  }
  const key = `${ip}:${windowStart}`;
  const count = (store.get(key) ?? 0) + 1;
  store.set(key, count);
  return { allowed: count <= REPORT_RATE_LIMIT, count, limit: REPORT_RATE_LIMIT };
}

export function getClientIp(c) {
  return c.req.header('cf-connecting-ip')?.trim() || 'unknown';
}

// POST /login brute-force budget: 5 failed PIN attempts per 5 minutes per IP,
// enforced in D1 via the login_attempts table (see db.js recordLoginAttempt /
// getRecentFailCount + migrations/0002_login_attempts.sql). D1-backed so the
// budget survives isolate restarts; only cf-connecting-ip is trusted (not
// spoofable x-forwarded-for). No KV writes (free-plan 1,000/day quota).
// Every POST /login inserts exactly one attempt row (success + failure +
// rate-limited alike) — only the outcome bit, never the PIN value or hash.
export const LOGIN_FAIL_LIMIT = 5;
export const LOGIN_FAIL_WINDOW = '5 minutes';

// CSRF gate for cookie-authenticated POSTs (/login, /logout). Browsers
// always send Origin (fetch/form) or Referer on same-origin POSTs; a
// missing pair means a forged cross-site request path. Returns true when
// the gate passes.
export function hasCsrfHeader(c) {
  return Boolean(c.req.header('origin') || c.req.header('referer'));
}

// True when the request carries a fresh session cookie signed with
// DASHBOARD_PIN. Fail-closed: unconfigured/invalid PIN, missing cookie,
// or bad/expired signature all deny. Never throws, never logs.
export async function hasValidSession(c, now = Date.now()) {
  const pin = c.env?.DASHBOARD_PIN;
  if (!pin || !/^\d{6}$/.test(pin)) return false;
  const cookies = parseCookie(c.req.header('cookie'));
  const value = cookies[SESSION_COOKIE];
  if (!value) return false;
  return verifySession(value, pin, now);
}

// PIN login form (GET /login). No token or PIN bytes in the page — the 6-digit
// PIN posts to POST /login which sets the HttpOnly session cookie. The PIN
// itself never appears in a URL (no ?pin= / ?token= path authenticates).
// Includes an on-screen keypad (10 digit buttons), a <noscript> fallback
// (the plain PIN field + submit keep working with JS disabled), and a
// prefers-reduced-motion guard.
function buildLoginHtml() {
  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const keys = digits.map((d) => `<button type="button" class="key" data-digit="${d}">${d}</button>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in — SinaiCamps Status</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0}
.wrap{max-width:24rem;margin:4rem auto;padding:1rem}
.card{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:1.5rem}
h1{font-size:1.1rem;margin:0 0 1rem}
label{display:block;font-size:.8rem;color:#cbd5e1;margin-bottom:.3rem}
input[type=text]{width:100%;padding:.6rem;font-size:1.25rem;letter-spacing:.4em;text-align:center;border-radius:.5rem;border:1px solid #475569;background:#0b1220;color:#e2e8f0}
button[type=submit]{width:100%;padding:.7rem;margin-top:1rem;font-size:.9rem;font-weight:700;color:#0f172a;background:#38bdf8;border:0;border-radius:.6rem}
.keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:.5rem;margin-top:1rem}
.key{padding:.8rem;font-size:1.1rem;font-weight:700;color:#e2e8f0;background:#0b1220;border:1px solid #475569;border-radius:.6rem}
.key:active{background:#334155}
.trust{display:flex;align-items:center;gap:.5rem;margin-top:1rem;font-size:.8rem;color:#cbd5e1}
.trust input{width:auto}
.muted{color:#94a3b8;font-size:.75rem;margin-top:1rem}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style>
</head>
<body>
<div class="wrap"><div class="card">
<h1>SinaiCamps Status — sign in</h1>
<form method="POST" action="/login">
<label for="pin">6-digit PIN</label>
<input id="pin" name="pin" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required>
<div class="keypad">${keys}</div>
<label class="trust"><input type="checkbox" name="trust" value="1"> Trust this device for 90 days</label>
<button type="submit">Sign in</button>
</form>
<noscript><p>Enter your 6-digit PIN above and press Sign in. The on-screen keypad needs JavaScript; the PIN field works without it.</p></noscript>
<p class="muted">Session cookie lasts 12 hours, or 90 days on trusted devices (HttpOnly, Secure, SameSite=Strict). 5 wrong tries per 5 minutes per IP, then try again later.</p>
</div></div>
<script>
(function(){
var input = document.getElementById('pin');
var keys = document.querySelectorAll('.key');
for (var i = 0; i < keys.length; i++) {
  keys[i].addEventListener('click', function(){
    if (input.value.length < 6) input.value += this.getAttribute('data-digit');
    input.focus();
  });
}
})();
</script>
</body>
</html>`;
}

// Error page when DASHBOARD_PIN is not configured (missing or not 6 digits).
// Names the secret to set (`wrangler secret put DASHBOARD_PIN`) without ever
// printing or requiring its value.
function buildUnconfiguredHtml() {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dashboard not configured</title></head>
<body style="background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif">
<div style="max-width:28rem;margin:4rem auto;padding:1rem">
<h1>Dashboard PIN not configured</h1>
<p>Set it via <code>wrangler secret put DASHBOARD_PIN</code> from <code>monitor/</code>, then redeploy. It must be exactly 6 digits.</p>
</div>
</body>
</html>`;
}

// Minimal HTML escaper for server-rendered dashboard values (report messages,
// page URLs, probe error strings are all operator/user-controlled).
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const REPORT_BODY_LIMITS = { message: 2000, page_url: 500, contact: 200 };

// Shared intake handler for POST /report/error + POST /report/feedback.
// Order: IP rate limit (60/min, throttles token brute-force too) → Bearer
// REPORT_TOKEN (401) → JSON + field validation (400) → D1 insert (201).
async function handleReport(c, kind) {
  const rl = checkReportRateLimit(getClientIp(c));
  if (!rl.allowed) return c.json({ error: 'rate limit exceeded' }, 429);
  if (!isAuthorizedToken(c.req.header('authorization'), c.env.REPORT_TOKEN)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return c.json({ error: 'message is required' }, 400);
  if (message.length > REPORT_BODY_LIMITS.message) {
    return c.json({ error: 'message too long (max 2000 chars)' }, 400);
  }
  const pageUrl = typeof body?.page_url === 'string' ? body.page_url.trim() : null;
  const contact = typeof body?.contact === 'string' ? body.contact.trim() : null;
  if (pageUrl && pageUrl.length > REPORT_BODY_LIMITS.page_url) {
    return c.json({ error: 'page_url too long (max 500 chars)' }, 400);
  }
  if (contact && contact.length > REPORT_BODY_LIMITS.contact) {
    return c.json({ error: 'contact too long (max 200 chars)' }, 400);
  }
  const id = await db.insertReport(c.env.DB, {
    kind,
    message,
    pageUrl: pageUrl || null,
    contact: contact || null,
  });
  return c.json({ id, kind, status: 'new' }, 201);
}

app.post('/report/error', (c) => handleReport(c, 'error'));
app.post('/report/feedback', (c) => handleReport(c, 'feedback'));

// Manual probe trigger (operator runbook + dashboard "Check Now" stays a
// same-origin refresh — see dashboard script). Bearer REPORT_TOKEN (401).
// Optional JSON { target }: one known target name probes just that target;
// empty body probes all. Unknown target → 400. Always 200 with the alert
// evaluation outcomes (probe rows are written first, same as the cron path).
app.post('/internal/check', async (c) => {
  const cookieOk = await hasValidSession(c);
  const bearerOk = isAuthorizedToken(c.req.header('authorization'), c.env.REPORT_TOKEN);
  if (!cookieOk && !bearerOk) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  let targetName = null;
  const raw = await c.req.text();
  if (raw) {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    targetName = body?.target ?? null;
    if (targetName != null && !TARGETS.some((t) => t.name === targetName)) {
      return c.json({ error: 'unknown target' }, 400);
    }
  }
  let probed;
  if (targetName) {
    const t = TARGETS.find((x) => x.name === targetName);
    const row = await probeTarget(t);
    await db.recordCheck(c.env.DB, { target: t.name, ...row });
    probed = [{ name: t.name, url: t.url, ...row }];
  } else {
    probed = await runProbeCycle(c.env);
  }
  const results = await evaluateAlerts(c.env, probed);
  return c.json({ checked_at: new Date().toISOString(), results });
});

// Aggregate shape for the dashboard. Mirrors GET /api/status field-for-field
// (kept as a separate block per A.4 extend-only scope — the /api/status
// handler above is untouched).
async function getDashboardAggregate(env) {
  const latest = await db.getLatestPerTarget(env.DB);
  const byTarget = new Map(latest.map((row) => [row.target, row]));
  const lastCheck = await db.getLastCheckTime(env.DB);
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
      uptime_24h: await db.getUptimeSince(env.DB, t.name, since),
      last_error: row?.error_message ?? null,
    });
  }
  const upCount = targets.filter((t) => t.up).length;
  const overall = upCount === targets.length ? 'ok' : upCount === 0 ? 'down' : 'degraded';
  return { overall, checked_at: db.toIso(lastCheck), targets };
}

// Inline dark mobile dashboard HTML. Server-rendered: status pill, per-target
// cards, last-20 checks + last-20 reports lists. Client JS refreshes the pill,
// cards, and per-target sparklines from the PUBLIC /api/status + /api/history
// endpoints every 60s (no token in the page JS); "Check Now" re-runs that same
// refresh immediately instead of waiting for the interval. Both endpoints are
// served from the 20s in-memory public cache, so a manual "Check Now" right
// after a refresh is nearly free.
function buildDashboardHtml({ overall, checked_at, targets, recentChecks, recentReports }) {
  const pillLabel = overall.toUpperCase();
  const cards = targets
    .map(
      (t) => `
      <section class="card" data-card="${escapeHtml(t.name)}">
        <div class="row">
          <strong>${escapeHtml(t.name)}</strong>
          <span class="dot ${t.up ? 'up' : 'down'}" data-f="dot"></span>
        </div>
        <div class="url">${escapeHtml(t.url)}</div>
        <div class="row meta">
          <span>uptime 24h: <b data-f="uptime">${t.uptime_24h == null ? '—' : `${t.uptime_24h}%`}</b></span>
          <span>last: <b data-f="ms">${t.last_response_ms == null ? '—' : `${t.last_response_ms} ms`}</b></span>
          <span>http: <b data-f="code">${t.last_status ?? '—'}</b></span>
        </div>
        <div class="err" data-f="err">${t.last_error ? escapeHtml(t.last_error) : ''}</div>
        <canvas class="spark" data-spark="${escapeHtml(t.name)}" width="320" height="48" aria-label="24h response-time sparkline"></canvas>
      </section>`,
    )
    .join('');
  const checkRows = recentChecks
    .map(
      (r) => `
      <tr><td>${escapeHtml(r.checked_at ?? '')}</td><td>${escapeHtml(r.target)}</td>
      <td class="${r.ok ? 'ok' : 'bad'}">${r.ok ? 'up' : 'down'}</td>
      <td>${r.status_code ?? '—'}</td><td>${r.response_ms ?? '—'}</td></tr>`,
    )
    .join('');
  const reportRows = recentReports
    .map(
      (r) => `
      <tr><td>${escapeHtml(r.created_at ?? '')}</td><td>${escapeHtml(r.kind)}</td>
      <td>${escapeHtml(String(r.message ?? '').slice(0, 120))}</td>
      <td>${escapeHtml(r.status ?? '')}</td></tr>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SinaiCamps Status</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0}
.wrap{max-width:28rem;margin:0 auto;padding:1rem 1rem 3rem}
header{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
h1{font-size:1.1rem;margin:.5rem 0}
h2{font-size:.95rem;margin:1.5rem 0 .25rem;color:#cbd5e1}
#status-pill{font-weight:700;font-size:.8rem;padding:.3rem .8rem;border-radius:999px;letter-spacing:.05em}
#status-pill.ok{background:#166534;color:#dcfce7}
#status-pill.degraded{background:#92400e;color:#fef3c7}
#status-pill.down{background:#991b1b;color:#fee2e2}
.card{background:#1e293b;border:1px solid #334155;border-radius:.75rem;padding:.75rem 1rem;margin:.75rem 0}
.row{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.url{color:#94a3b8;font-size:.75rem;word-break:break-all;margin:.15rem 0 .4rem}
.meta{font-size:.75rem;color:#cbd5e1;flex-wrap:wrap;gap:.25rem .75rem;justify-content:flex-start}
.err{color:#fca5a5;font-size:.75rem;min-height:1em;word-break:break-word}
.dot{width:.8rem;height:.8rem;border-radius:50%;background:#64748b}
.dot.up{background:#22c55e}
.dot.down{background:#ef4444}
canvas.spark{width:100%;height:48px;display:block;margin-top:.4rem;background:#0b1220;border-radius:.5rem}
table{width:100%;border-collapse:collapse;font-size:.72rem}
th,td{text-align:left;padding:.3rem .35rem;border-bottom:1px solid #334155;vertical-align:top}
th{color:#94a3b8;font-weight:600}
td.ok{color:#4ade80}td.bad{color:#f87171}
.muted{color:#94a3b8;font-size:.75rem}
#check-now{width:100%;padding:.7rem;font-size:.9rem;font-weight:700;color:#0f172a;background:#38bdf8;border:0;border-radius:.6rem;margin-top:1rem}
#check-now:active{transform:scale(.98)}
@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
</style>
</head>
<body>
<div class="wrap">
<header>
<h1>SinaiCamps Status</h1>
<div id="status-pill" class="${overall}">${pillLabel}</div>
<form method="POST" action="/logout" style="margin:0"><button id="logout" type="submit" style="background:none;border:1px solid #334155;color:#94a3b8;border-radius:.5rem;padding:.3rem .7rem;font-size:.75rem">Log out</button></form>
</header>
<p class="muted" id="updated">updated ${escapeHtml(checked_at ?? 'never')}</p>
<button id="check-now" type="button">Check Now</button>
<div id="cards">${cards}</div>
<h2>Recent checks (last 20)</h2>
<table><thead><tr><th>time</th><th>target</th><th>state</th><th>http</th><th>ms</th></tr></thead>
<tbody id="checks">${checkRows || '<tr><td colspan="5" class="muted">no checks yet</td></tr>'}</tbody></table>
<h2>Recent reports (last 20)</h2>
<table><thead><tr><th>time</th><th>kind</th><th>message</th><th>status</th></tr></thead>
<tbody id="reports">${reportRows || '<tr><td colspan="4" class="muted">no reports yet</td></tr>'}</tbody></table>
</div>
<script>
(function(){
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function setPill(overall){
  var pill = document.getElementById('status-pill');
  pill.className = overall;
  pill.textContent = String(overall).toUpperCase();
}
function drawSpark(canvas, points){
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!points.length) { ctx.fillStyle = '#64748b'; ctx.font = '12px system-ui'; ctx.fillText('no data', 8, 24); return; }
  var max = Math.max.apply(null, points.map(function(p){ return p.response_ms || 0; }).concat([1]));
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.beginPath();
  points.forEach(function(p, i){
    var x = (i / Math.max(points.length - 1, 1)) * (W - 8) + 4;
    var y = H - 6 - ((p.response_ms || 0) / max) * (H - 12);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.fillStyle = '#ef4444';
  points.forEach(function(p, i){
    if (!p.ok) {
      var x = (i / Math.max(points.length - 1, 1)) * (W - 8) + 4;
      var y = H - 6 - ((p.response_ms || 0) / max) * (H - 12);
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill();
    }
  });
  void reduceMotion;
}
async function refreshAll(){
  try {
    var s = await fetch('/api/status').then(function(r){ return r.json(); });
    setPill(s.overall);
    document.getElementById('updated').textContent = 'updated ' + (s.checked_at || 'never');
    (s.targets || []).forEach(function(t){
      var card = document.querySelector('[data-card="' + t.name + '"]');
      if (!card) return;
      var dot = card.querySelector('[data-f="dot"]');
      if (dot) dot.className = 'dot ' + (t.up ? 'up' : 'down');
      var set = function(k, v){ var el = card.querySelector('[data-f="' + k + '"]'); if (el) el.textContent = v; };
      set('uptime', t.uptime_24h == null ? '—' : t.uptime_24h + '%');
      set('ms', t.last_response_ms == null ? '—' : t.last_response_ms + ' ms');
      set('code', t.last_status == null ? '—' : String(t.last_status));
      set('err', t.last_error || '');
    });
    var sparks = document.querySelectorAll('[data-spark]');
    for (var i = 0; i < sparks.length; i++) {
      var name = sparks[i].getAttribute('data-spark');
      var h = await fetch('/api/history?target=' + encodeURIComponent(name) + '&hours=24').then(function(r){ return r.json(); });
      drawSpark(sparks[i], (h.checks || []).slice(-60));
    }
  } catch (e) {
    document.getElementById('updated').textContent = 'refresh failed — showing last render';
  }
}
document.getElementById('check-now').addEventListener('click', refreshAll);
setInterval(refreshAll, 60000);
refreshAll();
})();
</script>
</body>
</html>`;
}

// 6-digit PIN login (form-friendly). GET renders the keypad form; POST checks
// DASHBOARD_PIN constant-time and issues the signed session cookie.
// D1 gate: 5 failed attempts per 5 minutes per IP (cf-connecting-ip only),
// then 429 `rate limit exceeded`; every POST inserts one login_attempts row
// (success + failure + rate-limited alike — outcome bit only, never the PIN).
// Trust-device checkbox extends the cookie Max-Age from 12h (43200) to 90d
// (7776000). The PIN never appears in a URL and is never logged.
// Secrets via `wrangler secret put` — never in wrangler.toml [vars],
// never logged, never echoed.
export function isPinConfigured(env) {
  const pin = env?.DASHBOARD_PIN;
  return typeof pin === 'string' && /^\d{6}$/.test(pin);
}

app.get('/login', async (c) => {
  if (!isPinConfigured(c.env)) return c.html(buildUnconfiguredHtml(), 500);
  if (await hasValidSession(c)) return c.redirect('/', 302);
  return c.html(buildLoginHtml());
});

app.post('/login', async (c) => {
  if (!isPinConfigured(c.env)) return c.json({ error: 'dashboard pin not configured' }, 500);
  if (!hasCsrfHeader(c)) return c.json({ error: 'csrf required' }, 400);
  const ip = getClientIp(c);
  const failCount = await db.getRecentFailCount(c.env.DB, ip);
  if (failCount >= LOGIN_FAIL_LIMIT) {
    await db.recordLoginAttempt(c.env.DB, { ip, success: false });
    return c.json({ error: 'rate limit exceeded' }, 429);
  }
  let pin = '';
  let trust = false;
  const contentType = c.req.header('content-type') ?? '';
  const raw = await c.req.text();
  if (contentType.includes('application/json')) {
    let body;
    try {
      body = JSON.parse(raw || '{}');
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400);
    }
    pin = typeof body?.pin === 'string' ? body.pin : '';
    trust = body?.trust === true || body?.trust === 1 || body?.trust === '1' || body?.trust === 'on';
  } else {
    const params = new URLSearchParams(raw);
    pin = params.get('pin') ?? '';
    const trustRaw = params.get('trust') ?? '';
    trust = trustRaw === '1' || trustRaw === 'on' || trustRaw === 'true';
  }
  if (!pin) return c.json({ error: 'pin is required' }, 400);
  const ok = timingSafeEqual(pin, c.env.DASHBOARD_PIN);
  await db.recordLoginAttempt(c.env.DB, { ip, success: ok });
  if (!ok) {
    const triesLeft = Math.max(0, LOGIN_FAIL_LIMIT - failCount - 1);
    return c.json({ error: `Wrong PIN, ${triesLeft} tries left` }, 401);
  }
  const session = await signSession(c.env.DASHBOARD_PIN, Date.now());
  c.header('Set-Cookie', buildSessionCookie(session, trust));
  return c.redirect('/', 302);
});

app.post('/logout', (c) => {
  if (!hasCsrfHeader(c)) return c.json({ error: 'csrf required' }, 400);
  c.header('Set-Cookie', clearSessionCookie());
  return c.redirect('/login', 302);
});

// Cookie-session operator dashboard. Requires a fresh `monitor_session`
// cookie from POST /login (signed with DASHBOARD_PIN, 90d verify window;
// cookie Max-Age 12h default, 90d trusted). The old `?token=` bookmark is
// deleted — query tokens never authenticate, and the PIN never appears in
// a URL. Unauthenticated browsers redirect to /login (302); the PIN itself
// is set via `wrangler secret put` — never in wrangler.toml [vars].
app.get('/', async (c) => {
  if (!isPinConfigured(c.env)) return c.html(buildUnconfiguredHtml(), 500);
  if (!(await hasValidSession(c))) {
    return c.redirect('/login', 302);
  }
  const agg = await getDashboardAggregate(c.env);
  const recentChecks = await db.getRecentChecks(c.env.DB, 20);
  const recentReports = await db.getRecentReports(c.env.DB, 20);
  return c.html(buildDashboardHtml({ ...agg, recentChecks, recentReports }));
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

// Cron retention pass: prune probe rows, intake reports, and alert state that
// no longer has a probed target. Called from `scheduled()` after the probe rows
// are written and the alert transitions have been evaluated, so a live target
// has a fresh check row by the time the stale-state rule reads the table.
//
// BEST-EFFORT BY DESIGN, one try/catch PER STEP — the same posture as
// `sendAlert()` (which returns `{skipped:true}` instead of throwing for a dead
// webhook). A maintenance problem must never escalate into a monitoring
// outage: this same cron is what produces the alert that would REPORT a broken
// D1, so letting a prune failure reject out of `scheduled()` would silence the
// monitor during exactly the incident it exists to catch. Per-step rather than
// one wrapper, so a failing step cannot skip the remaining ones.
export async function runRetention(env) {
  const steps = [
    ['checks', db.pruneOldChecks],
    ['reports', db.pruneOldReports],
    ['alert_state', db.pruneStaleAlertState],
  ];
  const deleted = {};
  for (const [name, prune] of steps) {
    try {
      const res = await prune(env.DB);
      deleted[name] = res?.meta?.changes ?? null;
    } catch (err) {
      console.error('monitor retention step failed', name, err?.message ?? err);
      deleted[name] = null;
    }
  }
  return deleted;
}

// Cron entry: probe every target, store the rows, then evaluate alerts, then
// prune old login_attempts rows (keeps the 5-min PIN gate table small) and the
// retention pass (bounds `checks`/`reports`/orphaned `alert_state`).
// Runs every 5 minutes via the [triggers] crons schedule in wrangler.toml.
// Probe/alert/target logic above is untouched — only the cleanup DELETEs
// are added here.
//
// `clearOldLoginAttempts` keeps its original unwrapped behaviour (a throw
// there still rejects `scheduled()`); changing that failure mode is a separate
// call from this task's retention policy, so it is left alone deliberately.
async function scheduled(event, env, ctx) {
  const results = await runProbeCycle(env);
  await evaluateAlerts(env, results);
  await db.clearOldLoginAttempts(env.DB);
  await runRetention(env);
}

export default { fetch: app.fetch, scheduled };
export { app, scheduled };
