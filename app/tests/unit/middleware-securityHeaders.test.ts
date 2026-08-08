import { describe, it, expect, vi } from 'vitest';

import { buildSecurityHeaders, onRequest } from '@/middleware/securityHeaders';

describe('buildSecurityHeaders', () => {
  it('returns the full security header set', () => {
    const h = buildSecurityHeaders('sinaicamps.com');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
    expect(h['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
  });

  it('uses the production CSP for the marketplace host', () => {
    const h = buildSecurityHeaders('sinaicamps.com');
    const csp = h['Content-Security-Policy'];
    expect(csp).toContain("connect-src 'self' https://sinaicamps.com https://*.sinaicamps.com");
    expect(csp).not.toContain('localhost:8787');
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('allow-lists Plausible in script-src and connect-src of the production CSP', () => {
    const h = buildSecurityHeaders('sinaicamps.com');
    const csp = h['Content-Security-Policy'];
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://plausible.io");
    expect(csp).toContain("connect-src 'self' https://sinaicamps.com https://*.sinaicamps.com https://plausible.io");
    expect(csp).toContain('https://plausible.io');
  });

  it('allow-lists Plausible in the dev CSP', () => {
    const h = buildSecurityHeaders('localhost');
    const csp = h['Content-Security-Policy'];
    expect(csp).toContain("script-src 'self' 'unsafe-inline' https://plausible.io");
    expect(csp).toContain('http://localhost:8787');
    expect(csp).toContain('https://plausible.io');
  });

  it('uses the dev CSP for localhost variants', () => {
    for (const host of ['localhost', '127.0.0.1', 'mycamp.localhost', 'api.127.0.0.1']) {
      const h = buildSecurityHeaders(host);
      expect(h['Content-Security-Policy']).toContain('http://localhost:8787');
    }
  });

  it('uses the production CSP for custom domains', () => {
    const h = buildSecurityHeaders('acaciacamp.com');
    expect(h['Content-Security-Policy']).toContain('https://*.sinaicamps.com');
    expect(h['Content-Security-Policy']).not.toContain('http://localhost');
  });
});

describe('securityHeaders onRequest', () => {
  it('injects security headers into the next response', async () => {
    const response = new Response('ok');
    const context = { url: new URL('https://sinaicamps.com/') } as any;
    const next = vi.fn().mockResolvedValue(response);

    const result = await onRequest(context, next);

    expect(next).toHaveBeenCalledOnce();
    expect(result).toBe(response);
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toContain("script-src 'self'");
  });

  it('uses the dev CSP for localhost responses', async () => {
    const response = new Response('ok');
    const context = { url: new URL('http://localhost:4321/') } as any;
    const next = vi.fn().mockResolvedValue(response);

    await onRequest(context, next);

    expect(response.headers.get('Content-Security-Policy')).toContain('http://localhost:8787');
  });

  it('passes through a falsy response unchanged', async () => {
    const context = { url: new URL('https://sinaicamps.com/') } as any;
    const next = vi.fn().mockResolvedValue(undefined);

    const result = await onRequest(context, next);

    expect(result).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });
});
