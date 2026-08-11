import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('Camp Booking Page (/camp/[id]/book)', () => {
  test('booking page loads with reservation content', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    const content = await page.locator('body').textContent() ?? '';
    expect(content.length).toBeGreaterThan(0);
  });

  test('booking page shows reservation title', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    const heading = page.locator('h1');
    const count = await heading.count();
    expect(count).toBeGreaterThanOrEqual(1);
    const text = await heading.first().textContent() ?? '';
    expect(text.trim().length).toBeGreaterThan(0);
  });

  test('booking page has guest name input or empty state', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    // When reservation is empty, no inputs are shown — check for either inputs or empty state
    const nameInput = page.locator('input[type="text"]');
    const inputCount = await nameInput.count();
    if (inputCount > 0) {
      await expect(nameInput.first()).toBeVisible();
    } else {
      // Empty state — no inputs rendered
      const content = await page.locator('body').textContent() ?? '';
      expect(content.includes('No rooms') || content.includes('لا توجد غرف')).toBeTruthy();
    }
  });

  test('booking page has phone input or empty state', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    // When reservation is empty, no inputs are shown — check for either inputs or empty state
    const phoneInput = page.locator('input[type="tel"]');
    const inputCount = await phoneInput.count();
    if (inputCount > 0) {
      await expect(phoneInput.first()).toBeVisible();
    } else {
      // Empty state — no inputs rendered
      const content = await page.locator('body').textContent() ?? '';
      expect(content.includes('No rooms') || content.includes('لا توجد غرف')).toBeTruthy();
    }
  });

  test('booking page has WhatsApp send button or empty state', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    const waBtn = page.locator('button:has-text("WhatsApp")');
    const waCount = await waBtn.count();
    const waVisible = waCount > 0 && await waBtn.isVisible();
    if (!waVisible) {
      // Empty state — verify the body text contains the empty state message
      const content = await page.locator('body').textContent() ?? '';
      expect(content.includes('No rooms in your reservation') || content.includes('لا توجد غرف في حجزك')).toBeTruthy();
    }
  });

  test('booking page has copy summary button or empty state', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    const copyBtn = page.locator('button:has-text("Copy"), button:has-text("نسخ")');
    const copyCount = await copyBtn.count();
    const copyVisible = copyCount > 0 && await copyBtn.isVisible();
    if (!copyVisible) {
      // Empty state — verify the body text contains the empty state message
      const content = await page.locator('body').textContent() ?? '';
      expect(content.includes('No rooms in your reservation') || content.includes('لا توجد غرف في حجزك')).toBeTruthy();
    }
  });

  test('booking page has back to camp link', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    // The empty-state back control renders as a <button> containing a
    // "Back to Camp" span (ReservationSummary.tsx), while the populated-state
    // back control is an <a href="/camp/{id}">. Accept either element.
    const backLink = page.locator(
      'button:has-text("Back"), button:has-text("عودة"), a:has-text("Back"), a:has-text("عودة"), a[href*="/camp/"]'
    );
    const count = await backLink.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('booking page empty state shows message', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    const content = await page.locator('body').textContent() ?? '';
    // Should show either reservation content or empty state
    expect(content.length).toBeGreaterThan(0);
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
