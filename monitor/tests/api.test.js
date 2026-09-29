import { describe, it, expect, afterEach } from 'vitest';
import {
  app,
  timingSafeEqual,
  getBearerToken,
  isAuthorizedToken,
  checkReportRateLimit,
  REPORT_RATE_LIMIT,
} from '../src/index.js';
import { TARGETS } from '../src/targets.js';

// In-memory D1 stand-in covering every SQL shape used by db.js
// (status/history aggregates + A.4 intake/dashboard helpers).
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
  seedCheck(target, { ok = true, statusCode, errorMessage } = {}) {
    this.seq += 1;
    this.tick += 1;
    this.checks.push({
      id: this.seq,
      target,
      status_code: statusCode ?? (ok ? 200 : 500),
      ok: ok ? 1 : 0,
      response_ms: 12,
      error_message: errorMessage ?? (ok ? null : 'boom'),
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
const envFor = (db) => ({ DB: db, REPORT_TOKEN, DASHBOARD_PASSWORD });

function postReport(path, { token = REPORT_TOKEN, body = { message: 'help' }, ip = '10.9.0.1' } = {}) {
  const headers = { 'Content-Type': 'application/json', 'cf-connecting-ip': ip };
  if (token) headers.authorization = `Bearer ${token}`;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, envFor(new FakeDb()));
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('constant-time token helpers', () => {
  it('equal strings match, anything else denies', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(false);
    expect(timingSafeEqual(null, 'x')).toBe(false);
    expect(timingSafeEqual('x', null)).toBe(false);
  });

  it('bearer parsing + fail-closed auth', () => {
    expect(getBearerToken('Bearer s3cret')).toBe('s3cret');
    expect(getBearerToken('bearer s3cret')).toBeNull();
    expect(getBearerToken('Token s3cret')).toBeNull();
    expect(getBearerToken(null)).toBeNull();
    expect(isAuthorizedToken('Bearer s3cret', 's3cret')).toBe(true);
    expect(isAuthorizedToken('Bearer wrong', 's3cret')).toBe(false);
    expect(isAuthorizedToken(null, 's3cret')).toBe(false);
    expect(isAuthorizedToken('Bearer s3cret', null)).toBe(false);
    expect(isAuthorizedToken('Bearer s3cret', '')).toBe(false);
  });

  it('rate limiter allows 60/min then denies', () => {
    const ip = `rl-unit-${Date.now()}`;
    let last;
    for (let i = 0; i < REPORT_RATE_LIMIT; i++) {
      last = checkReportRateLimit(ip, 1_700_000_000_000);
      expect(last.allowed).toBe(true);
    }
    last = checkReportRateLimit(ip, 1_700_000_000_000);
    expect(last.allowed).toBe(false);
    expect(last.count).toBe(REPORT_RATE_LIMIT + 1);
    // Next minute window resets.
    expect(checkReportRateLimit(ip, 1_700_000_000_000 + 61_000).allowed).toBe(true);
  });
});

describe('GET /api/status (public aggregate)', () => {
  it('returns {overall, checked_at, targets[]} with one row per target', async () => {
    const db = new FakeDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });
    const res = await app.request('/api/status', {}, envFor(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.overall).toBe('ok');
    expect(typeof body.checked_at).toBe('string');
    expect(body.targets).toHaveLength(TARGETS.length);
    for (const row of body.targets) {
      expect(Object.keys(row).sort()).toEqual(
        ['last_error', 'last_response_ms', 'last_status', 'name', 'up', 'uptime_24h', 'url'].sort(),
      );
      expect(row.up).toBe(true);
    }
  });

  it('mixed health degrades overall', async () => {
    const db = new FakeDb();
    db.seedCheck(TARGETS[0].name, { ok: true });
    db.seedCheck(TARGETS[1].name, { ok: false });
    const res = await app.request('/api/status', {}, envFor(db));
    const body = await res.json();
    expect(['degraded', 'down']).toContain(body.overall);
  });
});

describe('GET /api/history (public, target required)', () => {
  it('400 when target missing or unknown', async () => {
    const db = new FakeDb();
    expect((await app.request('/api/history', {}, envFor(db))).status).toBe(400);
    expect((await app.request('/api/history?target=nope', {}, envFor(db))).status).toBe(400);
  });

  it('200 shape for a known target', async () => {
    const db = new FakeDb();
    db.seedCheck('marketplace', { ok: true });
    db.seedCheck('marketplace', { ok: false });
    const res = await app.request('/api/history?target=marketplace&hours=24', {}, envFor(db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.target).toBe('marketplace');
    expect(body.hours).toBe(24);
    expect(body.checks).toHaveLength(2);
    expect(body.checks[0].checked_at).toContain('T');
  });
});

describe('POST /report/* (tokened intake)', () => {
  it('401 without token and with wrong token', async () => {
    expect((await postReport('/report/error', { token: null })).status).toBe(401);
    expect((await postReport('/report/error', { token: 'wrong' })).status).toBe(401);
    expect((await postReport('/report/feedback', { token: null })).status).toBe(401);
  });

  it('400 when message missing or blank', async () => {
    expect((await postReport('/report/error', { body: {} })).status).toBe(400);
    expect((await postReport('/report/error', { body: { message: '  ' } })).status).toBe(400);
  });

  it('201 stores error + feedback rows', async () => {
    const errRes = await postReport('/report/error', {
      body: { message: 'checkout 500', page_url: 'https://x/book', contact: 'ops' },
    });
    expect(errRes.status).toBe(201);
    const errBody = await errRes.json();
    expect(errBody).toMatchObject({ kind: 'error', status: 'new' });
    expect(typeof errBody.id).toBe('number');

    const fbRes = await postReport('/report/feedback', {
      body: { message: 'love the new menu page' },
      ip: '10.9.0.2',
    });
    expect(fbRes.status).toBe(201);
    expect((await fbRes.json()).kind).toBe('feedback');
  });

  it('61st request in a minute → 429', async () => {
    const db = new FakeDb();
    const env = envFor(db);
    const ip = '10.9.9.9';
    let res;
    for (let i = 0; i < REPORT_RATE_LIMIT; i++) {
      res = await app.request(
        '/report/error',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            authorization: `Bearer ${REPORT_TOKEN}`,
            'cf-connecting-ip': ip,
          },
          body: JSON.stringify({ message: `spam ${i}` }),
        },
        env,
      );
      expect(res.status).toBe(201);
    }
    res = await app.request(
      '/report/error',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${REPORT_TOKEN}`,
          'cf-connecting-ip': ip,
        },
        body: JSON.stringify({ message: 'one too many' }),
      },
      env,
    );
    expect(res.status).toBe(429);
  });
});

describe('POST /internal/check (tokened manual probe)', () => {
  it('401 without token', async () => {
    const res = await app.request('/internal/check', { method: 'POST' }, envFor(new FakeDb()));
    expect(res.status).toBe(401);
  });

  it('400 on unknown target', async () => {
    const res = await app.request(
      '/internal/check',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${REPORT_TOKEN}` },
        body: JSON.stringify({ target: 'nope' }),
      },
      envFor(new FakeDb()),
    );
    expect(res.status).toBe(400);
  });

  it('200 probes all targets and returns outcomes', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });
    const db = new FakeDb();
    const res = await app.request(
      '/internal/check',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${REPORT_TOKEN}` },
      },
      envFor(db),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.checked_at).toBe('string');
    expect(body.results).toHaveLength(TARGETS.length);
    expect(db.checks).toHaveLength(TARGETS.length);
  });

  it('200 probes a single target when scoped', async () => {
    globalThis.fetch = async () => ({ status: 200, ok: true });
    const db = new FakeDb();
    const res = await app.request(
      '/internal/check',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authorization: `Bearer ${REPORT_TOKEN}` },
        body: JSON.stringify({ target: 'marketplace' }),
      },
      envFor(db),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].target).toBe('marketplace');
    expect(db.checks).toHaveLength(1);
  });
});

describe('GET / dashboard (cookie-session HTML)', () => {
  it('302 to /login without cookie; ?token= no longer authenticates', async () => {
    const db = new FakeDb();
    const bare = await app.request('/', {}, envFor(db));
    expect(bare.status).toBe(302);
    expect(bare.headers.get('location')).toContain('/login');
    const queryToken = await app.request('/?token=wrong', {}, envFor(db));
    expect(queryToken.status).toBe(302);
  });

  it('200 HTML contains status-pill, dark bg, Check Now, lists', async () => {
    const db = new FakeDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });
    const env = envFor(db);
    const login = await app.request(
      '/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://status.sinaicamps.com',
          'cf-connecting-ip': '10.9.0.11',
        },
        body: JSON.stringify({ password: DASHBOARD_PASSWORD }),
      },
      env,
    );
    expect(login.status).toBe(302);
    const cookie = String(login.headers.get('set-cookie')).split(';')[0];
    const res = await app.request('/', { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('status-pill');
    expect(html).toContain('#0f172a');
    expect(html).toContain('check-now');
    expect(html).toContain('Check Now');
    expect(html).toContain('Recent checks');
    expect(html).toContain('Recent reports');
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('marketplace');
  });

  it('accepts session cookie too and escapes report content', async () => {
    const db = new FakeDb();
    db.seedCheck('marketplace', { ok: false, errorMessage: '<img src=x>' });
    const env = envFor(db);
    await app.request(
      '/report/error',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${REPORT_TOKEN}`,
          'cf-connecting-ip': '10.9.0.7',
        },
        body: JSON.stringify({ message: '<script>alert(1)</script>' }),
      },
      env,
    );
    const login = await app.request(
      '/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'https://status.sinaicamps.com',
          'cf-connecting-ip': '10.9.0.12',
        },
        body: JSON.stringify({ password: DASHBOARD_PASSWORD }),
      },
      env,
    );
    expect(login.status).toBe(302);
    const cookie = String(login.headers.get('set-cookie')).split(';')[0];
    const res = await app.request('/', { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img src=x>');
  });
});
