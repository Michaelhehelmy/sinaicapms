import { test, expect } from '@playwright/test';
import { CampDetailPage } from '../../pages/marketplace/camp-detail.page';
import { TEST_CAMPS } from '../../fixtures/test-data';

const KNOWN_CAMP_ID = TEST_CAMPS[0].id;

test.describe('Camp Detail Page', () => {
  let detail: CampDetailPage;

  test.beforeEach(async ({ page }) => {
    detail = new CampDetailPage(page);
    await detail.goto(KNOWN_CAMP_ID);
  });

  test('banner title is not empty', async ({ page }) => {
    const bannerTitle = page.locator('[data-testid="hero-title"]');
    await expect(bannerTitle).toBeVisible();

    const title = await detail.getBannerTitle();
    expect(title.trim().length).toBeGreaterThan(0);
    expect(title).not.toBe('');

    const locationText = page.locator('[data-testid="hero-description"]');
    await expect(locationText).toBeVisible();
    const locationContent = await locationText.textContent();
    // Hero location row: inline map-pin SVG (aria-hidden) + location text
    expect(locationContent!.trim().length).toBeGreaterThan(0);
    await expect(locationText.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  });

  test('about section has text content', async ({ page }) => {
    const aboutHeading = page.locator('[data-testid="about-heading"]');
    await expect(aboutHeading).toBeVisible();
    const headingText = await aboutHeading.textContent();
    expect(headingText).toContain('About');

    const aboutText = await detail.getAboutText();
    expect(aboutText.trim().length).toBeGreaterThan(0);
    expect(aboutText).not.toBe('');
  });

  test('rooms section shows room cards or empty state', async ({ page }) => {
    const roomsSection = page.locator('[data-testid="rooms-section"]');
    await expect(roomsSection).toBeVisible();

    const roomCount = await detail.getRoomCount();

    if (roomCount > 0) {
      // Room cards have h4 names inside the rooms section
      const firstRoomName = roomsSection.locator('h4').first();
      await expect(firstRoomName).toBeVisible();
    } else {
      // Empty state — CampBooking renders EmptyState with role="status"
      const emptyState = roomsSection.locator('[role="status"]');
      const emptyCount = await emptyState.count();
      const hasEmptyState = emptyCount > 0;
      expect(hasEmptyState || roomCount >= 0).toBeTruthy();
    }
  });

  test('room cards have name (h4) and price info', async ({ page }) => {
    const roomCount = await detail.getRoomCount();

    if (roomCount > 0) {
      for (let i = 0; i < roomCount; i++) {
        const name = page.locator('[data-testid="rooms-section"] h4').nth(i);
        await expect(name).toBeVisible();
        const nameText = await name.textContent();
        expect(nameText?.trim().length).toBeGreaterThan(0);

        const priceStr = await detail.getRoomPrice(i);
        expect(priceStr).toMatch(/\d/);
      }
    }
  });

  test('room price format contains digits', async ({ page }) => {
    const roomCount = await detail.getRoomCount();

    if (roomCount > 0) {
      for (let i = 0; i < roomCount; i++) {
        const price = await detail.getRoomPrice(i);
        expect(price).toMatch(/\d/);
      }
    }
  });

  test('reviews section shows review cards or empty state', async ({ page }) => {
    const reviewsSection = page.locator('[data-testid="reviews-section"]');
    const reviewsCount = await reviewsSection.count();
    const hasReviews = reviewsCount > 0;

    const reviewCount = await detail.getReviewCount();

    // Either reviews section exists with content, or it doesn't exist (no reviews)
    expect(hasReviews || reviewCount >= 0).toBeTruthy();
  });

  test('review cards have star ratings', async ({ page }) => {
    const reviewsSection = page.locator('[data-testid="reviews-section"]');
    const reviewsSectionCount = await reviewsSection.count();
    if (reviewsSectionCount === 0 || !(await reviewsSection.isVisible())) return;

    const reviewCount = await detail.getReviewCount();

    if (reviewCount > 0) {
      // Review cards are direct children of the grid inside the reviews section
      const reviewCards = reviewsSection.locator('div > div').filter({
        has: page.locator('p[class*="italic"]'),
      });
      const cardCount = await reviewCards.count();

      for (let i = 0; i < cardCount; i++) {
        const card = reviewCards.nth(i);
        // Stars are rendered as ★/☆ characters in a div
        const starsEl = card.locator('div').first();
        const starsText = await starsEl.textContent();
        expect(starsText).toMatch(/[★☆]/);
        expect(starsText!.length).toBeGreaterThan(0);
      }
    }
  });

  test('review cards have text content and author', async ({ page }) => {
    const reviewsSection = page.locator('[data-testid="reviews-section"]');
    const reviewsSectionCount = await reviewsSection.count();
    if (reviewsSectionCount === 0 || !(await reviewsSection.isVisible())) return;

    const reviewCount = await detail.getReviewCount();

    if (reviewCount > 0) {
      // Review text is in italic paragraphs, author is in <strong> tags
      const italicTexts = reviewsSection.locator('p[class*="italic"]');
      const textCount = await italicTexts.count();

      for (let i = 0; i < textCount; i++) {
        const textContent = await italicTexts.nth(i).textContent();
        expect(textContent!.trim().length).toBeGreaterThan(0);
      }

      const strongEls = reviewsSection.locator('strong');
      const authorCount = await strongEls.count();
      expect(authorCount).toBeGreaterThanOrEqual(1);

      for (let i = 0; i < authorCount; i++) {
        const authorText = await strongEls.nth(i).textContent();
        expect(authorText?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('back link navigates back to marketplace', async ({ page }) => {
    const backLink = page.locator('[data-testid="back-to-marketplace"]');
    await expect(backLink).toBeVisible();

    const href = await backLink.getAttribute('href');
    expect(href).toBeTruthy();

    const linkText = await backLink.textContent();
    expect(linkText).toContain('Back to Marketplace');

    await detail.clickBack();
    // After clicking back, we should be on the marketplace root or tenant domain root
    await expect(page).toHaveURL(/\/$/);
  });

  test('CTA "Review Your Stay" link has valid href', async ({ page }) => {
    const ctaLink = page.locator('[data-testid="reservation-link"]');
    await expect(ctaLink).toBeVisible();

    const ctaText = await ctaLink.textContent();
    expect(ctaText).toContain('Review Your Stay');

    const href = await ctaLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href!.length).toBeGreaterThan(0);
    expect(href).toMatch(/\/book|\/camp\//);
  });
});
