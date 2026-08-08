import { Page } from '@playwright/test';

export class CampDetailPage {
  constructor(private page: Page) {}

  async goto(campId: string) {
    await this.page.goto(`/camp/${campId}`);
  }

  async getBannerTitle(): Promise<string> {
    return (await this.page.locator('[data-testid="hero-title"]').textContent()) ?? '';
  }

  async getAboutText(): Promise<string> {
    return (await this.page.locator('[data-testid="about-description"]').textContent()) ?? '';
  }

  async getRoomCount(): Promise<number> {
    // Room cards are rendered by CampBooking React component inside the rooms section.
    // Each room is a Card component — find them by the h4 name inside CardBody.
    return this.page.locator('[data-testid="rooms-section"] h4').count();
  }

  async getRoomName(index: number): Promise<string> {
    return (await this.page.locator('[data-testid="rooms-section"] h4').nth(index).textContent()) ?? '';
  }

  async getRoomPrice(index: number): Promise<string> {
    const priceSpan = this.page.locator('[data-testid="rooms-section"] .text-2xl').nth(index);
    return (await priceSpan.textContent()) ?? '';
  }

  async getReviewCount(): Promise<number> {
    // Review cards are rendered inline in the reviews section grid
    const section = this.page.locator('[data-testid="reviews-section"]');
    if (!(await section.isVisible().catch(() => false))) return 0;
    return section.locator('p.italic, p[class*="italic"]').count();
  }

  async clickVisitPortal() {
    await this.page.locator('[data-testid="reservation-link"]').click();
  }

  async clickBack() {
    await this.page.locator('[data-testid="back-to-marketplace"]').click();
  }

  async hasMap(): Promise<boolean> {
    return this.page.locator('[data-testid="map-section"]').isVisible().catch(() => false);
  }
}
