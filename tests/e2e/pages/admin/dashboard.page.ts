import { Page } from '@playwright/test';

export class AdminDashboardPage {
  constructor(private page: Page) {}

  async goto(tenantId = 'marketplace') {
    await this.page.goto(`/admin?tenant=${tenantId}`);
  }

  async isLoginOverlayVisible(): Promise<boolean> {
    return this.page.locator('[data-testid="login-overlay"]').isVisible();
  }

  async login(email: string, password: string) {
    await this.page.locator('[data-testid="login-email"]').fill(email);
    await this.page.locator('[data-testid="login-password"]').fill(password);
    await this.page.locator('[data-testid="login-submit"]').click();
  }

  async isDashboardLoaded(): Promise<boolean> {
    return this.page.locator('[data-testid="content-area"]').isVisible();
  }

  async clickTab(tabName: string) {
    await this.page.locator(`[data-testid="nav-tab-${tabName}"]`).click();
  }

  async clickLogout() {
    await this.page.locator('[data-testid="logout-btn"]').click();
  }

  async getSidebarTabs(): Promise<string[]> {
    const buttons = this.page.locator('[data-testid="sidebar-nav"] button[data-testid^="nav-tab-"]');
    const count = await buttons.count();
    const tabs: string[] = [];
    for (let i = 0; i < count; i++) {
      const testId = await buttons.nth(i).getAttribute('data-testid');
      if (testId) {
        tabs.push(testId.replace('nav-tab-', ''));
      }
    }
    return tabs;
  }

  async isSuperAdminMode(): Promise<boolean> {
    return this.page.locator('text=Global Operator Mode').isVisible();
  }

  async getContentArea(): Promise<string> {
    return (await this.page.locator('[data-testid="content-area"]').textContent()) ?? '';
  }

  async clickMobileToggle() {
    await this.page.locator('[data-testid="mobile-toggle"]').click();
  }
}
