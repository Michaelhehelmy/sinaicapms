import { Page } from '@playwright/test';
import { tenantUrl } from '../../fixtures/test-data';

export class TenantAboutPage {
  constructor(private page: Page) {}

  async goto(tenantId?: string) {
    // Tenant-zone route: custom-domain origin in production, `?tenant=` locally.
    const url = await tenantUrl(this.page, tenantId ?? '', '/about');
    // See rooms.page.ts: tenant pages hang on `load` in astro dev.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async getStoryText(): Promise<string> {
    const storySection = this.page.locator('h2:has-text("Our Story")').locator('..');
    return (await storySection.textContent()) ?? '';
  }

  async getFeatureCards(): Promise<number> {
    return this.page.locator('h4').count();
  }

  async getFeatureTitle(index: number): Promise<string> {
    return (await this.page.locator('h4').nth(index).textContent()) ?? '';
  }
}
