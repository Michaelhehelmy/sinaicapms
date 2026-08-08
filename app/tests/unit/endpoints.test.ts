import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Astro endpoint files only import `astro` types (erased at runtime), so they
// can be imported directly in vitest.
import { GET as healthGet } from '@/pages/api/health';
import { GET as robotsGet } from '@/pages/robots.txt';
import { GET as sitemapGet } from '@/pages/sitemap.xml';

describe('api/health endpoint', () => {
  it('returns 200 with status ok and JSON content type', async () => {
    const res = await healthGet();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });
});

describe('robots.txt endpoint', () => {
  it('returns robots directives with text content type', async () => {
    const res = await robotsGet();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    const text = await res.text();
    expect(text).toContain('User-agent: *');
    expect(text).toContain('Disallow: /admin/');
    expect(text).toContain('Disallow: /pos/');
    expect(text).toContain('Sitemap: https://sinaicamps.com/sitemap.xml');
  });
});

describe('sitemap.xml endpoint', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('generates base URLs when no tenants are returned', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    const res = await sitemapGet({ site: new URL('https://sinaicamps.com/') });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/xml');
    const text = await res.text();
    expect(text).toContain('<loc>https://sinaicamps.com/</loc>');
    expect(text).toContain('<loc>https://sinaicamps.com/about</loc>');
    expect(text).not.toContain('/camp/');
  });

  it('includes camp pages for public tenants', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => [
        { id: 'marketplace', subdomain: 'marketplace', name: 'Marketplace' },
        { id: 't1', subdomain: 'wadi', name: 'Wadi Camp' },
        { id: 't2', subdomain: '', name: 'No Slug' },
      ],
    });
    const res = await sitemapGet({ site: new URL('https://example.com') });
    const text = await res.text();
    expect(text).toContain('<loc>https://example.com/camp/wadi</loc>');
    expect(text).toContain('<loc>https://example.com/camp/wadi/menu</loc>');
    expect(text).toContain('<loc>https://example.com/camp/wadi/book</loc>');
    // t2 has no subdomain → falls back to id
    expect(text).toContain('<loc>https://example.com/camp/t2</loc>');
    // marketplace filtered out
    expect(text).not.toContain('/camp/marketplace');
  });

  it('falls back to default site and empty tenants when fetch fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network'));
    const res = await sitemapGet({ site: undefined });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<loc>https://sinaicamps.com/</loc>');
    expect(text).not.toContain('/camp/');
  });

  it('ignores non-ok fetch responses', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
    });
    const res = await sitemapGet({ site: new URL('https://example.com') });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain('/camp/');
  });
});
