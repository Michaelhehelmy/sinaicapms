import { Page } from '@playwright/test';

export class ProductsPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/pos/#products');
  }

  async search(query: string) {
    await this.page.locator('[data-testid="product-search"]').fill(query);
  }

  async getProductCount(): Promise<number> {
    return this.page.locator('[data-testid="product-item"]').count();
  }

  async getProductNames(): Promise<string[]> {
    const items = this.page.locator('[data-testid="product-item"]');
    const count = await items.count();
    const names: string[] = [];
    for (let i = 0; i < count; i++) {
      names.push((await items.nth(i).textContent()) ?? '');
    }
    return names;
  }

  async clickProduct(index: number) {
    await this.page.locator('[data-testid="product-item"]').nth(index).click();
  }
}
