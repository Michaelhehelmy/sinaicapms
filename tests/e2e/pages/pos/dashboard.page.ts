import { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/pos/dashboard', { waitUntil: 'domcontentloaded' });
  }

  async getRevenue(): Promise<string> {
    return (await this.page.locator('[data-testid="stat-revenue"]').textContent()) ?? '';
  }

  async getOrdersCount(): Promise<string> {
    return (await this.page.locator('[data-testid="stat-orders"]').textContent()) ?? '';
  }

  async getLowStockCount(): Promise<string> {
    return (await this.page.locator('[data-testid="stat-low-stock"]').textContent()) ?? '';
  }

  async getRecentOrders() {
    return this.page.locator('[data-testid="recent-orders"] tbody tr').all();
  }

  async isLoaded(): Promise<boolean> {
    return this.page.locator('[data-testid="pos-dashboard"]').isVisible();
  }
}
