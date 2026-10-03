import { describe, it, expect } from 'vitest';
import {
  evaluateAlerts,
  forwardReport,
  updateSummary,
  updateHistoryRing,
  readHistoryWindow,
  ALERT_FAIL_THRESHOLD,
  HISTORY_MAX_ENTRIES,
  REPORT_FORWARD_MESSAGE_MAX,
} from '../src/index.js';
import { alertStateKey, summaryKey, historyKey } from '../src/storage.js';
import { makeR2, webhookCollector, ringEntry } from './helpers/fake-r2.js';

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
describe('rolling per-target history ring (state/history/<target>.json)', () => {
  const env = (bucket) => ({ MONITOR_BUCKET: bucket });

  it('appends one entry per probed target, newest last, and skips the rest', async () => {
    const bucket = makeR2();
    const at = (minutes) => new Date(NOW.getTime() - minutes * 60_000);

    await updateHistoryRing(env(bucket), [T('marketplace', true), T('acacia', false)], at(20));
    await updateHistoryRing(env(bucket), [T('marketplace', false)], at(5));

    const market = bucket.read(historyKey('marketplace'));
    expect(market.target).toBe('marketplace');
    expect(market.updated_at).toBe(at(5).toISOString());
    expect(market.entries).toHaveLength(2);
    expect(market.entries[0]).toEqual({
      checked_at: at(20).toISOString(),
      status_code: 200,
      ok: 1,
      response_ms: 12,
    });
    expect(market.entries[1]).toMatchObject({ ok: 0, status_code: 500 });
    // A target absent from this run's results gets NO invented sample: "not probed"
    // is not a healthy observation.
    expect(bucket.read(historyKey('acacia')).entries).toHaveLength(1);
    // ...and a target this run never touched at all has no document yet.
    expect(bucket.keys().filter((k) => k.startsWith('state/history/')).sort()).toEqual([
      'state/history/acacia.json',
      'state/history/marketplace.json',
    ]);
  });

  it('drops entries past the served window', async () => {
    const bucket = makeR2();
    // One sample an hour, for 60 hours: the ones older than the 48h window the
    // endpoint will serve are gone, the rest survive.
    const hourly = [];
    for (let h = 1; h <= 60; h += 1) hourly.push(ringEntry(NOW, h * 60, { response_ms: h }));
    bucket.seed(historyKey('marketplace'), {
      target: 'marketplace',
      updated_at: NOW.toISOString(),
      entries: hourly,
    });
    await updateHistoryRing(env(bucket), [T('marketplace', true)], NOW);
    const kept = bucket.read(historyKey('marketplace')).entries;
    // 47 hourly samples inside the window, plus the one this run appended.
    expect(kept).toHaveLength(48);
    // 48h exactly is already unanswerable, so it is not kept; anything newer is.
    expect(kept.some((e) => e.checked_at === ringEntry(NOW, 48 * 60).checked_at)).toBe(false);
    expect(kept[kept.length - 1].checked_at).toBe(NOW.toISOString());
    // Append order is run order, not sorted order — the read path sorts the
    // window itself (see `readHistoryWindow`), so a run that lands out of order
    // cannot corrupt the series.
    expect(kept[0].checked_at).toBe(ringEntry(NOW, 60).checked_at);
  });

  it('caps the document at the endpoint\'s own entry limit, keeping the newest', async () => {
    const bucket = makeR2();
    // More samples inside the window than the endpoint can return — what an
    // operator hammering POST /internal/check produces.
    const full = Array.from({ length: HISTORY_MAX_ENTRIES + 5 }, (_, i) =>
      ringEntry(NOW, i, { response_ms: i }),
    );
    bucket.seed(historyKey('marketplace'), {
      target: 'marketplace',
      updated_at: NOW.toISOString(),
      entries: full,
    });
    await updateHistoryRing(env(bucket), [T('marketplace', true)], NOW);
    const capped = bucket.read(historyKey('marketplace')).entries;
    expect(capped).toHaveLength(HISTORY_MAX_ENTRIES);
    // Newest survives: the run appended at NOW is the last entry.
    expect(capped[capped.length - 1].checked_at).toBe(NOW.toISOString());
  });

  it('is readable by the endpoint: one object serves the whole window', async () => {
    const bucket = makeR2();
    const at = (hours) => new Date(NOW.getTime() - hours * 3600_000);
    bucket.seed(historyKey('marketplace'), {
      target: 'marketplace',
      updated_at: NOW.toISOString(),
      entries: [ringEntry(at(47), 0), ringEntry(at(20), 0), ringEntry(at(2), 0, { response_ms: 99 })],
    });

    const payload = await readHistoryWindow(env(bucket), 'marketplace', 24, NOW);
    expect(payload.checks).toHaveLength(2);
    expect(payload.checks.map((c) => c.checked_at)).toEqual([
      at(20).toISOString(),
      at(2).toISOString(),
    ]);
    // ONE get, no listing: the whole point of the ring.
    expect(bucket.calls.get).toEqual([historyKey('marketplace')]);
    expect(bucket.calls.list).toEqual([]);
  });

  it('a cold bucket reads as an empty series, not an error', async () => {
    const payload = await readHistoryWindow(env(makeR2()), 'marketplace', 24, NOW);
    expect(payload).toEqual({ target: 'marketplace', hours: 24, checks: [] });
  });

  it('a corrupt ring throws instead of being read as "no history"', async () => {
    const bucket = makeR2();
    bucket.seed(historyKey('marketplace'), null);
    bucket.get = async () => ({
      json: async () => {
        throw new SyntaxError('Unexpected token');
      },
    });
    await expect(readHistoryWindow(env(bucket), 'marketplace', 24, NOW)).rejects.toThrow();
  });
});

describe('report forwarding (the alert channel)', () => {
  const REPORT = {
    id: 'mus0f3ro-189cf5',
    kind: 'error',
    severity: 'fatal',
    message: 'checkout 500',
    page_url: 'https://sinaicamps.com/book',
    contact: 'ops@x',
    received_at: '2026-10-03T12:34:56.000Z',
    user_agent: 'SinaiCamps/1.2',
  };

  it('posts a readable line, and truncates a wall of text', async () => {
    const hooks = webhookCollector();
    const long = { ...REPORT, message: 'x'.repeat(REPORT_FORWARD_MESSAGE_MAX + 200) };
    const res = await forwardReport({ ALERT_WEBHOOK_URL: 'https://hooks.example/t' }, long, hooks.impl);
    expect(res).toEqual({ sent: true });
    expect(hooks.calls).toHaveLength(1);
    const { text, message } = hooks.calls[0].body;
    // The FULL message goes in the structured field...
    expect(message).toHaveLength(REPORT_FORWARD_MESSAGE_MAX + 200);
    // ...and a phone-readable summary goes in `text`, marked as cut.
    expect(text).toContain('NEW fatal report');
    expect(text).toContain('\u2026');
    expect(text).toContain('https://sinaicamps.com/book');
    expect(text).toContain('contact: ops@x');
  });

  it('honours the TELEGRAM_WEBHOOK_URL alias, and skips silently without one', async () => {
    const hooks = webhookCollector();
    expect(
      await forwardReport({ TELEGRAM_WEBHOOK_URL: 'https://api.telegram.org/bot/x' }, REPORT, hooks.impl),
    ).toEqual({ sent: true });
    expect(hooks.calls[0].url).toBe('https://api.telegram.org/bot/x');

    // Unconfigured: the intake request must still succeed, so this is a skip,
    // not an exception.
    expect(await forwardReport({}, REPORT, hooks.impl)).toEqual({
      skipped: true,
      reason: 'no-webhook',
    });
    expect(hooks.calls).toHaveLength(1);
  });

  it('a throwing webhook resolves as skipped, never rejects', async () => {
    const res = await forwardReport({ ALERT_WEBHOOK_URL: 'https://hooks.example/t' }, REPORT, async () => {
      throw new Error('ECONNREFUSED');
    });
    expect(res).toEqual({ skipped: true, reason: 'send-failed' });
  });
});
