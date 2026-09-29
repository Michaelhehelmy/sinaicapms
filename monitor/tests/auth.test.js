import { describe, it, expect, afterEach } from 'vitest';
import { app } from '../src/index.js';
import { TARGETS } from '../src/targets.js';
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  parseCookie,
  signSession,
  verifySession,
  timingSafeEqual,
  buildSessionCookie,
} from '../src/auth.js';

// Cookie-session dashboard auth: password login issues a signed
// `monitor_session` cookie; GET / requires it; POST /internal/check
// accepts it OR Bearer REPORT_TOKEN. The old `?token=` bookmark is deleted.

// In-memory D1 stand-in covering the SQL shapes used by db.js
// (status aggregate + intake/dashboard + alert evaluation for /internal/check).
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
    throw new Error(`FakeDb.run: unhandled SQL: ${sql}`);
  }
  execAll(sql, args) {
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
const DASHBOARD_PASSWORD = 'test-dashboard-password-123';
const envFor = (db, extra = {}) => ({ DB: db, REPORT_TOKEN, DASHBOARD_PASSWORD, ...extra });
const ORIGIN = 'https://status.sinaicamps.com';

function cookieHeader(setCookie) {
  const pair = String(setCookie).split(';')[0];
  return pair.trim();
}

async function loginCookie(db, env, ip = '10.99.1.4') {
  const res = await app.request(
    '/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: ORIGIN,
        'cf-connecting-ip': ip,
      },
      body: JSON.stringify({ password: DASHBOARD_PASSWORD }),
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

describe('monitor password login (signed session cookie)', () => {
  it('1: GET /login renders the password form when unauthenticated', async () => {
    const res = await app.request('/login', {}, envFor(new FakeDb()));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('action="/login"');
    expect(html).toContain('type="password"');
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
  });

  it('2: POST /login 400 when CSRF Origin/Referer missing (400 on malformed JSON)', async () => {
    const noCsrf = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.99.1.2' },
        body: JSON.stringify({ password: DASHBOARD_PASSWORD }),
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

  it('3: POST /login 401 on wrong password and 400 when password missing', async () => {
    const wrong = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.3' },
        body: JSON.stringify({ password: 'wrong-password' }),
      },
      envFor(new FakeDb()),
    );
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie')).toBeNull();

    const missing = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.33' },
        body: JSON.stringify({}),
      },
      envFor(new FakeDb()),
    );
    expect(missing.status).toBe(400);
  });

  it('4: POST /login success sets 30d cookie with exact flags (≤4KB) and 302 to /', async () => {
    const db = new FakeDb();
    const res = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.4' },
        body: JSON.stringify({ password: DASHBOARD_PASSWORD }),
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
    expect(setCookie).toContain(`Max-Age=${SESSION_MAX_AGE}`);
    expect(SESSION_MAX_AGE).toBe(2592000);
    expect(setCookie.length).toBeLessThanOrEqual(4096);
    const value = cookieHeader(setCookie).split('=')[1];
    expect(await verifySession(value, DASHBOARD_PASSWORD)).toBe(true);
    // Session window + shape edges (30d, constant-time).
    const expired = await signSession(DASHBOARD_PASSWORD, Date.now() - (SESSION_MAX_AGE * 1000 + 1000));
    expect(await verifySession(expired, DASHBOARD_PASSWORD)).toBe(false);
    const future = await signSession(DASHBOARD_PASSWORD, Date.now() + 60_000);
    expect(await verifySession(future, DASHBOARD_PASSWORD)).toBe(false);
    expect(await verifySession('not-a-session', DASHBOARD_PASSWORD)).toBe(false);
    expect(await verifySession('abc.def', DASHBOARD_PASSWORD)).toBe(false);
    expect(await verifySession(`${Date.now()}.zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz`, DASHBOARD_PASSWORD)).toBe(false);
    const last = value.slice(-1);
    const flipped = `${value.slice(0, -1)}${last === '0' ? '1' : '0'}`;
    expect(await verifySession(flipped, DASHBOARD_PASSWORD)).toBe(false);
    expect(await verifySession(value, 'wrong-password')).toBe(false);
    expect(await verifySession('', DASHBOARD_PASSWORD)).toBe(false);
    expect(await verifySession(value, '')).toBe(false);
    expect(await verifySession(`${'x'.repeat(4090)}.deadbeef`, DASHBOARD_PASSWORD)).toBe(false);
    expect(buildSessionCookie('v').length).toBeLessThanOrEqual(4096);
  });

  it('5: GET / with valid cookie renders the dashboard with logout link', async () => {
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

  it('6: GET / without cookie redirects to /login and ?token= no longer authenticates', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const bare = await app.request('/', {}, env);
    expect(bare.status).toBe(302);
    expect(bare.headers.get('location')).toContain('/login');

    const queryToken = await app.request(`/?token=${DASHBOARD_PASSWORD}`, {}, env);
    expect(queryToken.status).toBe(302);
    expect(queryToken.headers.get('location')).toContain('/login');

    const bearer = await app.request(
      '/',
      { headers: { authorization: `Bearer ${REPORT_TOKEN}` } },
      env,
    );
    expect(bearer.status).toBe(302);
  });

  it('7: authed GET /login redirects to /', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const cookie = await loginCookie(db, env, '10.99.1.7');
    const res = await app.request('/login', { headers: { cookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });

  it('8: POST /logout clears the cookie with Max-Age=0 (CSRF required)', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const noCsrf = await app.request('/logout', { method: 'POST' }, env);
    expect(noCsrf.status).toBe(400);

    const cookie = await loginCookie(db, env, '10.99.1.8');
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
  });

  it('9: POST /internal/check accepts session cookie or Bearer REPORT_TOKEN, rejects neither', async () => {
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

  it('10: POST /login rate limit 5/min/IP then 429', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const ip = '10.99.9.77';
    for (let i = 0; i < 5; i++) {
      const res = await app.request(
        '/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip },
          body: JSON.stringify({ password: DASHBOARD_PASSWORD }),
        },
        env,
      );
      expect(res.status).toBe(302);
    }
    const limited = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': ip },
        body: JSON.stringify({ password: DASHBOARD_PASSWORD }),
      },
      env,
    );
    expect(limited.status).toBe(429);
    expect((await limited.json()).error).toMatch(/rate limit/i);
  });

  it('11: unconfigured DASHBOARD_PASSWORD renders the error page and blocks login/dashboard', async () => {
    const db = new FakeDb();
    const env = { DB: db, REPORT_TOKEN };
    const loginPage = await app.request('/login', {}, env);
    expect(loginPage.status).toBe(500);
    expect(await loginPage.text()).toMatch(/password not configured/i);

    const loginPost = await app.request(
      '/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: ORIGIN, 'cf-connecting-ip': '10.99.1.11' },
        body: JSON.stringify({ password: 'x' }),
      },
      env,
    );
    expect(loginPost.status).toBe(500);

    const dash = await app.request('/', {}, env);
    expect(dash.status).toBe(500);
    expect(await dash.text()).toMatch(/password not configured/i);
  });
});
