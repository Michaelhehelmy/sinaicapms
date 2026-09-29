import { describe, it, expect } from 'vitest';
import { runProbeCycle, evaluateAlerts } from '../src/index.js';

// Minimal in-memory stand-in for the D1 binding: implements prepare().bind()
// with run()/all()/first() for exactly the SQL shapes used by db.js.
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
    this.alert = new Map();
    this.seq = 0;
    this.tick = 0;
  }
  prepare(sql) {
    return new FakeStmt(this, sql);
  }
  seedCheck(target, { ok, statusCode = ok ? 200 : 500, errorMessage = ok ? null : 'boom' } = {}) {
    this.seq += 1;
    this.tick += 1;
    this.checks.push({
      id: this.seq,
      target,
      status_code: statusCode,
      ok: ok ? 1 : 0,
      response_ms: 12,
      error_message: errorMessage,
      checked_at: `2026-09-29 00:00:${String(this.tick).padStart(2, '0')}`,
    });
  }
  seedAlert(target, { alerting = 0, consecutiveFailures = 0 } = {}) {
    this.alert.set(target, {
      target,
      consecutive_failures: consecutiveFailures,
      alerting,
      last_alert_at: null,
      updated_at: '2026-09-29 00:00:00',
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
    if (sql.includes('FROM (SELECT * FROM checks WHERE target = ?')) {
      const [target, n] = args;
      return this.checks.filter((r) => r.target === target).slice(-n);
    }
    if (sql.includes('FROM alert_state WHERE target = ?')) {
      const row = this.alert.get(args[0]);
      return row ? [row] : [];
    }
    throw new Error(`FakeDb.all: unhandled SQL: ${sql}`);
  }
}

const okProbe = async () => ({ status: 200 });
const failProbe = async () => ({ status: 500 });

function webhookCollector(calls) {
  return async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true };
  };
}

describe('cron probe + webhook alerts', () => {
  it('3 consecutive fails → down + webhook', async () => {
    const db = new FakeDb();
    db.seedCheck('marketplace', { ok: false });
    db.seedCheck('marketplace', { ok: false });
    const calls = [];
    const env = { DB: db, ALERT_WEBHOOK_URL: 'https://hooks.example/t' };

    const results = await runProbeCycle(env, failProbe);
    const outcomes = await evaluateAlerts(env, results, webhookCollector(calls));

    const m = outcomes.find((o) => o.target === 'marketplace');
    expect(m.event).toBe('down');
    expect(m.notified).toBe(true);
    expect(m.alerting).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://hooks.example/t');
    expect(calls[0].body.event).toBe('down');
    expect(calls[0].body.target).toBe('marketplace');
    expect(db.alert.get('marketplace').alerting).toBe(1);
  });

  it('3 ok after down → up + recovery webhook', async () => {
    const db = new FakeDb();
    db.seedAlert('acacia', { alerting: 1, consecutiveFailures: 3 });
    db.seedCheck('acacia', { ok: true });
    db.seedCheck('acacia', { ok: true });
    const calls = [];
    const env = { DB: db, ALERT_WEBHOOK_URL: 'https://hooks.example/t' };

    const results = await runProbeCycle(env, okProbe);
    const outcomes = await evaluateAlerts(env, results, webhookCollector(calls));

    const a = outcomes.find((o) => o.target === 'acacia');
    expect(a.event).toBe('recovery');
    expect(a.notified).toBe(true);
    expect(a.alerting).toBe(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.event).toBe('recovery');
    expect(calls[0].body.target).toBe('acacia');
    expect(db.alert.get('acacia').alerting).toBe(0);
  });

  it('2 fails + success → unchanged, no webhook', async () => {
    const db = new FakeDb();
    db.seedCheck('api-public', { ok: false });
    db.seedCheck('api-public', { ok: false });
    const calls = [];
    const env = { DB: db, ALERT_WEBHOOK_URL: 'https://hooks.example/t' };

    const results = await runProbeCycle(env, okProbe);
    const outcomes = await evaluateAlerts(env, results, webhookCollector(calls));

    const p = outcomes.find((o) => o.target === 'api-public');
    expect(p.event).toBeNull();
    expect(p.notified).toBe(false);
    expect(p.alerting).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('no webhook URL → state still flips, no crash, fetch never called', async () => {
    const db = new FakeDb();
    db.seedCheck('michaelshouse', { ok: false });
    db.seedCheck('michaelshouse', { ok: false });
    const env = { DB: db }; // no ALERT_WEBHOOK_URL / TELEGRAM_WEBHOOK_URL
    const mustNotRun = async () => {
      throw new Error('webhook fetch must not be called without a URL');
    };

    const results = await runProbeCycle(env, failProbe);
    let outcomes;
    await expect(
      (async () => {
        outcomes = await evaluateAlerts(env, results, mustNotRun);
      })(),
    ).resolves.toBeUndefined();

    const h = outcomes.find((o) => o.target === 'michaelshouse');
    expect(h.event).toBe('down');
    expect(h.notified).toBe(false);
    expect(db.alert.get('michaelshouse').alerting).toBe(1);
  });
});
