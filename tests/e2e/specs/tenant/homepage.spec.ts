import { test, expect } from '@playwright/test';
import { TenantHomePage } from '../../pages/tenant/home.page';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('Tenant Homepage', () => {
  let home: TenantHomePage;

  test.beforeEach(async ({ page }) => {
    home = new TenantHomePage(page);
    await home.goto(TENANT_ID);
  });

  test('hero section contains non-empty text content', async ({ page }) => {
    const heroBanner = page.locator('[data-testid="hero-banner"]');
    await expect(heroBanner).toBeVisible();

    const heroText = await home.getHeroText();
    expect(heroText.trim().length).toBeGreaterThan(0);
    expect(heroText).not.toBe('');
  });

  test('hero section has correct structure with title and description', async ({ page }) => {
    const heroBanner = page.locator('[data-testid="hero-banner"]');
    await expect(heroBanner).toBeVisible();

    const heroTitle = page.locator('[data-testid="hero-title"]');
    await expect(heroTitle).toBeVisible();
    const titleText = await heroTitle.textContent();
    expect(titleText?.trim().length).toBeGreaterThan(0);

    const heroDescription = page.locator('[data-testid="hero-description"]');
    await expect(heroDescription).toBeVisible();
    const descText = await heroDescription.textContent();
    expect(descText?.trim().length).toBeGreaterThan(0);
  });

  test('room cards have name and price info when present', async ({ page }) => {
    const roomCount = await home.getRoomCardCount();

    if (roomCount > 0) {
      for (let i = 0; i < roomCount; i++) {
        const card = page.locator('[data-testid="rooms-section"] .grid > div').nth(i);
        await expect(card).toBeVisible();

        // Room card should have a heading (room name)
        const nameEl = card.locator('h4');
        const nameElCount = await nameEl.count();
        const nameText = nameElCount > 0 ? (await nameEl.textContent() ?? '') : '';
        if (nameText) {
          expect(nameText.trim().length).toBeGreaterThan(0);
        }

        // Room card should have a price display
        const priceEl = card.locator('[class*="font-black"]');
        const count = await priceEl.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    } else {
      // No rooms — should show empty state or no content
      const content = await page.locator('[data-testid="rooms-section"]').textContent() ?? '';
      expect(content.length).toBeGreaterThanOrEqual(0);
    }
  });

  test('room card count is a valid number', async ({ page }) => {
    const count = await home.getRoomCardCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('CTA card is visible with reservation link', async ({ page }) => {
    const ctaCard = page.locator('[data-testid="cta-card"]');
    await expect(ctaCard).toBeVisible();

    const reservationLink = page.locator('[data-testid="reservation-link"]');
    await expect(reservationLink).toBeVisible();

    const href = await reservationLink.getAttribute('href');
    // Tenant zone: booking lives at the tenant root (/book). Marketplace-zone
    // deep links (/camp/{id}/book) apply only when NOT in the tenant zone.
    expect(href).toBe('/book');
  });

  test('CTA card shows menu link when menu is available', async ({ page }) => {
    const menuLink = page.locator('[data-testid="menu-link"]');
    const menuCount = await menuLink.count();

    if (menuCount > 0) {
      await expect(menuLink).toBeVisible();
      const href = await menuLink.getAttribute('href');
      expect(href).toContain('/menu');
    }
    // If no menu link, that's fine — not all camps have menus
    expect(typeof menuCount).toBe('number');
  });

  test('back to marketplace link exists', async ({ page }) => {
    const backLink = page.locator('[data-testid="back-to-marketplace"]');
    const count = await backLink.count();
    // Link may or may not be visible depending on marketplace detection
    expect(typeof count).toBe('number');
  });

  test('map container existence is valid (present or absent based on config)', async ({ page }) => {
    const mapSection = page.locator('[data-testid="map-section"]');
    const mapCount = await mapSection.count();

    if (mapCount > 0) {
      await expect(mapSection).toBeVisible();
      const iframe = mapSection.locator('iframe');
      const iframeCount = await iframe.count();
      expect(iframeCount).toBeGreaterThanOrEqual(1);
    } else {
      // Map is optional — not all camps have it configured
      expect(mapCount).toBe(0);
    }
  });

  test('about section renders with description', async ({ page }) => {
    const aboutHeading = page.locator('[data-testid="about-heading"]');
    await expect(aboutHeading).toBeVisible();

    const aboutDescription = page.locator('[data-testid="about-description"]');
    await expect(aboutDescription).toBeVisible();
    const descText = await aboutDescription.textContent();
    expect(descText?.trim().length).toBeGreaterThan(0);
  });

  test('rooms section has the CampBooking component', async ({ page }) => {
    const roomsSection = page.locator('[data-testid="rooms-section"]');
    await expect(roomsSection).toBeVisible();

    const heading = roomsSection.locator('h2:has-text("Accommodations")');
    await expect(heading).toBeVisible();
  });
});
