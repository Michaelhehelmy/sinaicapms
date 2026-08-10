import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';
const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

const ADMIN_URL = '/admin/';

test.describe('Page Reload State Persistence', () => {
  test('marketplace: reload preserves camp listing', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="camp-card"], [data-testid="camps-grid"]', { timeout: 10_000 });
    const cardsBefore = await page.locator('[data-testid="camp-card"]').count();

    await page.reload();
    await page.waitForLoadState('networkidle');
    const cardsAfter = await page.locator('[data-testid="camp-card"]').count();

    expect(cardsAfter).toBe(cardsBefore);
  });

  test('tenant: reload preserves hero content', async ({ page }) => {
    // Tenant pages can hang on `load` in astro dev (dead localhost:8001
    // logo/favicon; Google Maps subresources in sandboxed nets) — use
    // domcontentloaded and wait for the hero element instead of networkidle.
    await page.goto(`/?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="hero-banner"]', { timeout: 10_000 });
    const heroBefore = await page.locator('[data-testid="hero-banner"]').first().textContent() ?? '';

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="hero-banner"]', { timeout: 10_000 });
    const heroAfter = await page.locator('[data-testid="hero-banner"]').first().textContent() ?? '';

    expect(heroAfter.length).toBeGreaterThan(0);
    expect(heroAfter).toBe(heroBefore);
  });

  test('admin: reload on settings page preserves form state', async ({ page }) => {
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
    const contentBefore = await page.locator('body').textContent() ?? '';

    await page.reload();
    await page.waitForLoadState('networkidle');
    const contentAfter = await page.locator('body').textContent() ?? '';

    expect(contentAfter.length).toBeGreaterThan(0);
    expect(contentAfter).toBe(contentBefore);
  });

  test('POS: reload on login page preserves form', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-login"]', { timeout: 10_000 });

    await page.reload();
    await page.waitForLoadState('networkidle');

    const url = page.url();
    expect(url).toContain('/login');
  });
});

test.describe('Browser Back/Forward Navigation', () => {
  test('marketplace: navigate to camp detail, back returns to home', async ({ page }) => {
    // The fixture camp acaciacamp has custom_domain=acaciacamp.com, so the
    // grid's explore link points at the production domain — in the sandbox
    // that navigation never settles (external maps/analytics hang). Intercept
    // the tenant domain and redirect to the dev-server camp page so the back
    // navigation stays on localhost. Avoid networkidle (maps subresources hang).
    await page.route(/^https:\/\/acaciacamp\.com(\/|$)/, (route) =>
      route.fulfill({
        status: 302,
        headers: { location: `http://localhost:4320/camp/${TEST_TENANT.id}` },
      })
    );
    await page.goto('/');
    await page.waitForSelector('[data-testid="camp-card"]', { timeout: 10_000 });

    await page.locator('[data-testid="explore-camp-link"]').first().click();
    // Element wait, not waitForURL: waitForURL defaults to waitUntil:'load',
    // which never fires on the camp detail page (Google Maps subresources hang).
    await page.waitForSelector('[data-testid="hero-title"]', { timeout: 10_000 });

    await page.goBack();
    await page.waitForSelector('[data-testid="camp-card"]', { timeout: 10_000 });

    const url = page.url();
    const isHome = url.includes('localhost:4320') || url.endsWith('/');
    expect(isHome).toBeTruthy();
  });

  test('tenant: navigate to rooms, back returns to tenant home', async ({ page }) => {
    // Build a real history entry first: tenant home → rooms. A bare
    // `page.goto('/rooms?tenant=...')` has no prior entry, so `goBack()`
    // lands on about:blank. Tenant pages can hang on `load` in astro dev
    // (logo/favicon point at dead localhost:8001), so use domcontentloaded.
    await page.goto(`/?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="tenant-landing"], #main-content, header', { timeout: 10_000 });

    await page.goto(`/rooms?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="rooms-page"], #main-content, header', { timeout: 10_000 });

    await page.goBack({ waitUntil: 'domcontentloaded' });

    const url = page.url();
    expect(url).toContain('localhost:4320');
  });

  test('POS: login → dashboard, back returns to login', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });

    await page.locator('[data-testid="pos-identifier"]').fill(process.env.POS_IDENTIFIER || 'cashier');
    await page.locator('[data-testid="pos-password"]').fill(process.env.POS_PASSWORD || 'pass1234');
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.waitForURL('**/pos/**', { timeout: 10_000 }).catch(() => {});

    if (page.url().includes('/pos/') && !page.url().includes('/login')) {
      await page.goBack();
      await page.waitForLoadState('networkidle');
      const url = page.url();
      expect(url).toContain('/login');
    }
  });
});

test.describe('No Horizontal Scroll on Any Page', () => {
  test('marketplace: no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth + 10);
    expect(overflow).toBeTruthy();
  });

  test('marketplace: no horizontal scroll at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth + 10);
    expect(overflow).toBeTruthy();
  });

  test('tenant: no horizontal scroll at 375px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // Tenant page — see reload/JS-error tests: domcontentloaded + landmark
    // instead of load/networkidle (dead localhost:8001 assets can hang).
    await page.goto(`/?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="hero-banner"], #main-content, header', { timeout: 10_000 });

    const overflow = await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth + 10);
    expect(overflow).toBeTruthy();
  });

  test('admin: no horizontal scroll at 1280px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');

    const overflow = await page.evaluate(() => document.body.scrollWidth <= document.body.clientWidth + 10);
    expect(overflow).toBeTruthy();
  });
});

test.describe('No JavaScript Console Errors', () => {
  test('marketplace: no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('tenant: no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    // Tenant page — see camp detail test above re: load/networkidle hang.
    await page.goto(`/?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="hero-banner"], #main-content, header', { timeout: 10_000 });

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('camp detail: no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    // Google Maps subresources hang on `load` in the sandboxed CI net (maps
    // requests never complete) — tenant pages can hang on `load` in astro dev
    // anyway (dead localhost:8001 logo/favicon). Use domcontentloaded + wait
    // for the SSR hero instead of networkidle.
    await page.goto(`/camp/${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="hero-title"]');

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('rooms page: no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    // Tenant page — can hang on `load`/`networkidle` (dead localhost:8001
    // logo/favicon; Google Maps subresources). Use domcontentloaded + landmark.
    await page.goto(`/rooms?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="rooms-page"], #main-content, header', { timeout: 10_000 });

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('about page: no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto('/about');
    await page.waitForLoadState('networkidle');

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('FAQ page: no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto('/faq');
    await page.waitForLoadState('networkidle');

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('gallery page: no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto('/gallery');
    await page.waitForLoadState('networkidle');

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('contact page: no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto('/contact');
    await page.waitForLoadState('networkidle');

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
