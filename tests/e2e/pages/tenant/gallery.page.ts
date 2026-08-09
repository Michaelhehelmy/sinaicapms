import { Page } from '@playwright/test';
import { tenantUrl } from '../../fixtures/test-data';

export class TenantGalleryPage {
  constructor(private page: Page) {}

  async goto(tenantId?: string) {
    // Tenant-zone route: custom-domain origin in production, `?tenant=` locally.
    const url = await tenantUrl(this.page, tenantId ?? '', '/gallery');
    // See rooms.page.ts: tenant pages hang on `load` in astro dev.
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async getImageCount(): Promise<number> {
    return this.page.locator('[aria-label^="View photo"]').count();
  }

  async clickImage(index: number) {
    // Wait for the lightbox script to define the openLightbox function
    await this.page.waitForFunction(() => typeof (window as any).openLightbox === 'function', { timeout: 5000 }).catch(() => {});
    await this.page.locator('[aria-label^="View photo"]').nth(index).click();
    // Wait for lightbox to appear
    await this.page.locator('#lightboxModal').waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  }

  async isLightboxOpen(): Promise<boolean> {
    const modal = this.page.locator('#lightboxModal');
    const display = await modal.evaluate((el) => (el as HTMLElement).style.display);
    return display === 'flex';
  }

  async closeLightbox() {
    await this.page.locator('#lightboxModal button[aria-label="Close lightbox"]').click();
  }

  async isEmpty(): Promise<boolean> {
    const text = await this.page.locator('body').textContent() ?? '';
    return text.includes('No gallery photos uploaded');
  }
}
