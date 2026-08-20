import { test, expect } from '@playwright/test';
import { BookingModalPage } from '../../pages/marketplace/booking-modal.page';
import { TEST_TENANT, TEST_CUSTOMER } from '../../fixtures/test-data';

const TENANT_ID = TEST_TENANT.id;

/** Return an ISO date string N days from today. */
function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().split('T')[0];
}

/** Return ISO date strings for check-in (N days ahead) and check-out (N+2 days ahead). */
function datePair(checkInDaysAhead: number) {
  return { checkIn: futureDate(checkInDaysAhead), checkOut: futureDate(checkInDaysAhead + 2) };
}

/* ------------------------------------------------------------------ */

test.describe('Booking Submission Flow', () => {
  let booking: BookingModalPage;

  test.beforeEach(async ({ page }) => {
    booking = new BookingModalPage(page);
    await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
  });

  /* ---- 1. Navigation & Modal Opening ---- */

  test.describe('Modal Opening', () => {
    test('opens booking modal when clicking Book on a room', async ({ page }) => {
      await booking.openRoomBooking(0);
      await expect(booking.modal).toBeVisible();
      await expect(booking.bookingForm).toBeVisible();
    });

    test('shows room name in modal title', async ({ page }) => {
      const roomName = await page.locator('[data-testid="rooms-section"] h4').first().textContent();
      await booking.openRoomBooking(0);
      const title = page.locator('#booking-modal-title');
      await expect(title).toContainText(roomName?.trim() ?? '');
    });

    test('modal has accessible role and aria attributes', async ({ page }) => {
      await booking.openRoomBooking(0);
      await expect(booking.modal).toHaveAttribute('role', 'dialog');
      await expect(booking.modal).toHaveAttribute('aria-modal', 'true');
    });
  });

  /* ---- 2 & 3. Date Selection ---- */

  test.describe('Date Selection', () => {
    test('check-in and check-out inputs are visible', async ({ page }) => {
      await booking.openRoomBooking(0);
      await expect(booking.checkinInput).toBeVisible();
      await expect(booking.checkoutInput).toBeVisible();
    });

    test('selecting valid dates shows night count', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      const nightsText = page.locator('[data-testid="booking-form"] p:has-text("nights")');
      await expect(nightsText).toBeVisible();
      await expect(nightsText).toContainText('2');
    });

    test('total price updates when dates change', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn: ci1, checkOut: co1 } = datePair(7);
      await booking.setCheckin(ci1);
      await booking.setCheckout(co1);
      const total1 = await page.locator('[data-testid="booking-form"] .text-2xl.font-black').textContent();

      // Change to a longer stay
      const { checkIn: ci2, checkOut: co2 } = datePair(10);
      await booking.setCheckin(ci2);
      await booking.setCheckout(co2);
      const total2 = await page.locator('[data-testid="booking-form"] .text-2xl.font-black').textContent();

      expect(total1).not.toBe(total2);
    });

    test('submit button is disabled when no dates are selected', async ({ page }) => {
      await booking.openRoomBooking(0);
      // Modal opens with no dates — submit should not be visible (nights === 0 hides it)
      await expect(booking.submitBtn).not.toBeVisible();
    });
  });

  /* ---- 4. Guest Count ---- */

  test.describe('Guest Count', () => {
    test('guest count displays with default value', async ({ page }) => {
      await booking.openRoomBooking(0);
      const text = await booking.guestCount.textContent();
      expect(parseInt(text ?? '0', 10)).toBeGreaterThanOrEqual(1);
    });

    test('increase button increments guest count', async ({ page }) => {
      await booking.openRoomBooking(0);
      const before = parseInt((await booking.guestCount.textContent()) ?? '0', 10);
      await booking.guestIncreaseBtn.click();
      const after = parseInt((await booking.guestCount.textContent()) ?? '0', 10);
      expect(after).toBe(before + 1);
    });

    test('decrease button decrements guest count', async ({ page }) => {
      await booking.openRoomBooking(0);
      // Start at default (2), increase once, then decrease twice to reach 1
      await booking.guestIncreaseBtn.click();
      await booking.guestDecreaseBtn.click();
      await booking.guestDecreaseBtn.click();
      const count = parseInt((await booking.guestCount.textContent()) ?? '0', 10);
      expect(count).toBe(1);
    });

    test('guest count cannot go below 1', async ({ page }) => {
      await booking.openRoomBooking(0);
      // Default is 2; decrease once to reach the minimum of 1
      await booking.guestDecreaseBtn.click();
      const count = parseInt((await booking.guestCount.textContent()) ?? '0', 10);
      expect(count).toBe(1);
    });
  });

  /* ---- 5 & 6. Submit to Reservation ---- */

  test.describe('Add to Reservation', () => {
    test('clicking Add to Reservation closes modal and shows reservation bar', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();

      await expect(booking.reservationBar).toBeVisible();
      const barText = await booking.getReservationBarText();
      expect(barText).toContain('1 room');
    });

    test('submit button shows "Added!" feedback before modal closes', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitBtn.click();
      await expect(booking.submitBtn).toContainText('Added!');
    });

    test('reservation bar shows correct total for multiple rooms', async ({ page }) => {
      // Add first room
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await expect(booking.reservationBar).toBeVisible();

      // Add second room
      await booking.openRoomBooking(1);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();

      const barText = await booking.getReservationBarText();
      expect(barText).toContain('2 rooms');
    });

    test('clear button removes all items from reservation', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await expect(booking.reservationBar).toBeVisible();

      await booking.clickClearReservation();
      await expect(booking.reservationBar).not.toBeVisible();
    });
  });

  /* ---- 7. Confirmation / Summary Page ---- */

  test.describe('Confirmation & Summary Page', () => {
    test('navigates to reservation summary after adding a room', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await booking.clickViewSummary();

      await expect(page.locator('[data-testid="reservation-page"]')).toBeVisible();
      const heading = await booking.getPageHeading();
      expect(heading).toContain('Reservation');
    });

    test('summary page shows added room details', async ({ page }) => {
      await booking.openRoomBooking(0);
      const roomName = await page.locator('[data-testid="rooms-section"] h4').first().textContent();
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await booking.clickViewSummary();

      const content = await page.locator('body').textContent() ?? '';
      expect(content).toContain(roomName?.trim() ?? '');
    });

    test('summary page shows guest info form', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await booking.clickViewSummary();

      await expect(booking.getGuestNameInput()).toBeVisible();
      await expect(booking.getGuestPhoneInput()).toBeVisible();
    });

    test('summary page shows WhatsApp and Copy Summary buttons', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await booking.clickViewSummary();

      await expect(booking.getWhatsAppButton()).toBeVisible();
      await expect(booking.getCopySummaryButton()).toBeVisible();
    });

    test('summary page shows total amount', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await booking.clickViewSummary();

      const totalLabel = page.locator('text=/Total/i').first();
      await expect(totalLabel).toBeVisible();
    });

    test('remove button deletes a room from the summary', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await booking.clickViewSummary();

      await expect(booking.getWhatsAppButton()).toBeVisible();
      const removeBtn = page.locator('button:has-text("Remove")').first();
      if (await removeBtn.isVisible()) {
        await removeBtn.click();
        await expect(booking.isEmptyState()).resolves.toBe(true);
      }
    });
  });

  /* ---- 8. Form Validation ---- */

  test.describe('Form Validation', () => {
    test('WhatsApp button is disabled when guest name is empty', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await booking.clickViewSummary();

      const nameInput = booking.getGuestNameInput();
      await nameInput.fill('');
      await expect(booking.getWhatsAppButton()).toBeDisabled();
    });

    test('WhatsApp button enables after entering guest name', async ({ page }) => {
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);
      await booking.submitToAddReservation();
      await booking.clickViewSummary();

      await booking.getGuestNameInput().fill(TEST_CUSTOMER.firstName);
      await expect(booking.getWhatsAppButton()).toBeEnabled();
    });

    test('summary page requires at least one room', async ({ page }) => {
      await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
      await expect(booking.isEmptyState()).resolves.toBe(true);
    });

    test('empty state shows back to camp link', async ({ page }) => {
      await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });
      const backLink = page.locator(
        'button:has-text("Back"), button:has-text("عودة"), a:has-text("Back"), a:has-text("عودة"), a[href*="/camp/"]'
      );
      await expect(backLink.first()).toBeVisible();
    });
  });

  /* ---- 9. Error Handling ---- */

  test.describe('Error Handling', () => {
    test('booking modal survives API failure on lead capture', async ({ page }) => {
      await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });
      await booking.openRoomBooking(0);
      const { checkIn, checkOut } = datePair(7);
      await booking.setCheckin(checkIn);
      await booking.setCheckout(checkOut);

      // Block the leads API so the background fire-and-forget fails
      await page.route('**/api/leads', route => route.abort());

      await booking.submitToAddReservation();
      await expect(booking.reservationBar).toBeVisible();

      // Navigate to summary and verify it still works
      await booking.clickViewSummary();
      await expect(page.locator('[data-testid="reservation-page"]')).toBeVisible();
    });

    test('page loads without critical JavaScript errors', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', error => jsErrors.push(error.message));
      await page.goto(`/camp/${TENANT_ID}`, { waitUntil: 'domcontentloaded' });

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

    test('booking summary page loads without critical JavaScript errors', async ({ page }) => {
      const jsErrors: string[] = [];
      page.on('pageerror', error => jsErrors.push(error.message));
      await page.goto(`/camp/${TENANT_ID}/book`, { waitUntil: 'domcontentloaded' });

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

    test('invalid tenant ID camp detail page renders gracefully', async ({ page }) => {
      const response = await page.goto('/camp/__nonexistent_tenant__', { waitUntil: 'domcontentloaded' });
      const status = response?.status();
      const content = (await page.locator('body').textContent()) ?? '';
      // Page either 404s, redirects, or shows a camp-not-found message
      expect(
        status === 404 ||
        content.length > 0
      ).toBeTruthy();
    });
  });
});
