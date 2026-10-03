import { describe, it, expect, vi, afterEach } from 'vitest';
import { probeTarget, PROBE_USER_AGENT } from '../src/index.js';
import { matchesExpect } from '../src/targets.js';

// probeTarget(target, fetchFn): hard-timeout probe that never throws —
// network failures, timeouts, and non-2xx handling all fold into the row.
const T = (over = {}) => ({ name: 't', url: 'https://example.test/', expect: 200, timeoutMs: 5000, ...over });

// Every failed probe now logs one line (see logProbeFailure); a test that does
// not assert the log must not spray it through the reporter, and a test that
// asserts it needs it back. Restore after every test either way.
afterEach(() => {
  vi.restoreAllMocks();
});

// Capture console.error lines without letting them reach the reporter.
const errors = () => {
  const lines = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => lines.push(a.join(' ')));
  return lines;
};

describe('probeTarget check logic', () => {
  it('OK: matching status → ok:1, statusCode, null error, integer ms', async () => {
    let seen;
    const fetchFn = async (url, init) => {
      seen = { url, init };
      return { status: 200 };
    };
    const row = await probeTarget(T(), fetchFn);
    expect(row.statusCode).toBe(200);
    expect(row.ok).toBe(1);
    expect(row.errorMessage).toBeNull();
    expect(Number.isInteger(row.responseMs)).toBe(true);
    expect(row.responseMs).toBeGreaterThanOrEqual(0);
    expect(seen.url).toBe('https://example.test/');
    expect(seen.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('identifies itself: every probe sends the SinaiCamps User-Agent and follows redirects', async () => {
    let seen;
    await probeTarget(T(), async (url, init) => {
      seen = { url, init };
      return { status: 200 };
    });
    // Both callers — the cron cycle and POST /internal/check — funnel through
    // this one function, so this assertion covers every outbound probe there is.
    expect(seen.init.headers['User-Agent']).toBe(PROBE_USER_AGENT);
    expect(PROBE_USER_AGENT).toBe('SinaiCamps-Monitor/1.0 (https://status.sinaicamps.com)');
    // Explicit, not inherited from the fetch default: the `ok` rule in
    // probeTarget is only true while redirects are followed.
    expect(seen.init.redirect).toBe('follow');
  });

  it('a followed 301 landing on 200 counts UP, with no error recorded', async () => {
    // What fetch hands back after `redirect: 'follow'`: the FINAL response.
    // 200 is the status the target is pinned to, so this is healthy even though
    // the first hop was a redirect — the exact case that used to be ambiguous.
    const row = await probeTarget(
      T(),
      async () => ({ status: 200, redirected: true, url: 'https://example.test/home' }),
    );
    expect(row.statusCode).toBe(200);
    expect(row.ok).toBe(1);
    expect(row.errorMessage).toBeNull();
  });

  it('mismatch: non-expect status → ok:0, statusCode recorded, AND a non-null error message', async () => {
    const lines = errors();
    const row = await probeTarget(T(), async () => ({ status: 500 }));
    expect(row.statusCode).toBe(500);
    expect(row.ok).toBe(0);
    // CHANGED 2026-10-03: this used to be `null`. A mismatch is the one failure
    // with no exception text, and `last_error` is what the dashboard renders —
    // with it null, a red target carried no reason at all.
    expect(typeof row.errorMessage).toBe('string');
    expect(row.errorMessage).toContain('expected HTTP 200');
    expect(row.errorMessage).toContain('500');
    expect(Number.isInteger(row.responseMs)).toBe(true);
    // ...and the same failure is logged, so it is visible while the incident is
    // open instead of only after someone opens the dashboard.
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('monitor probe failed');
    expect(lines[0]).toContain('url=https://example.test/');
    expect(lines[0]).toContain('status=500');
  });

  it('a mismatch message names the final URL when the chain was followed and still missed', async () => {
    const lines = errors();
    const row = await probeTarget(
      T({ expect: 204 }),
      async () => ({ status: 404, redirected: true, url: 'https://example.test/moved' }),
    );
    expect(row.ok).toBe(0);
    expect(row.errorMessage).toContain('expected HTTP 204');
    expect(row.errorMessage).toContain('got HTTP 404');
    expect(row.errorMessage).toContain('https://example.test/moved');
    expect(lines[0]).toContain('redirected=true');
    expect(lines[0]).toContain('final_url=https://example.test/moved');
  });

  it('a terminal 3xx (chain exhausted) says so instead of reading as a bare 301', async () => {
    errors();
    const row = await probeTarget(T(), async () => ({ status: 301 }));
    expect(row.ok).toBe(0);
    expect(row.errorMessage).toContain('got HTTP 301');
    expect(row.errorMessage).toContain('redirect chain ended');
  });

  it('an array `expect` renders both statuses in the message', async () => {
    errors();
    const row = await probeTarget(T({ expect: [200, 204] }), async () => ({ status: 503 }));
    expect(row.ok).toBe(0);
    expect(row.errorMessage).toContain('expected HTTP 200|204');
  });

  it('a healthy probe logs nothing and keeps error_message null', async () => {
    const lines = errors();
    const row = await probeTarget(
      T(),
      async () => ({ status: 200, redirected: true, url: 'https://example.test/home' }),
    );
    expect(row.ok).toBe(1);
    expect(row.errorMessage).toBeNull();
    expect(lines).toEqual([]);
  });

  it('timeout: hanging fetch past timeoutMs → ok:0, null status, error set', async () => {
    const lines = errors();
    const hanging = (url, { signal } = {}) =>
      new Promise((_, reject) => {
        if (signal?.aborted) return reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })),
        );
      });
    const row = await probeTarget(T({ timeoutMs: 15 }), hanging);
    expect(row.statusCode).toBeNull();
    expect(row.ok).toBe(0);
    expect(typeof row.errorMessage).toBe('string');
    expect(row.errorMessage.length).toBeGreaterThan(0);
    expect(Number.isInteger(row.responseMs)).toBe(true);
    // A failure with no status is still a failure, and the log line says so with
    // `status=none` instead of printing `null`.
    expect(lines[0]).toContain('status=none');
    expect(lines[0]).toContain('redirected=false');
  });

  it('network failure: immediate reject → ok:0, null status, error message kept', async () => {
    const lines = errors();
    const row = await probeTarget(T(), async () => {
      throw new Error('getaddrinfo ENOTFOUND example.test');
    });
    expect(row.statusCode).toBeNull();
    expect(row.ok).toBe(0);
    expect(row.errorMessage).toContain('ENOTFOUND');
    expect(Number.isInteger(row.responseMs)).toBe(true);
    expect(lines[0]).toContain('error=getaddrinfo ENOTFOUND example.test');
  });

  it('integer-ms: responseMs is an integer on both success and failure rows', async () => {
    errors();
    const okRow = await probeTarget(T(), async () => ({ status: 200 }));
    const failRow = await probeTarget(T(), async () => {
      throw new Error('down');
    });
    for (const row of [okRow, failRow]) {
      expect(typeof row.responseMs).toBe('number');
      expect(Number.isInteger(row.responseMs)).toBe(true);
      expect(row.responseMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('matchesExpect (what counts as healthy)', () => {
  it('a single expected status is an equality test', () => {
    expect(matchesExpect(200, 200)).toBe(true);
    expect(matchesExpect(201, 200)).toBe(false);
    // `401` is how a target pins an endpoint that REQUIRES auth: a 200 there
    // would mean the auth was bypassed, so 200 must read as UNHEALTHY.
    expect(matchesExpect(401, 401)).toBe(true);
    expect(matchesExpect(200, 401)).toBe(false);
  });

  it('an ARRAY of statuses is a membership test — the documented multi-status form', () => {
    // No shipped target uses the array form today, which is exactly why it needs
    // a test: it is documented in README section 6, so an operator adding a
    // `expect: [200, 204]` target must be able to trust it.
    expect(matchesExpect(200, [200, 204])).toBe(true);
    expect(matchesExpect(204, [200, 204])).toBe(true);
    expect(matchesExpect(301, [200, 204])).toBe(false);
    expect(matchesExpect(200, [])).toBe(false);
  });
});
