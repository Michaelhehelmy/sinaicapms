import { Page } from '@playwright/test';

export class OrdersPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/pos/#orders');
  }

  async getOrderCount(): Promise<number> {
    return this.page.locator('[data-testid="orders-table"] tbody tr').count();
  }

  async getOrderNumbers(): Promise<string[]> {
    const rows = this.page.locator('[data-testid="orders-table"] tbody tr');
    const count = await rows.count();
    const numbers: string[] = [];
    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator('td');
      numbers.push((await cells.first().textContent()) ?? '');
    }
    return numbers;
  }

  async getOrderStatuses(): Promise<string[]> {
    const badges = this.page.locator('[data-testid="order-status"]');
    const count = await badges.count();
    const statuses: string[] = [];
    for (let i = 0; i < count; i++) {
      statuses.push((await badges.nth(i).textContent()) ?? '');
    }
    return statuses;
  }
}
