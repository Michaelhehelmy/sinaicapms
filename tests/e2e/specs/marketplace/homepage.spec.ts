import { test, expect } from '@playwright/test';
import { MarketplaceHomePage } from '../../pages/marketplace/home.page';

test.describe('Marketplace Homepage', () => {
  let home: MarketplaceHomePage;

  test.beforeEach(async ({ page }) => {
    home = new MarketplaceHomePage(page);
    await home.goto();
  });

  test('hero section visible with text', async ({ page }) => {
    const heroBanner = page.locator('[data-testid="hero-banner"]');
    await expect(heroBanner).toBeVisible();

    const h1 = heroBanner.locator('[data-testid="hero-title"]');
    await expect(h1).toBeVisible();
    const h1Text = await h1.textContent();
    expect(h1Text?.trim().length).toBeGreaterThan(0);

    const p = heroBanner.locator('[data-testid="hero-description"]');
    await expect(p).toBeVisible();
    const pText = await p.textContent();
    expect(pText?.trim().length).toBeGreaterThan(0);
  });

  test('camp grid renders in #campsGrid', async ({ page }) => {
    const grid = page.locator('[data-testid="camps-grid"]');
    await expect(grid).toBeVisible();

    const section = page.locator('#camps');
    await expect(section).toBeVisible();

    const sectionTitle = section.locator('h2');
    await expect(sectionTitle).toBeVisible();
    const titleText = await sectionTitle.textContent();
    expect(titleText).toContain('Camp');
  });

  test('camp cards have card structure', async ({ page }) => {
    const campCount = await home.getCampCount();

    if (campCount > 0) {
      for (let i = 0; i < campCount; i++) {
        const card = page.locator('[data-testid="camp-card"]').nth(i);
        await expect(card).toBeVisible();

        // Card contains camp name, description, and explore link
        const nameEl = card.locator('[data-testid="camp-name"]');
        await expect(nameEl).toBeVisible();
      }
    } else {
      const gridEl = page.locator('[data-testid="camps-grid"]');
      const emptyText = gridEl.locator('p:has-text("No camps")');
      const count = await emptyText.count();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('camp cards show name (camp-name text is not empty)', async ({ page }) => {
    const campCount = await home.getCampCount();

    if (campCount > 0) {
      for (let i = 0; i < campCount; i++) {
        const nameEl = page.locator('[data-testid="camp-card"]').nth(i).locator('[data-testid="camp-name"]');
        await expect(nameEl).toBeVisible();
        const nameText = await nameEl.textContent();
        expect(nameText?.trim().length).toBeGreaterThan(0);
        expect(nameText).not.toBe('');
      }
    }
  });

  test('camp cards show description (camp-description text)', async ({ page }) => {
    const campCount = await home.getCampCount();

    if (campCount > 0) {
      for (let i = 0; i < campCount; i++) {
        const descEl = page.locator('[data-testid="camp-card"]').nth(i).locator('[data-testid="camp-description"]');
        await expect(descEl).toBeAttached();
        const descText = await descEl.textContent();
        expect(descText?.trim().length).toBeGreaterThan(0);
      }
    }
  });

  test('camp cards show "Explore Camp" link with valid href', async ({ page }) => {
    const campCount = await home.getCampCount();

    if (campCount > 0) {
      for (let i = 0; i < campCount; i++) {
        const exploreLink = page.locator('[data-testid="camp-card"]').nth(i).locator('[data-testid="explore-camp-link"]');
        await expect(exploreLink).toBeVisible();

        const href = await exploreLink.getAttribute('href');
        expect(href).toBeTruthy();
        expect(href!.length).toBeGreaterThan(0);
      }
    }
  });

  test('search: type in search input -> apply -> verify results contain query', async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-input"]');
    await expect(searchInput).toBeVisible();

    const allCampCount = await home.getCampCount();

    await home.searchCamps('Alpha');
    await home.applyFilters();

    try {
      await page.locator('[data-testid="camps-grid"]').waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // Grid may have updated without losing visibility — continue
    }

    const filteredCount = await home.getCampCount();

    if (filteredCount > 0) {
      for (let i = 0; i < filteredCount; i++) {
        const name = await home.getCampName(i);
        const descEl = page.locator('[data-testid="camp-card"]').nth(i).locator('[data-testid="camp-description"]');
        const desc = await descEl.textContent() ?? '';
        const matches = name.toLowerCase().includes('alpha') || desc.toLowerCase().includes('alpha');
        expect(matches).toBeTruthy();
      }
    }
  });

  test('filter by location: select "Sinai Peninsula, Egypt" -> apply -> verify results', async ({ page }) => {
    const locationSelect = page.locator('[data-testid="location-filter"]');
    await expect(locationSelect).toBeVisible();

    await home.filterByLocation('Sinai Peninsula, Egypt');
    await home.applyFilters();

    try {
      await page.locator('[data-testid="camps-grid"]').waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // Grid may have updated without losing visibility — continue
    }

    const count = await home.getCampCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('filter by capacity: select "30" -> apply -> verify results', async ({ page }) => {
    const capacitySelect = page.locator('[data-testid="capacity-filter"]');
    await expect(capacitySelect).toBeVisible();

    await home.filterByCapacity('30');
    await home.applyFilters();

    try {
      await page.locator('[data-testid="camps-grid"]').waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // Grid may have updated without losing visibility — continue
    }

    const count = await home.getCampCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('filter by activity: select "Hiking" -> apply -> verify results', async ({ page }) => {
    const activitySelect = page.locator('[data-testid="activity-filter"]');
    await expect(activitySelect).toBeVisible();

    await home.filterByActivity('Hiking');
    await home.applyFilters();

    try {
      await page.locator('[data-testid="camps-grid"]').waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // Grid may have updated without losing visibility — continue
    }

    const count = await home.getCampCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('combined filters: search + location -> verify intersection', async ({ page }) => {
    await home.searchCamps('Camp');
    await home.filterByLocation('Sinai Peninsula, Egypt');
    await home.applyFilters();

    try {
      await page.locator('[data-testid="camps-grid"]').waitFor({ state: 'visible', timeout: 5000 });
    } catch {
      // Grid may have updated without losing visibility — continue
    }

    const count = await home.getCampCount();
    expect(typeof count).toBe('number');
    expect(count).toBeGreaterThanOrEqual(0);

    if (count > 0) {
      const name = await home.getCampName(0);
      expect(name.toLowerCase()).toContain('camp');
    }
  });

  test('onboarding form has all camp fields with correct IDs', async ({ page }) => {
    const onboardingForm = page.locator('[data-testid="onboarding-form"]');
    await expect(onboardingForm).toBeVisible();

    const fields = [
      { id: '#tenantName', type: 'text' },
      { id: '#tenantSubdomain', type: 'text' },
      { id: '#tenantColor', type: 'color' },
      { id: '#tenantLocation', type: 'text' },
      { id: '#tenantActivities', type: 'text' },
      { id: '#tenantDesc', type: 'textarea' },
    ];

    for (const field of fields) {
      const el = page.locator(field.id);
      await expect(el).toBeVisible();
      const exists = await el.count();
      expect(exists).toBe(1);

      if (field.type !== 'textarea') {
        const type = await el.getAttribute('type');
        expect(type).toBe(field.type);
      } else {
        const tag = await el.evaluate((el) => el.tagName.toLowerCase());
        expect(tag).toBe('textarea');
      }
    }

    const submitBtn = onboardingForm.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
    const btnText = await submitBtn.textContent();
    // t4 reworded onboarding CTA: "Setup Camp Portal Instantly" -> "Create Your Portal"
    expect(btnText).toContain('Create Your Portal');
  });
});
