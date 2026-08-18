import { test, expect } from '@playwright/test';
import { TEST_TENANT, tenantUrl } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

/* ------------------------------------------------------------------ */

test.describe('Contact Page — Hero & Layout', () => {
  test.beforeEach(async ({ page }) => {
    const url = await tenantUrl(page, TENANT_ID, '/contact');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  });

  test('hero banner is visible with correct title', async ({ page }) => {
    await expect(page.locator('[data-testid="hero-banner"]')).toBeVisible();
    await expect(page.locator('[data-testid="hero-title"]')).toHaveText('Contact Us');
  });

  test('hero description mentions getting in touch', async ({ page }) => {
    const desc = page.locator('[data-testid="hero-description"]');
    await expect(desc).toBeVisible();
    await expect(desc).toContainText('touch');
  });

  test('contact info section shows address, phone, email', async ({ page }) => {
    const body = await page.locator('body').textContent() ?? '';
    expect(body).toContain('Address');
    expect(body).toContain('Phone');
    expect(body).toContain('Email');
  });
});

/* ------------------------------------------------------------------ */

test.describe('Contact Page — Form Fields', () => {
  test.beforeEach(async ({ page }) => {
    const url = await tenantUrl(page, TENANT_ID, '/contact');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  });

  test('contact form is visible with all fields', async ({ page }) => {
    await expect(page.locator('[data-testid="contact-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="contact-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="contact-email"]')).toBeVisible();
    await expect(page.locator('[data-testid="contact-message"]')).toBeVisible();
  });

  test('name field is required', async ({ page }) => {
    const nameField = page.locator('[data-testid="contact-name"]');
    await expect(nameField).toHaveAttribute('required', '');
  });

  test('email field is required and has email type', async ({ page }) => {
    const emailField = page.locator('[data-testid="contact-email"]');
    await expect(emailField).toHaveAttribute('required', '');
    await expect(emailField).toHaveAttribute('type', 'email');
  });

  test('message field is required', async ({ page }) => {
    const messageField = page.locator('[data-testid="contact-message"]');
    await expect(messageField).toHaveAttribute('required', '');
  });

  test('submit button shows "Send Message"', async ({ page }) => {
    const btn = page.locator('button[type="submit"]');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveText('Send Message');
  });
});

/* ------------------------------------------------------------------ */

test.describe('Contact Page — Form Submission', () => {
  test.beforeEach(async ({ page }) => {
    const url = await tenantUrl(page, TENANT_ID, '/contact');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  });

  test('filling and submitting form shows success message', async ({ page }) => {
    await page.locator('[data-testid="contact-name"]').fill('Jane Smith');
    await page.locator('[data-testid="contact-email"]').fill('jane@example.com');
    await page.locator('[data-testid="contact-message"]').fill('Hello from E2E test');
    await page.locator('button[type="submit"]').click();

    const success = page.locator('[data-testid="contact-success"]');
    await expect(success).toBeVisible({ timeout: 10_000 });
    await expect(success).toContainText('Thank you');
  });

  test('success message includes the submitted name and email', async ({ page }) => {
    await page.locator('[data-testid="contact-name"]').fill('John Doe');
    await page.locator('[data-testid="contact-email"]').fill('john@doe.com');
    await page.locator('[data-testid="contact-message"]').fill('Test message');
    await page.locator('button[type="submit"]').click();

    const success = page.locator('[data-testid="contact-success"]');
    await expect(success).toBeVisible({ timeout: 10_000 });
    await expect(success).toContainText('John Doe');
    await expect(success).toContainText('john@doe.com');
  });

  test('form resets after successful submission', async ({ page }) => {
    await page.locator('[data-testid="contact-name"]').fill('Reset Test');
    await page.locator('[data-testid="contact-email"]').fill('reset@test.com');
    await page.locator('[data-testid="contact-message"]').fill('Will be cleared');
    await page.locator('button[type="submit"]').click();

    await page.locator('[data-testid="contact-success"]').waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});

    await expect(page.locator('[data-testid="contact-name"]')).toHaveValue('');
    await expect(page.locator('[data-testid="contact-email"]')).toHaveValue('');
    await expect(page.locator('[data-testid="contact-message"]')).toHaveValue('');
  });

  test('submit button shows "Sending..." while request is in flight', async ({ page }) => {
    await page.locator('[data-testid="contact-name"]').fill('Sending Test');
    await page.locator('[data-testid="contact-email"]').fill('sending@test.com');
    await page.locator('[data-testid="contact-message"]').fill('Check sending state');

    const btn = page.locator('button[type="submit"]');

    // Intercept the API call so we can hold it open and inspect button text mid-flight
    await page.route('**/api/contact', async (route) => {
      // Button should show "Sending..." while the request is pending
      await expect(btn).toHaveText('Sending...');
      // Now let the request through
      await route.continue();
    });

    await btn.click();

    // After response arrives, button reverts to "Send Message"
    await expect(btn).toHaveText('Send Message', { timeout: 10_000 });
  });
});

/* ------------------------------------------------------------------ */

test.describe('Contact Page — Validation', () => {
  test.beforeEach(async ({ page }) => {
    const url = await tenantUrl(page, TENANT_ID, '/contact');
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  });

  test('submitting empty form triggers browser validation', async ({ page }) => {
    const btn = page.locator('button[type="submit"]');
    // Collect potential validation messages before clicking
    const [validationMessage] = await Promise.all([
      page.waitForEvent('pageerror').catch(() => null),
      btn.click(),
    ]);

    // The form should NOT have submitted — success box stays hidden
    await expect(page.locator('[data-testid="contact-success"]')).not.toBeVisible();
  });

  test('invalid email format triggers browser validation', async ({ page }) => {
    await page.locator('[data-testid="contact-name"]').fill('Test User');
    await page.locator('[data-testid="contact-email"]').fill('notanemail');
    await page.locator('[data-testid="contact-message"]').fill('Some message');

    const btn = page.locator('button[type="submit"]');
    await btn.click();

    // Browser rejects invalid email via type="email" — success box stays hidden
    await expect(page.locator('[data-testid="contact-success"]')).not.toBeVisible();
  });
});

/* ------------------------------------------------------------------ */

test.describe('Contact Page — Error Handling', () => {
  test('API failure shows error message', async ({ page }) => {
    const url = await tenantUrl(page, TENANT_ID, '/contact');
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Block the contact API so the submission always fails
    await page.route('**/api/contact', (route) => route.abort());

    await page.locator('[data-testid="contact-name"]').fill('Error Test');
    await page.locator('[data-testid="contact-email"]').fill('error@test.com');
    await page.locator('[data-testid="contact-message"]').fill('This will fail');
    await page.locator('button[type="submit"]').click();

    const success = page.locator('[data-testid="contact-success"]');
    await expect(success).toBeVisible({ timeout: 10_000 });
    await expect(success).toContainText('Sorry');
  });

  test('page loads without critical JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    const url = await tenantUrl(page, TENANT_ID, '/contact');
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Allow the page settle
    await page.waitForTimeout(1_000);

    const criticalErrors = jsErrors.filter(
      (e) =>
        !e.includes('ResizeObserver') &&
        !e.includes('favicon') &&
        !e.includes('net::') &&
        !e.includes('Text content does not match') &&
        !e.includes('hydrat') &&
        !e.includes('Suspense boundary')
    );
    expect(criticalErrors).toHaveLength(0);
  });
});
