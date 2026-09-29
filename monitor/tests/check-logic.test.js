import { describe, it, expect } from 'vitest';
import { probeTarget } from '../src/index.js';

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
