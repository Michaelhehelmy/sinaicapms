import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, changePassword } from '@/lib/api';

global.fetch = vi.fn();

// ── Helpers ───────────────────────────────────────────────────────────

function setTestHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { hostname, origin: `https://${hostname}`, search: '' },
    writable: true,
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    headers: { get: () => 'application/json' },
  } as Response;
}

function htmlErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
    headers: { get: () => 'text/html' },
  } as Response;
}

function mock401(): Response {
  return jsonResponse({}, 401);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('apiFetch — Authorization header', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockClear();
    setTestHostname('localhost');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('includes Bearer token when present in localStorage', async () => {
    localStorage.setItem('sinaicamps_token', 'my-access-token');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

    await apiFetch('/test');

    const [, opts] = vi.mocked(fetch).mock.calls[0];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-access-token');
  });

  it('omits Authorization header when no token exists', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

    await apiFetch('/test');

    const [, opts] = vi.mocked(fetch).mock.calls[0];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('uses pos_token for /pos/ endpoints', async () => {
    localStorage.setItem('pos_token', 'pos-secret');
    localStorage.setItem('sinaicamps_token', 'admin-token');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

    await apiFetch('/pos/dashboard');

    const [, opts] = vi.mocked(fetch).mock.calls[0];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer pos-secret');
  });

  it('includes x-tenant-id header when tenant is available', async () => {
    localStorage.setItem('sinaicamps_token', 'tok');
    localStorage.setItem('sinaicamps_tenant_id', 'acacia');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }));

    await apiFetch('/test');

    const [, opts] = vi.mocked(fetch).mock.calls[0];
    const headers = opts.headers as Record<string, string>;
    expect(headers['x-tenant-id']).toBe('acacia');
  });
});

describe('apiFetch — refreshes token on 401', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockClear();
    setTestHostname('localhost');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('calls /auth/refresh with stored refresh token on 401', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'my-refresh');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockResolvedValueOnce(jsonResponse({
        token: 'new-access',
        refreshToken: 'new-refresh',
      }))
      .mockResolvedValueOnce(jsonResponse({ data: 'success' }));

    await apiFetch('/secured');

    // Call 1: original 401, Call 2: refresh, Call 3: retry
    expect(fetch).toHaveBeenCalledTimes(3);

    const [, refreshOpts] = vi.mocked(fetch).mock.calls[1];
    expect(String(vi.mocked(fetch).mock.calls[1][0])).toContain('/auth/refresh');
    expect(refreshOpts.method).toBe('POST');
    const body = JSON.parse(refreshOpts.body as string);
    expect(body.refreshToken).toBe('my-refresh');
  });

  it('stores new tokens after successful refresh', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'old-refresh');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockResolvedValueOnce(jsonResponse({
        token: 'fresh-access',
        refreshToken: 'fresh-refresh',
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch('/data');

    expect(localStorage.getItem('sinaicamps_token')).toBe('fresh-access');
    expect(localStorage.getItem('sinaicamps_refresh_token')).toBe('fresh-refresh');
  });

  it('does not attempt refresh for POS endpoints', async () => {
    localStorage.setItem('pos_token', 'pos-tok');
    vi.mocked(fetch).mockResolvedValue(mock401());

    await expect(apiFetch('/pos/orders')).rejects.toThrow('Unauthorized');

    // Only one call — the original. No refresh attempt.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pos_token')).toBeNull();
  });

  it('does not attempt refresh when the endpoint is /auth/refresh itself', async () => {
    localStorage.setItem('sinaicamps_refresh_token', 'refresh');
    vi.mocked(fetch).mockResolvedValue(mock401());

    await expect(
      apiFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: 'refresh' }) }),
    ).rejects.toThrow('Unauthorized');

    // Only 1 call — no infinite loop
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('apiFetch — retries request after refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockClear();
    setTestHostname('localhost');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('retries with new access token and returns successful response', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'valid-refresh');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockResolvedValueOnce(jsonResponse({ token: 'new-tok', refreshToken: 'new-r' }))
      .mockResolvedValueOnce(jsonResponse({ data: 'retried-ok' }));

    const result = await apiFetch('/protected');

    expect(result).toEqual({ data: 'retried-ok' });

    const [, retryOpts] = vi.mocked(fetch).mock.calls[2];
    const retryHeaders = retryOpts.headers as Record<string, string>;
    expect(retryHeaders['Authorization']).toBe('Bearer new-tok');
  });

  it('returns refresh response even when retry also fails (non-401)', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'valid-refresh');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockResolvedValueOnce(jsonResponse({ token: 'new-tok' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'Forbidden' }, 403));

    await expect(apiFetch('/forbidden')).rejects.toThrow('Forbidden');
  });
});

describe('apiFetch — logs out on refresh failure', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockClear();
    setTestHostname('localhost');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('clears all auth keys when refresh endpoint returns 401', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'bad-refresh');
    localStorage.setItem('sinaicamps_user', JSON.stringify({ role: 'admin' }));

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockResolvedValueOnce(mock401());

    await expect(apiFetch('/data')).rejects.toThrow('Unauthorized');

    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_refresh_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
  });

  it('clears all auth keys when refresh endpoint returns 500', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'server-error');
    localStorage.setItem('sinaicamps_user', JSON.stringify({ role: 'admin' }));

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockResolvedValueOnce(jsonResponse({ error: 'Internal Server Error' }, 500));

    await expect(apiFetch('/data')).rejects.toThrow('Unauthorized');

    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_refresh_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
  });

  it('clears all auth keys when refresh response has no token', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'refresh');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockResolvedValueOnce(jsonResponse({ refreshToken: 'new-r' })); // no token field

    await expect(apiFetch('/data')).rejects.toThrow('Unauthorized');

    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
  });

  it('clears all auth keys when refresh fetch throws a network error', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'refresh');
    localStorage.setItem('sinaicamps_user', '{}');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())
      .mockRejectedValueOnce(new Error('Network error'));

    await expect(apiFetch('/data')).rejects.toThrow('Unauthorized');

    expect(localStorage.getItem('sinaicamps_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_refresh_token')).toBeNull();
    expect(localStorage.getItem('sinaicamps_user')).toBeNull();
  });
});

describe('apiFetch — concurrent requests share one refresh', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockClear();
    setTestHostname('localhost');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('two concurrent 401s trigger only one /auth/refresh call', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'valid-refresh');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())                       // /a first attempt
      .mockResolvedValueOnce(mock401())                       // /b first attempt
      .mockResolvedValueOnce(jsonResponse({                    // single refresh
        token: 'fresh',
        refreshToken: 'fresh-r',
      }))
      .mockResolvedValueOnce(jsonResponse({ data: 'a' }))     // /a retry
      .mockResolvedValueOnce(jsonResponse({ data: 'b' }));    // /b retry

    const [r1, r2] = await Promise.all([apiFetch('/a'), apiFetch('/b')]);

    const refreshCalls = vi.mocked(fetch).mock.calls.filter(
      ([url]) => String(url).includes('/auth/refresh'),
    );
    expect(refreshCalls).toHaveLength(1);
    expect(r1).toEqual({ data: 'a' });
    expect(r2).toEqual({ data: 'b' });
  });

  it('second concurrent request uses already-resolved refresh promise', async () => {
    localStorage.setItem('sinaicamps_token', 'expired');
    localStorage.setItem('sinaicamps_refresh_token', 'valid-refresh');

    vi.mocked(fetch)
      .mockResolvedValueOnce(mock401())                       // /first
      .mockResolvedValueOnce(mock401())                       // /second (arrives before refresh resolves)
      .mockResolvedValueOnce(jsonResponse({ token: 'new' })) // refresh
      .mockResolvedValueOnce(jsonResponse({ data: '1' }))    // /first retry
      .mockResolvedValueOnce(jsonResponse({ data: '2' }));   // /second retry

    const [r1, r2] = await Promise.all([
      apiFetch('/first'),
      apiFetch('/second'),
    ]);

    // Both succeeded with the shared refresh
    expect(r1).toEqual({ data: '1' });
    expect(r2).toEqual({ data: '2' });
    expect(fetch).toHaveBeenCalledTimes(5); // 2 original + 1 refresh + 2 retries
  });
});

describe('apiFetch — changePassword endpoint', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockClear();
    setTestHostname('localhost');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('sends POST /auth/change-password with correct body', async () => {
    localStorage.setItem('sinaicamps_token', 'tok');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'Password changed' }));

    await changePassword('oldPass123', 'newPass456');

    const [url, opts] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain('/auth/change-password');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body).toEqual({ currentPassword: 'oldPass123', newPassword: 'newPass456' });
  });

  it('sends Authorization header with current token', async () => {
    localStorage.setItem('sinaicamps_token', 'auth-tok');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ message: 'OK' }));

    await changePassword('old', 'new');

    const [, opts] = vi.mocked(fetch).mock.calls[0];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer auth-tok');
  });

  it('throws on API error response', async () => {
    localStorage.setItem('sinaicamps_token', 'tok');
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: 'Current password is incorrect' }, 400),
    );

    await expect(changePassword('wrong', 'new')).rejects.toThrow(
      'Current password is incorrect',
    );
  });

  it('throws generic error when error response has no message field', async () => {
    localStorage.setItem('sinaicamps_token', 'tok');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));

    await expect(changePassword('old', 'new')).rejects.toThrow('API error: 500');
  });
});

describe('apiFetch — request deduplication', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockClear();
    setTestHostname('localhost');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('deduplicates concurrent identical GET requests', async () => {
    localStorage.setItem('sinaicamps_tenant_id', 't1');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ data: 'ok' }));

    const [r1, r2] = await Promise.all([
      apiFetch('/dedup'),
      apiFetch('/dedup'),
    ]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(r1).toEqual({ data: 'ok' });
    expect(r2).toEqual({ data: 'ok' });
  });

  it('does not deduplicate POST requests', async () => {
    localStorage.setItem('sinaicamps_tenant_id', 't1');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ id: 1 }));

    await Promise.all([
      apiFetch('/create', { method: 'POST', body: '{}' }),
      apiFetch('/create', { method: 'POST', body: '{}' }),
    ]);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not deduplicate different endpoints', async () => {
    localStorage.setItem('sinaicamps_tenant_id', 't1');
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}));

    await Promise.all([apiFetch('/a'), apiFetch('/b')]);

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('apiFetch — error handling edge cases', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetch).mockClear();
    setTestHostname('localhost');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('throws non-JSON error responses as formatted message', async () => {
    vi.mocked(fetch).mockResolvedValue(htmlErrorResponse(502));

    await expect(apiFetch('/gateway-error')).rejects.toThrow(
      'Server error (502): non-JSON response',
    );
  });

  it('prefers error field over message field in JSON errors', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ error: 'Primary error', message: 'Secondary message' }, 400),
    );

    await expect(apiFetch('/bad')).rejects.toThrow('Primary error');
  });

  it('uses message field when error field is absent', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse({ message: 'Not found' }, 404),
    );

    await expect(apiFetch('/missing')).rejects.toThrow('Not found');
  });

  it('falls back to status-based message when no error/message field', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 418));

    await expect(apiFetch('/teapot')).rejects.toThrow('API error: 418');
  });
});
