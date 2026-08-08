import { Page } from '@playwright/test';

export class TenantContactPage {
  constructor(private page: Page) {}

  async goto(tenantId?: string) {
    const url = tenantId ? `/contact?tenant=${tenantId}` : '/contact';
    // See rooms.page.ts: tenant pages hang on `load` in astro dev.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async fillName(value: string) {
    await this.page.fill('#cName', value);
  }

  async fillEmail(value: string) {
    await this.page.fill('#cEmail', value);
  }

  async fillMessage(value: string) {
    await this.page.fill('#cMessage', value);
  }

  async submit() {
    await this.page.locator('button[type="submit"]').click();
  }

  async fillAll({ name, email, message }: { name: string; email: string; message: string }) {
    await this.fillName(name);
    await this.fillEmail(email);
    await this.fillMessage(message);
  }

  async getContactInfoBlocks(): Promise<number> {
    const text = await this.page.locator('body').textContent() ?? '';
    let count = 0;
    if (text.includes('Address') || text.includes('العنوان')) count++;
    if (text.includes('Phone') || text.includes('الهاتف')) count++;
    if (text.includes('Email') || text.includes('البريد')) count++;
    return count;
  }
}
