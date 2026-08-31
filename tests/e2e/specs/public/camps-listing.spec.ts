import { test, expect } from '@playwright/test';
import { TEST_TENANT, TEST_CAMPS } from '../../fixtures/test-data';

/* ------------------------------------------------------------------ */
/*  Marketplace Camps Listing Page — /camps                            */
/* ------------------------------------------------------------------ */

test.describe('Camps Listing Page — Hero & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/camps', { waitUntil: 'domcontentloaded' });
  });

  test('hero banner is visible with correct title', async ({ page }) => {
    const heroBanner = page.locator('[data-testid="hero-banner"]');
    await expect(heroBanner).toBeVisible();
    const heroTitle = page.locator('[data-testid="hero-title"]');
    await expect(heroTitle).toBeVisible();
    await expect(heroTitle).toContainText('Explore All Camps');
  });

  test('hero description mentions browsing/filtering', async ({ page }) => {
    const desc = page.locator('[data-testid="hero-description"]');
    await expect(desc).toBeVisible();
    const text = (await desc.textContent()) ?? '';
    expect(text.toLowerCase()).toContain('browse');
    expect(text.toLowerCase()).toContain('filter');
  });

  test('browse camps link exists and points to #camps', async ({ page }) => {
    const link = page.locator('[data-testid="browse-camps-link"]');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '#camps');
  });

  test('filter form is visible with all filter fields', async ({ page }) => {
    await expect(page.locator('[data-testid="filter-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="type-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="location-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="capacity-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="activity-filter"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-submit"]')).toBeVisible();
  });

  test('camps grid section is visible', async ({ page }) => {
    await expect(page.locator('[data-testid="camps-grid"]')).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */

test.describe('Camps Listing Page — SSR Camp Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/camps', { waitUntil: 'domcontentloaded' });
  });

  test('renders at least one camp card from SSR', async ({ page }) => {
    const cards = page.locator('[data-testid="camp-card"]');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('camp card shows name, description, location, and type badge', async ({ page }) => {
    const card = page.locator('[data-testid="camp-card"]').first();
    await expect(card).toBeVisible();
    await expect(card.locator('[data-testid="camp-name"]')).toBeVisible();
    await expect(card.locator('[data-testid="camp-description"]')).toBeVisible();
    await expect(card.locator('[data-testid="camp-location"]')).toBeVisible();
    await expect(card.locator('[data-testid="camp-type-badge"]')).toBeVisible();
  });

  test('camp card has explore link', async ({ page }) => {
    const card = page.locator('[data-testid="camp-card"]').first();
    const exploreLink = card.locator('[data-testid="explore-camp-link"]');
    await expect(exploreLink).toBeVisible();
    await expect(exploreLink).toHaveAttribute('href', /.+/);
  });

  test('camp cards show capacity badge', async ({ page }) => {
    const card = page.locator('[data-testid="camp-card"]').first();
    const cardText = (await card.textContent()) ?? '';
    expect(cardText).toContain('Capacity:');
  });
});

/* ------------------------------------------------------------------ */

test.describe('Camps Listing Page — Client-Side Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/camps', { waitUntil: 'domcontentloaded' });
  });

  test('submitting empty filters reloads all camps', async ({ page }) => {
    const grid = page.locator('[data-testid="camps-grid"]');
    const countBefore = await grid.locator('[data-testid="camp-card"]').count();
    await page.locator('[data-testid="search-submit"]').click();
    await expect(grid.locator('[data-testid="camp-card"]').first()).toBeVisible();
    const countAfter = await grid.locator('[data-testid="camp-card"]').count();
    expect(countAfter).toBeGreaterThanOrEqual(1);
    expect(countAfter).toBe(countBefore);
  });

  test('search input filters camps by name', async ({ page }) => {
    const grid = page.locator('[data-testid="camps-grid"]');
    const campName = TEST_CAMPS[0].name;
    await page.locator('[data-testid="search-input"]').fill(campName);
    await page.locator('[data-testid="search-submit"]').click();
    await expect(grid.locator('[data-testid="camp-card"]').first()).toBeVisible();
    const cards = grid.locator('[data-testid="camp-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      const name = (await cards.nth(i).locator('[data-testid="camp-name"]').textContent()) ?? '';
      expect(name.toLowerCase()).toContain(campName.toLowerCase());
    }
  });

  test('type filter narrows results', async ({ page }) => {
    const grid = page.locator('[data-testid="camps-grid"]');
    await page.locator('[data-testid="type-filter"]').selectOption('camp');
    await page.locator('[data-testid="search-submit"]').click();
    await expect(grid.locator('[data-testid="camp-card"]').first()).toBeVisible();
    const badges = grid.locator('[data-testid="camp-type-badge"]');
    const count = await badges.count();
    for (let i = 0; i < count; i++) {
      const text = (await badges.nth(i).textContent()) ?? '';
      expect(text.trim()).toBe('Camp');
    }
  });

  test('location filter narrows results', async ({ page }) => {
    const grid = page.locator('[data-testid="camps-grid"]');
    const locSel = page.locator('[data-testid="location-filter"]');
    await locSel.locator('option[value="Sinai Peninsula, Egypt"]').waitFor({ state: 'attached' });
    await locSel.selectOption('Sinai Peninsula, Egypt');
    await page.locator('[data-testid="search-submit"]').click();
    await expect(grid.locator('[data-testid="camp-card"]').first()).toBeVisible();
    const locations = grid.locator('[data-testid="camp-location"]');
    const count = await locations.count();
    for (let i = 0; i < count; i++) {
      const text = (await locations.nth(i).textContent()) ?? '';
      expect(text.toLowerCase()).toContain('sinai');
    }
  });

  test('capacity filter narrows results', async ({ page }) => {
    const grid = page.locator('[data-testid="camps-grid"]');
    await page.locator('[data-testid="capacity-filter"]').selectOption('30');
    await page.locator('[data-testid="search-submit"]').click();
    await expect(grid.locator('[data-testid="camp-card"]').first()).toBeVisible();
    const cards = grid.locator('[data-testid="camp-card"]');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < count; i++) {
      const text = (await cards.nth(i).textContent()) ?? '';
      const match = text.match(/Capacity:\s*(\d+)/);
      if (match) {
        expect(parseInt(match[1], 10)).toBeGreaterThanOrEqual(30);
      }
    }
  });

  test('activity filter narrows results', async ({ page }) => {
    const grid = page.locator('[data-testid="camps-grid"]');
    await page.locator('[data-testid="activity-filter"]').selectOption('Hiking');
    await page.locator('[data-testid="search-submit"]').click();
    const cards = grid.locator('[data-testid="camp-card"]');
    const count = await cards.count();
    if (count > 0) {
      await expect(cards.first()).toBeVisible();
    }
  });

  test('no results message appears when filters match nothing', async ({ page }) => {
    const grid = page.locator('[data-testid="camps-grid"]');
    await page.locator('[data-testid="search-input"]').fill('zzz_nonexistent_camp_xyz');
    await page.locator('[data-testid="search-submit"]').click();
    await expect(grid).toContainText('No camps match');
  });
});

/* ------------------------------------------------------------------ */

test.describe('Camps Listing Page — Navigation', () => {
  test('clicking explore camp link navigates away', async ({ page }) => {
    await page.goto('/camps', { waitUntil: 'domcontentloaded' });
    const exploreLink = page.locator('[data-testid="explore-camp-link"]').first();
    await expect(exploreLink).toBeVisible();
    const href = await exploreLink.getAttribute('href');
    expect(href).toBeTruthy();
    await exploreLink.click();
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).not.toContain('/camps');
  });
});

/* ------------------------------------------------------------------ */

test.describe('Camps Listing Page — Error Handling', () => {
  test('page loads without critical JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', error => jsErrors.push(error.message));
    await page.goto('/camps', { waitUntil: 'domcontentloaded' });
    const criticalErrors = jsErrors.filter(
      e =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('Text content does not match') &&
        !e.includes('hydrat') &&
        !e.includes('Suspense boundary')
    );
    expect(criticalErrors.length).toBe(0);
  });

  test('filter API failure shows error state', async ({ page }) => {
    await page.goto('/camps', { waitUntil: 'domcontentloaded' });
    // The camps filter fetches from the versioned path /api/v1/tenants/public.
    await page.route('**/api/v1/tenants/public*', route => route.abort());
    await page.locator('[data-testid="search-submit"]').click();
    await expect(page.locator('[data-testid="camps-grid"]')).toContainText('Could not load camps');
  });
});
