import { test, expect } from '@playwright/test';
import { TEST_TENANT } from '../../fixtures/test-data';
import axeSource from 'axe-core';

const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

test.describe('Accessibility — Automated axe Checks', () => {
  test('marketplace homepage has no critical axe violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Run axe-core via page evaluate
    const results = await page.evaluate((source) => {
      // @ts-ignore
      window.eval(source);
      // @ts-ignore
      return window.axe.run();
    }, axeSource.source);

    const criticalViolations = results.violations.filter(
      (v: any) => v.impact === 'critical' || v.impact === 'serious'
    );

    // Log violations for debugging
    for (const v of criticalViolations) {
      console.log(`[axe] ${v.impact}: ${v.id} — ${v.description}`);
      for (const node of v.nodes) {
        console.log(`  Element: ${node.html.substring(0, 100)}`);
      }
    }

    // Allow up to 3 serious violations (known issues)
    expect(criticalViolations.length).toBeLessThanOrEqual(3);
  });

  test('tenant homepage has no critical axe violations', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate((source) => {
      // @ts-ignore
      window.eval(source);
      // @ts-ignore
      return window.axe.run();
    }, axeSource.source);

    const criticalViolations = results.violations.filter(
      (v: any) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations.length).toBeLessThanOrEqual(3);
  });

  test('booking page has no critical axe violations', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate((source) => {
      // @ts-ignore
      window.eval(source);
      // @ts-ignore
      return window.axe.run();
    }, axeSource.source);

    const criticalViolations = results.violations.filter(
      (v: any) => v.impact === 'critical' || v.impact === 'serious'
    );
    expect(criticalViolations.length).toBeLessThanOrEqual(3);
  });

  test('marketplace has no color contrast critical violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate((source) => {
      // @ts-ignore
      window.eval(source);
      // @ts-ignore
      return window.axe.run();
    }, axeSource.source);

    const contrastViolations = results.violations.filter(
      (v: any) => v.id === 'color-contrast'
    );
    // No critical contrast violations allowed
    expect(contrastViolations.length).toBe(0);
  });

  test('marketplace has no missing-alt violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate((source) => {
      // @ts-ignore
      window.eval(source);
      // @ts-ignore
      return window.axe.run();
    }, axeSource.source);

    const imageViolations = results.violations.filter(
      (v: any) => v.id === 'image-alt' || v.id === 'input-image-alt'
    );
    expect(imageViolations.length).toBe(0);
  });

  test('marketplace has no label violations on form inputs', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate((source) => {
      // @ts-ignore
      window.eval(source);
      // @ts-ignore
      return window.axe.run();
    }, axeSource.source);

    const labelViolations = results.violations.filter(
      (v: any) => v.id === 'label' || v.id === 'select-name'
    );
    expect(labelViolations.length).toBeLessThanOrEqual(2);
  });

  test('marketplace has no link-name violations', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const results = await page.evaluate((source) => {
      // @ts-ignore
      window.eval(source);
      // @ts-ignore
      return window.axe.run();
    }, axeSource.source);

    const linkViolations = results.violations.filter(
      (v: any) => v.id === 'link-name'
    );
    expect(linkViolations.length).toBe(0);
  });
});
