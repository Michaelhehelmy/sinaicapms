import { test, expect } from '../../fixtures/coverage-fixture';
import { TEST_TENANT, TEST_CUSTOMER } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

/**
 * Seed localStorage with a realistic reservation so the ReservationSummary
 * React component hydrates with items (instead of the empty state). The
 * component reads `sc_reservation` on mount via useEffect.
 */
async function seedReservation(page: import('@playwright/test').Page) {
  const reservation = [
    {
      roomType: { id: 'e2e-rt-1', name: 'Standard Tent', capacity: 2, basePrice: 80 },
      guests: 2,
      checkIn: '2026-10-01',
      checkOut: '2026-10-03',
      nights: 2,
      price: 160,
      mealPlans: [
        { productId: 'e2e-mp-1', name: 'Half Board', pricePerDay: 50, quantity: 1 },
      ],
    },
  ];
  await page.evaluate((data) => {
    localStorage.setItem('sc_reservation', JSON.stringify(data));
  }, reservation);
}

/* ------------------------------------------------------------------ */

test.describe('ReservationSummary — Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    // Seed reservation data BEFORE the React component reads localStorage
    await seedReservation(page);
    // Reload to trigger the useEffect that reads from localStorage
    await page.reload({ waitUntil: 'domcontentloaded' });
    // Wait for React hydration + data rendering
    await page.locator('button:has-text("Send Booking via WhatsApp")').waitFor({ state: 'visible', timeout: 15_000 });
  });

  test('guest name input is visible and editable', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]').first();
    await expect(nameInput).toBeVisible();
    await nameInput.fill(TEST_CUSTOMER.firstName);
    await expect(nameInput).toHaveValue(TEST_CUSTOMER.firstName);
  });

  test('guest phone input is visible and editable', async ({ page }) => {
    const phoneInput = page.locator('input[type="tel"]').first();
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill(TEST_CUSTOMER.phone);
    await expect(phoneInput).toHaveValue(TEST_CUSTOMER.phone);
  });

  test('WhatsApp button disabled when guest name is empty', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill('');
    const whatsappBtn = page.locator('button:has-text("Send Booking via WhatsApp")');
    await expect(whatsappBtn).toBeDisabled();
  });

  test('WhatsApp button enables after entering guest name', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill(TEST_CUSTOMER.firstName);
    const whatsappBtn = page.locator('button:has-text("Send Booking via WhatsApp")');
    await expect(whatsappBtn).toBeEnabled();
  });

  test('Copy Booking Summary button enables after entering guest name', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill(TEST_CUSTOMER.firstName);
    const copyBtn = page.locator('button:has-text("Copy Booking Summary")');
    await expect(copyBtn).toBeEnabled();
  });

  test('Copy Booking Summary writes reservation text to clipboard', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill(TEST_CUSTOMER.firstName);

    // Grant clipboard permissions and capture what gets written
    let clipboardText = '';
    await page.exposeFunction('__captureClipboard', (text: string) => {
      clipboardText = text;
    });

    // Override navigator.clipboard.writeText to capture the text
    await page.evaluate(() => {
      const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
      (navigator.clipboard as any).writeText = async (text: string) => {
        (window as any).__captureClipboard(text);
        return orig(text);
      };
    });

    const copyBtn = page.locator('button:has-text("Copy Booking Summary")');
    await copyBtn.click();

    // Wait for clipboard capture
    await expect.poll(() => clipboardText.length > 0, { timeout: 5000 }).toBe(true);
    expect(clipboardText).toContain('Standard Tent');
    expect(clipboardText).toContain(TEST_CUSTOMER.firstName);
    expect(clipboardText).toContain('160');
  });

  test('Send Booking via WhatsApp opens wa.me link with reservation data', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill(TEST_CUSTOMER.firstName);

    // Intercept the popup to capture the URL instead of actually opening WhatsApp
    let openedUrl = '';
    await page.exposeFunction('__capturePopup', (url: string) => {
      openedUrl = url;
    });
    await page.evaluate(() => {
      const origOpen = window.open.bind(window);
      (window as any).open = (url: string, target: string) => {
        if (url.includes('wa.me')) {
          (window as any).__capturePopup(url);
          return null;
        }
        return origOpen(url, target);
      };
    });

    const whatsappBtn = page.locator('button:has-text("Send Booking via WhatsApp")');
    await whatsappBtn.click();

    await expect.poll(() => openedUrl.length > 0, { timeout: 5000 }).toBe(true);
    expect(openedUrl).toContain('wa.me');
    // The URL is URL-encoded — decode to check content
    const decoded = decodeURIComponent(openedUrl);
    expect(decoded).toContain('Standard Tent');
    expect(decoded).toContain(TEST_CUSTOMER.firstName);
  });

  test('remove button deletes the room and shows empty state', async ({ page }) => {
    const removeBtn = page.locator('button:has-text("Remove")').first();
    await expect(removeBtn).toBeVisible();
    await removeBtn.click();

    // After removing, the empty state should appear
    const emptyText = page.locator('text=/No rooms in your reservation/');
    await expect(emptyText).toBeVisible({ timeout: 5000 });
  });

  test('Confirm & Pay Online button disabled when guest name is empty', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill('');
    const payBtn = page.locator('button:has-text("Confirm & Pay Online")');
    await expect(payBtn).toBeDisabled();
  });

  test('Confirm & Pay Online button enables when guest name is entered', async ({ page }) => {
    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.fill(TEST_CUSTOMER.firstName);
    const payBtn = page.locator('button:has-text("Confirm & Pay Online")');
    await expect(payBtn).toBeEnabled();
  });

  test('summary page shows room details with meal plan', async ({ page }) => {
    // Room name should be visible
    await expect(page.locator('text=Standard Tent').first()).toBeVisible();
    // Meal plan should be visible
    await expect(page.locator('text=Half Board').first()).toBeVisible();
    // Date details should be visible
    await expect(page.locator('text=2026-10-01').first()).toBeVisible();
    await expect(page.locator('text=2026-10-03').first()).toBeVisible();
  });

  test('summary page shows total amount', async ({ page }) => {
    const totalText = page.locator('text=/Total/i').first();
    await expect(totalText).toBeVisible();
    // Price should be formatted with currency
    await expect(page.locator('text=/160.*EGP/').first()).toBeVisible();
  });

  test('Back to Camp link navigates correctly', async ({ page }) => {
    const backLink = page.locator('a:has-text("Back to Camp")');
    await expect(backLink).toBeVisible();
    const href = await backLink.getAttribute('href');
    expect(href).toContain('/camp/');
  });
});

/* ------------------------------------------------------------------ */

test.describe('ReservationSummary — Empty State', () => {
  test('empty reservation shows empty state message', async ({ page }) => {
    // Clear any existing reservation data
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('sc_reservation'));
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Wait for hydration — the empty state renders after useEffect reads localStorage
    await page.locator('text=/No rooms in your reservation/').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.locator('text=/No rooms in your reservation/')).toBeVisible();
  });

  test('empty state shows hint text', async ({ page }) => {
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('sc_reservation'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('text=/No rooms in your reservation/').waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page.locator('text=/Go back and add rooms/')).toBeVisible();
  });
});

/* ------------------------------------------------------------------ */

test.describe('ReservationSummary — Error Handling', () => {
  test('page loads without critical JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
    await seedReservation(page);
    await page.reload({ waitUntil: 'domcontentloaded' });

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
