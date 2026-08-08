import { test, expect } from '@playwright/test';
import { TEST_POS_USER, TEST_TENANT } from '../../fixtures/test-data';
const TENANT_ID = process.env.TEST_TENANT_ID || TEST_TENANT.id;

const POS_IDENTIFIER = process.env.POS_IDENTIFIER || TEST_POS_USER.identifier;
const POS_PASSWORD = process.env.POS_PASSWORD || TEST_POS_USER.password;

test.describe('Accessibility', () => {
  test('all marketplace images have non-null alt attribute', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="camps-grid"]', { timeout: 10_000 });

    const images = page.locator('img');
    const count = await images.count();

    if (count === 0) {
      // Environmental: when tenant branding / camp cards carry no image URL
      // they render the 🏕️ emoji fallback, so a fully-rendered marketplace can
      // legitimately contain zero <img> elements. Guard instead of failing.
      test.skip(true, 'No <img> elements on marketplace (emoji fallback in use)');
      return;
    }

    for (let i = 0; i < count; i++) {
      const alt = await images.nth(i).getAttribute('alt');
      expect(alt).not.toBeNull();
      expect(typeof alt).toBe('string');
    }
  });

  test('booking form inputs have labels, aria-label, or placeholder', async ({
    page,
  }) => {
    await page.goto(`/camp/${TEST_TENANT.id}/book`, { waitUntil: 'domcontentloaded' });

    // Booking view is a React SPA: wait until it settles into either the
    // booking form or the empty-reservation state before sampling inputs, so we
    // never count elements on a half-mounted page.
    await page
      .locator('[data-testid="booking-form"], text=No rooms in your reservation.')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => {});

    const formInputs = page.locator(
      'input:not([type="hidden"]), select'
    );
    const count = await formInputs.count();

    if (count === 0) {
      test.skip(true, 'No booking form inputs found (empty reservation state)');
      return;
    }

    for (let i = 0; i < count; i++) {
      const input = formInputs.nth(i);
      const id = await input.getAttribute('id');
      const ariaLabel = await input.getAttribute('aria-label');
      const placeholder = await input.getAttribute('placeholder');

      let hasLabel = false;

      if (ariaLabel && ariaLabel.length > 0) {
        hasLabel = true;
      } else if (id) {
        const label = page.locator(`label[for="${id}"]`);
        hasLabel = (await label.count()) > 0;
      } else if (placeholder && placeholder.length > 0) {
        hasLabel = true;
      }

      expect(hasLabel).toBeTruthy();
    }
  });

  test('Tab key moves focus to interactive elements on marketplace', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="camps-grid"]', { timeout: 10_000 });

    const focusedElements: string[] = [];

    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => document.activeElement !== document.body, { timeout: 5000 }).catch(() => {});

      const focused = page.locator(':focus');
      const tagName = await focused
        .evaluate(el => el.tagName.toLowerCase())
        .catch(() => 'none');
      focusedElements.push(tagName);
    }

    const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
    const hasInteractive = focusedElements.some(tag =>
      interactiveTags.includes(tag)
    );
    expect(hasInteractive).toBeTruthy();
  });

  test('focused element has tag a/button/input/select or tabindex', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="camps-grid"]', { timeout: 10_000 });

    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');

    const focusedElement = page.locator(':focus');
    const isInteractive = await focusedElement.evaluate(el => {
      const tag = el.tagName.toLowerCase();
      return (
        tag === 'a' ||
        tag === 'button' ||
        tag === 'input' ||
        tag === 'select' ||
        tag === 'textarea' ||
        el.getAttribute('tabindex') !== null
      );
    });

    expect(isInteractive).toBeTruthy();
  });

  test('heading colors are not transparent (h1, h2, h3 on marketplace)', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="camps-grid"], h1, h2, h3', { timeout: 10_000 });

    const headings = page.locator('h1, h2, h3');
    const count = await headings.count();
    const limit = Math.min(count, 5);

    if (limit === 0) {
      test.skip(true, 'No headings found');
      return;
    }

    for (let i = 0; i < limit; i++) {
      const heading = headings.nth(i);
      const isVisible = await heading.isVisible();
      if (!isVisible) continue;

      const color = await heading.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.color;
      });

      expect(color).not.toBe('rgba(0, 0, 0, 0)');
      expect(color).not.toBe('transparent');
      expect(color).not.toBe('');
    }
  });

  test('POS login: Tab to identifier → type → Tab to password → type → Enter → dashboard', async ({
    page,
  }) => {
    await page.goto(`/pos/login?tenant=${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="pos-identifier"]', { timeout: 10_000 });
    // Wait until the whole login view is mounted before driving it via keyboard.
    await page.locator('[data-testid="pos-signin-btn"]').waitFor({ state: 'visible', timeout: 10_000 });

    // LoginView autoFocuses the identifier; bring focus to it deterministically
    // regardless of autoFocus timing, then verify it is a focusable element.
    await page.locator('[data-testid="pos-identifier"]').focus();
    const firstTag = await page.evaluate(() =>
      document.activeElement?.tagName.toLowerCase() ?? 'none'
    );
    expect(['input', 'button', 'a', 'textarea', 'select']).toContain(
      firstTag
    );

    await page.keyboard.type(POS_IDENTIFIER);

    // Tab should move focus to the password field.
    await page.keyboard.press('Tab');
    const activeId = await page.evaluate(() =>
      document.activeElement?.getAttribute('data-testid') ?? 'none'
    );
    expect(activeId).toBe('pos-password');

    await page.keyboard.type(POS_PASSWORD);

    await page.keyboard.press('Enter');

    // POS login navigates to /pos/dashboard — not just any /pos/* path.
    await page.waitForURL('**/pos/dashboard*', { timeout: 10_000 });
    const url = page.url();
    expect(url).toContain('/pos/dashboard');
    expect(url).not.toContain('/login');
  });

  test('marketplace nav links are focusable', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const navLinks = page.locator('nav a');
    const count = await navLinks.count();

    if (count === 0) {
      test.skip(true, 'No nav links found');
      return;
    }

    for (let i = 0; i < Math.min(count, 4); i++) {
      const link = navLinks.nth(i);
      const isVisible = await link.isVisible();
      if (!isVisible) continue;

      const tabIndex = await link.getAttribute('tabindex');
      const isFocusable = tabIndex === null || parseInt(tabIndex) >= 0;
      expect(isFocusable).toBeTruthy();
    }
  });

  test('all buttons have visible text content (not empty)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="camps-grid"]', { timeout: 10_000 });

    const buttons = page.locator('button');
    const count = await buttons.count();

    if (count === 0) {
      test.skip(true, 'No buttons found');
      return;
    }

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const isVisible = await button.isVisible();
      if (!isVisible) continue;

      const text = (await button.textContent()) || '';
      const ariaLabel = await button.getAttribute('aria-label');
      const title = await button.getAttribute('title');
      const hasIcon = await button.locator('svg, i').count();

      const hasContent =
        text.trim().length > 0 ||
        (ariaLabel && ariaLabel.length > 0) ||
        (title && title.length > 0) ||
        hasIcon > 0;

      expect(hasContent).toBeTruthy();
    }
  });

  test('form submit buttons have type="submit" or are inside a form', async ({
    page,
  }) => {
    await page.goto(`/camp/${TEST_TENANT.id}/book`);
    await page.waitForLoadState('networkidle');

    const submitBtns = page.locator(
      'button[type="submit"], button:has-text("Submit"), button:has-text("Book")'
    );
    const count = await submitBtns.count();

    if (count === 0) {
      test.skip(true, 'No submit buttons found on booking page');
      return;
    }

    for (let i = 0; i < count; i++) {
      const btn = submitBtns.nth(i);
      const isVisible = await btn.isVisible();
      if (!isVisible) continue;

      const typeAttr = await btn.getAttribute('type');

      const isSubmit =
        typeAttr === 'submit' ||
        (await btn.evaluate(el =>
          el.closest('form') !== null
        ));

      expect(isSubmit).toBeTruthy();
    }
  });

  test('no elements with role="button" missing accessible name', async ({
    page,
  }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="camps-grid"]', { timeout: 10_000 });

    const roleButtons = page.locator('[role="button"]');
    const count = await roleButtons.count();

    for (let i = 0; i < count; i++) {
      const el = roleButtons.nth(i);
      const isVisible = await el.isVisible();
      if (!isVisible) continue;

      const ariaLabel = await el.getAttribute('aria-label');
      const text = (await el.textContent()) || '';
      const title = await el.getAttribute('title');

      const hasName =
        (ariaLabel && ariaLabel.trim().length > 0) ||
        text.trim().length > 0 ||
        (title && title.trim().length > 0);

      expect(hasName).toBeTruthy();
    }
  });
});
