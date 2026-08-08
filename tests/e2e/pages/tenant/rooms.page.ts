import { Page } from '@playwright/test';

export class TenantRoomsPage {
  constructor(private page: Page) {}

  async goto(tenantId?: string) {
    const url = tenantId ? `/rooms?tenant=${tenantId}` : '/rooms';
    // Tenant pages hang on `load` in astro dev (logo/favicon point at dead
    // localhost:8001) — use domcontentloaded and let assertions auto-wait.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async getRoomCount(): Promise<number> {
    return this.page.locator('article').count();
  }

  async getRoomName(index: number): Promise<string> {
    return (await this.page.locator('article').nth(index).locator('h2').textContent()) ?? '';
  }

  async getRoomDescription(index: number): Promise<string> {
    const article = this.page.locator('article').nth(index);
    const paragraphs = article.locator('p');
    const count = await paragraphs.count();
    if (count > 0) {
      return (await paragraphs.first().textContent()) ?? '';
    }
    return '';
  }

  async clickBookRoom(index: number) {
    await this.page.locator('article').nth(index).locator('a:has-text("Check Availability")').click();
  }

  async isEmpty(): Promise<boolean> {
    const text = await this.page.locator('body').textContent() ?? '';
    return text.includes('No accommodation types registered');
  }
}
