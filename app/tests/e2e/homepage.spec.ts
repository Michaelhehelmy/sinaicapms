import { test, expect } from '@playwright/test';

test('homepage loads with title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SinaiCamps|Camp/);
});

test('homepage has hero section', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1, h2').first()).toBeVisible();
});

test('navigation links are visible', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('nav a').first()).toBeVisible();
});
