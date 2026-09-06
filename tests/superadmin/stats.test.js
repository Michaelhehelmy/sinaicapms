import { describe, it, expect, beforeAll } from 'vitest';
import { API_BASE_URL, superAdminLogin } from '../helpers';

describe('3. Super Admin - Aggregated Stats', () => {
  let superAdminToken;

  beforeAll(async () => {
    superAdminToken = await superAdminLogin();
  });

  it('GET /api/admin/stats → returns valid platform-wide counts', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/stats`, {
      headers: { 'Authorization': `Bearer ${superAdminToken}` }
    });
    expect(res.status).toBe(200);
    const stats = await res.json();
    // /api/admin/stats responses run through toCamel (T3 wire contract)
    expect(stats.totalTenants).toBeDefined();
    expect(stats.totalCamps).toBeDefined();
    expect(stats.totalRooms).toBeDefined();
    expect(stats.totalOrders).toBeDefined();
    expect(stats.totalRevenue).toBeDefined();

    expect(typeof stats.totalTenants).toBe('number');
    expect(typeof stats.totalCamps).toBe('number');
    expect(typeof stats.totalRooms).toBe('number');
    expect(typeof stats.totalOrders).toBe('number');
    expect(typeof stats.totalRevenue).toBe('number');
  });

  it('GET /api/admin/stats with tenant token → is forbidden (403)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/stats`, {
      headers: { 'Authorization': 'Bearer invalid_or_tenant_token' }
    });
    expect(res.status).toBe(403); 
  });
});
