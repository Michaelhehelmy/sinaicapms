import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('Tenant Camp Detail Page', () => {
  test('camp detail page loads with content', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');
    const content = (await page.textContent('body')) ?? '';
    expect(content.length).toBeGreaterThan(0);
  });

  test('camp detail shows hero banner', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');
    const heroBanner = page.locator('[data-testid="hero-banner"]');
    const count = await heroBanner.count();
    expect(count).toBe(1);
    await expect(heroBanner).toBeVisible();
  });

  test('camp detail shows about section or empty state', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');
    const aboutHeading = page.locator('[data-testid="about-heading"]');
    const count = await aboutHeading.count();
    expect(count).toBe(1);
    await expect(aboutHeading).toBeVisible();
  });

  test('camp detail has rooms section', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');
    const roomsSection = page.locator('[data-testid="rooms-section"]');
    const count = await roomsSection.count();
    expect(count).toBe(1);
  });

  test('camp detail has CTA card with reservation link', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`);
    await page.waitForLoadState('networkidle');
    const ctaCard = page.locator('[data-testid="cta-card"]');
    await expect(ctaCard).toBeVisible();
    const reservationLink = page.locator('[data-testid="reservation-link"]');
    await expect(reservationLink).toBeVisible();
    const href = await reservationLink.getAttribute('href');
    expect(href).toContain('/camp/');
  });
});
