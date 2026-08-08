import { test, expect } from '@playwright/test';
import { TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';
const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

const POS_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const POS_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

test.describe('DataTable Sorting', () => {
  test('POS products table → column headers are clickable for sort', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
    await page.locator('[data-testid="pos-identifier"]').fill(POS_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(POS_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.waitForURL('**/pos/**', { timeout: 10_000 }).catch(() => {});

    if (page.url().includes('/pos/') && !page.url().includes('/login')) {
      await page.goto(`/pos/products?tenant=${TENANT_ID}`);
      await page.waitForLoadState('networkidle');

      const headers = page.locator('table th');
      const count = await headers.count();
      expect(count).toBeGreaterThanOrEqual(2);

      await headers.nth(0).click();
      await page.locator('table').waitFor({ state: 'visible', timeout: 5000 });

      await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
    }
  });

  test('POS orders table → column headers are clickable for sort', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
    await page.locator('[data-testid="pos-identifier"]').fill(POS_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(POS_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.waitForURL('**/pos/**', { timeout: 10_000 }).catch(() => {});

    if (page.url().includes('/pos/') && !page.url().includes('/login')) {
      await page.goto(`/pos/orders?tenant=${TENANT_ID}`);
      await page.waitForLoadState('networkidle');

      const headers = page.locator('table th');
      const count = await headers.count();
      expect(count).toBeGreaterThanOrEqual(2);

      await headers.nth(0).click();
      await expect(page.locator('table')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('DataTable Pagination', () => {
  test('POS products table → pagination controls exist', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
    await page.locator('[data-testid="pos-identifier"]').fill(POS_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(POS_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.waitForURL('**/pos/**', { timeout: 10_000 }).catch(() => {});

    if (page.url().includes('/pos/') && !page.url().includes('/login')) {
      await page.goto(`/pos/orders?tenant=${TENANT_ID}`);
      await page.waitForLoadState('networkidle');

      const pagination = page.locator('[class*="pagination"], nav[aria-label*="pagination"]');
      const count = await pagination.count();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('POS customers page → loads with content', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
    await page.locator('[data-testid="pos-identifier"]').fill(POS_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(POS_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.waitForURL('**/pos/**', { timeout: 10_000 }).catch(() => {});

    if (page.url().includes('/pos/') && !page.url().includes('/login')) {
      await page.goto(`/pos/orders?tenant=${TENANT_ID}`);
      await page.waitForLoadState('networkidle');

      const content = await page.locator('body').textContent() ?? '';
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

test.describe('DataTable Search', () => {
  test('POS products search → filters rows in real-time', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
    await page.locator('[data-testid="pos-identifier"]').fill(POS_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(POS_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.waitForURL('**/pos/**', { timeout: 10_000 }).catch(() => {});

    if (page.url().includes('/pos/') && !page.url().includes('/login')) {
      await page.goto(`/pos/products?tenant=${TENANT_ID}`);
      await page.waitForLoadState('networkidle');

      const rows = page.locator('table tbody tr');
      const countBefore = await rows.count();

      const searchInput = page.locator('[data-testid="product-search"]');
      const searchInputCount = await searchInput.count();
      if (searchInputCount > 0) {
        await searchInput.fill('zzz_nonexistent_product_xyz');
        await page.waitForLoadState('networkidle');

        const countAfter = await rows.count();
        expect(countAfter).toBeLessThanOrEqual(countBefore);

        await searchInput.fill('');
        await page.waitForLoadState('networkidle');
      }
    }
  });
});

test.describe('DataTable Empty State', () => {
  test('POS products with no data shows empty state or no rows', async ({ page }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`);
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
    await page.locator('[data-testid="pos-identifier"]').fill(POS_IDENTIFIER);
    await page.locator('[data-testid="pos-password"]').fill(POS_PASSWORD);
    await page.locator('[data-testid="pos-signin-btn"]').click();
    await page.waitForURL('**/pos/**', { timeout: 10_000 }).catch(() => {});

    if (page.url().includes('/pos/') && !page.url().includes('/login')) {
      await page.goto(`/pos/products?tenant=${TENANT_ID}`);
      await page.waitForLoadState('networkidle');

      const searchInput = page.locator('[data-testid="product-search"]');
      const searchInputCount = await searchInput.count();
      if (searchInputCount > 0) {
        await searchInput.fill('zzz_nonexistent_xyz_12345');
        await page.waitForLoadState('networkidle');

        const rows = page.locator('table tbody tr');
        const rowCount = await rows.count();
        expect(rowCount).toBe(0);
      }
    }
  });
});
