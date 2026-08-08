import { FullConfig } from '@playwright/test';
import { createTestTenant, createTestTenantAdmin, seedTestData } from './utils/api-helpers';

async function globalSetup(config: FullConfig) {
  console.log('\n🌍 E2E Global Setup: Seeding test data...');
  try {
    await createTestTenant();
    console.log('  ✅ Test tenant created');
    await createTestTenantAdmin();
    console.log('  ✅ Tenant admin created');
    await seedTestData();
    console.log('  ✅ Test data seeded');
    console.log('🌍 Global setup complete\n');
  } catch (err) {
    console.error('⚠️  Global setup failed (tests may fail):', err);
  }
}

export default globalSetup;
