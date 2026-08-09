import { test, expect } from '@playwright/test';
import { API_BASE, TEST_TENANT } from '../../fixtures/test-data';
const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

test.describe('Security Headers', () => {
  test('API responses include Content-Type header', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/tenants`);
    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toContain('application/json');
  });

  test('API responses include X-Content-Type-Options: nosniff', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/tenants`);
    const nosniff = response.headers()['x-content-type-options'];
    expect(nosniff).toBe('nosniff');
  });

  test('API responses include X-Frame-Options or frame-ancestors', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/tenants`);
    const frameOptions = response.headers()['x-frame-options'];
    const csp = response.headers()['content-security-policy'];
    const hasProtection = frameOptions || (csp && csp.includes('frame-ancestors'));
    expect(hasProtection).toBeTruthy();
  });

  test('API responses do not expose server version', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/tenants`);
    const server = response.headers()['server'];
    // Should either be absent or not expose internal version details
    // Note: 'cloudflare' is expected from Cloudflare infrastructure and is safe
    if (server) {
      expect(server).not.toContain('wrangler');
      expect(server).not.toMatch(/\d+\.\d+\.\d+/);
    }
  });

  test('marketplace page does not leak API keys in HTML', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const html = await page.content();
    expect(html).not.toContain('JWT_SECRET');
    expect(html).not.toContain('API_KEY');
    expect(html).not.toContain('PRIVATE_KEY');
    expect(html).not.toContain('sk_live');
    expect(html).not.toContain('sk_test');
  });

  test('marketplace page does not expose env vars in script tags', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const scripts = page.locator('script');
    const count = await scripts.count();
    for (let i = 0; i < count; i++) {
      const content = await scripts.nth(i).textContent() ?? '';
      expect(content).not.toContain('JWT_SECRET');
      expect(content).not.toContain('DATABASE_URL');
      expect(content).not.toContain('API_KEY');
    }
  });

  test('admin page does not leak secrets in HTML source', async ({ page }) => {
    await page.goto('/admin/', { waitUntil: 'domcontentloaded' });
    const html = await page.content();
    expect(html).not.toContain('JWT_SECRET');
    expect(html).not.toContain('API_KEY');
    expect(html).not.toContain('DATABASE_URL');
  });

  test('POS page does not leak secrets in HTML source', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    const html = await page.content();
    expect(html).not.toContain('JWT_SECRET');
    expect(html).not.toContain('API_KEY');
    expect(html).not.toContain('DATABASE_URL');
  });

  test('API 401 responses do not include Set-Cookie headers', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/me`);
    const setCookie = response.headers()['set-cookie'];
    expect(setCookie).toBeUndefined();
  });

  test('marketplace page has no mixed content (HTTP on HTTPS)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const html = await page.content();
    // Check for http:// URLs in src/href attributes (excluding localhost)
    const httpMatches = html.match(/(href|src)="http:\/\/(?!localhost)[^"]+"/g);
    if (httpMatches) {
      // Filter out legitimate non-HTTPS resources
      const nonLocal = httpMatches.filter((m) => !m.includes('localhost') && !m.includes('127.0.0.1'));
      expect(nonLocal.length).toBe(0);
    }
  });

  test('API error responses do not include stack traces', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/products/nonexistent-tenant-xyz`);
    const body = await response.text();
    expect(body).not.toContain('at Object.');
    expect(body).not.toContain('at Module.');
    expect(body).not.toContain('node_modules');
    expect(body).not.toContain('/home/');
    expect(body).not.toContain('/Users/');
  });
});
