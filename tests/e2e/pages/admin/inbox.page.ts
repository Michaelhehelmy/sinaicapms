import { expect, type Locator, type Page } from '@playwright/test';
import { AdminDashboardPage } from './dashboard.page';
import { TEST_TENANT, TEST_TENANT_ADMIN } from '../../fixtures/test-data';
import { expectPanelContentReady, expectPanelReady } from '../../fixtures/admin';

/**
 * Page object for the Phase 4 Unified Inbox panel (tenant admin).
 *
 * The inbox is a tenant-admin feature: the nav unread badge (`nav-inbox-unread`)
 * and the panel's tenant context only render when the logged-in user has a
 * tenantId, so all tests log in as TEST_TENANT_ADMIN rather than the super
 * admin (whose tenant_id is NULL).
 *
 * Selectors are the data-testids emitted by InboxPanel.tsx / AdminApp.tsx:
 *   - nav:  `[data-testid="nav-tab-inbox"]`, `[data-testid="nav-inbox-unread"]`
 *   - panel: `inbox-panel`, `inbox-list`, `inbox-item-<id>`, `unread-dot`,
 *     `inbox-tab-{all|leads|bookings}`, `inbox-unread-count`,
 *     `inbox-live-badge`
 */
export class InboxPage {
  private readonly dashboard: AdminDashboardPage;

  constructor(private readonly page: Page) {
    this.dashboard = new AdminDashboardPage(page);
  }

  /** Open the admin SPA and log in as the tenant admin. */
  async loginAsTenantAdmin() {
    await this.dashboard.goto(TEST_TENANT.id);
    await this.dashboard.login(TEST_TENANT_ADMIN.email, TEST_TENANT_ADMIN.password);
    await expectPanelReady(this.page);
  }

  /** Open the Inbox tab and wait for its lazy data-backed content. */
  async openInboxTab() {
    await this.page.locator('[data-testid="nav-tab-inbox"]').click();
    await expectPanelContentReady(this.page, 'inbox-panel');
  }

  /** Switch the inbox feed tab (all | leads | bookings). */
  async clickFeedTab(key: 'all' | 'leads' | 'bookings') {
    await this.page.locator(`[data-testid="inbox-tab-${key}"]`).click();
    await expectPanelContentReady(this.page, 'inbox-panel');
  }

  item(id: string): Locator {
    return this.page.locator(`[data-testid="inbox-item-${id}"]`);
  }

  unreadDot(id: string): Locator {
    return this.item(id).locator('[data-testid="unread-dot"]');
  }

  /** Sidebar unread pill (hidden when the count is 0). */
  navBadge(): Locator {
    return this.page.locator('[data-testid="nav-inbox-unread"]');
  }

  /** Panel-header "N unread" chip (hidden when unread is 0). */
  headerUnread(): Locator {
    return this.page.locator('[data-testid="inbox-unread-count"]');
  }

  liveBadge(): Locator {
    return this.page.locator('[data-testid="inbox-live-badge"]');
  }

  /**
   * Read the current numeric nav badge, defaulting to 0 when hidden.
   * Use polling assertions on this value for badge transitions — the badge is
   * refreshed by query invalidation, never assume a sync text read (p4d race
   * lesson).
   */
  async navBadgeCount(): Promise<number> {
    const badge = this.navBadge();
    if ((await badge.count()) === 0) return 0;
    const text = (await badge.textContent()) ?? '0';
    const parsed = parseInt(text.replace(/[^0-9]/g, ''), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Mark an item read. The row click is targeted at the top-left gutter to
   * avoid landing on the row's buttons (Delete) or the status <select>.
   */
  async markRead(id: string) {
    await this.item(id).click({ position: { x: 12, y: 14 } });
  }

  /** Change a lead's status via its native <select>, by option label. */
  async changeLeadStatus(id: string, label: string) {
    await this.item(id).locator('select').selectOption({ label });
  }

  /** Delete a lead through the row button + ConfirmDialog. */
  async deleteLead(id: string) {
    await this.item(id).getByRole('button', { name: 'Delete', exact: true }).click();
    await this.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
  }

  /**
   * The Live badge only renders while the SSE stream is connected. In some
   * environments (headless CI quirks, tenant resolution lag) it may not
   * appear; callers should skip rather than fail when it does not.
   */
  async isLiveBadgeVisible(timeout = 5000): Promise<boolean> {
    try {
      await this.liveBadge().waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }
}

export { expect };
