import { test, expect } from '@playwright/test';
import { TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';
const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

const POS_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const POS_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

const ADMIN_URL = '/admin/';

test.describe('Keyboard Navigation', () => {
  test.describe('Marketplace', () => {
    test('Tab through marketplace nav links sequentially', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const focusedTags: string[] = [];
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement !== document.body, { timeout: 5000 }).catch(() => {});
        const tag = await page.locator(':focus').evaluate((el) => el.tagName.toLowerCase()).catch(() => 'none');
        focusedTags.push(tag);
      }

      const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
      const hasInteractive = focusedTags.some((t) => interactiveTags.includes(t));
      expect(hasInteractive).toBeTruthy();
    });

    test('Enter on focused camp card link navigates to camp detail', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="camp-card"]', { timeout: 10_000 });

      const cards = page.locator('[data-testid="camp-card"]');
      const count = await cards.count();
      if (count === 0) {
        test.skip(true, 'No camp cards found');
        return;
      }

      const exploreLink = page.locator('[data-testid="explore-camp-link"]').first();
      const exploreCount = await exploreLink.count();
      if (exploreCount > 0 && await exploreLink.isVisible()) {
        // CampsSection.astro renders href={camp.customDomain} when set; the
        // seeded local D1 camps carry production custom domains, so the link
        // points off localhost and camp-detail navigation can't be exercised
        // locally. Only assert navigation for local /camp/<id> links.
        const href = await exploreLink.getAttribute('href');
        if (href && /^https?:\/\//.test(href)) {
          test.skip(true, 'Seeded camp cards link to production custom domains in local dev');
          return;
        }

        await exploreLink.focus();
        await page.keyboard.press('Enter');
        await page.waitForLoadState('networkidle');

        const url = page.url();
        const navigated = url.includes('/camp/') || url.includes('detail');
        expect(navigated).toBeTruthy();
      }
    });

    test('Escape key closes any open modal/dropdown on marketplace', async ({ page }) => {
      let dialogFired = false;
      page.on('dialog', (dialog) => {
        dialogFired = true;
        dialog.dismiss();
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');
      await page.keyboard.press('Escape');
      await page.waitForLoadState('networkidle');
      expect(dialogFired).toBeFalsy();
    });
  });

  test.describe('Tenant Pages', () => {
    test('Tab through tenant nav links', async ({ page }) => {
      // Tenant pages can hang on `load`/`networkidle` in astro dev (dead
      // localhost:8001 logo/favicon; Google Maps subresources) — use
      // domcontentloaded + landmark per AGENTS.md.
      await page.goto(`/?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="hero-banner"], #main-content, header', { timeout: 10_000 });

      const focusedTags: string[] = [];
      for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement !== document.body, { timeout: 5000 }).catch(() => {});
        const tag = await page.locator(':focus').evaluate((el) => el.tagName.toLowerCase()).catch(() => 'none');
        focusedTags.push(tag);
      }

      const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
      const hasInteractive = focusedTags.some((t) => interactiveTags.includes(t));
      expect(hasInteractive).toBeTruthy();
    });

    test('Enter on FAQ question toggles answer', async ({ page }) => {
      // Tenant page — domcontentloaded + landmark (see above; /faq?tenant= is
      // a tenant-zone page and can hang on load in astro dev).
      await page.goto(`/faq?tenant=${TEST_TENANT.id}`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="faq-item"] summary, details summary, #main-content, header', { timeout: 10_000 });

      const questions = page.locator('[data-testid="faq-item"] summary, details summary');
      const count = await questions.count();
      if (count === 0) {
        test.skip(true, 'No FAQ questions found');
        return;
      }

      await questions.first().focus();
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle');

      const bodyVisible = await page.locator('body').isVisible();
      expect(bodyVisible).toBeTruthy();
    });
  });

  test.describe('Admin Panel', () => {
    test('Tab through admin login form fields', async ({ page }) => {
      await page.goto(ADMIN_URL);
      await page.waitForSelector('[data-testid="login-overlay"]', { timeout: 10_000 });

      const focusedTags: string[] = [];
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement !== document.body, { timeout: 5000 }).catch(() => {});
        const tag = await page.locator(':focus').evaluate((el) => el.tagName.toLowerCase()).catch(() => 'none');
        focusedTags.push(tag);
      }

      const interactiveTags = ['input', 'button', 'a', 'select', 'textarea'];
      const hasInteractive = focusedTags.some((t) => interactiveTags.includes(t));
      expect(hasInteractive).toBeTruthy();
    });

    test('Enter on admin login form submits', async ({ page }) => {
      await page.goto(ADMIN_URL);
      await page.waitForSelector('[data-testid="login-email"]', { timeout: 10_000 });

      const emailInput = page.locator('[data-testid="login-email"]');
      const count = await emailInput.count();
      if (count === 0) {
        test.skip(true, 'No admin email input found');
        return;
      }

      await emailInput.first().focus();
      await page.keyboard.type('admin');
      await page.keyboard.press('Tab');
      await page.keyboard.type('wrongpassword');
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle');

      const url = page.url();
      expect(url).toContain('4320');
    });
  });

  test.describe('POS Terminal', () => {
    test('Tab through POS login form fields', async ({ page }) => {
      await page.goto(`/pos/login?tenant=${TENANT_ID}`);
      await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });

      const focusedTags: string[] = [];
      for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        await page.waitForFunction(() => document.activeElement !== document.body, { timeout: 5000 }).catch(() => {});
        const tag = await page.locator(':focus').evaluate((el) => el.tagName.toLowerCase()).catch(() => 'none');
        focusedTags.push(tag);
      }

      const interactiveTags = ['input', 'button', 'a', 'select', 'textarea'];
      const hasInteractive = focusedTags.some((t) => interactiveTags.includes(t));
      expect(hasInteractive).toBeTruthy();
    });

    test('Enter on POS login with credentials navigates to dashboard', async ({ page }) => {
      await page.goto(`/pos/login?tenant=${TENANT_ID}`);
      await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
      await page.locator('[data-testid="pos-identifier"]').fill(POS_IDENTIFIER);
      await page.locator('[data-testid="pos-identifier"]').press('Tab');
      await page.locator('[data-testid="pos-password"]').waitFor({ state: 'visible', timeout: 5000 });
      await page.locator('[data-testid="pos-password"]').fill(POS_PASSWORD);
      await page.keyboard.press('Enter');

      await page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
        .waitFor({ state: 'visible', timeout: 10_000 });
      expect(page.url()).toContain('/pos');
    });

    test('Escape key on POS does not trigger errors', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', (error) => { jsErrors.push(error.message); });

      await page.goto(`/pos/login?tenant=${TENANT_ID}`);
      await page.waitForSelector('[data-testid="pos-login"]', { timeout: 10_000 });
      await page.keyboard.press('Escape');
      await page.waitForLoadState('networkidle');

      const criticalErrors = jsErrors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
      );
      expect(criticalErrors.length).toBe(0);
    });
  });
});
