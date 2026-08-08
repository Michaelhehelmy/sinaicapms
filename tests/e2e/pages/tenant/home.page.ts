import { Page, Locator } from '@playwright/test';

export class TenantHomePage {
  constructor(private page: Page) {}

  async goto(tenantId?: string) {
    // Tenant landing lives on the tenant zone root (/?tenant= in local dev;
    // the subdomain host in production). `/camp/{id}` is marketplace-only.
    const url = tenantId ? `/?tenant=${tenantId}` : '/';
    // See rooms.page.ts: tenant pages hang on `load` in astro dev.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async getHeroText(): Promise<string> {
    return (await this.page.locator('[data-testid="hero-banner"]').textContent()) ?? '';
  }

  async getHeroTitle(): Promise<string> {
    return (await this.page.locator('[data-testid="hero-title"]').textContent()) ?? '';
  }

  async getHeroDescription(): Promise<string> {
    return (await this.page.locator('[data-testid="hero-description"]').textContent()) ?? '';
  }

  async getRoomCardCount(): Promise<number> {
    return this.page.locator('[data-testid="rooms-section"] .grid > div').count();
  }

  async clickReservationLink() {
    await this.page.locator('[data-testid="reservation-link"]').click();
  }

  async clickMenuLink() {
    await this.page.locator('[data-testid="menu-link"]').click();
  }

  async hasMap(): Promise<boolean> {
    return this.page.locator('[data-testid="map-section"]').isVisible().catch(() => false);
  }
}
