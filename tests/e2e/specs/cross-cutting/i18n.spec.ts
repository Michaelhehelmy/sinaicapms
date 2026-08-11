import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

test.describe('Internationalization (i18n)', () => {
  test.describe('English Language (Default)', () => {
    test('marketplace loads in English by default', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const dir = await page.locator('html').getAttribute('dir');
      expect(dir).toBe('ltr');
    });

    test('lang attribute defaults to "en"', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang).toBe('en');
    });

    test('English headings use LTR direction', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
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

  test.describe('Page Load (English)', () => {
    test('marketplace loads with content', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('camp detail page loads with content', async ({ page }) => {
      await page.goto(`/camp/${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('about page loads with content', async ({ page }) => {
      await page.goto('/about', { waitUntil: 'domcontentloaded' });
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('faq page loads with content', async ({ page }) => {
      await page.goto('/faq', { waitUntil: 'domcontentloaded' });
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('gallery page loads with content', async ({ page }) => {
      await page.goto('/gallery', { waitUntil: 'domcontentloaded' });
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('contact page loads with content', async ({ page }) => {
      await page.goto('/contact', { waitUntil: 'domcontentloaded' });
      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    });

    test('page content is consistent across reloads', async ({ page }) => {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      const first = await page.locator('body').textContent() ?? '';
      await page.reload({ waitUntil: 'domcontentloaded' });
      const second = await page.locator('body').textContent() ?? '';
      expect(first).toBe(second);
    });
  });
});
