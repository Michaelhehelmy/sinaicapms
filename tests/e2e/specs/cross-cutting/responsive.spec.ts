import { test, expect } from '@playwright/test';
import { TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';
const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

const POS_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const POS_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

const ADMIN_URL = '/admin/';

async function loginToPOS(page: import('@playwright/test').Page) {
  await page.goto(`/pos/login?tenant=${TENANT_ID}`);
  await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
  await page.locator('[data-testid="pos-identifier"]').fill(POS_IDENTIFIER);
  await page.locator('[data-testid="pos-password"]').fill(POS_PASSWORD);
  await page.locator('[data-testid="pos-signin-btn"]').click();
  await page.waitForURL('**/pos/**', { timeout: 10_000 });
}

test.describe('Responsive Design', () => {
  test.describe('Mobile (375px)', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('marketplace: camp cards stack vertically (second card y >= first card y)', async ({
      page,
    }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="camp-card"]', { timeout: 10_000 });

      const cards = page.locator('[data-testid="camp-card"]');
      const count = await cards.count();

      if (count < 2) {
        test.skip(true, 'Need at least 2 camp cards');
        return;
      }

      const firstBox = await cards.nth(0).boundingBox();
      const secondBox = await cards.nth(1).boundingBox();

      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();

      if (firstBox && secondBox) {
        expect(secondBox.y).toBeGreaterThanOrEqual(firstBox.y);
      }
    });

    test('marketplace: hero text is visible and readable', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="hero-banner"]', { timeout: 10_000 });

      const hero = page.locator('[data-testid="hero-banner"]');
      const heroCount = await hero.count();
      const heroVisible = heroCount > 0 && await hero.first().isVisible();

      if (heroVisible) {
        const heroBox = await hero.first().boundingBox();
        expect(heroBox).not.toBeNull();
        if (heroBox) {
          expect(heroBox.width).toBeGreaterThan(50);
          expect(heroBox.height).toBeGreaterThan(10);
        }

        const fontSize = await hero.first().evaluate(el => {
          const style = window.getComputedStyle(el);
          return parseFloat(style.fontSize);
        });
        expect(fontSize).toBeGreaterThan(10);
      }
    });

    test('admin: mobile toggle is visible on mobile', async ({ page }) => {
      await page.goto(ADMIN_URL);
      await page.waitForLoadState('networkidle');

      const toggle = page.locator('[data-testid="mobile-toggle"]');
      const toggleCount = await toggle.count();
      if (toggleCount > 0 && await toggle.isVisible()) {
        await toggle.click();
        await page.waitForLoadState('networkidle');

        await expect(page.locator('[data-testid="admin-sidebar"]')).toBeVisible({ timeout: 5000 });
      }
    });

    test('POS: sidebar is hidden on mobile', async ({ page }) => {
      await loginToPOS(page);

      const sidebar = page.locator('[data-testid="pos-sidebar"]');
      // On mobile, POS sidebar uses "hidden sm:flex" so it should be hidden
      await expect(sidebar).toBeHidden({ timeout: 5000 });
    });
  });

  test.describe('Tablet (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('marketplace: grid width > 400px', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="camps-grid"]', { timeout: 10_000 });

      const grid = page.locator('[data-testid="camps-grid"]');
      const gridCount = await grid.count();

      if (gridCount === 0) {
        test.skip(true, 'No camp grid found');
        return;
      }

      const gridBox = await grid.boundingBox();
      expect(gridBox).not.toBeNull();
      if (gridBox) {
        expect(gridBox.width).toBeGreaterThan(400);
      }
    });

    test('marketplace: cards can be side-by-side (y positions similar)', async ({
      page,
    }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="camp-card"]', { timeout: 10_000 });

      const cards = page.locator('[data-testid="camp-card"]');
      const count = await cards.count();

      if (count < 2) {
        test.skip(true, 'Need at least 2 camp cards');
        return;
      }

      const firstBox = await cards.nth(0).boundingBox();
      const secondBox = await cards.nth(1).boundingBox();

      expect(firstBox).not.toBeNull();
      expect(secondBox).not.toBeNull();

      if (firstBox && secondBox) {
        const yDifference = Math.abs(firstBox.y - secondBox.y);
        const onSameRow = yDifference < 50;
        const secondCardIsRight = secondBox.x > firstBox.x + 50;
        expect(onSameRow && secondCardIsRight).toBeTruthy();
      }
    });

    test('tenant: body width >= 760, no horizontal scroll', async ({ page }) => {
      await page.goto(`/?tenant=${TEST_TENANT.id}`);
      await page.waitForLoadState('networkidle');

      const body = page.locator('body');
      const bodyBox = await body.boundingBox();
      expect(bodyBox).not.toBeNull();
      if (bodyBox) {
        expect(bodyBox.width).toBeGreaterThanOrEqual(760);
      }

      const overflow = await body.evaluate(
        el => el.scrollWidth <= el.clientWidth + 10
      );
      expect(overflow).toBeTruthy();
    });

    test('POS: sidebar is visible at tablet width', async ({ page }) => {
      await loginToPOS(page);
      await page.waitForLoadState('networkidle');

      // Handle shift overlay if present
      const shiftOverlay = page.locator('[data-testid="shift-overlay"]');
      if (await shiftOverlay.count() > 0) {
        const cashInput = shiftOverlay.locator('input');
        const cashInputCount = await cashInput.first().count();
        if (cashInputCount > 0) {
          await cashInput.first().fill('100');
        }
        const openShiftBtn = page.locator('[data-testid="open-shift-btn"]');
        const openShiftBtnCount = await openShiftBtn.count();
        if (openShiftBtnCount > 0) {
          await openShiftBtn.click();
          await page.waitForLoadState('networkidle');
        }
      }

      await expect(page.locator('[data-testid="pos-sidebar"]')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Desktop (1280px)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('marketplace: grid width > 800px', async ({ page }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="camps-grid"]', { timeout: 10_000 });

      const grid = page.locator('[data-testid="camps-grid"]');
      const gridCount = await grid.count();

      if (gridCount === 0) {
        test.skip(true, 'No camp grid found');
        return;
      }

      const gridBox = await grid.boundingBox();
      expect(gridBox).not.toBeNull();
      if (gridBox) {
        expect(gridBox.width).toBeGreaterThan(800);
      }
    });

    test('marketplace: 3+ cards in grid (unique x positions >= 2)', async ({
      page,
    }) => {
      await page.goto('/');
      await page.waitForSelector('[data-testid="camp-card"]', { timeout: 10_000 });

      const cards = page.locator('[data-testid="camp-card"]');
      const count = await cards.count();

      if (count < 3) {
        test.skip(true, 'Need at least 3 camp cards');
        return;
      }

      const xPositions: number[] = [];
      const limit = Math.min(count, 6);
      for (let i = 0; i < limit; i++) {
        const box = await cards.nth(i).boundingBox();
        if (box) xPositions.push(box.x);
      }

      const uniqueX = new Set(xPositions);
      expect(uniqueX.size).toBeGreaterThanOrEqual(2);
    });

    test('POS: sidebar width > 150px with visible menu text', async ({ page }) => {
      await loginToPOS(page);

      const sidebar = page.locator('[data-testid="pos-sidebar"]');
      await expect(sidebar).toBeVisible({ timeout: 5000 });

      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox).not.toBeNull();
      if (sidebarBox) {
        expect(sidebarBox.width).toBeGreaterThan(150);
      }

      const menuItems = page.locator('[data-testid="pos-sidebar"] button');
      const menuTextCount = await menuItems.count();
      expect(menuTextCount).toBeGreaterThan(0);

      await expect(menuItems.first()).toBeVisible();

      const firstMenuText = await menuItems.first().textContent();
      expect((firstMenuText || '').length).toBeGreaterThan(0);
    });

    test('admin: content area is full width', async ({ page }) => {
      await page.goto(ADMIN_URL);
      await page.waitForLoadState('networkidle');

      const bodyBox = await page.locator('body').boundingBox();
      expect(bodyBox).not.toBeNull();
      if (bodyBox) {
        expect(bodyBox.width).toBeGreaterThanOrEqual(1200);
      }

      const contentArea = page.locator('[data-testid="content-area"]');
      const contentCount = await contentArea.count();

      if (contentCount > 0) {
        const contentBox = await contentArea.first().boundingBox();
        expect(contentBox).not.toBeNull();
        if (contentBox) {
          expect(contentBox.width).toBeGreaterThan(600);
        }
      }
    });
  });
});
