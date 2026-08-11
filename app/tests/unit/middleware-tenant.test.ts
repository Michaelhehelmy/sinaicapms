import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { getTenantSSRData, onRequest } from '@/middleware/tenant';

const fetchMock = vi.fn();

function okJson(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function notOkJson(): Response {
  return { ok: false, json: async () => ({}) } as unknown as Response;
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
    expect(data.API_BASE).toBe('http://localhost:8787/api');
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

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:8787/api/tenants/acacia');
    expect(data.tenantId).toBe('acacia');
    expect(data.tenant?.name).toBe('Acacia Camp');
    expect(data.camps).toHaveLength(1);
    expect(data.roomTypes).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:8787/api/camps', {
      headers: { 'x-tenant-id': 'acacia' },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, 'http://localhost:8787/api/products', {
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

    expect(data.API_BASE).toBe('https://sinaicamps.com/api');
    expect(fetchMock).toHaveBeenCalledWith('https://sinaicamps.com/api/tenants/marketplace');
    expect(data.tenantId).toBe('marketplace');
    expect(data.tenantName).toBe('SinaiCamps');
  });

  it('extracts the subdomain from a sinaicamps.com subdomain host', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia' }));

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.API_BASE).toBe('https://acacia.sinaicamps.com/api');
    expect(fetchMock).toHaveBeenCalledWith('https://acacia.sinaicamps.com/api/tenants/acacia');
    expect(data.tenantId).toBe('acacia');
  });

  it('treats www.sinaicamps.com as the marketplace', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'marketplace', name: 'SinaiCamps' }));

    const data = await getTenantSSRData(new URL('https://www.sinaicamps.com/'));

    expect(data.tenantId).toBe('marketplace');
    expect(fetchMock).toHaveBeenCalledWith('https://www.sinaicamps.com/api/tenants/marketplace');
  });

  it('uses the full hostname as the lookup key for custom domains', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'custom', name: 'Custom' }));

    const data = await getTenantSSRData(new URL('https://acaciacamp.com/'));

    expect(data.API_BASE).toBe('https://sinaicamps.com/api');
    expect(fetchMock).toHaveBeenCalledWith('https://sinaicamps.com/api/tenants/acaciacamp.com');
    expect(data.tenantId).toBe('custom');
  });

  it('falls through to the hostname key when a subdomain is www', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'x1', name: 'X' }));

    const data = await getTenantSSRData(new URL('https://www.foo.sinaicamps.com/'));

    expect(fetchMock).toHaveBeenCalledWith(
      'https://www.foo.sinaicamps.com/api/tenants/foo.sinaicamps.com',
    );
    expect(data.tenantId).toBe('x1');
  });

  it('strips a leading www. from a custom-domain host for the lookup key', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia Camp' }));

    const data = await getTenantSSRData(new URL('https://www.acaciacamp.com/'));

    expect(data.API_BASE).toBe('https://sinaicamps.com/api');
    expect(fetchMock).toHaveBeenCalledWith('https://sinaicamps.com/api/tenants/acaciacamp.com');
    expect(data.tenantId).toBe('acacia');
  });

  it('leaves a non-www custom-domain host untouched', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'acacia', name: 'Acacia Camp' }));

    const data = await getTenantSSRData(new URL('https://acaciacamp.com/'));

    expect(fetchMock).toHaveBeenCalledWith('https://sinaicamps.com/api/tenants/acaciacamp.com');
    expect(data.tenantId).toBe('acacia');
  });

  it('still treats www.sinaicamps.com as the marketplace (no lookup key change)', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 'marketplace', name: 'SinaiCamps' }));

    const data = await getTenantSSRData(new URL('https://www.sinaicamps.com/'));

    expect(data.tenantId).toBe('marketplace');
    expect(fetchMock).toHaveBeenCalledWith('https://www.sinaicamps.com/api/tenants/marketplace');
  });

  it('keeps defaults when the tenant lookup returns not-ok', async () => {
    fetchMock.mockResolvedValue(notOkJson());

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.tenant).toBeNull();
    expect(data.tenantId).toBe('');
    expect(data.primaryColor).toBe('#4a7c4f');
    expect(data.theme.primary).toBe('#4a7c4f');
  });

  it('keeps defaults when the matched tenant has no id', async () => {
    fetchMock.mockResolvedValue(okJson({ name: 'No Id' }));

    const data = await getTenantSSRData(new URL('https://acacia.sinaicamps.com/'));

    expect(data.tenant).toBeNull();
    expect(data.tenantId).toBe('');
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
      expect(context.locals.API_BASE).toBe('https://sinaicamps.com/api');
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
    expect(next).toHaveBeenCalledOnce();
  });

  it('skips the tenant fetch when no tenant id resolves', async () => {
    const context = { url: new URL('https://localhost/camp'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(context.locals.tenantId).toBe('');
    expect(next).toHaveBeenCalledOnce();
  });

  it('populates locals from a successful tenant fetch', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 't1', name: 'Acacia', subdomain: 'acacia' }));

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://acacia.sinaicamps.com/api/tenants/acacia',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(context.locals.tenant).toEqual({ id: 't1', name: 'Acacia', subdomain: 'acacia' });
    expect(context.locals.tenantId).toBe('t1');
    expect(context.locals.tenantSubdomain).toBe('acacia');
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
  });

  it('keeps tenant null and logs when the fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.tenant).toBeNull();
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
  });

  it('sets an empty subdomain when the tenant has none', async () => {
    fetchMock.mockResolvedValue(okJson({ id: 't2', name: 'Y' }));

    const context = { url: new URL('https://acacia.sinaicamps.com/'), locals: {} } as any;
    const next = vi.fn().mockResolvedValue(new Response('ok'));

    await onRequest(context, next);

    expect(context.locals.tenant).toEqual({ id: 't2', name: 'Y' });
    expect(context.locals.tenantId).toBe('t2');
    expect(context.locals.tenantSubdomain).toBe('');
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
