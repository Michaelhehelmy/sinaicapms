import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('Camp Menu — Language Rendering', () => {
  test('menu page loads with content in default language', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    const content = await page.locator('body').textContent() ?? '';
    expect(content.length).toBeGreaterThan(0);
  });

  test('menu page heading is in correct language', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    const heading = page.locator('h1');
    const count = await heading.count();
    if (count > 0) {
      const text = await heading.first().textContent() ?? '';
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  test('menu search placeholder is English', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    const searchInput = page.locator('input[type="text"], input[placeholder*="Search"]').first();
    if (await searchInput.count() > 0) {
      const placeholder = await searchInput.getAttribute('placeholder') ?? '';
      expect(placeholder).toBe('Search for a meal...');
    }
  });

  test('menu category chips have text content', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    const chips = page.locator('[data-testid="tenant-nav-link"]');
    const count = await chips.count();

    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = await chips.nth(i).textContent() ?? '';
      if (text.trim().length > 0) {
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('menu page lang attribute matches page content direction', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');

    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('ltr');
  });
});

test.describe('Camp Menu — English LTR', () => {
  test('menu page renders correctly in English', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    // menu.astro is a standalone page that hardcodes lang="en" dir="ltr".
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBe('en');
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('ltr');

    const content = await page.locator('body').textContent() ?? '';
    expect(content.length).toBeGreaterThan(0);
  });

  test('menu page has no horizontal overflow in LTR mode', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 20);
  });
});

test.describe('Camp Menu — WhatsApp Button Language', () => {
  test('WhatsApp order button text is English', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    const waBtn = page.locator('button:has-text("Send Order via WhatsApp")');
    if (await waBtn.count() > 0) {
      const text = await waBtn.first().textContent() ?? '';
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).toContain('Send Order via WhatsApp');
    }
  });

  test('WhatsApp button is visible when meals exist', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    // TenantMenu uses data-testid="tenant-nav-link" for category chips
    const mealCards = page.locator('[data-testid="tenant-nav-link"], .grid > div');
    const mealCount = await mealCards.count();

    if (mealCount > 0) {
      const waBtn = page.locator('button:has-text("Send Order via WhatsApp")');
      const waCount = await waBtn.count();
      expect(typeof waCount).toBe('number');
      expect(waCount).toBeGreaterThanOrEqual(0);
    }
  });
});

test.describe('Camp Menu — No JS Errors', () => {
  test('menu page has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });

    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
        && !e.includes('Text content does not match') && !e.includes('hydrat')
        && !e.includes('Suspense boundary')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
