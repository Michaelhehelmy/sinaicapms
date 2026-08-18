import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;
const GALLERY_URL = `/gallery?tenant=${TENANT_ID}`;

test.describe('Gallery Page — Hero', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GALLERY_URL, { waitUntil: 'domcontentloaded' });
  });

  test('hero banner is visible with photo gallery title', async ({ page }) => {
    const heroBanner = page.locator('[data-testid="hero-banner"]');
    await expect(heroBanner).toBeVisible();

    const heroTitle = page.locator('[data-testid="hero-title"]');
    await expect(heroTitle).toBeVisible();
    await expect(heroTitle).toHaveText('Photo Gallery');
  });

  test('hero description mentions campsite/scenery', async ({ page }) => {
    const heroDescription = page.locator('[data-testid="hero-description"]');
    await expect(heroDescription).toBeVisible();

    const text = (await heroDescription.textContent()) ?? '';
    expect(text.toLowerCase()).toMatch(/camp|scenery|lodge/);
  });

  test('view accommodations link is visible', async ({ page }) => {
    const accommodationsLink = page.locator('a:has-text("View Accommodations")');
    await expect(accommodationsLink).toBeVisible();

    const href = await accommodationsLink.getAttribute('href');
    expect(href).toBeTruthy();
  });
});

test.describe('Gallery Page — Gallery Grid', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GALLERY_URL, { waitUntil: 'domcontentloaded' });
  });

  test('gallery grid is visible when images exist', async ({ page }) => {
    const galleryGrid = page.locator('[data-testid="gallery-grid"]');
    const gridCount = await galleryGrid.count();

    if (gridCount > 0) {
      await expect(galleryGrid).toBeVisible();
    } else {
      const emptyText = page.locator('text=No gallery photos uploaded');
      await expect(emptyText).toBeVisible();
    }
  });

  test('gallery items are clickable buttons', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();

    if (itemCount > 0) {
      expect(itemCount).toBeGreaterThanOrEqual(1);

      const tagName = await galleryItems.first().evaluate((el) => el.tagName.toLowerCase());
      expect(tagName).toBe('button');

      const type = await galleryItems.first().getAttribute('type');
      expect(type).toBe('button');
    }
  });

  test('each gallery item has aria-label for accessibility', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();

    if (itemCount > 0) {
      for (let i = 0; i < itemCount; i++) {
        const ariaLabel = await galleryItems.nth(i).getAttribute('aria-label');
        expect(ariaLabel).toBeTruthy();
        expect(ariaLabel).toMatch(/^View photo \d+$/);
      }
    }
  });
});

test.describe('Gallery Page — Lightbox', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(GALLERY_URL, { waitUntil: 'domcontentloaded' });
  });

  test('clicking a gallery item opens the lightbox', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount === 0, 'No gallery images to test lightbox');

    const lightbox = page.locator('[data-testid="lightbox-modal"]');

    const displayBefore = await lightbox.evaluate((el: HTMLElement) => el.style.display);
    expect(displayBefore).not.toBe('flex');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.first().click();

    const displayAfter = await lightbox.evaluate((el: HTMLElement) => el.style.display);
    expect(displayAfter).toBe('flex');
  });

  test('lightbox displays the enlarged image', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount === 0, 'No gallery images to test lightbox');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.first().click();

    const lightboxImg = page.locator('[data-testid="lightbox-img"]');
    await expect(lightboxImg).toBeVisible();

    const src = await lightboxImg.getAttribute('src');
    expect(src).toBeTruthy();
    expect(src!.length).toBeGreaterThan(0);
  });

  test('lightbox shows correct counter "1 / N"', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount === 0, 'No gallery images to test lightbox');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.first().click();

    const counter = page.locator('#lightboxCounter');
    const text = await counter.textContent();
    expect(text).toMatch(/^1 \/ \d+$/);
  });

  test('clicking next button advances to next photo', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount < 2, 'Need at least 2 gallery images for next/prev navigation');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.first().click();

    const counter = page.locator('#lightboxCounter');
    const textBefore = await counter.textContent();
    expect(textBefore).toMatch(/^1 \/ \d+$/);

    await page.locator('[aria-label="Next photo"]').click();

    const textAfter = await counter.textContent();
    expect(textAfter).toMatch(/^2 \/ \d+$/);
  });

  test('clicking previous button goes to previous photo', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount < 2, 'Need at least 2 gallery images for prev navigation');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.nth(1).click();

    const counter = page.locator('#lightboxCounter');
    const textBefore = await counter.textContent();
    expect(textBefore).toMatch(/^2 \/ \d+$/);

    await page.locator('[aria-label="Previous photo"]').click();

    const textAfter = await counter.textContent();
    expect(textAfter).toMatch(/^1 \/ \d+$/);
  });

  test('clicking close button closes the lightbox', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount === 0, 'No gallery images to test lightbox');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.first().click();

    const lightbox = page.locator('[data-testid="lightbox-modal"]');
    const displayOpen = await lightbox.evaluate((el: HTMLElement) => el.style.display);
    expect(displayOpen).toBe('flex');

    await page.locator('[aria-label="Close lightbox"]').click();

    const displayClosed = await lightbox.evaluate((el: HTMLElement) => el.style.display);
    expect(displayClosed).toBe('none');
  });

  test('pressing Escape closes the lightbox', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount === 0, 'No gallery images to test lightbox');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.first().click();

    const lightbox = page.locator('[data-testid="lightbox-modal"]');
    const displayOpen = await lightbox.evaluate((el: HTMLElement) => el.style.display);
    expect(displayOpen).toBe('flex');

    await page.keyboard.press('Escape');

    const displayClosed = await lightbox.evaluate((el: HTMLElement) => el.style.display);
    expect(displayClosed).toBe('none');
  });

  test('pressing ArrowRight navigates to next photo', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount < 2, 'Need at least 2 gallery images for keyboard navigation');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.first().click();

    const counter = page.locator('#lightboxCounter');
    const textBefore = await counter.textContent();
    expect(textBefore).toMatch(/^1 \/ \d+$/);

    await page.keyboard.press('ArrowRight');

    const textAfter = await counter.textContent();
    expect(textAfter).toMatch(/^2 \/ \d+$/);
  });

  test('pressing ArrowLeft navigates to previous photo', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount < 2, 'Need at least 2 gallery images for keyboard navigation');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.nth(1).click();

    const counter = page.locator('#lightboxCounter');
    const textBefore = await counter.textContent();
    expect(textBefore).toMatch(/^2 \/ \d+$/);

    await page.keyboard.press('ArrowLeft');

    const textAfter = await counter.textContent();
    expect(textAfter).toMatch(/^1 \/ \d+$/);
  });

  test('lightbox wraps around from last to first photo', async ({ page }) => {
    const galleryItems = page.locator('[data-testid="gallery-item"]');
    const itemCount = await galleryItems.count();
    test.skip(itemCount < 2, 'Need at least 2 gallery images for wrap-around test');

    await page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 });
    await galleryItems.last().click();

    const counter = page.locator('#lightboxCounter');
    const textBefore = await counter.textContent();
    const totalMatch = textBefore?.match(/^(\d+) \/ (\d+)$/);
    expect(totalMatch).toBeTruthy();

    const lastPhoto = parseInt(totalMatch![1], 10);
    const totalPhotos = parseInt(totalMatch![2], 10);
    expect(lastPhoto).toBe(totalPhotos);

    await page.locator('[aria-label="Next photo"]').click();

    const textAfter = await counter.textContent();
    expect(textAfter).toMatch(/^1 \/ \d+$/);
  });
});

test.describe('Gallery Page — Empty State & Errors', () => {
  test('page loads without critical JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    await page.goto(GALLERY_URL, { waitUntil: 'domcontentloaded' });

    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('Text content does not match') &&
        !e.includes('hydrat') &&
        !e.includes('Suspense boundary'),
    );
    expect(criticalErrors.length).toBe(0);
  });
});
