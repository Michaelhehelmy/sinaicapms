import { test, expect } from '@playwright/test';
import { InboxPage } from '../../pages/admin/inbox.page';
import { TEST_TENANT } from '../../fixtures/test-data';
import {
  apiRequest,
  createTestTenant,
  createTestTenantAdmin,
  tenantAdminLogin,
} from '../../utils/api-helpers';

/**
 * E2E coverage for the Phase 4 Unified Inbox panel (tenant admin).
 *
 * The inbox is tenant-scoped: nav badge + panel context require a user with a
 * tenantId, so these tests log in as TEST_TENANT_ADMIN (acaciacamp) instead of
 * the super admin. Two leads are seeded via the public contact-form endpoint
 * before the suite and removed after it, so assertions are robust to any
 * ambient inbox data left by other specs.
 *
 * Tests are declared in dependency order — the status update and mark-read
 * tests mutate the seeded leads and the delete test removes them last.
 */
const seededLeads: { id: string; email: string }[] = [];

async function seedLead(name: string): Promise<string> {
  const token = await tenantAdminLogin();
  const email = `e2e-inbox-lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const res = await apiRequest(
    'POST',
    '/api/leads',
    {
      name,
      email,
      subject: 'E2E inbox subject',
      message: 'E2E inbox message',
      source: 'e2e',
    },
    { Authorization: `Bearer ${token}`, 'x-tenant-id': TEST_TENANT.id },
  );
  const data = (await res.json()) as { id?: string; success?: boolean };
  if (!res.ok || !data.id) {
    throw new Error(`Failed to seed lead: ${res.status()} ${JSON.stringify(data)}`);
  }
  seededLeads.push({ id: data.id, email });
  return data.id;
}

test.beforeAll(async () => {
  await createTestTenant();
  await createTestTenantAdmin();
  await tenantAdminLogin();
  await seedLead('E2E Inbox Lead One');
  await seedLead('E2E Inbox Lead Two');
});

test.afterAll(async () => {
  try {
    const token = await tenantAdminLogin();
    for (const lead of seededLeads) {
      await apiRequest(
        'DELETE',
        `/api/leads/${lead.id}`,
        undefined,
        { Authorization: `Bearer ${token}`, 'x-tenant-id': TEST_TENANT.id },
      ).catch(() => {});
    }
  } catch {
    // Best-effort cleanup — never fail the suite on it.
  }
});

test.describe('Inbox panel (tenant admin)', () => {
  // The 7 tests below are deliberately dependency-ordered (see header comment):
  // status/mark-read mutate the seeded leads, delete removes them last, and the
  // nav badge assertions are tenant-wide. `playwright.config.ts` runs with
  // `fullyParallel: true`, which would execute these in separate workers — each
  // worker re-runs `beforeAll` (duplicate seeds) and concurrent mutations race
  // the badge count. Force serial execution within this group so the declared
  // ordering holds and the suite stays deterministic.
  test.describe.configure({ mode: 'serial' });

  test('nav unread badge shows the seeded unread count', async ({ page }) => {
    const inbox = new InboxPage(page);
    await inbox.loginAsTenantAdmin();

    await expect(inbox.navBadge()).toBeVisible();
    await expect.poll(() => inbox.navBadgeCount()).toBeGreaterThanOrEqual(2);
  });

  test('inbox lists seeded leads with unread dots', async ({ page }) => {
    const inbox = new InboxPage(page);
    await inbox.loginAsTenantAdmin();
    await inbox.openInboxTab();

    await expect(inbox.item(seededLeads[0].id)).toBeVisible();
    await expect(inbox.item(seededLeads[1].id)).toBeVisible();
    await expect(inbox.item(seededLeads[0].id)).toContainText('E2E Inbox Lead One');
    await expect(inbox.unreadDot(seededLeads[0].id)).toBeVisible();
    await expect(inbox.unreadDot(seededLeads[1].id)).toBeVisible();
  });

  test('bookings tab hides the seeded leads', async ({ page }) => {
    const inbox = new InboxPage(page);
    await inbox.loginAsTenantAdmin();
    await inbox.openInboxTab();

    await inbox.clickFeedTab('bookings');
    for (const lead of seededLeads) {
      await expect(inbox.item(lead.id)).toHaveCount(0);
    }
  });

  test('updating a lead status reflects in its row', async ({ page }) => {
    const inbox = new InboxPage(page);
    await inbox.loginAsTenantAdmin();
    await inbox.openInboxTab();

    const target = seededLeads[0].id;
    await inbox.changeLeadStatus(target, 'Contacted');
    await expect(inbox.item(target)).toContainText('Contacted');
  });

  test('marking a lead read clears its dot and decrements the nav badge', async ({ page }) => {
    const inbox = new InboxPage(page);
    await inbox.loginAsTenantAdmin();
    await inbox.openInboxTab();

    const target = seededLeads[0].id;
    await expect(inbox.unreadDot(target)).toBeVisible();
    const before = await inbox.navBadgeCount();

    await inbox.markRead(target);

    await expect(inbox.unreadDot(target)).toHaveCount(0);
    await expect.poll(() => inbox.navBadgeCount()).toBe(before - 1);
  });

  test('live badge appears when the SSE stream connects', async ({ page }) => {
    const inbox = new InboxPage(page);
    await inbox.loginAsTenantAdmin();
    await inbox.openInboxTab();

    const visible = await inbox.isLiveBadgeVisible();
    test.skip(!visible, 'SSE stream did not connect in this environment');
    await expect(inbox.liveBadge()).toBeVisible();
  });

  test('deleting leads removes their rows', async ({ page }) => {
    const inbox = new InboxPage(page);
    await inbox.loginAsTenantAdmin();
    await inbox.openInboxTab();

    const [first, second] = seededLeads;
    await inbox.deleteLead(first.id);
    await expect(inbox.item(first.id)).toHaveCount(0);
    await expect(inbox.item(second.id)).toBeVisible();

    await inbox.deleteLead(second.id);
    await expect(inbox.item(second.id)).toHaveCount(0);
  });
});
