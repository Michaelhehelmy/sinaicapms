import { describe, it, expect } from 'vitest';
import { probeTarget } from '../src/index.js';
import { matchesExpect } from '../src/targets.js';

// probeTarget(target, fetchFn): hard-timeout probe that never throws —
// network failures, timeouts, and non-2xx handling all fold into the row.
const T = (over = {}) => ({ name: 't', url: 'https://example.test/', expect: 200, timeoutMs: 5000, ...over });

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

  it('mismatch: non-expect status → ok:0 with statusCode recorded, no error', async () => {
    const row = await probeTarget(T(), async () => ({ status: 500 }));
    expect(row.statusCode).toBe(500);
    expect(row.ok).toBe(0);
    expect(row.errorMessage).toBeNull();
    expect(Number.isInteger(row.responseMs)).toBe(true);
  });

  it('timeout: hanging fetch past timeoutMs → ok:0, null status, error set', async () => {
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
  });

  it('network failure: immediate reject → ok:0, null status, error message kept', async () => {
    const row = await probeTarget(T(), async () => {
      throw new Error('getaddrinfo ENOTFOUND example.test');
    });
    expect(row.statusCode).toBeNull();
    expect(row.ok).toBe(0);
    expect(row.errorMessage).toContain('ENOTFOUND');
    expect(Number.isInteger(row.responseMs)).toBe(true);
  });

  it('integer-ms: responseMs is an integer on both success and failure rows', async () => {
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
