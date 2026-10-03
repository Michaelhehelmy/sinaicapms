import { describe, it, expect } from 'vitest';
import { evaluateAlerts, updateSummary, ALERT_FAIL_THRESHOLD } from '../src/index.js';
import { alertStateKey, summaryKey } from '../src/storage.js';
import { makeR2, webhookCollector } from './helpers/fake-r2.js';

// Alert-transition guard on the R2 state document.
//
// Same three rules the D1 version pinned (3 consecutive fails → down; a
// recovery after a down; no webhook without a URL), re-pointed at
// `state/alert_state.json`. What the test now proves INSTEAD of proving the
// D1 query: the counter in that document IS the "3 in a row" rule, so
// consecutive-failure counting, the reset on a healthy run, and the
// last_state-already-down guard are all observable in one stored object.
//
// The stub's page size is deliberately 2 with sorted keys, so the state file is
// read through the same list/get discipline a real bucket uses.

const T = (target, ok, extra = {}) => ({ name: target, url: `https://${target}.test/`, ok: ok ? 1 : 0, statusCode: ok ? 200 : 500, responseMs: 12, errorMessage: ok ? null : 'boom', ...extra });

const NOW = new Date('2026-10-03T12:00:00.000Z');

describe('alert transitions (R2 state document)', () => {
  it(`${ALERT_FAIL_THRESHOLD} consecutive fails → down + webhook, and only once`, async () => {
    const bucket = makeR2();
    const webhooks = webhookCollector();
    const env = { MONITOR_BUCKET: bucket, ALERT_WEBHOOK_URL: 'https://hooks.example/t' };

    // Two failures first: bookkeeping only, no alert yet.
    let outcomes = await evaluateAlerts(env, [T('marketplace', false)], webhooks.impl, NOW);
    expect(outcomes[0]).toMatchObject({ event: null, notified: false, alerting: false, consecutiveFailures: 1 });
    outcomes = await evaluateAlerts(env, [T('marketplace', false)], webhooks.impl, NOW);
    expect(outcomes[0]).toMatchObject({ event: null, consecutiveFailures: 2 });
    expect(webhooks.calls).toHaveLength(0);

    // The third consecutive failure crosses the threshold and announces once.
    outcomes = await evaluateAlerts(env, [T('marketplace', false)], webhooks.impl, NOW);
    expect(outcomes[0]).toMatchObject({ event: 'down', notified: true, alerting: true, consecutiveFailures: 3 });
    expect(webhooks.calls).toHaveLength(1);
    expect(webhooks.calls[0]).toMatchObject({ url: 'https://hooks.example/t', body: { event: 'down', target: 'marketplace' } });

    // A fourth failure must NOT re-announce: the target is already down.
    outcomes = await evaluateAlerts(env, [T('marketplace', false)], webhooks.impl, NOW);
    expect(outcomes[0]).toMatchObject({ event: null, notified: false, alerting: true, consecutiveFailures: 4 });
    expect(webhooks.calls).toHaveLength(1);

    // The document, not just the return value, carries the transition.
    expect(bucket.read(alertStateKey()).marketplace).toEqual({
      last_state: 'down',
      consecutive_failures: 4,
      updated_at: NOW.toISOString(),
    });
  });

  it('a healthy run after down → recovery, and the counter resets', async () => {
    const bucket = makeR2();
    bucket.seed(alertStateKey(), {
      marketplace: { last_state: 'down', consecutive_failures: 3, updated_at: '2026-10-03T11:55:00.000Z' },
    });
    const webhooks = webhookCollector();
    const env = { MONITOR_BUCKET: bucket, ALERT_WEBHOOK_URL: 'https://hooks.example/t' };

    const outcomes = await evaluateAlerts(env, [T('marketplace', true)], webhooks.impl, NOW);

    expect(outcomes[0]).toMatchObject({ event: 'recovery', notified: true, alerting: false, consecutiveFailures: 0 });
    expect(webhooks.calls).toHaveLength(1);
    expect(webhooks.calls[0].body.event).toBe('recovery');
    expect(bucket.read(alertStateKey()).marketplace.last_state).toBe('up');
  });

  it('an ok run while already up fires nothing', async () => {
    const bucket = makeR2();
    const webhooks = webhookCollector();
    const env = { MONITOR_BUCKET: bucket, ALERT_WEBHOOK_URL: 'https://hooks.example/t' };

    const outcomes = await evaluateAlerts(env, [T('api-public', true)], webhooks.impl, NOW);

    expect(outcomes[0]).toMatchObject({ event: null, notified: false, alerting: false, consecutiveFailures: 0 });
    expect(webhooks.calls).toHaveLength(0);
  });

  it('a single failure interrupts the streak (2 fails, ok, 2 fails, fail → down)', async () => {
    const bucket = makeR2();
    const webhooks = webhookCollector();
    const env = { MONITOR_BUCKET: bucket, ALERT_WEBHOOK_URL: 'https://hooks.example/t' };

    for (const ok of [false, false, true, false, false, false]) {
      await evaluateAlerts(env, [T('acacia', ok)], webhooks.impl, NOW);
    }

    // The streak only reached 3 at the END; the healthy run in the middle reset
    // it, which is exactly what the D1 "last 3 rows all fail" rule did.
    expect(webhooks.calls).toHaveLength(1);
    expect(webhooks.calls[0].body.event).toBe('down');
    expect(bucket.read(alertStateKey()).acacia).toMatchObject({ last_state: 'down', consecutive_failures: 3 });
  });

  it('no webhook URL → state still flips, no crash, fetch never called', async () => {
    const bucket = makeR2();
    const env = { MONITOR_BUCKET: bucket }; // no ALERT_WEBHOOK_URL / TELEGRAM_WEBHOOK_URL
    const mustNotRun = async () => {
      throw new Error('webhook fetch must not be called without a URL');
    };

    let outcomes;
    await expect(
      (async () => {
        for (let i = 0; i < 3; i += 1) {
          outcomes = await evaluateAlerts(env, [T('michaelshouse', false)], mustNotRun, NOW);
        }
      })(),
    ).resolves.toBeUndefined();

    expect(outcomes[0]).toMatchObject({ event: 'down', notified: false, alerting: true });
    expect(bucket.read(alertStateKey()).michaelshouse.last_state).toBe('down');
  });

  it('a single-target manual run carries the other targets forward untouched', async () => {
    const bucket = makeR2();
    bucket.seed(alertStateKey(), {
      acacia: { last_state: 'down', consecutive_failures: 7, updated_at: '2026-10-03T11:50:00.000Z' },
    });
    const env = { MONITOR_BUCKET: bucket };

    // Operator checks one host. Everything else must keep its state — "not
    // probed" is not "healthy", so nothing may be reset.
    const outcomes = await evaluateAlerts(env, [T('marketplace', true)], webhookCollector().impl, NOW);

    expect(outcomes.map((o) => o.target)).toEqual(['marketplace']);
    const state = bucket.read(alertStateKey());
    expect(state.acacia).toEqual({ last_state: 'down', consecutive_failures: 7, updated_at: '2026-10-03T11:50:00.000Z' });
    expect(state.marketplace.last_state).toBe('up');
  });

  it('a full run drops entries for targets that are no longer configured', async () => {
    const bucket = makeR2();
    bucket.seed(alertStateKey(), {
      'retired-host': { last_state: 'down', consecutive_failures: 9, updated_at: '2026-10-01T00:00:00.000Z' },
      marketplace: { last_state: 'up', consecutive_failures: 0, updated_at: '2026-10-03T11:55:00.000Z' },
    });
    const env = { MONITOR_BUCKET: bucket };
    // No probeResults = full run over TARGETS.
    const outcomes = await evaluateAlerts(env, [], webhookCollector().impl, NOW);

    expect(outcomes.length).toBeGreaterThan(1);
    expect(Object.keys(bucket.read(alertStateKey()))).not.toContain('retired-host');
    expect(bucket.read(alertStateKey()).marketplace).toBeTruthy();
  });

  it('a corrupt state document fails the step instead of resetting state', async () => {
    const bucket = makeR2();
    bucket.seed(alertStateKey(), { marketplace: { last_state: 'down', consecutive_failures: 3 } });
    bucket.get = async () => ({
      json: async () => {
        throw new SyntaxError('Unexpected end of JSON input');
      },
    });
    const env = { MONITOR_BUCKET: bucket };

    // Swallowing this would write an empty state back and announce a recovery
    // for an outage that is still running.
    await expect(evaluateAlerts(env, [], webhookCollector().impl, NOW)).rejects.toThrow();
    expect(bucket.calls.put).toEqual([]); // the file was left alone
  });
});

describe('rolling 24h summary (state/summary.json)', () => {
  it('counts ok/total per target across runs and drops runs older than 24h', async () => {
    const bucket = makeR2();
    const env = { MONITOR_BUCKET: bucket };
    const at = (hoursAgo) => new Date(NOW.getTime() - hoursAgo * 3600 * 1000);

    await updateSummary(env, [T('marketplace', true), T('acacia', false)], at(25));
    await updateSummary(env, [T('marketplace', true), T('acacia', true)], at(3));
    await updateSummary(env, [T('marketplace', false), T('acacia', true)], NOW);

    const summary = bucket.read(summaryKey());
    // The 25h-old run has expired: marketplace counts the two in-window runs.
    expect(summary.targets.marketplace).toEqual({ okCount: 1, totalCount: 2 });
    expect(summary.targets.acacia).toEqual({ okCount: 2, totalCount: 2 });
    expect(summary.runs).toHaveLength(2);
    expect(summary.window_hours).toBe(24);
    expect(summary.updated_at).toBe(NOW.toISOString());
  });

  it('is readable by a fresh worker: one object, no history walk', async () => {
    const bucket = makeR2();
    const env = { MONITOR_BUCKET: bucket };
    await updateSummary(env, [T('marketplace', true)], NOW);

    // The whole point: `/api/status` reads ONE key, not 288 run objects.
    expect(bucket.calls.get).toEqual([summaryKey()]);
    expect(bucket.read(summaryKey()).targets.marketplace.totalCount).toBe(1);
  });
});