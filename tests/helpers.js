export const API_BASE_URL = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.TEST_PORT || '8789'}`;
export const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'admin@sinaicamps.com';
export const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'sinairoot';
export const JWT_SECRET = process.env.JWT_SECRET || 'campmaster_super_jwt_secret_key_12345';

export async function superAdminLogin() {
  const passwords = [SUPER_ADMIN_PASSWORD, 'sinairoot', 'sinaiadmin'];
  let lastErr;
  for (const pw of passwords) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: SUPER_ADMIN_EMAIL,
          password: pw,
          tenantId: 'super',
        })
      });
      if (res.ok) {
        const data = await res.json();
        return data.token;
      }
      lastErr = await res.text();
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new Error(`Super admin login failed. Tried all passwords. Last error: ${lastErr}`);
}

export async function createTestTenant(id, subdomain, name) {
  const res = await fetch(`${API_BASE_URL}/api/tenants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, subdomain, name })
  });
  if (!res.ok) {
    throw new Error(`Create tenant failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.id;
}

export async function createTenantAdmin(tenantId, email, password, superAdminToken) {
  const res = await fetch(`${API_BASE_URL}/api/admin/admins`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${superAdminToken}`
    },
    body: JSON.stringify({
      email,
      password,
      tenantId,
      role: 'admin'
    })
  });
  if (!res.ok) {
    throw new Error(`Create tenant admin failed: ${res.status} ${await res.text()}`);
  }
  return true;
}

export async function tenantAdminLogin(tenantId, email, password) {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenantId })
  });
  if (!res.ok) {
    throw new Error(`Tenant admin login failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.token;
}

export async function deleteTestTenant(tenantId, superAdminToken) {
  const res = await fetch(`${API_BASE_URL}/api/admin/tenants/${tenantId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${superAdminToken}` }
  });
  if (!res.ok) {
    console.error(`Delete tenant failed: ${res.status} ${await res.text()}`);
  }
}
