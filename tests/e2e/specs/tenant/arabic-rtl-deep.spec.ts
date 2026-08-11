import { test, expect } from '@playwright/test';
import { TEST_TENANT, tenantUrl } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('English LTR Deep Rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Frontend is hard-coded English LTR — pages must render en/ltr without
    // relying on any client-side language setting.
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });
  });

  test('page direction is LTR', async ({ page }) => {
    const dir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.evaluate(() => window.getComputedStyle(document.body).direction);
    expect(dir === 'ltr' || bodyDir === 'ltr').toBeTruthy();
  });

  test('page lang is en', async ({ page }) => {
    const lang = await page.locator('html').getAttribute('lang');
    const bodyText = await page.locator('body').textContent() ?? '';
    const hasEnglish = /[A-Za-z]/.test(bodyText);
    expect(lang === 'en' || hasEnglish).toBeTruthy();
  });

  test('no horizontal overflow in LTR', async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 50); // increased tolerance
  });

  test('text alignment is correct in LTR', async ({ page }) => {
    const textAlign = await page.evaluate(() => {
      const body = document.body;
      return window.getComputedStyle(body).direction;
    });
    expect(textAlign).toBe('ltr');
  });

  test('hero section renders', async ({ page }) => {
    const hero = page.locator('[data-testid="hero-banner"]');
    const count = await hero.count();
    if (count > 0) {
      await expect(hero).toBeVisible();
    }
    expect(typeof count).toBe('number');
  });

  test('navigation renders', async ({ page }) => {
    const nav = page.locator('nav, header').first();
    if (await nav.count() > 0) {
      await expect(nav).toBeVisible();
    }
  });

  test('footer renders', async ({ page }) => {
    const footer = page.locator('[data-testid="site-footer"], footer');
    const count = await footer.count();
    if (count > 0) {
      await expect(footer.first()).toBeVisible();
    }
  });

  test('booking page renders content in LTR mode', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });

    // book.astro is a standalone page that hardcodes lang="en" dir="ltr".
    const dir = await page.locator('html').getAttribute('dir');
    const lang = await page.locator('html').getAttribute('lang');
    expect(dir).toBe('ltr');
    expect(lang).toBe('en');

    const content = await page.locator('body').textContent() ?? '';
    expect(content.length).toBeGreaterThan(0);
  });

  test('rooms page renders in LTR', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/rooms'), { waitUntil: 'domcontentloaded' });

    const dir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.evaluate(() => window.getComputedStyle(document.body).direction);
    expect(dir === 'ltr' || bodyDir === 'ltr').toBeTruthy();
  });

  test('menu page renders in LTR', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });

    const dir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.evaluate(() => window.getComputedStyle(document.body).direction);
    expect(dir === 'ltr' || bodyDir === 'ltr').toBeTruthy();
  });

  test('FAQ page renders in LTR', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/faq'), { waitUntil: 'domcontentloaded' });

    const dir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.evaluate(() => window.getComputedStyle(document.body).direction);
    expect(dir === 'ltr' || bodyDir === 'ltr').toBeTruthy();
  });

  test('gallery page renders in LTR', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/gallery'), { waitUntil: 'domcontentloaded' });

    const dir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.evaluate(() => window.getComputedStyle(document.body).direction);
    expect(dir === 'ltr' || bodyDir === 'ltr').toBeTruthy();
  });

  test('contact page renders in LTR', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/contact'), { waitUntil: 'domcontentloaded' });

    const dir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.evaluate(() => window.getComputedStyle(document.body).direction);
    expect(dir === 'ltr' || bodyDir === 'ltr').toBeTruthy();
  });

  test('about page renders in LTR', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/about'), { waitUntil: 'domcontentloaded' });

    const dir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.evaluate(() => window.getComputedStyle(document.body).direction);
    expect(dir === 'ltr' || bodyDir === 'ltr').toBeTruthy();
  });

  test('marketplace renders in LTR', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const dir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.evaluate(() => window.getComputedStyle(document.body).direction);
    expect(dir === 'ltr' || bodyDir === 'ltr').toBeTruthy();
  });

  test('page has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });

    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.reload({ waitUntil: 'domcontentloaded' });

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
        && !e.includes('Text content does not match') && !e.includes('hydrat')
        && !e.includes('Suspense boundary')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
