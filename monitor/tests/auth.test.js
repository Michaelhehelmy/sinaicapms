import { describe, it, expect, afterEach } from 'vitest';
import { app, isPinConfigured, LOGIN_FAIL_LIMIT } from '../src/index.js';
import { TARGETS } from '../src/targets.js';
import {
  SESSION_COOKIE,
  SESSION_DEFAULT_MAX_AGE,
  SESSION_TRUSTED_MAX_AGE,
  parseCookie,
  signSession,
  verifySession,
  timingSafeEqual,
  buildSessionCookie,
} from '../src/auth.js';

// Cookie-session dashboard auth: 6-digit PIN login issues a signed
// `monitor_session` cookie; GET / requires it; POST /internal/check
// accepts it OR Bearer REPORT_TOKEN. The old `?token=` bookmark is deleted
// and the PIN never appears in a URL. Brute-force budget is D1-backed:
// 5 failed attempts per 5 minutes per IP (login_attempts table), then 429.

// In-memory D1 stand-in covering the SQL shapes used by db.js
// (status aggregate + intake/dashboard + alert evaluation for /internal/check
// + login_attempts gate for POST /login).
class FakeStmt {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }
  bind(...args) {
    this.args = args;
    return this;
  }
  async run() {
    return this.db.execRun(this.sql, this.args);
  }
  async all() {
    return { results: this.db.execAll(this.sql, this.args) };
  }
  async first() {
    const rows = this.db.execAll(this.sql, this.args);
    return rows[0] ?? null;
  }
}

class FakeDb {
  constructor() {
    this.checks = [];
    this.reports = [];
    this.alert = new Map();
    this.attempts = [];
    this.seq = 0;
    this.reportSeq = 0;
    this.tick = 0;
  }
  prepare(sql) {
    return new FakeStmt(this, sql);
  }
  seedCheck(target, { ok = true } = {}) {
    this.seq += 1;
    this.tick += 1;
    this.checks.push({
      id: this.seq,
      target,
      status_code: ok ? 200 : 500,
      ok: ok ? 1 : 0,
      response_ms: 12,
      error_message: ok ? null : 'boom',
      checked_at: `2026-09-29 00:00:${String(this.tick).padStart(2, '0')}`,
    });
  }
  execRun(sql, args) {
    if (sql.startsWith('INSERT INTO checks')) {
      const [target, status_code, ok, response_ms, error_message] = args;
      this.seq += 1;
      this.tick += 1;
      this.checks.push({
        id: this.seq,
        target,
        status_code,
        ok,
        response_ms,
        error_message,
        checked_at: `2026-09-29 00:00:${String(this.tick).padStart(2, '0')}`,
      });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO reports')) {
      const [kind, message, page_url, contact] = args;
      this.reportSeq += 1;
      this.tick += 1;
      this.reports.push({
        id: this.reportSeq,
        kind,
        message,
        page_url,
        contact,
        status: 'new',
        created_at: `2026-09-29 00:01:${String(this.tick).padStart(2, '0')}`,
      });
      return { success: true, meta: { last_row_id: this.reportSeq } };
    }
    if (sql.startsWith('INSERT INTO alert_state')) {
      const [target, consecutive_failures, alerting, last_alert_at] = args;
      this.alert.set(target, {
        target,
        consecutive_failures,
        alerting,
        last_alert_at,
        updated_at: '2026-09-29 00:00:00',
      });
      return { success: true };
    }
    if (sql.startsWith('INSERT INTO login_attempts')) {
      const [ip, success] = args;
      this.tick += 1;
      this.attempts.push({
        id: this.attempts.length + 1,
        ip,
        success,
        attempted_at: `2026-09-29 00:02:${String(this.tick).padStart(2, '0')}`,
      });
      return { success: true };
    }
    if (sql.startsWith('DELETE FROM login_attempts')) {
      this.attempts = [];
      return { success: true };
    }
    throw new Error(`FakeDb.run: unhandled SQL: ${sql}`);
  }
  execAll(sql, args) {
    if (sql.includes('FROM login_attempts')) {
      const [ip] = args;
      const fails = this.attempts.filter((r) => r.ip === ip && r.success === 0).length;
      return [{ fail_count: fails }];
    }
    if (sql.includes('SELECT MAX(id)')) {
      const newest = new Map();
      for (const r of this.checks) newest.set(r.target, r);
      return [...newest.values()];
    }
    if (sql.includes('SELECT MAX(checked_at)')) {
      const max = this.checks.reduce((m, r) => (!m || r.checked_at > m ? r.checked_at : m), null);
      return [{ last_check: max }];
    }
    if (sql.includes('SELECT COUNT(*) AS total')) {
      const [target] = args;
      const rows = this.checks.filter((r) => r.target === target);
      return [{ total: rows.length, ok_count: rows.reduce((n, r) => n + r.ok, 0) }];
    }
    if (sql.includes("datetime('now',")) {
      const [target] = args;
      return this.checks.filter((r) => r.target === target);
    }
    if (sql.includes('FROM (SELECT * FROM checks WHERE target = ?')) {
      const [target, n] = args;
      return this.checks.filter((r) => r.target === target).slice(-n);
    }
    if (sql.includes('FROM alert_state WHERE target = ?')) {
      const row = this.alert.get(args[0]);
      return row ? [row] : [];
    }
    if (sql.includes('FROM reports')) {
      const [limit] = args;
      return [...this.reports].sort((a, b) => b.id - a.id).slice(0, limit);
    }
    if (sql.includes('ORDER BY id DESC')) {
      const [limit] = args;
      return [...this.checks].sort((a, b) => b.id - a.id).slice(0, limit);
    }
    throw new Error(`FakeDb.all: unhandled SQL: ${sql}`);
  }
}

const REPORT_TOKEN = 'test-report-secret';
const DASHBOARD_PIN = '123456';
const envFor = (db, extra = {}) => ({ DB: db, REPORT_TOKEN, DASHBOARD_PIN, ...extra });
const ORIGIN = 'https://status.sinaicamps.com';

function cookieHeader(setCookie) {
  const pair = String(setCookie).split(';')[0];
  return pair.trim();
}

async function loginCookie(db, env, ip = '10.99.1.4', extraBody = {}) {
  const res = await app.request(
    '/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: ORIGIN,
        'cf-connecting-ip': ip,
      },
      body: JSON.stringify({ pin: DASHBOARD_PIN, ...extraBody }),
    },
    env,
  );
  expect(res.status).toBe(302);
  const setCookie = res.headers.get('set-cookie');
  expect(setCookie).toContain(`${SESSION_COOKIE}=`);
  return cookieHeader(setCookie);
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('monitor PIN login (signed session cookie + D1 gate)', () => {
  it('1: GET /login renders the keypad form (10 digits, noscript, reduced-motion, no PIN bytes)', async () => {
    const res = await app.request('/login', {}, envFor(new FakeDb()));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('action="/login"');
    expect(html).toContain('name="pin"');
    expect(html).toContain('name="trust"');
    // 10 digit buttons, one per digit.
    const digits = (html.match(/data-digit="/g) || []).length;
    expect(digits).toBe(10);
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(html).toContain(`data-digit="${d}"`);
    }
    // Noscript fallback + reduced-motion guard.
    expect(html).toContain('<noscript>');
    expect(html).toContain('prefers-reduced-motion');
    // No PIN bytes leak into the page and the PIN never appears in a URL.
    expect(html).not.toContain(DASHBOARD_PIN);
    expect(html).not.toContain('?pin=');
    // Cookie helpers stay honest on edge input.
    expect(parseCookie(null)).toEqual({});
    expect(parseCookie('')).toEqual({});
    expect(parseCookie('a=1; b=2; a=3').a).toBe('1');
    expect(parseCookie('weird; =x; k=v').k).toBe('v');
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(false);
    expect(timingSafeEqual(null, 'x')).toBe(false);
    expect(timingSafeEqual('x', null)).toBe(false);
    expect(LOGIN_FAIL_LIMIT).toBe(5);
  });

  it('2: POST /login 400 when CSRF Origin/Referer missing (400 on malformed JSON)', async () => {
    const noCsrf = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.99.1.2' },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      envFor(new FakeDb()),
    );
    expect(noCsrf.status).toBe(400);
    expect((await noCsrf.json()).error).toMatch(/csrf/i);

    const badJson = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.22' },
        body: '{not-json',
      },
      envFor(new FakeDb()),
    );
    expect(badJson.status).toBe(400);
  });

  it('3: POST /login 401 Wrong PIN with tries left; 400 when PIN missing; non-6-digit rejected; always-insert', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const wrong = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.3' },
        body: JSON.stringify({ pin: '000000' }),
      },
      env,
    );
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();
    const wrongBody = await wrong.json();
    expect(wrongBody.error).toContain('Wrong PIN');
    expect(wrongBody.error).toContain('4 tries left');
    // Failure inserts exactly one attempt row (outcome bit only).
    expect(db.attempts).toHaveLength(1);
    expect(db.attempts[0]).toMatchObject({ ip: '10.99.1.3', success: 0 });
    expect(JSON.stringify(db.attempts)).not.toContain('000000');

    const second = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.3' },
        body: JSON.stringify({ pin: '000000' }),
      },
      env,
    );
    expect(second.status).toBe(401);
    expect((await second.json()).error).toContain('3 tries left');

    // Non-6-digit input counts as a wrong attempt (401, never 500).
    const short = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.31' },
        body: JSON.stringify({ pin: '123' }),
      },
      env,
    );
    expect(short.status).toBe(401);
    expect((await short.json()).error).toMatch(/wrong pin/i);

    const missing = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.33' },
        body: JSON.stringify({}),
      },
      env,
    );
    expect(missing.status).toBe(400);
  });

  it('4: POST /login success sets 12h cookie with exact flags (≤4KB) and 302 to /; 90d window edges', async () => {
    const db = new FakeDb();
    const res = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.4' },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      envFor(db),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toContain(`${SESSION_COOKIE}=`);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Strict');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain(`Max-Age=${SESSION_DEFAULT_MAX_AGE}`);
    expect(SESSION_DEFAULT_MAX_AGE).toBe(43200);
    expect(SESSION_TRUSTED_MAX_AGE).toBe(7776000);
    expect(setCookie.length).toBeLessThanOrEqual(4096);
    // Success inserts exactly one attempt row with the success bit.
    expect(db.attempts).toHaveLength(1);
    expect(db.attempts[0]).toMatchObject({ ip: '10.99.1.4', success: 1 });
    const value = cookieHeader(setCookie).split('=')[1];
    expect(await verifySession(value, DASHBOARD_PIN)).toBe(true);
    // Session window edges (90d trusted bound, constant-time).
    const almostExpired = await signSession(DASHBOARD_PIN, Date.now() - (SESSION_TRUSTED_MAX_AGE * 1000 - 5000));
    expect(await verifySession(almostExpired, DASHBOARD_PIN)).toBe(true);
    const expired = await signSession(DASHBOARD_PIN, Date.now() - (SESSION_TRUSTED_MAX_AGE * 1000 + 1000));
    expect(await verifySession(expired, DASHBOARD_PIN)).toBe(false);
    const future = await signSession(DASHBOARD_PIN, Date.now() + 60_000);
    expect(await verifySession(future, DASHBOARD_PIN)).toBe(false);
    expect(await verifySession('not-a-session', DASHBOARD_PIN)).toBe(false);
    expect(await verifySession('abc.def', DASHBOARD_PIN)).toBe(false);
    expect(await verifySession(`${Date.now()}.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz`, DASHBOARD_PIN)).toBe(false);
    const last = value.slice(-1);
    const flipped = `${value.slice(0, -1)}${last === '0' ? '1' : '0'}`;
    expect(await verifySession(flipped, DASHBOARD_PIN)).toBe(false);
    expect(await verifySession(value, '000000')).toBe(false);
    expect(await verifySession('', DASHBOARD_PIN)).toBe(false);
    expect(await verifySession(value, '')).toBe(false);
    expect(await verifySession(`${'x'.repeat(4090)}.deadbeef`, DASHBOARD_PIN)).toBe(false);
    expect(buildSessionCookie('v').length).toBeLessThanOrEqual(4096);
    expect(buildSessionCookie('v', true)).toContain('Max-Age=7776000');
  });

  it('5: trust-device flag picks Max-Age 7776000 vs 43200 (JSON + form)', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const trusted = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.41' },
        body: JSON.stringify({ pin: DASHBOARD_PIN, trust: true }),
      },
      env,
    );
    expect(trusted.status).toBe(302);
    expect(trusted.headers.get('set-cookie')).toContain('Max-Age=7776000');

    const formTrusted = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.42' },
        body: `pin=${DASHBOARD_PIN}&trust=1`,
      },
      env,
    );
    expect(formTrusted.status).toBe(302);
    expect(formTrusted.headers.get('set-cookie')).toContain('Max-Age=7776000');

    const plain = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.43' },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      env,
    );
    expect(plain.status).toBe(302);
    expect(plain.headers.get('set-cookie')).toContain('Max-Age=43200');
  });

  it('6: GET / with valid cookie renders the dashboard with logout link', async () => {
    const db = new FakeDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });
    const env = envFor(db);
    const cookie = await loginCookie(db, env, '10.99.1.5');
    const res = await app.request('/', { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('status-pill');
    expect(html).toContain('>OK</div>');
    expect(html).toContain('action="/logout"');
    expect(html).toContain('Log out');
  });

  it('7: GET / without cookie redirects to /login and ?pin=/ ?token= never authenticate', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const bare = await app.request('/', {}, env);
    expect(bare.status).toBe(302);
    expect(bare.headers.get('location')).toContain('/login');

    const queryPin = await app.request(`/?pin=${DASHBOARD_PIN}`, {}, env);
    expect(queryPin.status).toBe(302);
    expect(queryPin.headers.get('location')).toContain('/login');

    const queryToken = await app.request(`/?token=${DASHBOARD_PIN}`, {}, env);
    expect(queryToken.status).toBe(302);
    expect(queryToken.headers.get('location')).toContain('/login');

    const bearer = await app.request(
      '/',
      { headers: { authorization: `Bearer ${REPORT_TOKEN}` } },
      env,
    );
    expect(bearer.status).toBe(302);
  });

  it('8: authed GET /login redirects to /', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const cookie = await loginCookie(db, env, '10.99.1.7');
    const res = await app.request('/login', { headers: { cookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });

  it('9: POST /logout clears the cookie with Max-Age=0 (CSRF required, cookie only)', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const noCsrf = await app.request('/logout', { method: 'POST' }, env);
    expect(noCsrf.status).toBe(400);

    const cookie = await loginCookie(db, env, '10.99.1.8');
    const attemptsBefore = db.attempts.length;
    const res = await app.request(
      '/logout',
      { method: 'POST', headers: { origin: ORIGIN, cookie } },
      env,
    );
    expect(res.status).toBe(302);
    const cleared = res.headers.get('set-cookie');
    expect(cleared).toContain(`${SESSION_COOKIE}=`);
    expect(cleared).toContain('Max-Age=0');
    expect(cleared).toContain('HttpOnly');
    expect(cleared).toContain('Secure');
    expect(cleared).toContain('SameSite=Strict');
    expect(cleared).toContain('Path=/');
    // Logout clears the cookie only — attempt rows are untouched.
    expect(db.attempts.length).toBe(attemptsBefore);
  });

  it('10: POST /internal/check accepts session cookie or Bearer REPORT_TOKEN, rejects neither', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });
    const db = new FakeDb();
    const env = envFor(db);
    const cookie = await loginCookie(db, env, '10.99.1.9');

    const viaCookie = await app.request('/internal/check', { method: 'POST', headers: { cookie } }, env);
    expect(viaCookie.status).toBe(200);

    const viaBearer = await app.request(
      '/internal/check',
      { method: 'POST', headers: { authorization: `Bearer ${REPORT_TOKEN}` } },
      envFor(new FakeDb()),
    );
    expect(viaBearer.status).toBe(200);

    const denied = await app.request('/internal/check', { method: 'POST' }, envFor(new FakeDb()));
    expect(denied.status).toBe(401);
  });

  it('11: D1 gate 5 fails/5min/IP then 429 verbatim (per-IP); unconfigured PIN 500s', async () => {
    expect(isPinConfigured({ DASHBOARD_PIN })).toBe(true);
    expect(isPinConfigured({})).toBe(false);
    expect(isPinConfigured({ DASHBOARD_PIN: '12345' })).toBe(false);
    expect(isPinConfigured({ DASHBOARD_PIN: 'abcdef' })).toBe(false);
    expect(isPinConfigured({ DASHBOARD_PIN: '1234567' })).toBe(false);

    const db = new FakeDb();
    const env = envFor(db);
    const ip = '10.99.9.77';
    const wants = ['4 tries left', '3 tries left', '2 tries left', '1 tries left', '0 tries left'];
    for (let i = 0; i < 5; i++) {
      const res = await app.request(
        '/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip },
          body: JSON.stringify({ pin: '000000' }),
        },
        env,
      );
      expect(res.status).toBe(401);
      expect((await res.json()).error).toContain(wants[i]);
    }
    expect(db.attempts.filter((r) => r.ip === ip)).toHaveLength(5);
    // 6th attempt — even the correct PIN — hits the gate and still inserts.
    const limited = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      env,
    );
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate limit exceeded' });
    expect(db.attempts.filter((r) => r.ip === ip)).toHaveLength(6);
    // A different IP is unaffected (per-IP gate) and successes insert rows.
    const otherDb = new FakeDb();
    const otherEnv = envFor(otherDb);
    const other = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.9.78' },
        body: JSON.stringify({ pin: DASHBOARD_PIN }),
      },
      otherEnv,
    );
    expect(other.status).toBe(302);
    expect(otherDb.attempts).toHaveLength(1);

    // Unconfigured PIN (missing or not 6 digits) blocks login + dashboard.
    for (const badEnv of [{ DB: new FakeDb(), REPORT_TOKEN }, { DB: new FakeDb(), REPORT_TOKEN, DASHBOARD_PIN: '12345' }]) {
      const loginPage = await app.request('/login', {}, badEnv);
      expect(loginPage.status).toBe(500);
      expect(await loginPage.text()).toMatch(/pin not configured/i);

      const loginPost = await app.request(
        '/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.11' },
          body: JSON.stringify({ pin: '123456' }),
        },
        badEnv,
      );
      expect(loginPost.status).toBe(500);

      const dash = await app.request('/', {}, badEnv);
      expect(dash.status).toBe(500);
      expect(await dash.text()).toMatch(/pin not configured/i);
    }
  });
});
