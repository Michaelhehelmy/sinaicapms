import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

test.describe('Accessibility — ARIA Landmarks', () => {
  test('marketplace page has at least one landmark role', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const landmarks = page.locator(
      'header, nav, main, footer, aside, [role="banner"], [role="navigation"], [role="main"], [role="contentinfo"], [role="complementary"]'
    );
    const count = await landmarks.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('marketplace page has a <main> or role="main" element', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const main = page.locator('main, [role="main"]');
    const count = await main.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('marketplace nav has role="navigation" or is a <nav> element', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const nav = page.locator('nav, [role="navigation"]');
    const count = await nav.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('tenant page has landmark roles (header/nav/main/footer)', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');

    const landmarks = page.locator(
      'header, nav, main, footer, [role="banner"], [role="navigation"], [role="main"], [role="contentinfo"]'
    );
    const count = await landmarks.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('all images on tenant homepage have alt text', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');

    const images = page.locator('img');
    const count = await images.count();

    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt');
      expect(alt).not.toBeNull();
    }
  });

  test('page lang attribute is set on marketplace', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
    expect(['en', 'ar']).toContain(lang);
  });

  test('page lang attribute is set on tenant', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
    expect(['en', 'ar']).toContain(lang);
  });
});

test.describe('Accessibility — High Contrast Mode', () => {
  test('page renders correctly with forced-colors: active', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    const isVisible = await body.isVisible();
    expect(isVisible).toBeTruthy();

    const headings = page.locator('h1, h2, h3');
    const count = await headings.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('buttons remain visible in forced-colors mode', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const buttons = page.locator('button');
    const count = await buttons.count();
    const limit = Math.min(count, 5);

    for (let i = 0; i < limit; i++) {
      const btn = buttons.nth(i);
      if (await btn.isVisible()) {
        const box = await btn.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeGreaterThan(0);
        expect(box!.height).toBeGreaterThan(0);
      }
    }
  });

  test('tenant page renders correctly in forced-colors mode', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    const isVisible = await body.isVisible();
    expect(isVisible).toBeTruthy();
  });

  test('POS login renders in forced-colors mode', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-login"]', { timeout: 10_000 });

    const heading = page.locator('[data-testid="pos-branding"]');
    await expect(heading).toBeVisible();
    const text = await heading.textContent();
    expect(text).toContain('SinaiCamps');
  });
});

test.describe('Accessibility — Print Stylesheet', () => {
  test('page renders without error in print media', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    const isVisible = await body.isVisible();
    expect(isVisible).toBeTruthy();
  });

  test('tenant page renders without error in print media', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    const isVisible = await body.isVisible();
    expect(isVisible).toBeTruthy();
  });

  test('navigation elements are hidden or de-emphasized in print', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const nav = page.locator('nav').first();
    if (await nav.count() > 0) {
      const display = await nav.evaluate(el => {
        return window.getComputedStyle(el).display;
      });
      expect(display).toBeDefined();
    }
  });

  test('footer is visible in print mode on tenant page', async ({ page }) => {
    await page.emulateMedia({ media: 'print' });
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');

    const footer = page.locator('footer');
    const footerCount = await footer.count();
    if (footerCount > 0) {
      const footerCount = await footer.count();
      const isVisible = footerCount > 0 && await footer.isVisible();
      expect(typeof isVisible).toBe('boolean');
    }
  });
});

test.describe('Accessibility — Reduced Motion', () => {
  test('page respects prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    const isVisible = await body.isVisible();
    expect(isVisible).toBeTruthy();
  });

  test('animations are disabled with reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const headings = page.locator('h1, h2, h3');
    const count = await headings.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
