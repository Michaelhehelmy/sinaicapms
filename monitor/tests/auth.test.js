import { describe, it, expect } from 'vitest';
import { app } from '../src/index.js';
import { TARGETS } from '../src/targets.js';

// Auth surface: tokened intake + operator dashboard.
// Mission pins: 401 (report) / 401 (internal/check) / 201+row (report) /
// 401 (dashboard) / 200+status-pill (dashboard).

// In-memory D1 stand-in covering the SQL shapes used by db.js
// (status aggregate + intake/dashboard helpers).
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
const DASHBOARD_TOKEN = 'test-dashboard-secret';
const envFor = (db) => ({ DB: db, REPORT_TOKEN, DASHBOARD_TOKEN });

describe('auth: tokened intake + dashboard', () => {
  it('401: POST /report/error without/wrong token', async () => {
    const noToken = await app.request(
      '/report/error',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '10.99.0.1' },
        body: JSON.stringify({ message: 'help' }),
      },
      envFor(new FakeDb()),
    );
    expect(noToken.status).toBe(401);

    const wrongToken = await app.request(
      '/report/error',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: 'Bearer wrong',
          'cf-connecting-ip': '10.99.0.2',
        },
        body: JSON.stringify({ message: 'help' }),
      },
      envFor(new FakeDb()),
    );
    expect(wrongToken.status).toBe(401);
  });

  it('401: POST /internal/check without token', async () => {
    const res = await app.request('/internal/check', { method: 'POST' }, envFor(new FakeDb()));
    expect(res.status).toBe(401);
  });

  it('201+row: POST /report/error with token stores one reports row', async () => {
    const db = new FakeDb();
    const res = await app.request(
      '/report/error',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${REPORT_TOKEN}`,
          'cf-connecting-ip': '10.99.0.3',
        },
        body: JSON.stringify({ message: 'checkout 500 on /book' }),
      },
      envFor(db),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ kind: 'error', status: 'new' });
    expect(typeof body.id).toBe('number');
    expect(db.reports).toHaveLength(1);
    expect(db.reports[0]).toMatchObject({ kind: 'error', message: 'checkout 500 on /book', status: 'new' });
  });

  it('401: GET / dashboard without/wrong token', async () => {
    const db = new FakeDb();
    expect((await app.request('/', {}, envFor(db))).status).toBe(401);
    expect((await app.request('/?token=wrong', {}, envFor(db))).status).toBe(401);
  });

  it('200+status-pill: GET / with token renders the dashboard', async () => {
    const db = new FakeDb();
    for (const t of TARGETS) db.seedCheck(t.name, { ok: true });
    const res = await app.request(`/?token=${DASHBOARD_TOKEN}`, {}, envFor(db));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('status-pill');
    expect(html).toContain('>OK</div>');
  });
});
