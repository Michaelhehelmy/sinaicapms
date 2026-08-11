import { FullConfig } from '@playwright/test';
import { createTestTenant, createTestTenantAdmin, seedTestData, createTestPosUser } from './utils/api-helpers';

async function globalSetup(config: FullConfig) {
  console.log('\n🌍 E2E Global Setup: Seeding test data...');
  try {
    await createTestTenant();
    console.log('  ✅ Test tenant created');
    await createTestTenantAdmin();
    console.log('  ✅ Tenant admin created');
    // POS user FIRST: createTestPosUser auto-provisions the tenant's POS
    // organization + tenant_org_mapping. seedTestData must run after it so
    // POST /api/products resolves the tenant's real org (the handler looks up
    // tenant_org_mapping) and the products land in the SAME org as the
    // cashier — otherwise the POS product grid is empty and the
    // product-grid specs fail.
    await createTestPosUser();
    console.log('  ✅ POS cashier created (migration 0051 removed the seed row)');
    await seedTestData();
    console.log('  ✅ Test data seeded');
    console.log('🌍 Global setup complete\n');
  } catch (err) {
    console.error('⚠️  Global setup failed (tests may fail):', err);
  }
}

export default globalSetup;
