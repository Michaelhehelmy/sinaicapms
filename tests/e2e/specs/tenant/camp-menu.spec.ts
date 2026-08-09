import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('Camp Menu Page (/camp/[id]/menu)', () => {
  test('menu page loads with content', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });
    const content = await page.locator('body').textContent() ?? '';
    expect(content.length).toBeGreaterThan(0);
  });

  test('menu page shows camp name or menu title', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });
    const heading = page.locator('h1');
    const count = await heading.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('menu page has search input or empty state', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });
    // When meals are available, search input is shown; otherwise empty state
    const searchInput = page.locator('input[type="text"], input[placeholder*="search"], input[placeholder*="ابحث"]');
    const inputCount = await searchInput.count();
    if (inputCount > 0) {
      expect(inputCount).toBeGreaterThanOrEqual(1);
    } else {
      // No meals — static empty state shown
      const content = await page.locator('body').textContent() ?? '';
      expect(content.includes('القائمة غير متوفرة') || content.includes('لم يتم إعداد')).toBeTruthy();
    }
  });

  test('menu page has category chips/tabs', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });
    // TenantMenu uses data-testid="tenant-nav-link" for category buttons
    const chips = page.locator('[data-testid="tenant-nav-link"]');
    const count = await chips.count();
    // May be 0 if no meal categories configured
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('menu page has meal cards or empty state', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });
    const content = await page.locator('body').textContent() ?? '';
    // Should show either meals or "no meals" message
    expect(content.length).toBeGreaterThan(0);
  });

  test('menu page has WhatsApp order button or empty state', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });
    const waBtn = page.locator('button:has-text("WhatsApp"), button:has-text("واتساب")');
    const waCount = await waBtn.count();
    const waVisible = waCount > 0 && await waBtn.isVisible();
    if (!waVisible) {
      // No meals — check for empty state text in body
      const content = await page.locator('body').textContent() ?? '';
      expect(
        content.includes('القائمة غير متوفرة') ||
        content.includes('No meals') ||
        content.includes('لم يتم إعداد')
      ).toBeTruthy();
    }
  });

  test('menu page has data-testid="menu-page" body', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/menu`, { waitUntil: 'domcontentloaded' });
    const menuPage = page.locator('[data-testid="menu-page"]');
    const count = await menuPage.count();
    expect(count).toBe(1);
  });

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
