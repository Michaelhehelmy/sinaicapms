import { Page } from '@playwright/test';
import { tenantUrl } from '../../fixtures/test-data';

export class TenantFaqPage {
  constructor(private page: Page) {}

  async goto(tenantId?: string) {
    // Tenant-zone route: custom-domain origin in production, `?tenant=` locally.
    const url = await tenantUrl(this.page, tenantId ?? '', '/faq');
    // See rooms.page.ts: tenant pages hang on `load` in astro dev.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async getFaqCount(): Promise<number> {
    return this.page.locator('details').count();
  }

  async toggleFaq(index: number) {
    await this.page.locator('details').nth(index).locator('summary').click();
  }

  async getFaqAnswer(index: number): Promise<string> {
    const details = this.page.locator('details').nth(index);
    const divs = details.locator('div');
    const count = await divs.count();
    if (count > 0) {
      return (await divs.last().textContent()) ?? '';
    }
    return '';
  }

  async isAnswerVisible(index: number): Promise<boolean> {
    return this.page.locator('details').nth(index).getAttribute('open') !== null;
  }

  async isEmpty(): Promise<boolean> {
    const text = await this.page.locator('body').textContent() ?? '';
    return text.includes('No FAQs registered');
  }
}
