import { Page } from '@playwright/test';

export class TenantAboutPage {
  constructor(private page: Page) {}

  async goto(tenantId?: string) {
    const url = tenantId ? `/about?tenant=${tenantId}` : '/about';
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
