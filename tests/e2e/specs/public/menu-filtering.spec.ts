import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;
const MENU_URL = `/camp/${TENANT_ID}/menu`;

/* ------------------------------------------------------------------ */

test.describe('Menu Page — Layout & Hero', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MENU_URL, { waitUntil: 'domcontentloaded' });
  });

  test('menu page renders with tenant name in hero', async ({ page }) => {
    const hero = page.locator('[data-testid="tenant-nav"] h1');
    await expect(hero).toBeVisible();
    await expect(hero).toContainText(TEST_TENANT.name);
  });

  test('menu page shows "Menu" subtitle', async ({ page }) => {
    const subtitle = page.locator('[data-testid="tenant-nav"] h1 + p');
    await expect(subtitle).toBeVisible();
    await expect(subtitle).toContainText('Menu');
  });

  test('search input is visible with correct placeholder', async ({ page }) => {
    const search = page.locator('[data-testid="menu-search"]');
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute('placeholder', 'Search for a meal...');
  });
});

/* ------------------------------------------------------------------ */

test.describe('Menu Page — Category Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MENU_URL, { waitUntil: 'domcontentloaded' });
    // Wait for the React island to hydrate and render category chips
    await page.locator('[data-testid="tenant-nav-link"]').first().waitFor({ state: 'visible' });
  });

  test('category chips are visible', async ({ page }) => {
    const chips = page.locator('[data-testid="tenant-nav-link"]');
    const count = await chips.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('clicking a category chip scrolls to that section', async ({ page }) => {
    const chips = page.locator('[data-testid="tenant-nav-link"]');
    const count = await chips.count();
    if (count < 2) return;

    const secondChip = chips.nth(1);
    const categoryName = await secondChip.getAttribute('data-page');
    await secondChip.click();

    // The corresponding section should be visible in the viewport
    const section = page.locator(`h2:has-text("${categoryName}")`);
    await expect(section).toBeVisible();
    const box = await section.boundingBox();
    expect(box).not.toBeNull();
    // Section should be near the top of the viewport after scroll
    expect(box!.y).toBeLessThan(400);
  });

  test('category chips highlight active category', async ({ page }) => {
    const chips = page.locator('[data-testid="tenant-nav-link"]');
    const firstChip = chips.first();
    // Click the first chip to ensure it is the active one
    await firstChip.click();
    // The active chip should have a non-white background (brand color)
    const bg = await firstChip.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    // Active chip should not be pure white (#ffffff / rgb(255, 255, 255))
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });
});

/* ------------------------------------------------------------------ */

test.describe('Menu Page — Search Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MENU_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="tenant-nav-link"]').first().waitFor({ state: 'visible' });
  });

  test('typing in search filters meals by name', async ({ page }) => {
    // Grab the name of the first meal card on the page
    const firstMeal = page.locator('[data-testid="tenant-nav"] h3').first();
    const mealName = await firstMeal.textContent();
    expect(mealName).toBeTruthy();

    const search = page.locator('[data-testid="menu-search"]');
    await search.fill(mealName!.trim());

    // The matching meal should still be visible
    const visible = page.locator(`h3:has-text("${mealName!.trim()}")`);
    await expect(visible.first()).toBeVisible();
  });

  test('search is case-insensitive', async ({ page }) => {
    const firstMeal = page.locator('[data-testid="tenant-nav"] h3').first();
    const mealName = await firstMeal.textContent();
    expect(mealName).toBeTruthy();

    const search = page.locator('[data-testid="menu-search"]');
    await search.fill(mealName!.trim().toUpperCase());

    const visible = page.locator(`h3:has-text("${mealName!.trim()}")`);
    await expect(visible.first()).toBeVisible();
  });

  test('search filters by category name', async ({ page }) => {
    const chips = page.locator('[data-testid="tenant-nav-link"]');
    const chipName = await chips.first().getAttribute('data-page');
    expect(chipName).toBeTruthy();

    const search = page.locator('[data-testid="menu-search"]');
    await search.fill(chipName!);

    // The category heading should still be visible
    const heading = page.locator(`h2:has-text("${chipName}")`);
    await expect(heading).toBeVisible();
  });

  test('clearing search shows all meals', async ({ page }) => {
    const search = page.locator('[data-testid="menu-search"]');
    const initialChipCount = await page.locator('[data-testid="tenant-nav-link"]').count();

    // Filter down to something specific, then clear
    const firstMeal = page.locator('[data-testid="tenant-nav"] h3').first();
    const mealName = await firstMeal.textContent();
    if (mealName) {
      await search.fill(mealName.trim());
    }
    await search.fill('');

    // All original categories should reappear
    const afterClear = await page.locator('[data-testid="tenant-nav-link"]').count();
    expect(afterClear).toBe(initialChipCount);
  });

  test('no results state shows when search matches nothing', async ({ page }) => {
    const search = page.locator('[data-testid="menu-search"]');
    await search.fill('zzz_no_match_gibberish_xyz');

    const emptyState = page.getByText('No results');
    await expect(emptyState).toBeVisible();
    const hint = page.getByText('Try a different search term');
    await expect(hint).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */

test.describe('Menu Page — Meal Cards', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MENU_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="tenant-nav-link"]').first().waitFor({ state: 'visible' });
  });

  test('meal cards show name, description, and price', async ({ page }) => {
    const card = page.locator('.rounded-xl.overflow-hidden').first();
    await expect(card).toBeVisible();

    const name = card.locator('h3');
    await expect(name).toBeVisible();
    expect((await name.textContent())?.trim().length).toBeGreaterThan(0);

    // Price is rendered via formatPrice — contains EGP
    const price = card.locator('span:has-text("EGP")');
    await expect(price).toBeVisible();
  });

  test('prices display in EGP format', async ({ page }) => {
    const prices = page.locator('span:has-text("EGP")');
    const count = await prices.count();
    expect(count).toBeGreaterThan(0);

    // Every price should match the pattern "<number> EGP"
    for (let i = 0; i < Math.min(count, 5); i++) {
      const text = await prices.nth(i).textContent();
      expect(text?.trim()).toMatch(/^\d+(\.\d+)?\s+EGP$/);
    }
  });

  test('add button increases quantity', async ({ page }) => {
    const firstCard = page.locator('.rounded-xl.overflow-hidden').first();
    const addBtn = firstCard.locator('button:has-text("+")');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // After clicking +, the quantity indicator and − button should appear
    const qty = firstCard.locator('span.text-center.font-bold');
    await expect(qty).toBeVisible();
    expect(parseInt(await qty.textContent() ?? '0', 10)).toBe(1);
  });

  test('decrease button removes one quantity', async ({ page }) => {
    const firstCard = page.locator('.rounded-xl.overflow-hidden').first();
    const addBtn = firstCard.locator('button:has-text("+")');
    await addBtn.click();
    await addBtn.click();

    const qty = firstCard.locator('span.text-center.font-bold');
    expect(parseInt(await qty.textContent() ?? '0', 10)).toBe(2);

    const removeBtn = firstCard.locator('button:has-text("−")');
    await removeBtn.click();
    expect(parseInt(await qty.textContent() ?? '0', 10)).toBe(1);
  });

  test('add button appears for items not in cart', async ({ page }) => {
    // Every visible meal card should have a + button
    const addButtons = page.locator('.rounded-xl.overflow-hidden button:has-text("+")');
    const count = await addButtons.count();
    expect(count).toBeGreaterThan(0);

    // First add button should be visible (item has qty 0)
    await expect(addButtons.first()).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */

test.describe('Menu Page — Cart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(MENU_URL, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-testid="tenant-nav-link"]').first().waitFor({ state: 'visible' });
  });

  test('cart button appears when items are added', async ({ page }) => {
    const firstCard = page.locator('.rounded-xl.overflow-hidden').first();
    const addBtn = firstCard.locator('button:has-text("+")');
    await addBtn.click();

    // Fixed bottom cart button should become visible with count badge and total
    const cartBtn = page.locator('button:has-text("View Order")');
    await expect(cartBtn).toBeVisible();
    await expect(cartBtn).toContainText('1');
    await expect(cartBtn).toContainText('EGP');
  });

  test('clicking cart button opens drawer', async ({ page }) => {
    const firstCard = page.locator('.rounded-xl.overflow-hidden').first();
    const addBtn = firstCard.locator('button:has-text("+")');
    await addBtn.click();

    const cartBtn = page.locator('button:has-text("View Order")');
    await cartBtn.click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Your Order');

    // WhatsApp button should exist inside the drawer
    const whatsappBtn = page.locator('[data-testid="menu-whatsapp-btn"]');
    await expect(whatsappBtn).toBeVisible();

    // Clear cart button should exist
    const clearBtn = page.locator('button:has-text("Clear Cart")');
    await expect(clearBtn).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */

test.describe('Menu Page — Empty State & Errors', () => {
  test('page loads without critical JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    await page.goto(MENU_URL, { waitUntil: 'domcontentloaded' });

    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('Text content does not match') &&
        !e.includes('hydrat') &&
        !e.includes('Suspense boundary')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
