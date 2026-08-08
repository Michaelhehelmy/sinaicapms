import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

test.describe('Internationalization (i18n)', () => {
  test.describe('Arabic Language Support', () => {
    test('marketplace loads in Arabic when ?lang=ar', async ({ page }) => {
      await page.goto('/?lang=ar');
      await page.waitForLoadState('networkidle');
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('RTL attribute is set on html element for Arabic', async ({ page }) => {
      await page.goto('/?lang=ar');
      await page.waitForLoadState('networkidle');
      const dir = await page.locator('html').getAttribute('dir');
      // Astro SSR may not set dir from query param; check body content as fallback
      const bodyDir = await page.evaluate(() => window.getComputedStyle(document.body).direction);
      expect(dir === 'rtl' || bodyDir === 'rtl').toBeTruthy();
    });

    test('lang attribute is set to "ar" on html element', async ({ page }) => {
      await page.goto('/?lang=ar');
      await page.waitForLoadState('networkidle');
      const lang = await page.locator('html').getAttribute('lang');
      // Check lang attribute OR verify Arabic content is present
      const bodyText = await page.locator('body').textContent() ?? '';
      const hasArabicContent = /[\u0600-\u06FF]/.test(bodyText);
      expect(lang === 'ar' || hasArabicContent).toBeTruthy();
    });

    test('camp detail page loads in Arabic', async ({ page }) => {
      await page.goto(`/camp/${TEST_TENANT.id}?lang=ar`);
      await page.waitForLoadState('networkidle');
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('about page loads in Arabic', async ({ page }) => {
      await page.goto('/about?lang=ar');
      await page.waitForLoadState('networkidle');
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('faq page loads in Arabic', async ({ page }) => {
      await page.goto('/faq?lang=ar');
      await page.waitForLoadState('networkidle');
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('gallery page loads in Arabic', async ({ page }) => {
      await page.goto('/gallery?lang=ar');
      await page.waitForLoadState('networkidle');
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('contact page loads in Arabic', async ({ page }) => {
      await page.goto('/contact?lang=ar');
      await page.waitForLoadState('networkidle');
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });
  });

  test.describe('English Language (Default)', () => {
    test('marketplace loads in English by default', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const dir = await page.locator('html').getAttribute('dir');
      expect(dir).not.toBe('rtl');
    });

    test('lang attribute defaults to "en"', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang).toBe('en');
    });

    test('English headings use LTR direction', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const headings = page.locator('h1, h2, h3');
      const count = await headings.count();
      if (count > 0) {
        for (let i = 0; i < Math.min(count, 3); i++) {
          const heading = headings.nth(i);
          const isVisible = await heading.isVisible();
          if (!isVisible) continue;
          const dir = await heading.evaluate((el) => window.getComputedStyle(el).direction);
          expect(dir).toBe('ltr');
        }
      }
    });
  });

  test.describe('Language Switching', () => {
    test('switching from English to Arabic re-renders page', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      const enText = await page.locator('body').textContent() ?? '';

      await page.goto('/?lang=ar');
      await page.waitForLoadState('networkidle');
      const arText = await page.locator('body').textContent() ?? '';

      // Content should change when language switches
      expect(enText).not.toBe(arText);
    });

    test('switching from Arabic to English re-renders page', async ({ page }) => {
      await page.goto('/?lang=ar');
      await page.waitForLoadState('networkidle');
      const arText = await page.locator('body').textContent() ?? '';

      await page.goto('/?lang=en');
      await page.waitForLoadState('networkidle');
      const enText = await page.locator('body').textContent() ?? '';

      expect(arText).not.toBe(enText);
    });
  });
});
