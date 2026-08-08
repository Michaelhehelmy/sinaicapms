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
  ? 'http://localhost:8787/api'
  : isSinaicamps
    ? '/api'
    : 'https://sinaicamps.com/api';

const TOKEN_KEY = 'sinaicamps_token';

// T7: refresh token used for silent session renewal on 401 (admin token only).
// POS has no refresh token (POS login issues only an access token).
export const REFRESH_TOKEN_KEY = 'sinaicamps_refresh_token';

// T6: pagination envelope shape shared by list endpoints
// { data, total, page, pageSize, hasMore } — clean migration from limit/offset
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export function getTenantId(): string {
  if (typeof window === 'undefined') return '';

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
// must never trigger a refresh while refreshing.
let _refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;

  try {
    const tenant = getTenantId();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (tenant) headers['x-tenant-id'] = tenant;

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;

    const data = (await response.json()) as Record<string, unknown>;
    const accessToken = data.token as string | undefined;
    if (!accessToken) return false;

    localStorage.setItem(TOKEN_KEY, accessToken);
    const newRefresh = data.refreshToken as string | undefined;
    if (newRefresh) localStorage.setItem(REFRESH_TOKEN_KEY, newRefresh);
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
  const isPosEndpoint = endpoint.startsWith('/pos/');
  const tokenKey = isPosEndpoint ? 'pos_token' : TOKEN_KEY;
  const token = localStorage.getItem(tokenKey);

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

      // T7: silent-refresh for admin sessions only. On 401 (not POS, not the refresh
      // endpoint itself), exchange the stored refresh token for a new access token and
      // retry the original request once. Falls through to the shared 401 handling below
      // if there is no refresh token, the refresh fails, or the retry still 401s.
      if (response.status === 401 && !isPosEndpoint && endpoint !== '/auth/refresh') {
        if (!_refreshPromise) {
          _refreshPromise = refreshAccessToken().finally(() => {
            _refreshPromise = null;
          });
        }
        const refreshed = await _refreshPromise;
        if (refreshed) {
          const newToken = localStorage.getItem(TOKEN_KEY);
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
        if (isPosEndpoint) {
          localStorage.removeItem('pos_token');
          localStorage.removeItem('pos_user');
        } else {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          localStorage.removeItem('sinaicamps_user');
        }
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

export function deleteCamp(id: number | string) {
  return apiFetch<Schemas['SuccessResponse']>(`/camps/${id}`, { method: 'DELETE' });
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

/** POS: Login */
export function posLogin(identifier: string, password: string) {
  return apiFetch<Schemas['PosLoginResponse']>('/pos/auth/login', {
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

/** POS: Create a product */
export function posCreateProduct(data: unknown) {
  return apiFetch('/pos/products', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** POS: Update a product */
export function posUpdateProduct(id: string | number, data: unknown) {
  return apiFetch(`/pos/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** POS: Delete a product */
export function posDeleteProduct(id: string | number) {
  return apiFetch(`/pos/products/${id}`, { method: 'DELETE' });
}

/** POS: Get orders */
export function posGetOrders() {
  return apiFetch<Schemas['PosOrderList']>('/pos/orders');
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

/** POS: Get customers */
export function posGetCustomers() {
  return apiFetch('/pos/customers');
}

/** POS: Get inventory */
export function posGetInventory() {
  return apiFetch('/pos/inventory');
}

/** POS: Get staff */
export function posGetStaff() {
  return apiFetch('/pos/staff');
}

/** POS: Get reports */
export function posGetReports() {
  return apiFetch('/pos/reports');
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
  const token = localStorage.getItem(TOKEN_KEY);
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

// ─── Backward-compat aliases (gradual migration) ──────────────────────
export const getReservations = getOrders;
export const saveReservation = saveOrder;
export const deleteReservation = deleteOrder;
export const getRoomTypes = getProducts;
export const saveRoomType = saveProduct;
export const deleteRoomType = deleteProduct;
