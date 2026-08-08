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
    expect(stats.total_tenants).toBeDefined();
    expect(stats.total_camps).toBeDefined();
    expect(stats.total_rooms).toBeDefined();
    expect(stats.total_reservations).toBeDefined();
    expect(stats.total_revenue).toBeDefined();

    expect(typeof stats.total_tenants).toBe('number');
    expect(typeof stats.total_camps).toBe('number');
    expect(typeof stats.total_rooms).toBe('number');
    expect(typeof stats.total_reservations).toBe('number');
    expect(typeof stats.total_revenue).toBe('number');
  });

  it('GET /api/admin/stats with tenant token → is forbidden (403)', async () => {
    const res = await fetch(`${API_BASE_URL}/api/admin/stats`, {
      headers: { 'Authorization': 'Bearer invalid_or_tenant_token' }
    });
    expect(res.status).toBe(403); 
  });
});
