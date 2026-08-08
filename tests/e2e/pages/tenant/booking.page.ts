import { Page } from '@playwright/test';

export class TenantBookingPage {
  constructor(private page: Page) {}

  async goto(tenantId?: string) {
    const url = tenantId ? `/camp/${tenantId}/book` : '/book';
    await this.page.goto(url);
  }

  async getTitle(): Promise<string> {
    return (await this.page.locator('h1').textContent()) ?? '';
  }

  async getGuestNameInput() {
    return this.page.locator('input[type="text"]').first();
  }

  async getPhoneInput() {
    return this.page.locator('input[type="tel"]').first();
  }

  async clickWhatsApp() {
    await this.page.locator('button:has-text("WhatsApp"), button:has-text("واتساب")').first().click();
  }

  async clickCopySummary() {
    await this.page.locator('button:has-text("Copy"), button:has-text("نسخ")').first().click();
  }

  async isEmpty(): Promise<boolean> {
    const text = await this.page.locator('body').textContent() ?? '';
    return text.includes('No rooms in your reservation') || text.includes('لا توجد غرف في حجزك');
  }

  async hasBackLink(): Promise<boolean> {
    return this.page.locator('a:has-text("Back"), a:has-text("عودة")').isVisible().catch(() => false);
  }
}
