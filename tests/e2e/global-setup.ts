import { FullConfig } from '@playwright/test';
import { createTestTenant, createTestTenantAdmin, seedTestData, createTestPosUser } from './utils/api-helpers';

async function globalSetup(config: FullConfig) {
  console.log('\n🌍 E2E Global Setup: Seeding test data...');
  try {
    await createTestTenant();
    console.log('  ✅ Test tenant created');
    await createTestTenantAdmin();
    console.log('  ✅ Tenant admin created');
    await seedTestData();
    console.log('  ✅ Test data seeded');
    await createTestPosUser();
    console.log('  ✅ POS cashier created (migration 0051 removed the seed row)');
    console.log('🌍 Global setup complete\n');
  } catch (err) {
    console.error('⚠️  Global setup failed (tests may fail):', err);
  }
}

export default globalSetup;
