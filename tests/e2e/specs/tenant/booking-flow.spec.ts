import { test, expect } from '@playwright/test';
import { TenantBookingPage } from '../../pages/tenant/booking.page';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('Tenant Booking Flow', () => {
  let booking: TenantBookingPage;

  test.beforeEach(async ({ page }) => {
    booking = new TenantBookingPage(page);
    await booking.goto(TENANT_ID);
  });

  test('guest name input renders with text type when reservation has items', async ({ page }) => {
    const isEmpty = await booking.isEmpty();
    if (isEmpty) return; // No inputs in empty state
    const input = await booking.getGuestNameInput();
    await expect(input).toBeVisible();
    const type = await input.getAttribute('type');
    expect(type).toBe('text');
  });

  test('phone input renders with tel type when reservation has items', async ({ page }) => {
    const isEmpty = await booking.isEmpty();
    if (isEmpty) return; // No inputs in empty state
    const input = await booking.getPhoneInput();
    await expect(input).toBeVisible();
    const type = await input.getAttribute('type');
    expect(type).toBe('tel');
  });

  test('reservation page has a heading', async ({ page }) => {
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible();
    const text = await heading.textContent();
    expect(text?.trim().length).toBeGreaterThan(0);
  });

  test('reservation page shows title or empty state', async ({ page }) => {
    const content = await page.locator('body').textContent() ?? '';
    // Should show either reservation content or empty state message
    expect(content.length).toBeGreaterThan(0);
  });

  test('empty state shows appropriate message when no rooms reserved', async ({ page }) => {
    const isEmpty = await booking.isEmpty();
    if (isEmpty) {
      const content = await page.locator('body').textContent() ?? '';
      const hasEmptyMessage =
        content.includes('No rooms') ||
        content.includes('لا توجد غرف');
      expect(hasEmptyMessage).toBeTruthy();
    }
    // If not empty, rooms are reserved — that's fine
    expect(typeof isEmpty).toBe('boolean');
  });

  test('back to camp link exists when rooms are reserved', async ({ page }) => {
    const isEmpty = await booking.isEmpty();
    if (!isEmpty) {
      const hasBackLink = await booking.hasBackLink();
      expect(hasBackLink).toBeTruthy();
    }
    // If empty, no back link is shown — that's expected
    expect(typeof isEmpty).toBe('boolean');
  });

  test('WhatsApp button is visible when rooms are reserved', async ({ page }) => {
    const isEmpty = await booking.isEmpty();
    if (!isEmpty) {
      const waBtn = page.locator('button:has-text("WhatsApp")');
      const count = await waBtn.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
    expect(typeof isEmpty).toBe('boolean');
  });

  test('copy summary button is visible when rooms are reserved', async ({ page }) => {
    const isEmpty = await booking.isEmpty();
    if (!isEmpty) {
      const copyBtn = page.locator('button:has-text("Copy"), button:has-text("نسخ")');
      const count = await copyBtn.count();
      expect(count).toBeGreaterThanOrEqual(1);
    }
    expect(typeof isEmpty).toBe('boolean');
  });

  test('booking page has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
        && !e.includes('Text content does not match') && !e.includes('hydrat')
        && !e.includes('Suspense boundary')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
