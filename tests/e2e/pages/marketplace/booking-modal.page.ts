import { Page, Locator } from '@playwright/test';

/**
 * Page object for the CampBooking modal and ReservationSummary flow.
 *
 * Covers:
 *  - Opening the modal from a room card
 *  - Filling dates, guest count, submitting to reservation
 *  - The floating reservation bar
 *  - Guest info form on the summary page
 *  - WhatsApp / copy-summary submission buttons
 */
export class BookingModalPage {
  readonly page: Page;
  readonly modal: Locator;
  readonly bookingForm: Locator;
  readonly checkinInput: Locator;
  readonly checkoutInput: Locator;
  readonly guestCount: Locator;
  readonly guestIncreaseBtn: Locator;
  readonly guestDecreaseBtn: Locator;
  readonly submitBtn: Locator;
  readonly reservationBar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.locator('[role="dialog"][aria-modal="true"]');
    this.bookingForm = page.locator('[data-testid="booking-form"]');
    this.checkinInput = page.locator('[data-testid="checkin-date"]');
    this.checkoutInput = page.locator('[data-testid="checkout-date"]');
    this.guestCount = page.locator('[data-testid="guest-count"]');
    this.guestIncreaseBtn = page.getByRole('button', { name: 'Increase guests' });
    this.guestDecreaseBtn = page.getByRole('button', { name: 'Decrease guests' });
    this.submitBtn = page.locator('[data-testid="whatsapp-submit"]');
    this.reservationBar = page.locator('[data-testid="reservation-bar"]');
  }

  async openRoomBooking(roomIndex = 0) {
    const bookBtn = this.page.locator('[data-testid="rooms-section"] button:has-text("Book")').nth(roomIndex);
    await bookBtn.click();
    await this.modal.waitFor({ state: 'visible', timeout: 5_000 });
  }

  async setCheckin(date: string) {
    await this.checkinInput.fill(date);
  }

  async setCheckout(date: string) {
    await this.checkoutInput.fill(date);
  }

  async setGuests(count: number) {
    // Reset to 1 by clicking decrease as many times as possible, then increase.
    // The default is 2, so we decrease first to 1, then increase to target.
    const currentText = await this.guestCount.textContent();
    const current = parseInt(currentText ?? '2', 10);
    const diff = count - current;
    if (diff > 0) {
      for (let i = 0; i < diff; i++) await this.guestIncreaseBtn.click();
    } else if (diff < 0) {
      for (let i = 0; i < Math.abs(diff); i++) await this.guestDecreaseBtn.click();
    }
  }

  async submitToAddReservation() {
    await this.submitBtn.click();
    // After clicking, the button text changes to "Added!" — wait for it.
    await this.page.locator('[data-testid="whatsapp-submit"]:has-text("Added!")').waitFor({ state: 'visible', timeout: 3_000 });
    // Modal auto-closes after 800ms — wait for it to disappear.
    await this.modal.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
  }

  async isModalVisible(): Promise<boolean> {
    return this.modal.isVisible().catch(() => false);
  }

  async isSubmitDisabled(): Promise<boolean> {
    return this.submitBtn.isDisabled();
  }

  async isReservationBarVisible(): Promise<boolean> {
    return this.reservationBar.isVisible().catch(() => false);
  }

  async getReservationBarText(): Promise<string> {
    return (await this.reservationBar.textContent()) ?? '';
  }

  async clickViewSummary() {
    await this.reservationBar.locator('a:has-text("View Summary")').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async clickClearReservation() {
    await this.reservationBar.locator('button:has-text("Clear")').click();
  }

  /* ---- ReservationSummary (book) page helpers ---- */

  getGuestNameInput(): Locator {
    return this.page.locator('input[type="text"]').first();
  }

  getGuestPhoneInput(): Locator {
    return this.page.locator('input[type="tel"]').first();
  }

  getWhatsAppButton(): Locator {
    return this.page.locator('button:has-text("Send Booking via WhatsApp")');
  }

  getCopySummaryButton(): Locator {
    return this.page.locator('button:has-text("Copy Booking Summary")');
  }

  async isWhatsAppDisabled(): Promise<boolean> {
    return this.getWhatsAppButton().isDisabled();
  }

  async isEmptyState(): Promise<boolean> {
    const text = await this.page.locator('body').textContent() ?? '';
    return text.includes('No rooms in your reservation') || text.includes('لا توجد غرف في حجزك');
  }

  async getPageHeading(): Promise<string> {
    return (await this.page.locator('h1').first().textContent()) ?? '';
  }
}
