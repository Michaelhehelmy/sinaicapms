import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { getTenantSSRData, onRequest, resolveApiFetcher } from '@/middleware/tenant';

const fetchMock = vi.fn();

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

/**
 * A non-2xx tenant answer. Defaults to the backend's "no such tenant" 404
 * (api/tenants.js `errorResponse('Tenant not found', 404)`); pass another status
 * to model anything the API can answer that is NOT proof of absence.
 */
function notOkJson(status = 404): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

/** What a D1 outage looks like to SSR: the Worker's `app.onError` 500. */
function serverErrorJson(status = 500): Response {
  return notOkJson(status);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('getTenantSSRData', () => {
  it('returns marketplace defaults when no lookup key resolves (localhost)', async () => {
    const data = await getTenantSSRData(new URL('https://localhost/'));

    expect(data.tenantId).toBe('');
    expect(data.tenant).toBeNull();
    expect(data.camps).toEqual([]);
    expect(data.roomTypes).toEqual([]);
    expect(data.primaryColor).toBe('#4a7c4f');
    expect(data.tenantName).toBe('Camp Portal');
    expect(data.API_BASE).toBe('http://localhost:8787/api/v1');
    expect(data.lookupState).toBe('skipped');
    expect(data.theme.primary).toBe('#4a7c4f');
    expect(data.theme.darkMode).toBe('class');
    expect(Object.keys(data.theme.cssVars)).toEqual([
      '--brand-primary',
      '--brand-accent',
      '--brand-contrast',
      '--brand-font',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves the tenant query param on localhost and loads tenant data', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ id: 'acacia', name: 'Acacia Camp' }))
      .mockResolvedValueOnce(okJson([{ id: 'c1', name: 'Camp One' }]))
      .mockResolvedValueOnce(okJson([{ id: 'r1', name: 'Tent' }]));

    const data = await getTenantSSRData(new URL('https://localhost/?tenant=acacia'));

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:8787/api/v1/tenants/acacia');
    expect(data.tenantId).toBe('acacia');
    expect(data.tenant?.name).toBe('Acacia Camp');
    expect(data.lookupState).toBe('ok');
    expect(data.camps).toHaveLength(1);
    expect(data.roomTypes).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:8787/api/v1/projects', {
      headers: { 'x-tenant-id': 'acacia' },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://localhost:8787/api/v1/products', {
      headers: { 'x-tenant-id': 'acacia' },
    });
    // Tenant resolved without a branding color → default theme palette.
    expect(data.theme.primary).toBe('#4a7c4f');
  });

  it('derives the theme from the tenant primary color', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ id: 'acacia', name: 'Acacia Camp', primaryColor: '#336699' }))
      .mockResolvedValueOnce(okJson([]))
      .mockResolvedValueOnce(okJson([]));

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.primaryColor).toBe('#336699');
    expect(data.theme.primary).toBe('#336699');
    expect(data.theme.accent).toBe(data.theme.cssVars['--brand-accent']);
    expect(data.theme.cssVars['--brand-primary']).toBe('#336699');
    expect(data.theme.cssVars['--brand-accent']).toMatch(/^#[0-9a-f]{6}$/);
    expect(data.theme.cssVars['--brand-contrast']).toMatch(/^#[0-9a-f]{6}$/);
    expect(data.theme.cssVars['--brand-font']).toContain('Plus Jakarta Sans');
  });

  it('treats the marketplace host as its own tenant', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'marketplace', name: 'SinaiCamps' }));

    const data = await getTenantSSRData(new URL('https://sinaicamps.com/'));

    expect(data.API_BASE).toBe('https://sinaicamps.com/api/v1');
    expect(fetchMock).toHaveBeenCalledWith('https://sinaicamps.com/api/v1/tenants/marketplace');
    expect(data.tenantId).toBe('marketplace');
    expect(data.tenantName).toBe('SinaiCamps');
  });

  it('extracts the subdomain from a sinaicamps.com subdomain host', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia' }));

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.API_BASE).toBe('https://acacia.sinaicamps.com/api/v1');
    expect(fetchMock).toHaveBeenCalledWith('https://acacia.sinaicamps.com/api/v1/tenants/acacia');
    expect(data.tenantId).toBe('acacia');
  });

  it('treats www.sinaicamps.com as the marketplace', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'marketplace', name: 'SinaiCamps' }));

    const data = await getTenantSSRData(new URL('https://www.sinaicamps.com/'));

    expect(data.tenantId).toBe('marketplace');
    expect(fetchMock).toHaveBeenCalledWith('https://www.sinaicamps.com/api/v1/tenants/marketplace');
  });

  it('uses the full hostname as the lookup key for custom domains', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'custom', name: 'Custom' }));

    const data = await getTenantSSRData(new URL('https://acaciacamp.com/'));

    expect(data.API_BASE).toBe('https://sinaicamps.com/api/v1');
    expect(fetchMock).toHaveBeenCalledWith('https://sinaicamps.com/api/v1/tenants/acaciacamp.com');
    expect(data.tenantId).toBe('custom');
  });

  it('falls through to the hostname key when a subdomain is www', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'x1', name: 'X' }));

    const data = await getTenantSSRData(new URL('https://www.foo.sinaicamps.com/'));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.foo.sinaicamps.com/api/v1/tenants/foo.sinaicamps.com',
    );
    expect(data.tenantId).toBe('x1');
  });

  it('strips a leading www. from a custom-domain host for the lookup key', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia Camp' }));

    const data = await getTenantSSRData(new URL('https://www.acaciacamp.com/'));

    expect(data.API_BASE).toBe('https://sinaicamps.com/api/v1');
    expect(fetchMock).toHaveBeenCalledWith('https://sinaicamps.com/api/v1/tenants/acaciacamp.com');
    expect(data.tenantId).toBe('acacia');
  });

  it('leaves a non-www custom-domain host untouched', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia Camp' }));

    const data = await getTenantSSRData(new URL('https://acaciacamp.com/'));

    expect(fetchMock).toHaveBeenCalledWith('https://sinaicamps.com/api/v1/tenants/acaciacamp.com');
    expect(data.tenantId).toBe('acacia');
  });

  it('still treats www.sinaicamps.com as the marketplace (no lookup key change)', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'marketplace', name: 'SinaiCamps' }));

    const data = await getTenantSSRData(new URL('https://www.sinaicamps.com/'));

    expect(data.tenantId).toBe('marketplace');
    expect(fetchMock).toHaveBeenCalledWith('https://www.sinaicamps.com/api/v1/tenants/marketplace');
  });

  it('keeps defaults when the tenant lookup returns not-ok', async () => {
    fetchMock.mockResolvedValue(notOkJson());

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.tenant).toBeNull();
    expect(data.tenantId).toBe('');
    expect(data.primaryColor).toBe('#4a7c4f');
    expect(data.theme.primary).toBe('#4a7c4f');
    // 404 is the API's positive "no such tenant" → NOT an outage.
    expect(data.lookupState).toBe('not-found');
  });

  it('reports the lookup as failed when the API answers 5xx (D1 outage)', async () => {
    fetchMock.mockResolvedValue(serverErrorJson());

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.tenant).toBeNull();
    expect(data.tenantId).toBe('');
    expect(data.lookupState).toBe('failed');
  });

  it('reports the lookup as failed when the tenant body is not JSON', async () => {
    // An edge/proxy error page can arrive 200 + HTML: json() throws, so the
    // lookup never completed even though the status looked fine.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    } as unknown as Response);

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.tenant).toBeNull();
    expect(data.lookupState).toBe('failed');
    expect(console.error).toHaveBeenCalledWith(
      'Error loading tenant SSR data:',
      expect.any(SyntaxError),
    );
  });

  it('keeps defaults when the matched tenant has no id', async () => {
    fetchMock.mockResolvedValue(okJson({ name: 'No Id' }));

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.tenant).toBeNull();
    expect(data.tenantId).toBe('');
    // 2xx we cannot use is treated as absent, exactly as before this change.
    expect(data.lookupState).toBe('not-found');
  });

  it('keeps camps empty when the camps fetch is not-ok', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ id: 'x1', name: 'X' }))
      .mockResolvedValueOnce(notOkJson())
      .mockResolvedValueOnce(okJson([{ id: 'r1', name: 'Tent' }]));

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.tenantId).toBe('x1');
    expect(data.camps).toEqual([]);
    expect(data.roomTypes).toHaveLength(1);
  });

  it('keeps room types empty when the products fetch is not-ok', async () => {
    fetchMock
      .mockResolvedValueOnce(okJson({ id: 'x1', name: 'X' }))
      .mockResolvedValueOnce(okJson([{ id: 'c1', name: 'Camp' }]))
      .mockResolvedValueOnce(notOkJson());

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.tenantId).toBe('x1');
    expect(data.camps).toHaveLength(1);
    expect(data.roomTypes).toEqual([]);
  });

  it('falls back to defaults and logs when the tenant fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.tenant).toBeNull();
    expect(data.tenantId).toBe('');
    expect(data.lookupState).toBe('failed');
    expect(console.error).toHaveBeenCalledWith('Error loading tenant SSR data:', expect.any(Error));
  });
});

describe('tenant onRequest middleware', () => {
  it('sets locals and skips tenant fetching for admin routes', async () => {
    for (const path of ['/admin', '/admin/settings', '/pos', '/pos/sales', '/auth/login', '/register']) {
      const context = { url: new URL(`https://sinaicamps.com${path}`), locals: {} } as any;
      const next = vi.fn().mockResolvedValue(new Response('ok'));
      await onRequest(context, next);
      expect(next).toHaveBeenCalledOnce();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(context.locals.tenantId).toBe('marketplace');
      expect(context.locals.API_BASE).toBe('https://sinaicamps.com/api/v1');
      expect(context.locals.tenantLookupState).toBe('skipped');
      fetchMock.mockReset();
    }
  });

  it('skips the tenant fetch for the marketplace itself', async () => {
    const context = { url: new URL('https://sinaicamps.com/camps'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(context.locals.tenant).toBeNull();
    expect(context.locals.tenantSubdomain).toBe('');
    expect(context.locals.tenantLookupState).toBe('skipped');
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips the tenant fetch when no tenant id resolves', async () => {
    const context = { url: new URL('https://localhost/camp'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(context.locals.tenantId).toBe('');
    expect(context.locals.tenantLookupState).toBe('skipped');
    expect(next).toHaveBeenCalledOnce();
  });

  it('populates locals from a successful tenant fetch', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 't1', name: 'Acacia', subdomain: 'acacia' }));

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://acacia.sinaicamps.com/api/v1/tenants/acacia',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(context.locals.tenant).toEqual({ id: 't1', name: 'Acacia', subdomain: 'acacia' });
    expect(context.locals.tenantId).toBe('t1');
    expect(context.locals.tenantSubdomain).toBe('acacia');
    expect(context.locals.tenantLookupState).toBe('ok');
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps tenant null when the fetch is not-ok', async () => {
    fetchMock.mockResolvedValue(notOkJson());

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.tenant).toBeNull();
    expect(context.locals.tenantId).toBe('acacia');
    expect(context.locals.tenantSubdomain).toBe('');
    // A 404 is the API saying "no such tenant" — the branded 404 still applies.
    expect(context.locals.tenantLookupState).toBe('not-found');
  });

  // THE INCIDENT (2026-10-03): a D1 outage answered every tenant host with the
  // Worker's 500, the middleware swallowed it, and the pages rendered the
  // branded 404. These pin the distinction at its single source.
  it('reports a FAILED lookup (not "not found") when the API answers 5xx', async () => {
    for (const status of [500, 502, 503, 504]) {
      fetchMock.mockResolvedValue(serverErrorJson(status));

      const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
      const next = vi.fn().mockResolvedValue(new Response('ok'));
      await onRequest(context, next);

      expect(context.locals.tenant).toBeNull();
      expect(context.locals.tenantLookupState, `status ${status}`).toBe('failed');
      fetchMock.mockReset();
    }
  });

  it('reports a FAILED lookup when the tenant answer is throttled or unauthenticated', async () => {
    for (const status of [401, 403, 429]) {
      fetchMock.mockResolvedValue(serverErrorJson(status));

      const context = { url: new URL('https://acaciacamp.com/'), locals: {} } as any;
      const next = vi.fn().mockResolvedValue(new Response('ok'));
      await onRequest(context, next);

      expect(context.locals.tenantLookupState, `status ${status}`).toBe('failed');
      fetchMock.mockReset();
    }
  });

  it('reports a FAILED lookup when the 2xx tenant body is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    } as unknown as Response);

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.tenant).toBeNull();
    expect(context.locals.tenantLookupState).toBe('failed');
    expect(console.error).toHaveBeenCalledWith(
      'Middleware tenant fetch failed:',
      expect.any(SyntaxError),
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps tenant null and logs when the fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.tenant).toBeNull();
    expect(context.locals.tenantLookupState).toBe('failed');
    expect(console.error).toHaveBeenCalledWith('Middleware tenant fetch failed:', expect.any(Error));
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps tenant null when the matched tenant has no id', async () => {
    fetchMock.mockResolvedValue(okJson({ name: 'No Id' }));

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.tenant).toBeNull();
    expect(context.locals.tenantId).toBe('acacia');
    expect(context.locals.tenantSubdomain).toBe('');
    expect(context.locals.tenantLookupState).toBe('not-found');
  });

  it('sets an empty subdomain when the tenant has none', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 't2', name: 'Y' }));

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.tenant).toEqual({ id: 't2', name: 'Y' });
    expect(context.locals.tenantId).toBe('t2');
    expect(context.locals.tenantSubdomain).toBe('');
    expect(context.locals.tenantLookupState).toBe('ok');
  });

  it('aborts the tenant fetch and logs when it times out', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, opts?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('The operation was aborted.', 'AbortError')),
          );
        }),
    );

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    const pending = onRequest(context, next);
    await vi.advanceTimersByTimeAsync(5000);
    await pending;

    expect(console.error).toHaveBeenCalledWith(
      'Middleware tenant fetch failed:',
      expect.any(DOMException),
    );
    expect(context.locals.tenant).toBeNull();
    // An aborted lookup never learned whether the tenant exists → outage, not
    // "no such tenant".
    expect(context.locals.tenantLookupState).toBe('failed');
    expect(next).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });
});

describe('zone model locals (marketplace vs tenant exclusivity)', () => {
  it('marks marketplace zone for the marketplace host', async () => {
    const context = { url: new URL('https://sinaicamps.com/camps'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.zone).toBe('marketplace');
    expect(context.locals.routeForbidden).toBe(false);
  });

  it('marks tenant zone for a tenant subdomain', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia', subdomain: 'acacia' }));
    const context = { url: new URL('https://acacia.sinaicamps.com/rooms'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.zone).toBe('tenant');
    expect(context.locals.routeForbidden).toBe(false);
  });

  it('forbids tenant-only routes on the marketplace zone', async () => {
    for (const path of ['/book', '/menu', '/rooms', '/pos', '/pos/sales']) {
      const context = { url: new URL(`https://sinaicamps.com${path}`), locals: {} } as any;
      const next = vi.fn().mockResolvedValue(new Response('ok'));
      await onRequest(context, next);
      expect(context.locals.zone).toBe('marketplace');
      expect(context.locals.routeForbidden).toBe(true);
    }
  });

  it('forbids marketplace-only routes on the tenant zone', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia' }));
    for (const path of ['/camps', '/camp', '/camp/acacia', '/camp/acacia/book', '/camp/acacia/menu']) {
      const context = { url: new URL(`https://acacia.sinaicamps.com${path}`), locals: {} } as any;
      const next = vi.fn().mockResolvedValue(new Response('ok'));
      await onRequest(context, next);
      expect(context.locals.zone).toBe('tenant');
      expect(context.locals.routeForbidden).toBe(true);
    }
  });

  it('never forbids system routes regardless of zone', async () => {
    for (const zone of ['marketplace', 'tenant'] as const) {
      for (const path of ['/admin', '/admin/settings', '/auth/login', '/register', '/login', '/api/camps', '/robots.txt', '/sitemap.xml', '/404']) {
        const context = { url: new URL(`https://sinaicamps.com${path}`), locals: {} } as any;
        const next = vi.fn().mockResolvedValue(new Response('ok'));
        await onRequest(context, next);
        expect(context.locals.zone).toBe('marketplace');
        expect(context.locals.routeForbidden).toBe(false);
        fetchMock.mockReset();
      }
    }
  });

  it('allows pos routes on the tenant zone', async () => {
    // /pos is an operations app — the fetch is skipped (SSR-skip list) but the
    // zone still resolves to tenant, so the route is NOT forbidden.
    for (const path of ['/pos', '/pos/sales']) {
      const context = { url: new URL(`https://acacia.sinaicamps.com${path}`), locals: {} } as any;
      const next = vi.fn().mockResolvedValue(new Response('ok'));
      await onRequest(context, next);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(context.locals.zone).toBe('tenant');
      expect(context.locals.routeForbidden).toBe(false);
      fetchMock.mockReset();
    }
  });

  it('never forbids shared routes in either zone', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia' }));
    for (const path of ['/', '/about', '/contact', '/faq', '/gallery']) {
      const mkt = { url: new URL(`https://sinaicamps.com${path}`), locals: {} } as any;
      await onRequest(mkt, vi.fn().mockResolvedValue(new Response('ok')));
      expect(mkt.locals.routeForbidden).toBe(false);

      const tenant = { url: new URL(`https://acacia.sinaicamps.com${path}`), locals: {} } as any;
      await onRequest(tenant, vi.fn().mockResolvedValue(new Response('ok')));
      expect(tenant.locals.routeForbidden).toBe(false);
      fetchMock.mockReset();
    }
  });

  it('resolves a tenant query param on localhost into the tenant zone', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia' }));
    const context = { url: new URL('https://localhost/rooms?tenant=acacia'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.zone).toBe('tenant');
    expect(context.locals.routeForbidden).toBe(false);
  });

  it('defaults localhost without a tenant param to the marketplace zone', async () => {
    const context = { url: new URL('https://localhost/rooms'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.zone).toBe('marketplace');
    expect(context.locals.routeForbidden).toBe(true);
  });
});

describe('resolveApiFetcher', () => {
  it('uses the API_BACKEND service binding when available (production origin)', async () => {
    const bindingFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const runtimeEnv = { API_BACKEND: { fetch: bindingFetch } };

    const fetcher = resolveApiFetcher(runtimeEnv, 'https://sinaicamps.com/api/v1');
    await fetcher('/tenants/123');

    expect(bindingFetch).toHaveBeenCalledTimes(1);
    const [request, init] = bindingFetch.mock.calls[0];
    expect(request).toBeInstanceOf(URL);
    expect(request.pathname).toBe('/api/v1/tenants/123');
    expect(request.origin).toBe('https://campmaster-backend');
  });

  it('passes init options through the binding (production origin)', async () => {
    const bindingFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const runtimeEnv = { API_BACKEND: { fetch: bindingFetch } };

    const fetcher = resolveApiFetcher(runtimeEnv, 'https://sinaicamps.com/api/v1');
    await fetcher('/camps', { method: 'POST', headers: { 'x-tenant-id': 't1' } });

    const [, init] = bindingFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'x-tenant-id': 't1' });
  });

  it('falls back to cross-origin fetch in local dev even when a binding is present', async () => {
    const bindingFetch = vi.fn().mockResolvedValue(new Response('ok'));
    const runtimeEnv = { API_BACKEND: { fetch: bindingFetch } };

    // Local dev: the binding target (campmaster-backend) runs as a separate
    // `wrangler dev` process that the @astrojs/cloudflare v14 Vite-plugin
    // workerd cannot discover, so the binding fetch dead-ends and every SSR
    // load resolves tenant=null. The plain cross-origin fetch to the
    // standalone backend on localhost:8787 restores the pre-Astro-7 behavior.
    const fetcher = resolveApiFetcher(runtimeEnv, 'http://localhost:8787/api/v1');
    await fetcher('/tenants/123');

    expect(bindingFetch).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/v1/tenants/123');
  });

  it('falls back to cross-origin fetch when binding is absent', async () => {
    const fetcher = resolveApiFetcher(undefined, 'http://localhost:8787/api/v1');
    await fetcher('/camps');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/v1/camps');
  });

  it('falls back to cross-origin fetch when binding lacks a fetch function', async () => {
    const fetcher = resolveApiFetcher({ API_BACKEND: {} }, 'http://localhost:8787/api/v1');
    await fetcher('/camps');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/v1/camps');
  });

  it('passes init to the fallback fetch when provided', async () => {
    const fetcher = resolveApiFetcher(undefined, 'http://localhost:8787/api/v1');
    await fetcher('/camps', { method: 'POST', body: '{}' });

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8787/api/v1/camps', { method: 'POST', body: '{}' });
  });
});
