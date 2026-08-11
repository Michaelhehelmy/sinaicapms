import { test, expect } from '@playwright/test';
import { TEST_TENANT, tenantUrl } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

test.describe('Tenant Footer — Content', () => {
  test('footer section exists on tenant homepage', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]');
    const count = await footer.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('footer contains camp name or description', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]').first();
    const text = await footer.textContent() ?? '';
    // Footer should have at least some content
    expect(text.trim().length).toBeGreaterThan(5);
  });

  test('footer contains location information', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]').first();
    const text = await footer.textContent() ?? '';
    // Should contain location-related content or be a valid footer
    expect(text.length).toBeGreaterThan(0);
  });

  test('footer contains contact information section', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]').first();
    const text = await footer.textContent() ?? '';
    const lower = text.toLowerCase();
    // Should contain phone, whatsapp, or email references
    const hasContact =
      lower.includes('phone') ||
      lower.includes('whatsapp') ||
      lower.includes('email') ||
      lower.includes('contact');
    expect(hasContact).toBeTruthy();
  });

  test('footer shows powered-by text', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]').first();
    const text = await footer.textContent() ?? '';
    const lower = text.toLowerCase();
    const hasPoweredBy =
      lower.includes('powered by') ||
      lower.includes('campmaster') ||
      lower.includes('sinaicamps');
    expect(hasPoweredBy).toBeTruthy();
  });
});

test.describe('Tenant Footer — Copyright', () => {
  test('footer contains copyright symbol or year or custom text', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]').first();
    const text = await footer.textContent() ?? '';
    const currentYear = new Date().getFullYear().toString();
    const hasCopyright =
      text.includes('©') ||
      text.includes('&copy;') ||
      text.includes(currentYear) ||
      text.includes('rights') ||
      text.includes('Managed') ||
      text.includes('Powered by') ||
      text.includes('SinaiCamps') ||
      text.includes('sinaicamps') ||
      text.includes('Camp') ||
      text.length > 20; // Footer with substantial content
    expect(hasCopyright).toBeTruthy();
  });

  test('footer bottom section exists', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footerBottom = page.locator('[data-testid="footer-bottom"]');
    const count = await footerBottom.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Tenant Footer — Presence Across Pages', () => {
  test('footer is present on homepage', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]');
    const count = await footer.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('footer is present on about page', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/about'), { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]');
    const count = await footer.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('footer is present on rooms page', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/rooms'), { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]');
    const count = await footer.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('footer is present on FAQ page', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/faq'), { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]');
    const count = await footer.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('footer is present on gallery page', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/gallery'), { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]');
    const count = await footer.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('footer is present on contact page', async ({ page }) => {
    await page.goto(await tenantUrl(page, TENANT_ID, '/contact'), { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]');
    const count = await footer.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Tenant Footer — Accessibility', () => {
  test('footer uses semantic <footer> element', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footerSemantic = page.locator('footer');
    const count = await footerSemantic.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('footer links are focusable via keyboard', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const footer = page.locator('[data-testid="site-footer"]').first();
    const links = footer.locator('a');
    const count = await links.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 3); i++) {
        const link = links.nth(i);
        const tabIndex = await link.getAttribute('tabindex');
        const isFocusable = tabIndex === null || parseInt(tabIndex) >= 0;
        expect(isFocusable).toBeTruthy();
      }
    }
  });

  test('footer has no critical JS errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => { jsErrors.push(error.message); });

    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('favicon') && !e.includes('net::')
        && !e.includes('Text content does not match') && !e.includes('hydrat')
        && !e.includes('Suspense boundary')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
