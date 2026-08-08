export const API_BASE = process.env.API_BASE_URL || 'http://127.0.0.1:8787';

export const SUPER_ADMIN = {
  email: 'admin@sinaicamps.com',
  password: process.env.SUPER_ADMIN_PASSCODE || 'sinairoot',
  tenantId: 'marketplace',
};

export const TEST_TENANT = {
  id: process.env.E2E_TENANT_ID || 'acaciacamp',
  subdomain: process.env.E2E_TENANT_SUBDOMAIN || 'acacia',
  name: 'Acacia Camp',
};

export const TEST_TENANT_ADMIN = {
  email: 'e2e-admin@test.com',
  password: 'TestPass123!',
};

export const TEST_PRODUCT = {
  name: 'E2E Test Product',
  capacity: 2,
  basePrice: 80,
  description: 'E2E test room type',
};

export const TEST_CUSTOMER = {
  firstName: 'E2E',
  lastName: 'Customer',
  email: 'e2e-customer@test.com',
  phone: '+201001234567',
};

export const TEST_CAMPS = [
  { id: process.env.E2E_TENANT_ID || 'acaciacamp', name: 'Acacia Camp', location: 'Sinai Peninsula, Egypt', capacity: 80 },
  { id: process.env.E2E_TENANT_2_ID || 'michaelshouse', name: "Michael's House", location: 'Dahab, South Sinai', capacity: 50 },
];

export const TEST_PRODUCTS = [
  { id: 'e2e-rt-1', name: 'Standard Tent', capacity: 2, basePrice: 80 },
  { id: 'e2e-rt-2', name: 'Deluxe Cabin', capacity: 4, basePrice: 150 },
];

export const TEST_RATE_PLAN = {
  id: 'e2e-rp-1',
  name: 'Summer Season Rate',
  productId: 'e2e-rt-1',
  pricePerNight: 80,
  startDate: '2026-07-01',
  endDate: '2026-09-30',
};

export const TEST_POS_USER = {
  identifier: process.env.POS_IDENTIFIER || 'cashier',
  password: process.env.POS_PASSWORD || 'pass123',
};

export const TENANT_URL = (path: string, tenantId?: string) =>
  tenantId ? `${path}?tenant=${tenantId}` : path;
