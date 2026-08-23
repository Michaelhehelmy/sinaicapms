import { Page } from '@playwright/test';

export class AdminDashboardPage {
  constructor(private page: Page) {}

  async goto(tenantId = 'marketplace') {
    await this.page.goto(`/admin?tenant=${tenantId}`, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Navigate to a specific admin panel via its canonical path (/admin/<tab>).
   * Phase 7: AdminApp resolves path deep links on mount through the pushState
   * kernel; legacy `#tab=` hashes are still honored (see navigation.spec.ts)
   * during the migration window.
   */
  async gotoTab(tenantId = 'marketplace', tabName = 'dashboard') {
    await this.page.goto(`/admin/${tabName}?tenant=${tenantId}`, { waitUntil: 'domcontentloaded' });
  }

  async isLoginOverlayVisible(): Promise<boolean> {
    return this.page.locator('[data-testid="login-overlay"]').isVisible();
  }

  async login(email: string, password: string) {
    await this.page.locator('[data-testid="login-email"]').fill(email);
    await this.page.locator('[data-testid="login-password"]').fill(password);
    await this.page.locator('[data-testid="login-submit"]').click();
    // Wait for login overlay to disappear (login succeeded) before returning.
    // Without this, concurrent tests can race against the backend response and
    // expectPanelReady times out on content-area that never appears.
    await this.page.locator('[data-testid="login-overlay"]').waitFor({ state: 'hidden', timeout: 15_000 });
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
