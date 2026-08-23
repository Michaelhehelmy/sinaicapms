import { Page } from '@playwright/test';

export class MarketplaceHomePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await this.page.waitForLoadState('networkidle');
  }

  async isHeroVisible(): Promise<boolean> {
    return this.page.locator('[data-testid="hero-banner"]').isVisible();
  }

  async getCampCount(): Promise<number> {
    return this.page.locator('[data-testid="camps-grid"] [data-testid="camp-card"]').count();
  }

  async getCampName(index: number): Promise<string> {
    return (await this.page.locator('[data-testid="camp-card"]').nth(index).locator('[data-testid="camp-name"]').textContent()) ?? '';
  }

  async clickExploreCamp(index: number) {
    await this.page.locator('[data-testid="camp-card"]').nth(index).locator('[data-testid="explore-camp-link"]').click();
  }

  async searchCamps(query: string) {
    await this.page.locator('[data-testid="search-input"]').fill(query);
  }

  async filterByLocation(location: string) {
    await this.page.locator('[data-testid="location-filter"]').selectOption(location);
  }

  async filterByCapacity(capacity: string) {
    await this.page.locator('[data-testid="capacity-filter"]').selectOption(capacity);
  }

  async filterByActivity(activity: string) {
    await this.page.locator('[data-testid="activity-filter"]').selectOption(activity);
  }

  async applyFilters() {
    await this.page.locator('[data-testid="search-submit"]').click();
  }

  async fillOnboardingForm(data: {
    name: string;
    subdomain: string;
    color: string;
    location: string;
    activities: string;
    desc: string;
  }) {
    await this.page.locator('#tenantName').fill(data.name);
    await this.page.locator('#tenantSubdomain').fill(data.subdomain);
    await this.page.locator('#tenantColor').fill(data.color);
    await this.page.locator('#tenantLocation').fill(data.location);
    await this.page.locator('#tenantActivities').fill(data.activities);
    await this.page.locator('#tenantDesc').fill(data.desc);
  }

  async submitOnboarding() {
    await this.page.locator('[data-testid="onboarding-form"] button[type="submit"]').click();
  }

  async waitForCampsLoad() {
    await this.page.locator('[data-testid="camps-grid"] [data-testid="camp-card"]').first().waitFor();
  }
}
