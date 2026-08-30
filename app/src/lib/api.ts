// T8-C: type-only import of the OpenAPI-generated schema types (run `npm run gen:types`).
// The spec (backend/openapi.json) is the single source of truth for the wire contract.
import type { components } from './api-types';

type Schemas = components['schemas'];

const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.endsWith('.localhost') ||
    window.location.hostname.endsWith('.127.0.0.1'));

const isSinaicamps =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'sinaicamps.com' ||
    window.location.hostname === 'www.sinaicamps.com' ||
    window.location.hostname.endsWith('.sinaicamps.com'));

// Custom domains (acaciacamp.com etc.) are NOT .sinaicamps.com subdomains
// but they still need to reach the same API. They are detected as "external"
// and route to sinaicamps.com/api.
const isCustomDomain =
  typeof window !== 'undefined' &&
  !isLocal && !isSinaicamps &&
  window.location.hostname !== 'localhost';

export const API_BASE = isLocal
  ? 'http://localhost:8787/api/v1'
  : isSinaicamps
    ? '/api/v1'
    : 'https://sinaicamps.com/api/v1';

// Phase 6 / Task 2: token storage is owned by the session kernel (./session).
// Legacy key names are re-exported for back-compat imports.
import { session, type Realm } from './session';
export { REFRESH_TOKEN_KEY } from './session';

// T6: pagination envelope shape shared by list endpoints
// { data, total, page, pageSize, hasMore } — clean migration from limit/offset
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// T9: super-admin tenant-scope override for the Tenants hub drill-down.
// When set (non-empty), getTenantId() returns it FIRST so admin panels target
// the selected tenant while sitting on the marketplace host. Module-level only —
// never persisted — and reset on drill-down exit / logout so tenant admins and
// POS sessions are never affected.
let _tenantScopeOverride: string | null = null;

export function setTenantScope(tenantId: string | null): void {
  _tenantScopeOverride = tenantId && tenantId.trim() ? tenantId.trim() : null;
}

export function getTenantScope(): string | null {
  return _tenantScopeOverride;
}

export function getTenantId(): string {
  if (typeof window === 'undefined') return '';

  if (_tenantScopeOverride) return _tenantScopeOverride;

  // Tenant hierarchy: the authenticated admin's real tenant (the business
  // entity) wins over the marketplace-host fallback. Admin tokens carry their
  // tenant id in the cached user blob; super-admin/marketplace-tenant tokens
  // fall through so anonymous and marketplace-scoped visitors still resolve
  // via host/subdomain/query/localStorage below. Sync on purpose — no async
  // auth fetching may ever gate a scoping decision.
  const adminUser = session.getUser<{ tenantId?: string }>('admin');
  if (adminUser?.tenantId && adminUser.tenantId !== 'marketplace') {
    return adminUser.tenantId;
  }

  const host = window.location.hostname;

  if (host === 'sinaicamps.com' || host === 'www.sinaicamps.com') {
    return 'marketplace';
  }

  const parts = host.split('.');
  if (
    parts.length > 1 &&
    parts[0] !== 'www' &&
    parts[0] !== 'localhost' &&
    parts[0] !== '127'
  ) {
    return parts[0];
  }

  const urlParams = new URLSearchParams(window.location.search);
  const paramTenant = urlParams.get('tenant');
  if (paramTenant) return paramTenant;

  return localStorage.getItem('sinaicamps_tenant_id') || '';
}

// Request deduplication — prevents duplicate in-flight GET requests
const _inflight = new Map<string, Promise<unknown>>();

// T7: shared in-flight silent-refresh — concurrent 401s await one refresh call
// instead of stampeding /auth/refresh. Uses a raw fetch on purpose: apiFetch
// must never trigger a refresh while refreshing. Phase 6: one singleton per
// realm (admin + POS both rotate via their Phase 5 endpoints).
const _refreshPromises: Record<Realm, Promise<boolean> | null> = {
  admin: null,
  pos: null,
};

// Phase 6: auth transitions invalidate request deduplication so a GET cached
// under one identity is never reused across login/logout/401-clear.
session.onAuthChange(() => {
  _inflight.clear();
});

async function refreshAccessToken(realm: Realm): Promise<boolean> {
  const refreshToken = session.getRefreshToken(realm);
  if (!refreshToken) return false;

  const endpoint = realm === 'pos' ? '/pos/auth/refresh' : '/auth/refresh';
  const headers: Record<string, string> = {
    // POS refresh gate reads the Bearer header; the admin endpoint accepts it
    // as well and the body below covers legacy expectations for both.
    Authorization: `Bearer ${refreshToken}`,
    'Content-Type': 'application/json',
  };
  const tenant = getTenantId();
  if (tenant) headers['x-tenant-id'] = tenant;

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;

    const data = (await response.json()) as Record<string, unknown>;
    const accessToken =
      (data.token as string | undefined) ||
      ((data.data as Record<string, unknown> | undefined)?.token as string | undefined);
    if (!accessToken) return false;

    session.setTokens(
      realm,
      accessToken,
      (data.refreshToken as string | undefined) ??
        ((data.data as Record<string, unknown> | undefined)?.refreshToken as
          | string
          | undefined),
    );
    return true;
  } catch {
    return false;
  }
}

export async function apiFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const tenant = getTenantId();
  // Phase 9: POS login moved to /auth/pos-login — still a POS-realm session.
  const realm: Realm =
    endpoint.startsWith('/pos/') || endpoint.startsWith('/auth/pos-') ? 'pos' : 'admin';
  const token = session.getAccessToken(realm);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(tenant ? { 'x-tenant-id': tenant } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  let fetchOpts: RequestInit = { ...options, headers };

  // Dedup identical in-flight GET requests
  const dedupKey = (!fetchOpts.method || fetchOpts.method === 'GET')
    ? `${tenant}:${endpoint}`
    : null;

  if (dedupKey && _inflight.has(dedupKey)) {
    return _inflight.get(dedupKey) as Promise<T>;
  }

  const promise = (async () => {
    try {
      let response = await fetch(`${API_BASE}${endpoint}`, fetchOpts);

      // T7 + Phase 6: silent-refresh for BOTH realms on 401 (never for the
      // refresh endpoints themselves). Exchange the stored refresh token for a
      // new access token and retry the original request once. Falls through to
      // the shared 401 handling below if there is no refresh token, the refresh
      // fails, or the retry still 401s.
      const refreshEndpoint = realm === 'pos' ? '/pos/auth/refresh' : '/auth/refresh';
      if (response.status === 401 && endpoint !== refreshEndpoint) {
        if (!_refreshPromises[realm]) {
          _refreshPromises[realm] = refreshAccessToken(realm).finally(() => {
            _refreshPromises[realm] = null;
          });
        }
        const refreshed = await _refreshPromises[realm];
        if (refreshed) {
          const newToken = session.getAccessToken(realm);
          if (newToken) {
            const retryHeaders = {
              ...headers,
              Authorization: `Bearer ${newToken}`,
            };
            fetchOpts = { ...fetchOpts, headers: retryHeaders };
            response = await fetch(`${API_BASE}${endpoint}`, fetchOpts);
          }
        }
      }

      if (response.status === 401) {
        session.clear(realm);
        throw new Error('Unauthorized');
      }

      if (!response.ok) {
        const contentType = response.headers?.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Server error (${response.status}): non-JSON response`);
        }
        const errData = await response.json().catch(() => ({} as Record<string, unknown>));
        const msg =
          (errData as Record<string, unknown>).error ||
          (errData as Record<string, unknown>).message ||
          `API error: ${response.status}`;
        throw new Error(typeof msg === 'string' ? msg : String(msg));
      }

      const data = await response.json();
      return data as T;
    } finally {
      if (dedupKey) _inflight.delete(dedupKey);
    }
  })();

  if (dedupKey) _inflight.set(dedupKey, promise);
  return promise;
}

// ─── Auth ─────────────────────────────────────────────────────────────
export function login(email: string, password: string, tenantId?: string) {
  return apiFetch<Schemas['AuthSession']>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, tenantId }),
  });
}

export function logout() {
  return apiFetch<Schemas['MessageEnvelope']>('/auth/logout', { method: 'POST' });
}

export function getAuthMe() {
  return apiFetch<Schemas['AuthMe']>('/auth/me');
}

// ─── Camps ────────────────────────────────────────────────────────────
export function getCamps() {
  return apiFetch<Schemas['CampList']>('/camps');
}

export function getCamp(id: number | string) {
  return apiFetch<Schemas['Camp']>(`/camps/${id}`);
}

export function saveCamp(data: Schemas['CampCreateRequest'] | Schemas['CampUpdateRequest'], editId?: number | string) {
  return apiFetch<Schemas['IdResponse'] | Schemas['SuccessResponse']>(editId ? `/camps/${editId}` : '/camps', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteCamp(id: number | string, opts?: { tenantId?: string }) {
  // Super-admin cross-tenant override: when the owning tenant is known (e.g.
  // marketplace directory rows carry tenant_id), append ?tenantId= so the
  // backend resolveScope queryOverride scopes the delete correctly.
  const query = opts?.tenantId ? `?tenantId=${encodeURIComponent(opts.tenantId)}` : '';
  return apiFetch<Schemas['SuccessResponse']>(`/camps/${id}${query}`, { method: 'DELETE' });
}

// ─── Products (Room Types) ────────────────────────────────────────────
export function getProducts() {
  return apiFetch<Schemas['ProductList']>('/products');
}

export function saveProduct(data: Schemas['ProductCreateRequest'] | Schemas['ProductUpdateRequest'], editId?: number | string) {
  return apiFetch<Schemas['IdResponse'] | Schemas['SuccessResponse']>(editId ? `/products/${editId}` : '/products', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteProduct(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/products/${id}`, { method: 'DELETE' });
}

// ─── Rooms ────────────────────────────────────────────────────────────
export function getRooms() {
  return apiFetch<Schemas['RoomList']>('/rooms');
}

export function saveRoom(data: Schemas['RoomCreateRequest'] | Schemas['RoomUpdateRequest'], editId?: number | string) {
  return apiFetch<Schemas['IdResponse'] | Schemas['SuccessResponse']>(editId ? `/rooms/${editId}` : '/rooms', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteRoom(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/rooms/${id}`, { method: 'DELETE' });
}

// ─── Rate Plans ───────────────────────────────────────────────────────
export function getRatePlans() {
  return apiFetch<Schemas['RatePlanList']>('/rateplans');
}

export function saveRatePlan(data: Schemas['RatePlanCreateRequest'] | Schemas['RatePlanUpdateRequest'], editId?: number | string) {
  return apiFetch<Schemas['IdResponse'] | Schemas['SuccessResponse']>(editId ? `/rateplans/${editId}` : '/rateplans', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteRatePlan(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/rateplans/${id}`, { method: 'DELETE' });
}

// ─── Orders (Reservations) ────────────────────────────────────────────
export function getOrders(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<Schemas['PaginatedOrders']>(`/orders${qs}`);
}
export function getOrder(id: number | string) {
  return apiFetch<Schemas['OrderDetail']>(`/orders/${id}`);
}

export function getOrderStatus(ref: string) {
  return apiFetch<Schemas['OrderStatus']>(`/orders/status/${ref}`);
}

export function saveOrder(data: Schemas['OrderCreateRequest'] | Schemas['OrderUpdateRequest'], editId?: number | string) {
  return apiFetch<Schemas['OrderCreateResponse'] | Schemas['SuccessResponse']>(editId ? `/orders/${editId}` : '/orders', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

// T5: PATCH /orders/:id/status — status-only partial update
export function updateOrderStatus(id: number | string, status: string) {
  return apiFetch<Schemas['OrderStatusUpdateResponse']>(`/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function deleteOrder(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/orders/${id}`, { method: 'DELETE' });
}

export function bulkDeleteOrders(ids: string[]) {
  return apiFetch<Schemas['BulkDeleteResponse']>('/orders/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids } satisfies Schemas['BulkDeleteRequest']),
  });
}

export function calculatePrice(roomId: number | string, checkIn: string, checkOut: string) {
  return apiFetch<Schemas['PriceEnvelope']>(
    `/orders/calculate-price?roomId=${roomId}&checkIn=${checkIn}&checkOut=${checkOut}`,
  );
}

export function getAvailability(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return apiFetch<Schemas['AvailabilityResponse']>(`/availability?${qs}`);
}

// ─── Categories ───────────────────────────────────────────────────────
export function getCategories() {
  return apiFetch<Schemas['CategoryList']>('/categories');
}

export function getCategory(id: number | string) {
  return apiFetch<Schemas['CategoryDetail']>(`/categories/${id}`);
}

export function saveCategory(data: Schemas['CategoryCreateRequest'] | Schemas['CategoryUpdateRequest'], editId?: number | string) {
  return apiFetch<Schemas['IdResponse'] | Schemas['SuccessResponse']>(editId ? `/categories/${editId}` : '/categories', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteCategory(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/categories/${id}`, { method: 'DELETE' });
}

// ─── Meals ────────────────────────────────────────────────────────────
export function getMeals() {
  return apiFetch<Schemas['MealList']>('/meals');
}

export function getMeal(id: number | string) {
  return apiFetch<Schemas['Meal']>(`/meals/${id}`);
}

export function saveMeal(data: Schemas['MealCreateRequest'] | Schemas['MealUpdateRequest'], editId?: number | string) {
  return apiFetch<Schemas['IdResponse'] | Schemas['SuccessResponse']>(editId ? `/meals/${editId}` : '/meals', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteMeal(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/meals/${id}`, { method: 'DELETE' });
}

// ─── Meal Schedules ────────────────────────────────────────
export function getMealSchedules(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<Schemas['MealScheduleList']>(`/meal-schedules${qs}`);
}

export function createMealSchedule(data: Schemas['MealScheduleCreateRequest']) {
  return apiFetch<Schemas['IdResponse']>('/meal-schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteMealSchedule(id: string) {
  return apiFetch<Schemas['SuccessResponse']>(`/meal-schedules/${id}`, { method: 'DELETE' });
}

// ─── Meal Categories ──────────────────────────────────────────────────
export function getMealCategories() {
  return apiFetch<Schemas['MealCategoryList']>('/meal-categories');
}

export function saveMealCategory(data: Schemas['MealCategoryCreateRequest'] | Schemas['MealCategoryUpdateRequest'], editId?: number | string) {
  return apiFetch<Schemas['IdResponse'] | Schemas['SuccessResponse']>(editId ? `/meal-categories/${editId}` : '/meal-categories', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteMealCategory(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/meal-categories/${id}`, { method: 'DELETE' });
}

// ─── Plans ────────────────────────────────────────────────────────────
export function getPlans() {
  return apiFetch<Schemas['PlanList']>('/plans');
}

export function getPlan(id: number | string) {
  return apiFetch<Schemas['Plan']>(`/plans/${id}`);
}

export function savePlan(data: Schemas['PlanCreateRequest'] | Schemas['PlanUpdateRequest'], editId?: number | string) {
  return apiFetch<Schemas['IdResponse'] | Schemas['SuccessResponse']>(editId ? `/plans/${editId}` : '/plans', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deletePlan(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/plans/${id}`, { method: 'DELETE' });
}

// ─── Reports ──────────────────────────────────────────────────────────
export function getOccupancyReport() {
  return apiFetch<Schemas['OccupancyReport']>('/reports/occupancy');
}

export function getRevenueReport(opts?: { days?: number; start?: string; end?: string }) {
  const params = new URLSearchParams();
  if (opts?.days) params.set('days', String(opts.days));
  if (opts?.start) params.set('start', opts.start);
  if (opts?.end) params.set('end', opts.end);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<Schemas['RevenueReport']>(`/reports/revenue${qs}`);
}

export function getBookingsReport(opts?: { days?: number; start?: string; end?: string }) {
  const params = new URLSearchParams();
  if (opts?.days) params.set('days', String(opts.days));
  if (opts?.start) params.set('start', opts.start);
  if (opts?.end) params.set('end', opts.end);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<Schemas['BookingsReport']>(`/reports/bookings${qs}`);
}

export function getMe() {
  return apiFetch<Schemas['Me']>('/me');
}

export function updateBranding(data: Schemas['TenantMeUpdateRequest']) {
  return apiFetch<Schemas['SuccessResponse']>('/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Tenant Billing ────────────────────────────────────────────────
export interface TenantBillingPlan {
  name: string;
  price: string;
  period: string;
  bookingsLimit: number | null;
  storageLimit: string;
  posUsersLimit: number | null;
  features: string[];
}

export interface TenantBillingResponse {
  subscription: {
    plan: string;
    planLabel: string;
    price: number;
    status: string;
    currentPeriodEnd: string | null;
    trialEndsAt: string | null;
    bookingsLimit: number;
  };
  usage: {
    bookings: number;
    bookingsLimit: number;
    posUsers: number;
    posUsersLimit: number;
  };
  plans: TenantBillingPlan[];
  billingHistory: Array<{
    id: string;
    date: string;
    amount: number;
    status: string;
    description: string;
  }>;
}

export function getTenantBilling() {
  return apiFetch<TenantBillingResponse>('/tenant/billing');
}

export function getTenants() {
  return apiFetch<Schemas['TenantList']>('/tenants');
}

export function getTenantsPublic() {
  return apiFetch('/tenants/public');
}

export function createTenant(data: Schemas['TenantCreateRequest']) {
  return apiFetch<Schemas['TenantCreateResponse']>('/tenants', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getAdminStats() {
  return apiFetch<Schemas['AdminStats']>('/admin/stats');
}

export function getAdminTenants(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<Schemas['PaginatedAdminTenants']>(`/admin/tenants${qs}`);
}

export function updateAdminTenant(id: number | string, data: Schemas['AdminTenantUpdateRequest']) {
  return apiFetch<Schemas['SuccessResponse']>(`/admin/tenants/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteAdminTenant(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/admin/tenants/${id}`, { method: 'DELETE' });
}

export function getAdmins(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<Schemas['PaginatedAdmins']>(`/admin/admins${qs}`);
}

export function createAdminUser(data: Schemas['AdminCreateRequest']) {
  return apiFetch<Schemas['AdminCreateResponse']>('/admin/admins', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteAdminUser(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/admin/admins/${id}`, { method: 'DELETE' });
}

export function updateAdminUser(id: number | string, data: Schemas['AdminUpdateRequest']) {
  return apiFetch<Schemas['AdminUpdateResponse']>(`/admin/admins/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// ─── Bulk Tenant Actions (Super Admin) ────────────────────────────────
export function bulkSuspendTenants(ids: string[]) {
  return apiFetch<Schemas['BulkActionResult']>('/admin/tenants/bulk/suspend', {
    method: 'POST',
    body: JSON.stringify({ ids } satisfies Schemas['BulkActionRequest']),
  });
}

export function bulkActivateTenants(ids: string[]) {
  return apiFetch<Schemas['BulkActionResult']>('/admin/tenants/bulk/activate', {
    method: 'POST',
    body: JSON.stringify({ ids } satisfies Schemas['BulkActionRequest']),
  });
}

export function bulkDeleteTenants(ids: string[]) {
  return apiFetch<Schemas['BulkActionResult']>('/admin/tenants/bulk/delete', {
    method: 'POST',
    body: JSON.stringify({ ids } satisfies Schemas['BulkActionRequest']),
  });
}

// ─── POS Users (Staff) ────────────────────────────────────────────────
export function getPosUsers(params?: { page?: number | string; pageSize?: number | string; role?: string; search?: string; tenantId?: string }) {
  const qp: Record<string, string> = {};
  if (params?.page !== undefined && params.page !== '') qp.page = String(params.page);
  if (params?.pageSize !== undefined && params.pageSize !== '') qp.pageSize = String(params.pageSize);
  if (params?.role) qp.role = params.role;
  if (params?.search) qp.search = params.search;
  if (params?.tenantId) qp.tenantId = params.tenantId; // super-admin cross-tenant listing
  const qs = Object.keys(qp).length ? '?' + new URLSearchParams(qp).toString() : '';
  return apiFetch<Schemas['PaginatedPosUsers']>(`/pos-users${qs}`);
}

export function createPosUser(data: { email: string; username?: string; password: string; firstName: string; lastName: string; phone?: string; role?: 'cashier' | 'manager' | 'admin'; department?: string; employeeId?: string; storeId?: number }) {
  return apiFetch<Schemas['PosUserActionResponse']>('/pos-users', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updatePosUser(id: number | string, data: Partial<{ email: string; username: string; firstName: string; lastName: string; phone?: string; role?: 'cashier' | 'manager' | 'admin'; isActive?: boolean; department?: string; employeeId?: string; storeId?: number }>) {
  return apiFetch<Schemas['PosUserActionResponse']>(`/pos-users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deletePosUser(id: number | string) {
  return apiFetch<Schemas['PosUserActionResponse']>(`/pos-users/${id}`, { method: 'DELETE' });
}

export function resetPosUserPassword(id: number | string, password: string) {
  return apiFetch<Schemas['PosUserActionResponse']>(`/pos-users/${id}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

// ─── Password Management ──────────────────────────────────────────────
export function forgotPassword(email: string) {
  return apiFetch<Schemas['MessageEnvelope']>('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, password: string) {
  return apiFetch<Schemas['MessageEnvelope']>('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<Schemas['MessageEnvelope']>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function registerUser(data: { name: string; email: string; password: string; tenantId: string }) {
  return apiFetch<Schemas['RegisterResponse']>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Leads ────────────────────────────────────────────────────────────
export function saveLead(data: Schemas['LeadCreateRequest']) {
  return apiFetch<Schemas['LeadCreateResponse']>('/leads', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// T6: GET /leads returns a paginated envelope; params can include page/pageSize/status
export function getLeads(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<Schemas['PaginatedLeads']>(`/leads${qs}`);
}

export function updateLead(id: string, data: Schemas['LeadStatusUpdateRequest']) {
  return apiFetch<Schemas['SuccessResponse']>(`/leads/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export function deleteLead(id: string) {
  return apiFetch<Schemas['SuccessResponse']>(`/leads/${id}`, { method: 'DELETE' });
}

// ─── Inbox (Unified) ──────────────────────────────────────────────────
/**
 * Unified inbox feed (auth + tenant scoped): merged leads + bookings.
 * T6 pagination envelope ({ data, total, page, pageSize, hasMore, unread })
 * with optional kind/status filters.
 */
export function getInbox(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<Schemas['InboxResponse']>(`/inbox${qs}`);
}

/** Mark an inbox item read — lead or booking; idempotent. */
export function markInboxRead(kind: 'lead' | 'booking', id: string) {
  return apiFetch<Schemas['SuccessResponse']>('/inbox/read', {
    method: 'PATCH',
    body: JSON.stringify({ kind, id } satisfies Schemas['InboxReadRequest']),
  });
}

/** Delete an inbox item — lead only (booking deletion returns 400). */
export function deleteInboxLead(id: string) {
  return apiFetch<Schemas['SuccessResponse']>(`/inbox/lead/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ─── Payments ─────────────────────────────────────────────────────────
export function createPaymentIntent(data: { orderId: string; amount: number; currency?: string }) {
  return apiFetch<Schemas['PaymentIntentResponse']>('/payments/create-intent', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function confirmPayment(data: { paymentIntentId: string; orderId: string }) {
  return apiFetch<Schemas['ConfirmPaymentResponse']>('/payments/confirm', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── POS (Point of Sale) ──────────────────────────────────────────────
// POS endpoints use /api/pos/* prefix. The centralized apiFetch handles
// tenant isolation and auth headers automatically.

/** POS: Login (Phase 9: consolidated onto the /api/auth surface) */
export function posLogin(identifier: string, password: string) {
  return apiFetch<Schemas['PosLoginResponse']>('/auth/pos-login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password } satisfies Schemas['PosLoginRequest']),
  });
}

/** POS: Get today's dashboard stats */
export function posGetDashboard() {
  return apiFetch<Schemas['PosDashboard']>('/pos/dashboard');
}

/** POS: Get all products */
export function posGetProducts() {
  return apiFetch<Schemas['PosProductList']>('/pos/products');
}

/** POS: Get orders (paginated envelope — unwrapped to the page rows) */
export async function posGetOrders() {
  const page = await apiFetch<Schemas['PaginatedPosOrders']>('/pos/orders');
  return page.data;
}

/** POS: Get a single order with items */
export function posGetOrder(id: string | number) {
  return apiFetch<Schemas['PosOrderDetail']>('/pos/orders/' + id);
}

/** POS: Create an order (checkout) */
export function posCreateOrder(data: Schemas['PosOrderCreateRequest']) {
  return apiFetch<Schemas['PosOrderCreateResponse']>('/pos/orders', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** POS: Get active shift */
export function posGetActiveShift() {
  return apiFetch<Schemas['PosShiftActiveResponse']>('/pos/shifts/active');
}

/** POS: Open a new shift */
export function posOpenShift(data: Schemas['PosShiftOpenRequest']) {
  return apiFetch<Schemas['PosShiftOpenResponse']>('/pos/shifts/open', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** POS: Close the active shift */
export function posCloseShift(data: Schemas['PosShiftCloseRequest']) {
  return apiFetch<Schemas['PosShiftCloseResponse']>('/pos/shifts/close', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Restaurant pillar (0069): floor tables + kitchen status ─────────
// Wire contract: backend/openapi.json (PosTable*, TableStatusUpdateResponse,
// KitchenStatusUpdateResponse). Like every sibling function in this module,
// tenant scoping rides the x-tenant-id header apiFetch already sets — there is
// no explicit orgId parameter.

/** Kitchen fulfillment states (0069). NOTE the one-L spelling of 'canceled' —
 *  it must match the 0069 column CHECK + KITCHEN_TRANSITIONS map exactly. */
export type KitchenStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'canceled';

/** Floor-table row as served on the camelCase wire (spec: PosTable). */
export type PosTable = Schemas['PosTable'];

/** POS: List restaurant floor tables grouped by section → { sections, total }.
 *  Named sections come first alphabetically; the null section renders last. */
export function getPosTables() {
  return apiFetch<Schemas['PosTableList']>('/pos-tables');
}

/** Create a floor table (admin-tier role required server-side) → { success, id }. */
export function createPosTable(data: { name: string; capacity?: number; section?: string }) {
  return apiFetch<Schemas['PosTableCreated']>('/pos-tables', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Partial table update (COALESCE semantics — omitted fields keep their value). */
export function updatePosTable(
  id: string,
  data: Partial<{ name: string; capacity: number; status: Schemas['PosTable']['status']; section: string }>,
) {
  return apiFetch<Schemas['SuccessResponse']>(`/pos-tables/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Move a table through its service lifecycle: available ↔ occupied/reserved/cleaning. */
export function updatePosTableStatus(id: string, status: Schemas['PosTable']['status']) {
  return apiFetch<Schemas['TableStatusUpdateResponse']>(`/pos-tables/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function deletePosTable(id: string) {
  return apiFetch<Schemas['SuccessResponse']>(`/pos-tables/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** Advance a kitchen ticket along pending→confirmed→preparing→ready→served
 *  (any pre-serve step may cancel). Body key is `status` — the single-key
 *  pattern PATCH /orders/:id/status established; 409 on illegal transitions. */
export function updateKitchenStatus(orderId: string, kitchenStatus: KitchenStatus) {
  return apiFetch<Schemas['KitchenStatusUpdateResponse']>(`/orders/${encodeURIComponent(orderId)}/kitchen-status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: kitchenStatus }),
  });
}

// ─── Inventory (tenant admin) ─────────────────────────────────────────
/**
 * Low-stock inventory items for the tenant organization.
 * Returns a paginated envelope keyed as `{ items, total, page, pageSize, hasMore }`.
 */
export function getLowStock(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return apiFetch<Schemas['InventoryLowStockList']>(`/inventory/low-stock${qs}`);
}

// ─── Price Overrides ──────────────────────────────────────────────────
/** List price overrides for a product (optional from/to filter) */
export function getPriceOverrides(params: { productId: string; from?: string; to?: string }) {
  const entries = (Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]);
  const qs = new URLSearchParams(entries).toString();
  return apiFetch<Schemas['PriceOverrideList']>(`/price-overrides?${qs}`);
}

/** Bulk upsert price overrides for a product (null price deletes that date) */
export function setPriceOverrides(body: Schemas['PriceOverridePutRequest']) {
  return apiFetch<Schemas['PriceOverridePutResponse']>('/price-overrides', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** Delete a single price override for a product + date */
export function deletePriceOverride(productId: string, date: string) {
  return apiFetch<Schemas['SuccessResponse']>(
    `/price-overrides?productId=${encodeURIComponent(productId)}&date=${encodeURIComponent(date)}`,
    { method: 'DELETE' },
  );
}

// ─── Media Upload (R2) ──────────────────────────────────────────────
/**
 * Upload an image to tenant media storage via POST /api/upload (multipart,
 * `file` field; tenant-admin auth; max 8 MB; jpg/jpeg/png/webp/gif).
 *
 * Uses a raw fetch on purpose (like `refreshAccessToken`): apiFetch always
 * sets `Content-Type: application/json`, which would break the multipart
 * boundary fetch must generate itself for FormData bodies.
 */
export function upload(file: File) {
  const body = new FormData();
  body.append('file', file);
  const tenant = getTenantId();
  const token = session.getAccessToken('admin');
  const headers: Record<string, string> = {};
  if (tenant) headers['x-tenant-id'] = tenant;
  if (token) headers.Authorization = `Bearer ${token}`;

  return fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body,
    headers,
  }).then(async (response) => {
    if (!response.ok) {
      const contentType = response.headers?.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errData = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        const msg = errData.error || errData.message || `API error: ${response.status}`;
        throw new Error(typeof msg === 'string' ? msg : String(msg));
      }
      throw new Error(`Server error (${response.status}): non-JSON response`);
    }
    return (await response.json()) as Schemas['UploadResponse'];
  });
}

// ─── Project Meta (EAV custom fields) ────────────────────────────────
// Backed by /api/projects/:projectId/meta (backend/src/api/meta.js).
// Rows are { id, projectId, metaKey, metaValue, sortOrder } on the camelCase
// wire; writes are normalized server-side so camelCase bodies are accepted.

/** List all meta rows for a project, ordered by sortOrder then id. */
export async function getProjectMeta(projectId: string): Promise<any[]> {
  const data = await apiFetch<unknown[]>(`/projects/${encodeURIComponent(projectId)}/meta`);
  return Array.isArray(data) ? data : [];
}

/**
 * Create one meta row for a project. Returns `{ success: true, id }` where
 * `id` is the new project_meta row id.
 */
export async function setProjectMeta(projectId: string, key: string, value: string): Promise<any> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/meta`, {
    method: 'POST',
    body: JSON.stringify({ metaKey: key, metaValue: value }),
  });
}

/** Update one meta row's value in place (keeps its row id and sort_order). */
export async function updateProjectMeta(projectId: string, metaId: number, value: string): Promise<any> {
  return apiFetch(`/projects/${encodeURIComponent(projectId)}/meta/${metaId}`, {
    method: 'PUT',
    body: JSON.stringify({ metaValue: value }),
  });
}

/** Delete one meta row by its integer row id. */
export async function deleteProjectMeta(projectId: string, metaId: number): Promise<void> {
  await apiFetch(`/projects/${encodeURIComponent(projectId)}/meta/${metaId}`, {
    method: 'DELETE',
  });
}

/** Bulk-update sort_order for a set of meta rows (one implicit transaction). */
export async function reorderProjectMeta(
  projectId: string,
  items: { id: number; sort_order: number }[],
): Promise<void> {
  await apiFetch(`/projects/${encodeURIComponent(projectId)}/meta/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({ items }),
  });
}

// ─── Project Items (type-aware child inventory) ───────────────────────
// Backed by /api/projects/items (admin-scoped, backend/src/api/project-items.js).
// The wire payload uses camelCase keys ({ projectId, itemType, basePrice,
// metaData … }) — the backend normalizes to snake_case server-side.
// item_type is one of: vehicle | product | menu_item | service | custom.

/** A project child-inventory item, as returned by GET /api/projects/items. */
export interface ProjectItem {
  id: string;
  /** Item's owning project id (some list responses surface it via `project`). */
  projectId?: string;
  itemType: string;
  name: string;
  description?: string | null;
  basePrice?: number;
  quantity?: number;
  /** Free-form JSON metadata (e.g. plate numbers, dimensions, specs). */
  metaData?: unknown;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  /** Denormalized project lookup attached by the API when joined. */
  project?: { id: string; name: string; slug: string | null; projectType: string | null } | null;
}

/** Create/update payload for a project item (camelCase on the wire). */
export interface ProjectItemInput {
  projectId: string;
  itemType: string;
  name: string;
  description?: string | null;
  basePrice?: number;
  quantity?: number;
  metaData?: unknown;
  status?: string;
}

/**
 * List project items. All filters are optional:
 *  - projectId scopes to one project (the primary use case for this panel)
 *  - itemType scopes to one item_type (vehicle, product, menu_item, …)
 *  - status scopes to one status (active, inactive, archived, …)
 */
export async function getProjectItems(
  params: { projectId?: string; itemType?: string; status?: string } = {},
): Promise<ProjectItem[]> {
  const qs = new URLSearchParams();
  if (params.projectId) qs.set('projectId', params.projectId);
  if (params.itemType) qs.set('itemType', params.itemType);
  if (params.status) qs.set('status', params.status);
  const query = qs.toString();
  const data = await apiFetch<unknown>(`/projects/items${query ? `?${query}` : ''}`);
  return Array.isArray(data) ? (data as ProjectItem[]) : [];
}

/** Create (no id) or update (with id) a project item. Returns the saved item. */
export async function saveProjectItem(payload: ProjectItemInput, id?: string): Promise<ProjectItem> {
  return apiFetch(id ? `/projects/items/${encodeURIComponent(id)}` : '/projects/items', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(payload),
  }) as Promise<ProjectItem>;
}

/** Delete a project item by id. */
export async function deleteProjectItem(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/projects/items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }) as Promise<{ success: boolean }>;
}

// ─── Project Links (cross-project connections) ───────────────────────
// Backed by /api/projects/links (admin-scoped, backend/src/api/project-links.js).
// The wire payload uses camelCase keys ({ projectIdA, projectIdB, linkType,
// metaData … }) and the list endpoint returns a plain array of joined rows.

/** A cross-project connection between two of this tenant's projects. */
export interface ProjectLink {
  id: string;
  linkType: string;
  /** Free-form JSON metadata attached to the link (e.g. notes, terms). */
  metaData?: unknown;
  a: { id: string; name: string; slug: string | null; projectType: string | null };
  b: { id: string; name: string; slug: string | null; projectType: string | null };
}

/** Create/update payload for a project link (camelCase on the wire). */
export interface ProjectLinkInput {
  projectIdA: string;
  projectIdB: string;
  linkType?: string;
  metaData?: unknown;
}

/**
 * List links for the tenant, optionally filtered to those touching one
 * project (the primary use case for the Connections section). The backend
 * returns a plain array; defensive empty fallback for envelope shapes.
 */
export async function getProjectLinks(projectId?: string): Promise<ProjectLink[]> {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  const data = await apiFetch<unknown>(`/projects/links${qs}`);
  return Array.isArray(data) ? (data as ProjectLink[]) : [];
}

/** Create a same-tenant link between two distinct projects. Returns the created link. */
export async function createProjectLink(payload: ProjectLinkInput): Promise<ProjectLink> {
  return apiFetch('/projects/links', {
    method: 'POST',
    body: JSON.stringify(payload),
  }) as Promise<ProjectLink>;
}

/** Delete a project link by id. */
export async function deleteProjectLink(id: string): Promise<{ success: boolean }> {
  return apiFetch(`/projects/links/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }) as Promise<{ success: boolean }>;
}

// ─── Tags (taxonomy) ──────────────────────────────────────────────────
// Backed by /api/tags + /api/projects/:projectId/tags (backend/src/api/tags.js).

/**
 * List all tags for a tenant. Tenant scoping normally comes from the
 * x-tenant-id header apiFetch already sends; an explicit tenantId is passed
 * through as a query param for forward-compat with scoped listing.
 */
export async function getTags(tenantId?: string): Promise<any[]> {
  const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
  const data = await apiFetch<unknown[]>(`/tags${qs}`);
  return Array.isArray(data) ? data : [];
}

/** Create a tenant tag from a display name (slug is auto-generated server-side). Returns `{ id, success }`. */
export async function createTag(name: string): Promise<any> {
  return apiFetch('/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/** List the tags attached to a project. */
export async function getProjectTags(projectId: string): Promise<any[]> {
  const data = await apiFetch<unknown[]>(`/projects/${encodeURIComponent(projectId)}/tags`);
  return Array.isArray(data) ? data : [];
}

/** Attach existing tags to a project (idempotent — duplicates are ignored). */
export async function addProjectTags(projectId: string, tagIds: string[]): Promise<void> {
  await apiFetch(`/projects/${encodeURIComponent(projectId)}/tags`, {
    method: 'POST',
    body: JSON.stringify({ tagIds }),
  });
}

/** Detach one tag from a project (the tag itself is kept for reuse). */
export async function removeProjectTag(projectId: string, tagId: string): Promise<void> {
  await apiFetch(
    `/projects/${encodeURIComponent(projectId)}/tags/${encodeURIComponent(tagId)}`,
    { method: 'DELETE' },
  );
}

// ─── Audit Log ────────────────────────────────────────────────────────
// Backed by GET /api/audit (backend/src/api/audit.js); returns the T6
// pagination envelope { data, total, page, pageSize, hasMore }. Legacy-style
// limit/offset params are accepted by the backend as aliases.

export async function getAuditLog(
  params?: { entity_type?: string; limit?: number; offset?: number },
): Promise<any> {
  const search = new URLSearchParams();
  if (params?.entity_type) search.set('entity_type', params.entity_type);
  if (params?.limit !== undefined) search.set('limit', String(params.limit));
  if (params?.offset !== undefined) search.set('offset', String(params.offset));
  const qs = search.toString();
  return apiFetch(`/audit${qs ? `?${qs}` : ''}`);
}

// ─── Promotions ───────────────────────────────────────────────────────
export interface Promotion {
  id: string;
  name: string;
  type: 'percentage' | 'fixed' | 'bogo';
  value: number;
  applies_to: 'all' | 'category' | 'product';
  applies_to_id: string | null;
  min_purchase: number;
  day_of_week: number | null;
  start_date: string | null;
  end_date: string | null;
  is_active: number;
  created_at: string;
}

export interface PromotionApplyRequest {
  items: Array<{ productId: string; quantity: number }>;
}

export interface PromotionApplyResult {
  items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
    final_price: number;
    discount: number;
    promotion_id: string | null;
    promotion_name: string | null;
  }>;
  subtotal: number;
  total_discount: number;
  total: number;
}

export function getPromotions(includeInactive?: boolean) {
  const qs = includeInactive ? '?includeInactive=1' : '';
  return apiFetch<Promotion[]>(`/promotions${qs}`);
}

export function savePromotion(data: Partial<Promotion>, editId?: string) {
  return apiFetch<{ id: string; success: boolean }>(editId ? `/promotions/${editId}` : '/promotions', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deletePromotion(id: string) {
  return apiFetch<{ success: boolean }>(`/promotions/${id}`, { method: 'DELETE' });
}

export function applyPromotions(data: PromotionApplyRequest) {
  return apiFetch<PromotionApplyResult>('/promotions/apply', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Dynamic Service Module ─────────────────────────────────────────────
export interface ServiceDefinition {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  description: string | null;
  fields_schema: unknown;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ServiceItem {
  id: string;
  tenant_id: string;
  service_definition_id: string;
  project_id: string | null;
  name: string;
  description: string | null;
  base_price: number;
  meta_data: Record<string, unknown>;
  status: string;
  definition_name?: string;
  definition_slug?: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceBooking {
  id: string;
  tenant_id: string;
  service_item_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  scheduled_date: string | null;
  status: string;
  notes: string | null;
  item_name?: string;
  definition_name?: string;
  created_at: string;
  updated_at: string;
}

// Definitions
export function getServiceDefinitions() {
  return apiFetch<ServiceDefinition[]>('/services/definitions');
}

export function saveServiceDefinition(data: Partial<ServiceDefinition>, editId?: string) {
  return apiFetch<{ id: string; success: boolean }>(editId ? `/services/definitions/${editId}` : '/services/definitions', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteServiceDefinition(id: string) {
  return apiFetch<{ success: boolean }>(`/services/definitions/${id}`, { method: 'DELETE' });
}

// Items
export function getServiceItems() {
  return apiFetch<ServiceItem[]>('/services/items');
}

export function saveServiceItem(data: Partial<ServiceItem>, editId?: string) {
  return apiFetch<{ id: string; success: boolean }>(editId ? `/services/items/${editId}` : '/services/items', {
    method: editId ? 'PUT' : 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteServiceItem(id: string) {
  return apiFetch<{ success: boolean }>(`/services/items/${id}`, { method: 'DELETE' });
}

// Bookings
export function getServiceBookings(status?: string) {
  const qs = status ? `?status=${status}` : '';
  return apiFetch<ServiceBooking[]>(`/services/bookings${qs}`);
}

export function createServiceBooking(data: { service_item_id: string; customer_name?: string; customer_phone?: string; scheduled_date?: string; notes?: string }) {
  return apiFetch<{ id: string; success: boolean; status: string }>('/services/bookings', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateBookingStatus(id: string, status: string) {
  return apiFetch<{ id: string; status: string; success: boolean }>(`/services/bookings/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// Public catalog
export function getPublicServiceCatalog(slug: string) {
  return apiFetch<{ tenant: { id: string; name: string }; definitions: ServiceDefinition[] }>(`/services/public/${slug}`);
}

// ─── Analytics (supplementary) ─────────────────────────────────────────
// getRevenueReport and getOccupancyReport already exist in the Reports section.
// These add POS-specific analytics not covered by existing report functions.
export interface TopProduct {
  id: string;
  name: string;
  total_qty: number;
  total_revenue: number;
  order_count: number;
}

export interface KitchenStatusCount {
  status: string;
  count: number;
}

export interface KitchenTrend {
  date: string;
  completed: number;
  ready: number;
  pending: number;
  total: number;
}

export interface LowStockItem {
  id: string;
  name: string;
  stock_quantity: number;
  min_stock_level: number;
  unit: string;
  status: string;
}

export function getAnalyticsLowStock() {
  return apiFetch<{ low_stock: LowStockItem[] }>('/reports/low-stock');
}

export function getTopProducts(days?: number, limit?: number) {
  const params = new URLSearchParams();
  if (days) params.set('days', String(days));
  if (limit) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<{ days: number; top_products: TopProduct[] }>(`/reports/top-products${qs}`);
}

export function getKitchenPerformance(days?: number) {
  const qs = days ? `?days=${days}` : '';
  return apiFetch<{ days: number; by_status: KitchenStatusCount[]; daily_trend: KitchenTrend[] }>(`/reports/kitchen-performance${qs}`);
}

// ─── Self-Service Onboarding ────────────────────────────────────────────
export interface OnboardingSignupResult {
  success: boolean;
  tenant_id: string;
  onboarding_token: string;
  message: string;
}

export interface OnboardingStatus {
  tenant_id: string;
  name: string;
  subdomain: string;
  email: string;
  status: string;
  onboarding_status: string;
  setup_complete: boolean;
  profile: {
    location: string | null;
    phone: string | null;
    description: string | null;
    primary_color: string | null;
    capacity: number | null;
    currency: string | null;
  };
}

export interface OnboardingSetupResult {
  success: boolean;
  tenant_id: string;
  message: string;
  site_url: string;
  auto_login_token?: string;
}

export function signupTenant(data: {
  name: string;
  subdomain: string;
  business_type?: string;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}) {
  return apiFetch<OnboardingSignupResult>('/public/signup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getOnboardingStatus(token: string) {
  return apiFetch<OnboardingStatus>(`/onboarding/status/${token}`);
}

export function completeOnboarding(data: {
  token: string;
  location?: string;
  phone?: string;
  description?: string;
  primary_color?: string;
  capacity?: number;
  currency?: string;
  activities?: string;
}) {
  return apiFetch<OnboardingSetupResult>('/onboarding/setup', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateOnboardingTenant(data: {
  token: string;
  [key: string]: unknown;
}) {
  return apiFetch<{ success: boolean; tenant_id: string }>('/onboarding/tenant', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Auto-Login (C1.1) ───────────────────────────────────────────────────
export function autoLogin(token: string) {
  return apiFetch<{
    success: boolean;
    token: string;
    refreshToken: string;
    user: { id: string; name: string; email: string; role: string; tenantId: string };
  }>('/auth/auto-login', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

// ─── Marketplace (C3) ────────────────────────────────────────────────────
export interface MarketplaceListing {
  tenantId: string;
  tenantName: string;
  subdomain: string;
  tenantDescription: string | null;
  primaryColor: string | null;
  location: string | null;
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  projectType: string | null;
  capacity: number | null;
  slug: string | null;
  reviewCount: number;
  avgRating: number;
}

export interface MarketplaceCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  projectCount: number;
}

export interface MarketplaceTenantProfile {
  tenant: {
    id: string;
    name: string;
    subdomain: string;
    description: string | null;
    primaryColor: string | null;
    location: string | null;
    phone: string | null;
    capacity: number | null;
    currency: string | null;
  };
  projects: Array<{
    id: string;
    name: string;
    description: string | null;
    type: string | null;
    capacity: number | null;
    slug: string | null;
  }>;
  reviews: Array<{
    id: string;
    reviewerName: string;
    rating: number;
    comment: string | null;
    createdAt: string;
    projectName: string;
  }>;
  categories: Array<{ name: string; slug: string }>;
}

export interface MarketplaceReview {
  id: string;
  reviewerName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export function getMarketplaceListings(params?: { search?: string; category?: string; page?: number; pageSize?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.category) searchParams.set('category', params.category);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  const qs = searchParams.toString();
  return apiFetch<{ data: MarketplaceListing[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
    `/marketplace${qs ? `?${qs}` : ''}`
  );
}

export function getMarketplaceCategories() {
  return apiFetch<MarketplaceCategory[]>('/marketplace/categories');
}

export function getMarketplaceTenantProfile(slug: string) {
  return apiFetch<MarketplaceTenantProfile>(`/marketplace/${encodeURIComponent(slug)}`);
}

export function submitMarketplaceReview(data: { project_id: string; reviewer_name?: string; rating: number; comment?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/marketplace/reviews', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getMarketplaceReviews(projectId: string) {
  return apiFetch<MarketplaceReview[]>(`/marketplace/reviews/${encodeURIComponent(projectId)}`);
}

// ─── Inventory Adjustments (B2.2) ───────────────────────────────────────
export interface InventoryAdjustment {
  id: string;
  tenantId: string;
  productId: string;
  adjustment: number;
  reason: string;
  reference: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  productName?: string;
}

export function getInventoryAdjustments() {
  return apiFetch<InventoryAdjustment[]>('/inventory/adjustments');
}

export function createInventoryAdjustment(data: {
  product_id: string;
  adjustment: number;
  reason?: string;
  reference?: string;
  notes?: string;
}) {
  return apiFetch<{ id: string; success: boolean; new_stock: number }>('/inventory/adjustments', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function getReorderSuggestions() {
  return apiFetch<{ suggestions: Array<{
    id: string;
    name: string;
    stock_quantity: number;
    reorder_point: number;
    min_stock_level: number;
    supplier_name: string | null;
    suggested_order_qty: number;
  }> }>('/inventory/reorder-suggestions');
}

// ─── Service Enhancements (B4) ──────────────────────────────────────────
export function assignServiceWorker(bookingId: string, workerId: string) {
  return apiFetch<{ id: string; assigned_worker_id: string; success: boolean }>(
    `/services/bookings/${encodeURIComponent(bookingId)}/assign`,
    { method: 'PATCH', body: JSON.stringify({ assigned_worker_id: workerId }) }
  );
}

export function getServiceAvailability(itemId: string) {
  return apiFetch<Array<{
    id: string;
    service_item_id: string;
    worker_id: string | null;
    available_date: string;
    available_from: string;
    available_to: string;
    is_available: number;
  }>>(`/services/items/${encodeURIComponent(itemId)}/availability`);
}

export function createServiceAvailabilitySlot(itemId: string, data: {
  available_date: string;
  available_from: string;
  available_to: string;
  worker_id?: string;
  is_available?: number;
}) {
  return apiFetch<{ id: string; success: boolean }>(
    `/services/items/${encodeURIComponent(itemId)}/availability`,
    { method: 'POST', body: JSON.stringify(data) }
  );
}

export function getServiceReviews() {
  return apiFetch<Array<{
    id: string;
    service_item_id: string;
    customer_name: string | null;
    rating: number;
    comment: string | null;
    created_at: string;
    item_name?: string;
  }>>('/services/reviews');
}

export function submitServiceReview(data: {
  service_item_id: string;
  booking_id?: string;
  customer_name?: string;
  rating: number;
  comment?: string;
}) {
  return apiFetch<{ id: string; success: boolean }>('/services/reviews', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateServicePricing(itemId: string, data: { price_tier: string; price_premium?: number }) {
  return apiFetch<{ id: string; success: boolean }>(
    `/services/items/${encodeURIComponent(itemId)}/pricing`,
    { method: 'PUT', body: JSON.stringify(data) }
  );
}

// ─── Analytics Enhancements (C2) ─────────────────────────────────────────
export function getRevenueBreakdown(days?: number) {
  const qs = days ? `?days=${days}` : '';
  return apiFetch<{
    days: number;
    by_product_type: Array<{ type: string; revenue: number; order_count: number }>;
    by_payment_method: Array<{ method: string; revenue: number; count: number }>;
    accommodation: { revenue: number; order_count: number };
  }>(`/reports/revenue-breakdown${qs}`);
}

export function getCustomerMetrics(days?: number) {
  const qs = days ? `?days=${days}` : '';
  return apiFetch<{
    days: number;
    total_customers: number;
    new_customers: number;
    repeat_customers: number;
    avg_order_value: number;
    avg_collected: number;
  }>(`/reports/customer-metrics${qs}`);
}

export function getSeasonalComparison() {
  return apiFetch<{
    accommodation_monthly: Array<{ month: string; revenue: number; order_count: number }>;
    pos_monthly: Array<{ month: string; revenue: number; tx_count: number }>;
  }>('/reports/seasonal');
}

// ─── Financial Management (Agent F) ────────────────────────────────────────
export function getFinancialAccounts() {
  return apiFetch<Array<{ id: string; code: string; name: string; type: string; isActive: number }>>('/financials/accounts');
}

export function createFinancialAccount(data: { code: string; name: string; type: string; parentId?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/financials/accounts', { method: 'POST', body: JSON.stringify(data) });
}

export function updateFinancialAccount(id: string, data: { name?: string; type?: string; isActive?: number }) {
  return apiFetch<{ success: boolean }>(`/financials/accounts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteFinancialAccount(id: string) {
  return apiFetch<{ success: boolean }>(`/financials/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getFinancialJournals() {
  return apiFetch<Array<{ id: string; name: string; type: string; isActive: number }>>('/financials/journals');
}

export function createFinancialJournal(data: { name: string; type: string }) {
  return apiFetch<{ id: string; success: boolean }>('/financials/journals', { method: 'POST', body: JSON.stringify(data) });
}

export function getJournalEntries(params?: { journalId?: string; startDate?: string; endDate?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
  return apiFetch<Array<{ id: string; journalId: string; date: string; description: string; posted: number }>>(`/financials/journal-entries${qs}`);
}

export function createJournalEntry(data: { journalId: string; date: string; description?: string; reference?: string; lines: Array<{ accountId: string; debit: number; credit: number }> }) {
  return apiFetch<{ id: string; success: boolean }>('/financials/journal-entries', { method: 'POST', body: JSON.stringify(data) });
}

export function postJournalEntry(id: string) {
  return apiFetch<{ success: boolean }>(`/financials/journal-entries/${encodeURIComponent(id)}/post`, { method: 'POST' });
}

export function getFinancialInvoices(params?: { status?: string; type?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
  return apiFetch<Array<{ id: string; invoiceNumber: string; type: string; totalAmount: number; paidAmount: number; status: string }>>(`/financials/invoices${qs}`);
}

export function createFinancialInvoice(data: { type: string; contactId?: string; issueDate: string; dueDate?: string; currency?: string; notes?: string; lines: Array<{ description: string; quantity: number; unitPrice: number; taxRate?: number }> }) {
  return apiFetch<{ id: string; invoiceNumber: string; success: boolean }>('/financials/invoices', { method: 'POST', body: JSON.stringify(data) });
}

export function updateInvoiceStatus(id: string, status: string) {
  return apiFetch<{ success: boolean }>(`/financials/invoices/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function createPayment(data: { invoiceId?: string; amount: number; paymentDate: string; method: string; reference?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/financials/payments', { method: 'POST', body: JSON.stringify(data) });
}

export function getTaxRates() {
  return apiFetch<Array<{ id: string; name: string; rate: number; jurisdiction: string | null; isDefault: number }>>('/financials/tax-rates');
}

export function createTaxRate(data: { name: string; rate: number; jurisdiction?: string; isDefault?: number }) {
  return apiFetch<{ id: string; success: boolean }>('/financials/tax-rates', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Payment Gateway (Stub) ─────────────────────────────────────────────────
export function processPayment(data: { invoiceId?: string; amount: number; method: string; currency?: string; customerEmail?: string }) {
  return apiFetch<{ id: string; paymentIntentId: string; clientSecret: string; amount: number; currency: string; status: string; message: string; success: boolean }>('/financials/process-payment', { method: 'POST', body: JSON.stringify(data) });
}

export function confirmFinancialPayment(paymentId: string) {
  return apiFetch<{ success: boolean; status: string }>('/financials/confirm-payment', { method: 'POST', body: JSON.stringify({ paymentId }) });
}

// ─── HR & Payroll (Agent H) ────────────────────────────────────────────────
export function getHrEmployees() {
  return apiFetch<Array<{ id: string; firstName: string; lastName: string; email: string; department: string; position: string; status: string; salaryAmount: number }>>('/hr/employees');
}

export function createHrEmployee(data: { firstName: string; lastName: string; email: string; hireDate: string; department?: string; position?: string; salaryType?: string; salaryAmount: number }) {
  return apiFetch<{ id: string; success: boolean }>('/hr/employees', { method: 'POST', body: JSON.stringify(data) });
}

export function updateHrEmployee(id: string, data: Record<string, unknown>) {
  return apiFetch<{ success: boolean }>(`/hr/employees/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteHrEmployee(id: string) {
  return apiFetch<{ success: boolean }>(`/hr/employees/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getHrLeaveTypes() {
  return apiFetch<Array<{ id: string; name: string; accrualRate: number; isPaid: number }>>('/hr/leave-types');
}

export function createHrLeaveType(data: { name: string; accrualRate: number; isPaid?: number }) {
  return apiFetch<{ id: string; success: boolean }>('/hr/leave-types', { method: 'POST', body: JSON.stringify(data) });
}

export function getHrLeaveRequests() {
  return apiFetch<Array<{ id: string; employeeId: string; leaveTypeId: string; startDate: string; endDate: string; days: number; status: string }>>('/hr/leave-requests');
}

export function createHrLeaveRequest(data: { employeeId: string; leaveTypeId: string; startDate: string; endDate: string; days: number; notes?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/hr/leave-requests', { method: 'POST', body: JSON.stringify(data) });
}

export function approveHrLeaveRequest(id: string, status: string) {
  return apiFetch<{ success: boolean }>(`/hr/leave-requests/${encodeURIComponent(id)}/approve`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function getHrPayrollRuns() {
  return apiFetch<Array<{ id: string; periodStart: string; periodEnd: string; status: string; totalGross: number; totalDeductions: number; totalNet: number }>>('/hr/payroll/runs');
}

export function createHrPayrollRun(data: { periodStart: string; periodEnd: string; runDate: string }) {
  return apiFetch<{ id: string; success: boolean }>('/hr/payroll/runs', { method: 'POST', body: JSON.stringify(data) });
}

export function postHrPayrollRun(id: string) {
  return apiFetch<{ success: boolean }>(`/hr/payroll/runs/${encodeURIComponent(id)}/post`, { method: 'POST' });
}

export function getHrJobPosts() {
  return apiFetch<Array<{ id: string; title: string; department: string; location: string; status: string }>>('/hr/job-posts');
}

export function createHrJobPost(data: { title: string; description?: string; department?: string; location?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/hr/job-posts', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Supply Chain (Agent S) ────────────────────────────────────────────────
export function getSupplyWarehouses() {
  return apiFetch<Array<{ id: string; name: string; location: string; isActive: number }>>('/supply/warehouses');
}

export function createSupplyWarehouse(data: { name: string; location?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/supply/warehouses', { method: 'POST', body: JSON.stringify(data) });
}

export function getSupplyStock(params?: { warehouseId?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
  return apiFetch<Array<{ id: string; productId: string; warehouseId: string; quantity: number; reserved: number; productName?: string; warehouseName?: string }>>(`/supply/stock${qs}`);
}

export function adjustSupplyStock(data: { productId: string; warehouseId: string; quantity: number }) {
  return apiFetch<{ id: string; success: boolean }>('/supply/stock', { method: 'POST', body: JSON.stringify(data) });
}

export function getSupplyTransfers() {
  return apiFetch<Array<{ id: string; fromWarehouseId: string; toWarehouseId: string; productId: string; quantity: number; status: string }>>('/supply/stock-transfers');
}

export function createSupplyTransfer(data: { fromWarehouseId: string; toWarehouseId: string; productId: string; quantity: number }) {
  return apiFetch<{ id: string; success: boolean }>('/supply/stock-transfers', { method: 'POST', body: JSON.stringify(data) });
}

export function confirmSupplyTransfer(id: string) {
  return apiFetch<{ success: boolean }>(`/supply/stock-transfers/${encodeURIComponent(id)}/confirm`, { method: 'PATCH' });
}

export function getSupplyPurchaseOrders() {
  return apiFetch<Array<{ id: string; poNumber: string; vendorId: string | null; orderDate: string; status: string; totalAmount: number }>>('/supply/purchase-orders');
}

export function createSupplyPurchaseOrder(data: { poNumber: string; vendorId?: string; orderDate: string; expectedDelivery?: string; notes?: string; lines: Array<{ productId: string; quantity: number; unitPrice: number }> }) {
  return apiFetch<{ id: string; success: boolean }>('/supply/purchase-orders', { method: 'POST', body: JSON.stringify(data) });
}

export function receiveSupplyPurchaseOrder(id: string) {
  return apiFetch<{ success: boolean }>(`/supply/purchase-orders/${encodeURIComponent(id)}/receive`, { method: 'PATCH' });
}

export function getSupplyBoms() {
  return apiFetch<Array<{ id: string; productId: string; name: string; version: number; isActive: number }>>('/supply/boms');
}

export function createSupplyBom(data: { productId: string; name: string; lines: Array<{ componentId: string; quantity: number; unit?: string }> }) {
  return apiFetch<{ id: string; success: boolean }>('/supply/boms', { method: 'POST', body: JSON.stringify(data) });
}

export function getSupplyManufacturingOrders() {
  return apiFetch<Array<{ id: string; bomId: string; productId: string; quantity: number; status: string; producedQuantity: number }>>('/supply/manufacturing-orders');
}

export function createSupplyManufacturingOrder(data: { bomId: string; productId: string; quantity: number; startDate?: string; endDate?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/supply/manufacturing-orders', { method: 'POST', body: JSON.stringify(data) });
}

export function progressSupplyManufacturingOrder(id: string, producedQuantity: number) {
  return apiFetch<{ success: boolean }>(`/supply/manufacturing-orders/${encodeURIComponent(id)}/progress`, { method: 'PATCH', body: JSON.stringify({ producedQuantity }) });
}

// ─── CRM & Projects (Agent C) ──────────────────────────────────────────────
export function getCrmContacts(params?: { type?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
  return apiFetch<Array<{ id: string; type: string; name: string; email: string | null; phone: string | null; isCustomer: number; isVendor: number; isLead: number }>>(`/crm/contacts${qs}`);
}

export function createCrmContact(data: { type: string; name: string; email?: string; phone?: string; address?: string; industry?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/crm/contacts', { method: 'POST', body: JSON.stringify(data) });
}

export function updateCrmContact(id: string, data: Record<string, unknown>) {
  return apiFetch<{ success: boolean }>(`/crm/contacts/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function getCrmLeads() {
  return apiFetch<Array<{ id: string; contactId: string; status: string; source: string | null; value: number | null; assignedTo: string | null }>>('/crm/leads');
}

export function createCrmLead(data: { contactId: string; source?: string; value?: number; notes?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/crm/leads', { method: 'POST', body: JSON.stringify(data) });
}

export function updateCrmLeadStatus(id: string, status: string) {
  return apiFetch<{ success: boolean }>(`/crm/leads/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function getCrmOpportunities() {
  return apiFetch<Array<{ id: string; leadId: string | null; name: string; stage: string; amount: number; probability: number; expectedCloseDate: string | null; assignedTo: string | null }>>('/crm/opportunities');
}

export function createCrmOpportunity(data: { leadId?: string; name: string; amount?: number; probability?: number; expectedCloseDate?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/crm/opportunities', { method: 'POST', body: JSON.stringify(data) });
}

export function updateCrmOpportunityStage(id: string, stage: string) {
  return apiFetch<{ success: boolean }>(`/crm/opportunities/${encodeURIComponent(id)}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) });
}

export function getCrmTasks(params?: { projectId?: string; assigneeId?: string; status?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
  return apiFetch<Array<{ id: string; projectId: string | null; title: string; status: string; priority: string; assigneeId: string | null; dueDate: string | null }>>(`/crm/tasks${qs}`);
}

export function createCrmTask(data: { projectId?: string; title: string; description?: string; priority?: string; assigneeId?: string; dueDate?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/crm/tasks', { method: 'POST', body: JSON.stringify(data) });
}

export function updateCrmTaskStatus(id: string, status: string) {
  return apiFetch<{ success: boolean }>(`/crm/tasks/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function getCrmTickets() {
  return apiFetch<Array<{ id: string; contactId: string | null; subject: string; status: string; priority: string; assignedTo: string | null }>>('/crm/tickets');
}

export function createCrmTicket(data: { contactId?: string; subject: string; description?: string; priority?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/crm/tickets', { method: 'POST', body: JSON.stringify(data) });
}

export function addCrmTicketComment(ticketId: string, content: string, internal?: boolean) {
  return apiFetch<{ id: string; success: boolean }>(`/crm/tickets/${encodeURIComponent(ticketId)}/comments`, { method: 'POST', body: JSON.stringify({ content, internal }) });
}

export function getCrmKnowledgeArticles() {
  return apiFetch<Array<{ id: string; title: string; category: string | null; isPublished: number }>>('/crm/knowledge-articles');
}

export function createCrmKnowledgeArticle(data: { title: string; content: string; category?: string; tags?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/crm/knowledge-articles', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Storefront (Agent E) ──────────────────────────────────────────────────
export function getStorefrontProducts(params?: { category?: string; search?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
  return apiFetch<Array<{ id: string; name: string; sellingPrice: number; description: string; imageUrl: string | null }>>(`/storefront/products${qs}`);
}

export function getStorefrontProduct(id: string) {
  return apiFetch<{ id: string; name: string; sellingPrice: number; description: string; imageUrl: string | null }>(`/storefront/products/${encodeURIComponent(id)}`);
}

export function getStorefrontCart(sessionId: string) {
  return apiFetch<{ id: string; items: Array<{ id: string; productId: string; quantity: number; unitPrice: number; totalPrice: number; productName?: string }> }>(`/storefront/cart?sessionId=${encodeURIComponent(sessionId)}`);
}

export function addToStorefrontCart(data: { productId: string; quantity: number; sessionId: string }) {
  return apiFetch<{ id: string; success: boolean }>('/storefront/cart/items', { method: 'POST', body: JSON.stringify(data) });
}

export function updateStorefrontCartItem(id: string, quantity: number) {
  return apiFetch<{ success: boolean }>(`/storefront/cart/items/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ quantity }) });
}

export function removeStorefrontCartItem(id: string) {
  return apiFetch<{ success: boolean }>(`/storefront/cart/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function checkoutStorefront(data: { sessionId: string; customerEmail?: string; customerPhone?: string; shippingAddress?: string }) {
  return apiFetch<{ orderId: string; orderNumber: string; success: boolean }>('/storefront/checkout', { method: 'POST', body: JSON.stringify(data) });
}

export function getStorefrontOrders(sessionId: string) {
  return apiFetch<Array<{ id: string; orderNumber: string; totalAmount: number; status: string; createdAt: string }>>(`/storefront/orders?sessionId=${encodeURIComponent(sessionId)}`);
}

export function getStorefrontPages() {
  return apiFetch<Array<{ id: string; slug: string; title: string; isPublished: number }>>('/storefront/admin/pages');
}

export function createStorefrontPage(data: { slug: string; title: string; content?: string; metaTitle?: string; metaDescription?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/storefront/admin/pages', { method: 'POST', body: JSON.stringify(data) });
}

export function updateStorefrontPage(id: string, data: Record<string, unknown>) {
  return apiFetch<{ success: boolean }>(`/storefront/admin/pages/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteStorefrontPage(id: string) {
  return apiFetch<{ success: boolean }>(`/storefront/admin/pages/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getStorefrontBlogPosts() {
  return apiFetch<Array<{ id: string; slug: string; title: string; category: string | null; isPublished: number }>>('/storefront/admin/blog');
}

export function createStorefrontBlogPost(data: { slug: string; title: string; content: string; excerpt?: string; category?: string; tags?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/storefront/admin/blog', { method: 'POST', body: JSON.stringify(data) });
}

export function updateStorefrontBlogPost(id: string, data: Record<string, unknown>) {
  return apiFetch<{ success: boolean }>(`/storefront/admin/blog/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteStorefrontBlogPost(id: string) {
  return apiFetch<{ success: boolean }>(`/storefront/admin/blog/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ─── AI & Intelligence (Agent A) ───────────────────────────────────────────
export function getAiPredictions(params?: { modelType?: string }) {
  const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
  return apiFetch<Array<{ id: string; modelType: string; targetId: string | null; predictedValue: string; confidence: number; createdAt: string }>>(`/ai/predictions${qs}`);
}

export function createAiPrediction(data: { modelType: string; targetId?: string; predictedValue: string; inputFeatures?: string; confidence?: number }) {
  return apiFetch<{ id: string; success: boolean }>('/ai/predictions', { method: 'POST', body: JSON.stringify(data) });
}

export function getAiDynamicPrice(data: { productId: string; currentPrice: number; historicalSales?: number[]; competitorPrice?: number }) {
  return apiFetch<{ suggestedPrice: number; confidence: number; factors: Record<string, unknown> }>('/ai/dynamic-price', { method: 'POST', body: JSON.stringify(data) });
}

export function getAiForecast(data: { productId: string; periodDays: number }) {
  return apiFetch<{ forecasts: Array<{ date: string; predictedDemand: number; confidence: number }> }>('/ai/forecast', { method: 'POST', body: JSON.stringify(data) });
}

export function getAiAnomaly(data: { type: string; data: Record<string, unknown> }) {
  return apiFetch<{ anomalies: Array<{ field: string; expected: number; actual: number; severity: string }> }>('/ai/anomaly', { method: 'POST', body: JSON.stringify(data) });
}

export function getAiPriceRules() {
  return apiFetch<Array<{ id: string; name: string; productId: string | null; ruleType: string; minPrice: number | null; maxPrice: number | null; adjustmentPercent: number; isActive: number }>>('/ai/price-rules');
}

export function createAiPriceRule(data: { name: string; productId?: string; ruleType: string; minPrice?: number; maxPrice?: number; adjustmentPercent?: number }) {
  return apiFetch<{ id: string; success: boolean }>('/ai/price-rules', { method: 'POST', body: JSON.stringify(data) });
}

export function updateAiPriceRule(id: string, data: Record<string, unknown>) {
  return apiFetch<{ success: boolean }>(`/ai/price-rules/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteAiPriceRule(id: string) {
  return apiFetch<{ success: boolean }>(`/ai/price-rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getAiAutomationRules() {
  return apiFetch<Array<{ id: string; name: string; triggerEvent: string; isActive: number; lastTriggeredAt: string | null; triggerCount: number }>>('/ai/automation-rules');
}

export function createAiAutomationRule(data: { name: string; triggerEvent: string; conditionJson?: string; actionJson?: string }) {
  return apiFetch<{ id: string; success: boolean }>('/ai/automation-rules', { method: 'POST', body: JSON.stringify(data) });
}

export function toggleAiAutomationRule(id: string) {
  return apiFetch<{ success: boolean; isActive: number }>(`/ai/automation-rules/${encodeURIComponent(id)}/activate`, { method: 'PATCH' });
}

export function getAiAutomationLogs() {
  return apiFetch<Array<{ id: string; ruleId: string | null; triggerEvent: string; result: string; error: string | null; createdAt: string }>>('/ai/automation-logs');
}

// ─── Workers AI (Stub) ──────────────────────────────────────────────────────
export function analyzeWithWorkersAI(data: { prompt: string; model?: string; maxTokens?: number }) {
  return apiFetch<{ id: string; model: string; response: string; tokens_used: number; created_at: string; message: string; success: boolean }>('/ai/workers-ai/analyze', { method: 'POST', body: JSON.stringify(data) });
}

export function generateEmbeddings(data: { text: string; model?: string }) {
  return apiFetch<{ id: string; model: string; embeddings: number[][]; dimensions: number; message: string; success: boolean }>('/ai/workers-ai/embeddings', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Durable Objects State (Stub) ───────────────────────────────────────────
export function getDurableStateSessions() {
  return apiFetch<{ sessions: unknown[]; total: number; message: string; success: boolean }>('/ai/state/sessions');
}

export function syncDurableState(data: { key: string; value: unknown; ttl?: number }) {
  return apiFetch<{ key: string; stored: boolean; ttl: number; message: string; success: boolean }>('/ai/state/sync', { method: 'POST', body: JSON.stringify(data) });
}

export function getDurableStateValue(key: string) {
  return apiFetch<{ key: string; value: unknown; found: boolean; message: string; success: boolean }>(`/ai/state/sync/${encodeURIComponent(key)}`);
}

// ─── Super Admin: Cross-Tenant Pillar Overview APIs ──────────────────

export function getSuperFinancialsOverview() {
  return apiFetch<{ revenue: { totalCamps: number; totalRevenue: number; collectedAmount: number; pendingAmount: number; averageRevenuePerCamp: number; revenuePerCamp: Array<{ campId: number; campName: string; revenue: number; collected: number; pending: number }> }; collections: { outstandingInvoices: number; overdueInvoices: number; averageCollectionPeriod: number; collectionRate: number } }>('/admin/financials/overview');
}

export function getSuperInvoices(page = 1, limit = 20) {
  return apiFetch<Paginated<{ id: number; tenantId: number; campId: number; campName: string; guestName: string; amount: number; currency: string; status: string; dueDate: string; paidDate: string | null; invoiceNumber: string; createdAt: string }>>(`/admin/financials/invoices?page=${page}&limit=${limit}`);
}

export function getSuperHROverview() {
  return apiFetch<{ employees: { totalEmployees: number; activeEmployees: number; pendingLeaveRequests: number; recentHires: number; terminationRate: number }; payroll: { totalPayroll: number; averageSalary: number; pendingPayrollRuns: number; lastPayrollDate: string | null }; training: { completionRate: number; overdueTrainings: number; upcomingSessions: number } }>('/admin/hr/overview');
}

export function getSuperEmployees(page = 1, limit = 20) {
  return apiFetch<Paginated<{ id: number; tenantId: number; campId: number; campName: string; firstName: string; lastName: string; email: string; position: string; department: string; status: string; hireDate: string; salary: number; currency: string; createdAt: string }>>(`/admin/hr/employees?page=${page}&limit=${limit}`);
}

export function getSuperSupplyOverview() {
  return apiFetch<{ inventory: { totalWarehouses: number; totalProducts: number; lowStockAlerts: number; totalInventoryValue: number; averageStockLevel: number }; procurement: { pendingPurchaseOrders: number; totalSpend: number; averageOrderValue: number; suppliers: number; recentOrders: Array<{ id: number; supplier: string; amount: number; status: string; expectedDate: string }> } }>('/admin/supply/overview');
}

export function getSuperPurchaseOrders(page = 1, limit = 20) {
  return apiFetch<Paginated<{ id: number; tenantId: number; campId: number; campName: string; supplier: string; totalAmount: number; currency: string; status: string; expectedDate: string; actualDate: string | null; items: number; createdAt: string }>>(`/admin/supply/purchase-orders?page=${page}&limit=${limit}`);
}

export function getSuperCRMOverview() {
  return apiFetch<{ contacts: { totalContacts: number; activeContacts: number; conversionRate: number; averageLeadScore: number }; pipeline: { totalLeads: number; qualifiedLeads: number; opportunities: number; totalPipelineValue: number; averageDealSize: number; winRate: number }; support: { totalTickets: number; openTickets: number; averageResolutionTime: number; satisfactionRate: number } }>('/admin/crm/overview');
}

export function getSuperContacts(page = 1, limit = 20) {
  return apiFetch<Paginated<{ id: number; tenantId: number; campId: number; campName: string; firstName: string; lastName: string; email: string; phone: string; company: string; leadScore: number; status: string; source: string; lastContacted: string | null; createdAt: string }>>(`/admin/crm/contacts?page=${page}&limit=${limit}`);
}

export function getSuperOpportunities(page = 1, limit = 20) {
  return apiFetch<Paginated<{ id: number; tenantId: number; campId: number; campName: string; name: string; value: number; currency: string; stage: string; probability: number; expectedCloseDate: string; contactName: string; contactEmail: string; createdAt: string }>>(`/admin/crm/opportunities?page=${page}&limit=${limit}`);
}

export function getSuperStorefrontOverview() {
  return apiFetch<{ products: { totalProducts: number; activeProducts: number; draftProducts: number; averagePrice: number }; sales: { totalOrders: number; totalRevenue: number; averageOrderValue: number; conversionRate: number; topSelling: Array<{ productId: number; productName: string; quantity: number; revenue: number }> }; pos: { totalPOSTransactions: number; posRevenue: number; averagePOSTransaction: number; activeTerminals: number } }>('/admin/storefront/overview');
}

export function getSuperStorefrontProducts(page = 1, limit = 20) {
  return apiFetch<Paginated<{ id: number; tenantId: number; campId: number; campName: string; name: string; description: string; price: number; currency: string; category: string; status: string; stockQuantity: number; imageUrl: string | null; createdAt: string }>>(`/admin/storefront/products?page=${page}&limit=${limit}`);
}

export function getSuperAIOverview() {
  return apiFetch<{ predictions: { totalPredictions: number; activeModels: number; averageAccuracy: number; recentPredictions: number }; automation: { totalRules: number; activeRules: number; triggeredToday: number; successRate: number; totalExecutions: number }; insights: { priceOptimizations: number; demandForecasts: number; anomalyDetections: number; lastUpdated: string | null } }>('/admin/ai/overview');
}

export function getSuperPredictions(page = 1, limit = 20) {
  return apiFetch<Paginated<{ id: number; tenantId: number; campId: number; campName: string; modelType: string; prediction: string; confidence: number; inputFeatures: string; status: string; validUntil: string; createdAt: string }>>(`/admin/ai/predictions?page=${page}&limit=${limit}`);
}

// ─── Generic request helper (used by SupplyPanel, etc.) ─────────────────────

export async function request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, init);
}

// ─── HR Module: Additional API Functions ────────────────────────────────────

export function createHrApplicant(data: Record<string, unknown>) {
  return apiFetch('/hr/applicants', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Storefront API Functions ───────────────────────────────────────────────

export function saveStorefrontPage(data: Record<string, unknown>, editId?: string) {
  const method = editId ? 'PUT' : 'POST';
  const path = editId ? `/storefront/pages/${editId}` : '/storefront/pages';
  return apiFetch(path, { method, body: JSON.stringify(data) });
}

export function saveStorefrontBlogPost(data: Record<string, unknown>, editId?: string) {
  const method = editId ? 'PUT' : 'POST';
  const path = editId ? `/storefront/blog/posts/${editId}` : '/storefront/blog/posts';
  return apiFetch(path, { method, body: JSON.stringify(data) });
}

export function saveStorefrontBlogCategory(data: Record<string, unknown>, editId?: string) {
  const method = editId ? 'PUT' : 'POST';
  const path = editId ? `/storefront/blog/categories/${editId}` : '/storefront/blog/categories';
  return apiFetch(path, { method, body: JSON.stringify(data) });
}

export function deleteStorefrontBlogCategory(id: string) {
  return apiFetch(`/storefront/blog/categories/${id}`, { method: 'DELETE' });
}

// ─── AI Module API Functions ────────────────────────────────────────────────

export function updateAIPriceRule(id: string, data: Record<string, unknown>) {
  return apiFetch(`/ai/price-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function createAIPriceRule(data: Record<string, unknown>) {
  return apiFetch('/ai/price-rules', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteAIPriceRule(id: string) {
  return apiFetch(`/ai/price-rules/${id}`, { method: 'DELETE' });
}

export function updateAIAutomationRule(id: string, data: Record<string, unknown>) {
  return apiFetch(`/ai/automation-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function createAIAutomationRule(data: Record<string, unknown>) {
  return apiFetch('/ai/automation-rules', { method: 'POST', body: JSON.stringify(data) });
}

export function toggleAIAutomationRule(id: string) {
  return apiFetch(`/ai/automation-rules/${id}/toggle`, { method: 'PUT' });
}

export function runAIForecast(data: Record<string, unknown>) {
  return apiFetch('/ai/forecast', { method: 'POST', body: JSON.stringify(data) });
}

// ─── Admin Settings API Functions ───────────────────────────────────────────

export function getAdminSettings() {
  return apiFetch('/admin/settings');
}

export function updateAdminSettings(data: Record<string, unknown>) {
  return apiFetch('/admin/settings', { method: 'PUT', body: JSON.stringify(data) });
}

// ─── Admin Subscriptions API Functions ──────────────────────────────────────

export function updateAdminSubscription(id: string, data: Record<string, unknown>) {
  return apiFetch(`/admin/subscriptions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function cancelAdminSubscription(id: string) {
  return apiFetch(`/admin/subscriptions/${id}/cancel`, { method: 'POST' });
}

export function resumeAdminSubscription(id: string) {
  return apiFetch(`/admin/subscriptions/${id}/resume`, { method: 'POST' });
}

// ─── Admin Reports API Functions ────────────────────────────────────────────

export function generateAdminReport(data: Record<string, unknown>) {
  return apiFetch('/admin/reports/generate', { method: 'POST', body: JSON.stringify(data) });
}

export function createAdminScheduledReport(data: Record<string, unknown>) {
  return apiFetch('/admin/reports/scheduled', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteAdminScheduledReport(id: string) {
  return apiFetch(`/admin/reports/scheduled/${id}`, { method: 'DELETE' });
}

// ─── Admin Performance API Functions ────────────────────────────────────────

export function exportAdminPerformance(format: string) {
  return apiFetch(`/admin/performance/export?format=${format}`);
}
