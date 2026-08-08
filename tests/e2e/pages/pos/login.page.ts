import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/pos/login');
  }

  async fillIdentifier(value: string) {
    await this.page.locator('[data-testid="pos-identifier"]').fill(value);
  }

  async fillPassword(value: string) {
    await this.page.locator('[data-testid="pos-password"]').fill(value);
  }

  async submit() {
    await this.page.locator('[data-testid="pos-signin-btn"]').click();
  }

  async login(identifier: string, password: string) {
    await this.fillIdentifier(identifier);
    await this.fillPassword(password);
    await this.submit();
  }

  async waitForDashboard() {
    await this.page.locator('[data-testid="pos-dashboard"], [data-testid="shift-overlay"]')
      .waitFor({ state: 'visible', timeout: 10000 });
  }

  async getErrorMessage(): Promise<string> {
    const el = this.page.locator('[data-testid="pos-login-error"]');
    await el.waitFor({ state: 'visible', timeout: 5000 });
    return (await el.textContent()) ?? '';
  }

  async isLoginPage(): Promise<boolean> {
    return this.page.locator('[data-testid="pos-login"]').isVisible();
  }
}
