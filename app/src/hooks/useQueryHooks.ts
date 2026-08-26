/**
 * React Query hooks for SinaiCamps admin data.
 *
 * These hooks replace the custom useCachedData pattern in useAdminData.ts
 * with TanStack Query for automatic caching, background refetching,
 * stale-while-revalidate, and optimistic updates.
 *
 * Query key conventions:
 *   ['camps']            — list of all camps
 *   ['camps', id]        — single camp detail
 *   ['rooms']            — list of all rooms
 *   ['orders']           — list of orders (with optional filters)
 *   ['products']         — list of products (room types)
 *   ['ratePlans']        — list of rate plans
 *   ['plans']            — list of plans
 *   ['meals']            — list of meals
 *   ['categories']       — list of categories
 *   ['mealCategories']   — list of meal categories
 *   ['mealSchedules']    — list of meal schedules
 *   ['settings']         — tenant settings (from /me)
 *   ['inventory', 'low-stock'] — low-stock inventory items
 *   ['adminStats']       — super admin stats
 *   ['tenants']          — super admin tenants list
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';
import * as api from '@/lib/api';
import { apiFetch } from '@/lib/api';
import type { Paginated } from '@/lib/api';
// T8-C: spec-derived wire types — the typed api client is the contract source.
import type { components } from '@/lib/api-types';
import type { MetaRow, MetaWriteOps } from '@/lib/project-types';

type Schemas = components['schemas'];
import type {
  Camp,
  Product,
  Room,
  Order,
  RatePlan,
  Plan,
  Meal,
  Category,
  MealCategory,
  MealSchedule,
  TenantSettings,
} from './useAdminData';

// ─── Query Key Factories ──────────────────────────────────────────────

export const queryKeys = {
  // All admin-zone concerns are namespaced under ['admin', ...] so they can
  // never collide with other zones' caches (e.g. POS lives under ['pos', ...]).
  camps: ['admin', 'camps'] as const,
  camp: (id: string) => ['admin', 'camps', id] as const,
  products: ['admin', 'products'] as const,
  rooms: ['admin', 'rooms'] as const,
  orders: (params?: Record<string, string>) => ['admin', 'orders', params] as const,
  order: (id: string) => ['admin', 'orders', id] as const,
  ratePlans: ['admin', 'ratePlans'] as const,
  plans: ['admin', 'plans'] as const,
  meals: ['admin', 'meals'] as const,
  categories: ['admin', 'categories'] as const,
  mealCategories: ['admin', 'mealCategories'] as const,
  mealSchedules: (params?: Record<string, string>) => ['admin', 'mealSchedules', params] as const,
  settings: ['admin', 'settings'] as const,
  lowStock: ['admin', 'inventory', 'low-stock'] as const,
  adminStats: ['admin', 'stats'] as const,
  tenants: ['admin', 'tenants'] as const,
  admins: ['admin', 'admins'] as const,
  availability: (params: Record<string, string>) => ['admin', 'availability', params] as const,
  priceOverrides: (params: { productId: string; from?: string; to?: string }) => ['admin', 'price-overrides', params] as const,
  inbox: (params?: Record<string, string>) => ['admin', 'inbox', params] as const,
  inboxUnread: ['admin', 'inbox', 'unread'] as const,
  projectMeta: (id: string) => ['admin', 'projects', id, 'meta'] as const,
  tenantBilling: ['admin', 'tenantBilling'] as const,
  // HR (tenant-level)
  hrEmployees: ['admin', 'hr', 'employees'] as const,
  hrLeaveTypes: ['admin', 'hr', 'leaveTypes'] as const,
  hrLeaveRequests: ['admin', 'hr', 'leaveRequests'] as const,
  hrPayrollRuns: ['admin', 'hr', 'payrollRuns'] as const,
  hrJobPosts: ['admin', 'hr', 'jobPosts'] as const,
  // Financial (tenant-level)
  financialAccounts: ['admin', 'financials', 'accounts'] as const,
  financialJournals: ['admin', 'financials', 'journals'] as const,
  financialJournalEntries: ['admin', 'financials', 'journalEntries'] as const,
  financialInvoices: ['admin', 'financials', 'invoices'] as const,
  financialPayments: ['admin', 'financials', 'payments'] as const,
  financialTaxRates: ['admin', 'financials', 'taxRates'] as const,
  // Supply Chain (tenant-level)
  supplyWarehouses: ['admin', 'supply', 'warehouses'] as const,
  supplyStock: ['admin', 'supply', 'stock'] as const,
  supplyTransfers: ['admin', 'supply', 'transfers'] as const,
  supplyPurchaseOrders: ['admin', 'supply', 'purchaseOrders'] as const,
  supplyBoms: ['admin', 'supply', 'boms'] as const,
  supplyManufacturingOrders: ['admin', 'supply', 'manufacturingOrders'] as const,
  // CRM (tenant-level)
  crmContacts: ['admin', 'crm', 'contacts'] as const,
  crmLeads: ['admin', 'crm', 'leads'] as const,
  crmOpportunities: ['admin', 'crm', 'opportunities'] as const,
  crmTasks: ['admin', 'crm', 'tasks'] as const,
  crmTickets: ['admin', 'crm', 'tickets'] as const,
  crmKnowledgeArticles: ['admin', 'crm', 'knowledgeArticles'] as const,
  // Storefront (tenant-level)
  storefrontPages: ['admin', 'storefront', 'pages'] as const,
  storefrontBlogPosts: ['admin', 'storefront', 'blogPosts'] as const,
  storefrontBlogCategories: ['admin', 'storefront', 'blogCategories'] as const,
  storefrontCarts: ['admin', 'storefront', 'carts'] as const,
  storefrontOrders: ['admin', 'storefront', 'orders'] as const,
  // AI (tenant-level)
  aiPredictions: ['admin', 'ai', 'predictions'] as const,
  aiPriceRules: ['admin', 'ai', 'priceRules'] as const,
  aiAutomationRules: ['admin', 'ai', 'automationRules'] as const,
  aiAutomationLogs: ['admin', 'ai', 'automationLogs'] as const,
} as const;

// ─── Error Toast Helper ───────────────────────────────────────────────

function useErrorToast() {
  const { showToast } = useToast();
  return (message: string, err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    showToast(`${message}: ${msg}`, 'error');
  };
}

// ─── Data Hooks ───────────────────────────────────────────────────────

/** Fetch all camps */
export function useCampsQuery() {
  const toastError = useErrorToast();
  return useQuery<Camp[]>({
    queryKey: queryKeys.camps,
    queryFn: () => api.getCamps() as Promise<Camp[]>,
    meta: { errorMessage: 'Failed to load camps' },
    // react-query v5 removed onError on useQuery; throwOnError(fn) is the supported
    // replacement. Returning false keeps errors in query state (no throw to boundary)
    // while still firing the toast on failure.
    throwOnError: (err) => {
      toastError('Failed to load camps', err);
      return false;
    },
  });
}

/** Fetch all products (room types) */
export function useProductsQuery() {
  const toastError = useErrorToast();
  return useQuery<Product[]>({
    queryKey: queryKeys.products,
    queryFn: () => api.getProducts() as Promise<Product[]>,
    throwOnError: (err) => {
      toastError('Failed to load products', err);
      return false;
    },
  });
}

/** Fetch all rooms */
export function useRoomsQuery() {
  const toastError = useErrorToast();
  return useQuery<Room[]>({
    queryKey: queryKeys.rooms,
    queryFn: () => api.getRooms() as Promise<Room[]>,
    throwOnError: (err) => {
      toastError('Failed to load rooms', err);
      return false;
    },
  });
}

/** Fetch orders with optional filters */
export function useOrdersQuery(params?: Record<string, string>) {
  const toastError = useErrorToast();
  return useQuery<Paginated<Order>>({
    queryKey: queryKeys.orders(params),
    queryFn: () => api.getOrders(params) as Promise<Paginated<Order>>,
    throwOnError: (err) => {
      toastError('Failed to load orders', err);
      return false;
    },
  });
}

/** Fetch all rate plans */
export function useRatePlansQuery() {
  const toastError = useErrorToast();
  return useQuery<RatePlan[]>({
    queryKey: queryKeys.ratePlans,
    queryFn: () => api.getRatePlans() as Promise<RatePlan[]>,
    throwOnError: (err) => {
      toastError('Failed to load rate plans', err);
      return false;
    },
  });
}

/** Fetch all plans */
export function usePlansQuery() {
  const toastError = useErrorToast();
  return useQuery<Plan[]>({
    queryKey: queryKeys.plans,
    queryFn: () => api.getPlans() as Promise<Plan[]>,
    throwOnError: (err) => {
      toastError('Failed to load plans', err);
      return false;
    },
  });
}

/** Fetch all meals */
export function useMealsQuery() {
  const toastError = useErrorToast();
  return useQuery<Meal[]>({
    queryKey: queryKeys.meals,
    queryFn: () => api.getMeals() as Promise<Meal[]>,
    throwOnError: (err) => {
      toastError('Failed to load meals', err);
      return false;
    },
  });
}

/** Fetch all categories */
export function useCategoriesQuery() {
  const toastError = useErrorToast();
  return useQuery<Category[]>({
    queryKey: queryKeys.categories,
    queryFn: () => api.getCategories() as Promise<Category[]>,
    throwOnError: (err) => {
      toastError('Failed to load categories', err);
      return false;
    },
  });
}

/** Fetch all meal categories */
export function useMealCategoriesQuery() {
  const toastError = useErrorToast();
  return useQuery<MealCategory[]>({
    queryKey: queryKeys.mealCategories,
    queryFn: () => api.getMealCategories() as Promise<MealCategory[]>,
    throwOnError: (err) => {
      toastError('Failed to load meal categories', err);
      return false;
    },
  });
}

/** Fetch meal schedules with optional params */
export function useMealSchedulesQuery(params?: Record<string, string>) {
  const toastError = useErrorToast();
  return useQuery<MealSchedule[]>({
    queryKey: queryKeys.mealSchedules(params),
    queryFn: () => api.getMealSchedules(params) as Promise<MealSchedule[]>,
    throwOnError: (err) => {
      toastError('Failed to load meal schedules', err);
      return false;
    },
  });
}

/** Fetch tenant settings (from /me) */
export function useSettingsQuery() {
  const toastError = useErrorToast();
  return useQuery<TenantSettings>({
    queryKey: queryKeys.settings,
    queryFn: () => api.getMe() as Promise<TenantSettings>,
    throwOnError: (err) => {
      toastError('Failed to load settings', err);
      return false;
    },
  });
}

/** Low-stock inventory item (wire type from GET /api/inventory/low-stock) */
export type LowStockItem = Schemas['InventoryItem'];
/** Low-stock list envelope */
export type LowStockList = Schemas['InventoryLowStockList'];

/** Fetch low-stock inventory items for the tenant (GET /api/inventory/low-stock) */
export function useLowStock() {
  const toastError = useErrorToast();
  return useQuery<LowStockList>({
    queryKey: queryKeys.lowStock,
    queryFn: () => api.getLowStock(),
    throwOnError: (err) => {
      toastError('Failed to load low-stock items', err);
      return false;
    },
  });
}

/** Fetch super admin platform stats */
export function useAdminStatsQuery() {
  const toastError = useErrorToast();
  return useQuery<{ totalTenants: number; totalCamps: number; totalRooms: number; totalOrders: number; totalRevenue: number; totalAdmins: number }>({
    queryKey: queryKeys.adminStats,
    queryFn: () => api.getAdminStats(),
    throwOnError: (err) => {
      toastError('Failed to load platform stats', err);
      return false;
    },
  });
}

/** Fetch all tenants (super admin) — T6: paginated envelope via GET /admin/tenants */
export function useTenantsQuery() {
  const toastError = useErrorToast();
  return useQuery<Paginated<unknown>>({
    queryKey: queryKeys.tenants,
    queryFn: () => api.getAdminTenants() as Promise<Paginated<unknown>>,
    throwOnError: (err) => {
      toastError('Failed to load tenants', err);
      return false;
    },
  });
}

// ─── Mutation Hooks ───────────────────────────────────────────────────

/** Generic mutation helper with toast + cache invalidation */
function useCrudMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  queryKey: readonly unknown[],
  successMessage: string,
  errorMessage: string,
) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      showToast(successMessage, 'success');
    },
    onError: (err) => toastError(errorMessage, err),
  });
}

/** Save (create/update) a camp — with optimistic update */
export function useSaveCampMutation(editId?: string | number) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['CampCreateRequest'] | Schemas['CampUpdateRequest']) => api.saveCamp(data, editId),
    onMutate: async (newData) => {
      // Snapshot current cache for rollback
      const previousCamps = queryClient.getQueryData(queryKeys.camps);

      // Optimistically update cache
      queryClient.setQueryData(queryKeys.camps, (old: Camp[] | undefined) => {
        if (!old) return old;
        if (editId) {
          // Update existing camp
          return old.map((c) => (String(c.id) === String(editId) ? { ...c, ...(newData as Partial<Camp>) } : c));
        }
        // Add new camp (temporary id until server responds)
        return [...old, { ...(newData as Camp), id: `temp_${Date.now()}` }];
      });

      return { previousCamps };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previousCamps) {
        queryClient.setQueryData(queryKeys.camps, context.previousCamps);
      }
      toastError('Failed to save camp', _err);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.camps });
      showToast(editId ? 'Camp updated' : 'Camp created', 'success');
    },
  });
}

/** Delete a camp — with optimistic update */
export function useDeleteCampMutation() {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (id: string | number) => api.deleteCamp(id),
    onMutate: async (deletedId) => {
      const previousCamps = queryClient.getQueryData(queryKeys.camps);

      // Optimistically remove camp from cache
      queryClient.setQueryData(queryKeys.camps, (old: Camp[] | undefined) => {
        if (!old) return old;
        return old.filter((c) => String(c.id) !== String(deletedId));
      });

      return { previousCamps };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousCamps) {
        queryClient.setQueryData(queryKeys.camps, context.previousCamps);
      }
      toastError('Failed to delete camp', _err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.camps });
      showToast('Camp deleted', 'success');
    },
  });
}

// ─── Project Meta hooks ───────────────────────────────────────────────

/** Fetch a project's meta rows (EAV custom fields), keyed list endpoint. */
export function useProjectMetaQuery(projectId: string | null | undefined) {
  const toastError = useErrorToast();
  return useQuery<MetaRow[]>({
    queryKey: queryKeys.projectMeta(String(projectId)),
    queryFn: () => api.getProjectMeta(String(projectId)) as Promise<MetaRow[]>,
    enabled: !!projectId,
    staleTime: 30_000,
    throwOnError: (err) => {
      toastError('Failed to load project fields', err);
      return false;
    },
  });
}

/**
 * Execute a precomputed meta write-op diff (see `buildMetaOps`) against
 * /projects/:id/meta. Creates run before updates/deletes so a failed batch
 * never leaves an existing row half-mutated; all calls fire in parallel.
 * Invalidates the meta query on settle.
 */
export function useSaveProjectMetaMutation(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (ops: MetaWriteOps) => {
      if (!projectId) throw new Error('No project selected');
      const calls: Promise<unknown>[] = [
        ...ops.creates.map((c) => api.setProjectMeta(projectId, c.key, c.value)),
        ...ops.updates.map((u) => api.updateProjectMeta(projectId, u.id, u.value)),
        ...ops.deletes.map((id) => api.deleteProjectMeta(projectId, id)),
      ];
      await Promise.all(calls);
    },
    onError: (err) => toastError('Failed to save project fields', err),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projectMeta(String(projectId)) });
      showToast('Custom fields saved', 'success');
    },
  });
}

/** Save (create/update) a product */
export function useSaveProductMutation(editId?: string | number) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['ProductCreateRequest'] | Schemas['ProductUpdateRequest']) => api.saveProduct(data, editId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products });
      showToast(editId ? 'Product updated' : 'Product created', 'success');
    },
    onError: (err) => toastError('Failed to save product', err),
  });
}

/** Delete a product */
export function useDeleteProductMutation() {
  return useCrudMutation(
    (id: string | number) => api.deleteProduct(id),
    queryKeys.products,
    'Product deleted',
    'Failed to delete product',
  );
}

/** Save (create/update) a room — with optimistic update */
export function useSaveRoomMutation(editId?: string | number) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['RoomCreateRequest'] | Schemas['RoomUpdateRequest']) => api.saveRoom(data, editId),
    onMutate: async (newData) => {
      const previousRooms = queryClient.getQueryData(queryKeys.rooms);
      queryClient.setQueryData(queryKeys.rooms, (old: Room[] | undefined) => {
        if (!old) return old;
        if (editId) {
          return old.map((r) => (String(r.id) === String(editId) ? { ...r, ...(newData as Partial<Room>) } : r));
        }
        return [...old, { ...(newData as Room), id: `temp_${Date.now()}` }];
      });
      return { previousRooms };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousRooms) {
        queryClient.setQueryData(queryKeys.rooms, context.previousRooms);
      }
      toastError('Failed to save room', _err);
    },
    onSuccess: () => {
      showToast(editId ? 'Room updated' : 'Room created', 'success');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms });
    },
  });
}

/** Delete a room */
export function useDeleteRoomMutation() {
  return useCrudMutation(
    (id: string | number) => api.deleteRoom(id),
    queryKeys.rooms,
    'Room deleted',
    'Failed to delete room',
  );
}

/** Save (create/update) an order */
export function useSaveOrderMutation(editId?: string | number) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['OrderCreateRequest'] | Schemas['OrderUpdateRequest']) => api.saveOrder(data, editId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders() });
      showToast(editId ? 'Order updated' : 'Order created', 'success');
    },
    onError: (err) => toastError('Failed to save order', err),
  });
}

/** Delete an order */
export function useDeleteOrderMutation() {
  return useCrudMutation(
    (id: string | number) => api.deleteOrder(id),
    queryKeys.orders(),
    'Order deleted',
    'Failed to delete order',
  );
}

/** Save (create/update) a rate plan */
export function useSaveRatePlanMutation(editId?: string | number) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['RatePlanCreateRequest'] | Schemas['RatePlanUpdateRequest']) => api.saveRatePlan(data, editId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ratePlans });
      showToast(editId ? 'Rate plan updated' : 'Rate plan created', 'success');
    },
    onError: (err) => toastError('Failed to save rate plan', err),
  });
}

/** Delete a rate plan */
export function useDeleteRatePlanMutation() {
  return useCrudMutation(
    (id: string | number) => api.deleteRatePlan(id),
    queryKeys.ratePlans,
    'Rate plan deleted',
    'Failed to delete rate plan',
  );
}

/** Save (create/update) a meal */
export function useSaveMealMutation(editId?: string | number) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['MealCreateRequest'] | Schemas['MealUpdateRequest']) => api.saveMeal(data, editId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.meals });
      showToast(editId ? 'Meal updated' : 'Meal created', 'success');
    },
    onError: (err) => toastError('Failed to save meal', err),
  });
}

/** Delete a meal */
export function useDeleteMealMutation() {
  return useCrudMutation(
    (id: string | number) => api.deleteMeal(id),
    queryKeys.meals,
    'Meal deleted',
    'Failed to delete meal',
  );
}

/** Update tenant settings */
export function useUpdateSettingsMutation() {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['TenantMeUpdateRequest']) => api.updateBranding(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      showToast('Settings saved', 'success');
    },
    onError: (err) => toastError('Failed to save settings', err),
  });
}

// ─── Additional Mutation Hooks ────────────────────────────────────────

/** Save (create/update) a meal category */
export function useSaveMealCategoryMutation(editId?: string | number) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['MealCategoryCreateRequest'] | Schemas['MealCategoryUpdateRequest']) => api.saveMealCategory(data, editId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealCategories });
      showToast(editId ? 'Category updated' : 'Category created', 'success');
    },
    onError: (err) => toastError('Failed to save category', err),
  });
}

/** Delete a meal category */
export function useDeleteMealCategoryMutation() {
  return useCrudMutation(
    (id: string | number) => api.deleteMealCategory(id),
    queryKeys.mealCategories,
    'Category deleted',
    'Failed to delete category',
  );
}

/** Create a meal schedule */
export function useCreateMealScheduleMutation() {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['MealScheduleCreateRequest']) =>
      api.createMealSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealSchedules() });
      showToast('Meal scheduled', 'success');
    },
    onError: (err) => toastError('Failed to schedule meal', err),
  });
}

/** Delete a meal schedule */
export function useDeleteMealScheduleMutation() {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (id: string) => api.deleteMealSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealSchedules() });
      showToast('Meal removed', 'success');
    },
    onError: (err) => toastError('Failed to remove meal', err),
  });
}

/** Save (create/update) a plan */
export function useSavePlanMutation(editId?: string | number) {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['PlanCreateRequest'] | Schemas['PlanUpdateRequest']) => api.savePlan(data, editId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.plans });
      showToast(editId ? 'Plan updated' : 'Plan created', 'success');
    },
    onError: (err) => toastError('Failed to save plan', err),
  });
}

/** Delete a plan */
export function useDeletePlanMutation() {
  return useCrudMutation(
    (id: string | number) => api.deletePlan(id),
    queryKeys.plans,
    'Plan deleted',
    'Failed to delete plan',
  );
}

/** Update tenant settings (alias for settings mutation) */
export function useSaveSettingsMutation() {
  return useUpdateSettingsMutation();
}

/** Change password mutation */
export function useChangePasswordMutation() {
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      api.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      showToast('Password changed successfully', 'success');
    },
    onError: (err) => toastError('Failed to change password', err),
  });
}

// ─── Report Queries ───────────────────────────────────────────────────

/** Fetch occupancy report */
export function useOccupancyReportQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: ['reports', 'occupancy'] as const,
    queryFn: () => api.getOccupancyReport(),
    throwOnError: (err) => {
      toastError('Failed to load occupancy report', err);
      return false;
    },
  });
}

/** Fetch revenue report with optional date range */
export function useRevenueReportQuery(opts?: { days?: number; start?: string; end?: string }) {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: ['reports', 'revenue', opts] as const,
    queryFn: () => api.getRevenueReport(opts),
    throwOnError: (err) => {
      toastError('Failed to load revenue report', err);
      return false;
    },
  });
}

/** Fetch bookings report with optional date range */
export function useBookingsReportQuery(opts?: { days?: number; start?: string; end?: string }) {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: ['reports', 'bookings', opts] as const,
    queryFn: () => api.getBookingsReport(opts),
    throwOnError: (err) => {
      toastError('Failed to load bookings report', err);
      return false;
    },
  });
}

// ─── Super Admin Queries ──────────────────────────────────────────────

/** Fetch all admin users — T6: getAdmins returns a paginated envelope */
export function useAdminsQuery() {
  const toastError = useErrorToast();
  return useQuery<Paginated<unknown>>({
    queryKey: queryKeys.admins,
    queryFn: () => api.getAdmins() as Promise<Paginated<unknown>>,
    throwOnError: (err) => {
      toastError('Failed to load admins', err);
      return false;
    },
  });
}

// ─── Availability & Price Overrides ───────────────────────────────────

/** Fetch availability for a date range (optional product filter) */
export function useAvailabilityQuery(params: Record<string, string>) {
  const toastError = useErrorToast();
  return useQuery<Schemas['AvailabilityResponse']>({
    queryKey: queryKeys.availability(params),
    queryFn: () => api.getAvailability(params),
    throwOnError: (err) => {
      toastError('Failed to load availability', err);
      return false;
    },
  });
}

/** Fetch price overrides for a product (optional from/to window) */
export function usePriceOverridesQuery(params: { productId: string; from?: string; to?: string; enabled?: boolean }) {
  const toastError = useErrorToast();
  const { productId, from, to, enabled = true } = params;
  return useQuery<Schemas['PriceOverrideList']>({
    queryKey: queryKeys.priceOverrides({ productId, from, to }),
    queryFn: () => api.getPriceOverrides({ productId, from, to }),
    // The backend requires productId (400 without it). Callers without a
    // selected product (e.g. BookingCalendar before a room type is picked)
    // must pass enabled:false instead of firing a doomed request.
    enabled,
    throwOnError: (err) => {
      toastError('Failed to load price overrides', err);
      return false;
    },
  });
}

/** Save (upsert) price overrides for a product — invalidates availability + overrides */
export function useSetPriceOverrideMutation() {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: Schemas['PriceOverridePutRequest']) => api.setPriceOverrides(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'availability'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'price-overrides'] });
      showToast('Price override saved', 'success');
    },
    onError: (err) => toastError('Failed to save price override', err),
  });
}

/** Delete a single price override for a product + date — invalidates availability + overrides */
export function useDeletePriceOverrideMutation() {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({ productId, date }: { productId: string; date: string }) =>
      api.deletePriceOverride(productId, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'availability'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'price-overrides'] });
      showToast('Price override cleared', 'success');
    },
    onError: (err) => toastError('Failed to clear price override', err),
  });
}

// ─── Inbox (Unified) ──────────────────────────────────────────────────

/**
 * Fetch the unified inbox feed (GET /inbox) — merged leads + bookings.
 * Keeps the previous page's data visible while a new filter refetches
 * (placeholderData), so the panel never flashes an empty state.
 */
export function useInboxQuery(params?: Record<string, string>) {
  const toastError = useErrorToast();
  return useQuery<Schemas['InboxResponse']>({
    queryKey: queryKeys.inbox(params),
    queryFn: () => api.getInbox(params),
    placeholderData: (previous) => previous,
    throwOnError: (err) => {
      toastError('Failed to load inbox', err);
      return false;
    },
  });
}

/**
 * Poll the unread inbox count every 30s.
 * Fetches the lightest feed slice (`pageSize=1`) and exposes only the
 * envelope's `unread` count, so consumers render a number, not a page.
 */
export function useInboxUnreadQuery() {
  const toastError = useErrorToast();
  return useQuery<Schemas['InboxResponse'], Error, number>({
    queryKey: queryKeys.inboxUnread,
    queryFn: () => api.getInbox({ pageSize: '1' }),
    refetchInterval: 30000,
    select: (data) => data.unread,
    throwOnError: (err) => {
      toastError('Failed to load unread count', err);
      return false;
    },
  });
}

/** Mark an inbox item read — invalidates the feed + unread count. */
export function useMarkInboxReadMutation() {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({ kind, id }: { kind: 'lead' | 'booking'; id: string }) =>
      api.markInboxRead(kind, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox', 'unread'] });
      showToast('Marked as read', 'success');
    },
    onError: (err) => toastError('Failed to mark as read', err),
  });
}

/** Delete an inbox lead — invalidates the feed + unread count. */
export function useDeleteInboxLeadMutation() {
  const queryClient = useQueryClient();
  const toastError = useErrorToast();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (id: string) => api.deleteInboxLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'inbox', 'unread'] });
      showToast('Lead deleted', 'success');
    },
    onError: (err) => toastError('Failed to delete lead', err),
  });
}

// ─── Analytics Queries ─────────────────────────────────────────────────

/** Fetch top products (by quantity) for a given period */
export function useTopProductsQuery(days?: number, limit?: number) {
  const toastError = useErrorToast();
  return useQuery<{ days: number; top_products: api.TopProduct[] }>({
    queryKey: ['reports', 'topProducts', days, limit] as const,
    queryFn: () => api.getTopProducts(days, limit),
    throwOnError: (err) => {
      toastError('Failed to load top products', err);
      return false;
    },
  });
}

/** Fetch kitchen performance stats */
export function useKitchenPerformanceQuery(days?: number) {
  const toastError = useErrorToast();
  return useQuery<{ days: number; by_status: api.KitchenStatusCount[]; daily_trend: api.KitchenTrend[] }>({
    queryKey: ['reports', 'kitchenPerformance', days] as const,
    queryFn: () => api.getKitchenPerformance(days),
    throwOnError: (err) => {
      toastError('Failed to load kitchen performance', err);
      return false;
    },
  });
}

/** Fetch analytics low-stock items */
export function useAnalyticsLowStockQuery() {
  const toastError = useErrorToast();
  return useQuery<{ low_stock: api.LowStockItem[] }>({
    queryKey: ['reports', 'analyticsLowStock'] as const,
    queryFn: () => api.getAnalyticsLowStock(),
    throwOnError: (err) => {
      toastError('Failed to load low stock', err);
      return false;
    },
  });
}

/** Fetch revenue breakdown by product type and payment method */
export function useRevenueBreakdownQuery(days?: number) {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: ['reports', 'revenueBreakdown', days] as const,
    queryFn: () => api.getRevenueBreakdown(days),
    throwOnError: (err) => {
      toastError('Failed to load revenue breakdown', err);
      return false;
    },
  });
}

/** Fetch customer metrics for a given period */
export function useCustomerMetricsQuery(days?: number) {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: ['reports', 'customerMetrics', days] as const,
    queryFn: () => api.getCustomerMetrics(days),
    throwOnError: (err) => {
      toastError('Failed to load customer metrics', err);
      return false;
    },
  });
}

/** Fetch seasonal comparison data */
export function useSeasonalComparisonQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: ['reports', 'seasonalComparison'] as const,
    queryFn: () => api.getSeasonalComparison(),
    throwOnError: (err) => {
      toastError('Failed to load seasonal comparison', err);
      return false;
    },
  });
}

// ─── Promotion Queries ────────────────────────────────────────────────

/** Fetch all promotions */
export function usePromotionsQuery(includeInactive?: boolean) {
  const toastError = useErrorToast();
  return useQuery<api.Promotion[]>({
    queryKey: ['admin', 'promotions', includeInactive] as const,
    queryFn: () => api.getPromotions(includeInactive),
    throwOnError: (err) => {
      toastError('Failed to load promotions', err);
      return false;
    },
  });
}

// ─── Service Queries ──────────────────────────────────────────────────

/** Fetch all service definitions */
export function useServiceDefinitionsQuery() {
  const toastError = useErrorToast();
  return useQuery<api.ServiceDefinition[]>({
    queryKey: ['admin', 'serviceDefinitions'] as const,
    queryFn: () => api.getServiceDefinitions() as Promise<api.ServiceDefinition[]>,
    throwOnError: (err) => {
      toastError('Failed to load service definitions', err);
      return false;
    },
  });
}

/** Fetch all service items */
export function useServiceItemsQuery() {
  const toastError = useErrorToast();
  return useQuery<api.ServiceItem[]>({
    queryKey: ['admin', 'serviceItems'] as const,
    queryFn: () => api.getServiceItems() as Promise<api.ServiceItem[]>,
    throwOnError: (err) => {
      toastError('Failed to load service items', err);
      return false;
    },
  });
}

/** Fetch service bookings with optional status filter */
export function useServiceBookingsQuery(status?: string) {
  const toastError = useErrorToast();
  return useQuery<api.ServiceBooking[]>({
    queryKey: ['admin', 'serviceBookings', status] as const,
    queryFn: () => api.getServiceBookings(status) as Promise<api.ServiceBooking[]>,
    throwOnError: (err) => {
      toastError('Failed to load service bookings', err);
      return false;
    },
  });
}

// ─── POS User Queries ────────────────────────────────────────────────

/** Fetch POS users (staff) with pagination and optional filters */
export function usePosUsersQuery(params?: { page?: number; pageSize?: number; search?: string; tenantId?: string }) {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: ['admin', 'posUsers', params] as const,
    queryFn: () => api.getPosUsers(params),
    throwOnError: (err) => {
      toastError('Failed to load staff', err);
      return false;
    },
  });
}

// ─── HR Queries ───────────────────────────────────────────────────────

/** Fetch all HR employees */
export function useHrEmployeesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.hrEmployees,
    queryFn: () => api.getHrEmployees(),
    throwOnError: (err) => {
      toastError('Failed to load employees', err);
      return false;
    },
  });
}

/** Fetch all HR leave types */
export function useHrLeaveTypesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.hrLeaveTypes,
    queryFn: () => api.getHrLeaveTypes(),
    throwOnError: (err) => {
      toastError('Failed to load leave types', err);
      return false;
    },
  });
}

/** Fetch all HR leave requests */
export function useHrLeaveRequestsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.hrLeaveRequests,
    queryFn: () => api.getHrLeaveRequests(),
    throwOnError: (err) => {
      toastError('Failed to load leave requests', err);
      return false;
    },
  });
}

/** Fetch all HR payroll runs */
export function useHrPayrollRunsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.hrPayrollRuns,
    queryFn: () => api.getHrPayrollRuns(),
    throwOnError: (err) => {
      toastError('Failed to load payroll runs', err);
      return false;
    },
  });
}

/** Fetch all HR job posts */
export function useHrJobPostsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.hrJobPosts,
    queryFn: () => api.getHrJobPosts(),
    throwOnError: (err) => {
      toastError('Failed to load job posts', err);
      return false;
    },
  });
}

// ─── Financial Queries ────────────────────────────────────────────────

/** Fetch all financial accounts */
export function useFinancialAccountsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.financialAccounts,
    queryFn: () => api.getFinancialAccounts(),
    throwOnError: (err) => {
      toastError('Failed to load accounts', err);
      return false;
    },
  });
}

/** Fetch all financial journals */
export function useFinancialJournalsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.financialJournals,
    queryFn: () => api.getFinancialJournals(),
    throwOnError: (err) => {
      toastError('Failed to load journals', err);
      return false;
    },
  });
}

/** Fetch all financial journal entries */
export function useFinancialJournalEntriesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.financialJournalEntries,
    queryFn: () => api.getJournalEntries(),
    throwOnError: (err) => {
      toastError('Failed to load journal entries', err);
      return false;
    },
  });
}

/** Fetch all financial invoices */
export function useFinancialInvoicesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.financialInvoices,
    queryFn: () => api.getFinancialInvoices(),
    throwOnError: (err) => {
      toastError('Failed to load invoices', err);
      return false;
    },
  });
}

/** Fetch all financial payments */
export function useFinancialPaymentsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.financialPayments,
    queryFn: () => api.request('/financials/payments') as Promise<unknown[]>,
    throwOnError: (err) => {
      toastError('Failed to load payments', err);
      return false;
    },
  });
}

/** Fetch all financial tax rates */
export function useFinancialTaxRatesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.financialTaxRates,
    queryFn: () => api.getTaxRates(),
    throwOnError: (err) => {
      toastError('Failed to load tax rates', err);
      return false;
    },
  });
}

// ─── Supply Chain Queries ─────────────────────────────────────────────

/** Fetch all supply warehouses */
export function useSupplyWarehousesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.supplyWarehouses,
    queryFn: () => api.getSupplyWarehouses(),
    throwOnError: (err) => {
      toastError('Failed to load warehouses', err);
      return false;
    },
  });
}

/** Fetch all supply stock records */
export function useSupplyStockQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.supplyStock,
    queryFn: () => api.getSupplyStock(),
    throwOnError: (err) => {
      toastError('Failed to load stock', err);
      return false;
    },
  });
}

/** Fetch all supply stock transfers */
export function useSupplyTransfersQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.supplyTransfers,
    queryFn: () => api.getSupplyTransfers(),
    throwOnError: (err) => {
      toastError('Failed to load transfers', err);
      return false;
    },
  });
}

/** Fetch all supply purchase orders */
export function useSupplyPurchaseOrdersQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.supplyPurchaseOrders,
    queryFn: () => api.getSupplyPurchaseOrders(),
    throwOnError: (err) => {
      toastError('Failed to load purchase orders', err);
      return false;
    },
  });
}

/** Fetch all supply BOMs */
export function useSupplyBomsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.supplyBoms,
    queryFn: () => api.getSupplyBoms(),
    throwOnError: (err) => {
      toastError('Failed to load BOMs', err);
      return false;
    },
  });
}

/** Fetch all supply manufacturing orders */
export function useSupplyManufacturingOrdersQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.supplyManufacturingOrders,
    queryFn: () => api.getSupplyManufacturingOrders(),
    throwOnError: (err) => {
      toastError('Failed to load manufacturing orders', err);
      return false;
    },
  });
}

// ─── CRM Queries ──────────────────────────────────────────────────────

/** Fetch all CRM contacts */
export function useCrmContactsQuery() {
  const toastError = useErrorToast();
  return useQuery<Record<string, unknown>[]>({
    queryKey: queryKeys.crmContacts,
    queryFn: () => api.getCrmContacts() as Promise<Record<string, unknown>[]>,
    throwOnError: (err) => {
      toastError('Failed to load contacts', err);
      return false;
    },
  });
}

/** Fetch all CRM leads */
export function useCrmLeadsQuery() {
  const toastError = useErrorToast();
  return useQuery<Record<string, unknown>[]>({
    queryKey: queryKeys.crmLeads,
    queryFn: () => api.getCrmLeads() as Promise<Record<string, unknown>[]>,
    throwOnError: (err) => {
      toastError('Failed to load leads', err);
      return false;
    },
  });
}

/** Fetch all CRM opportunities */
export function useCrmOpportunitiesQuery() {
  const toastError = useErrorToast();
  return useQuery<Record<string, unknown>[]>({
    queryKey: queryKeys.crmOpportunities,
    queryFn: () => api.getCrmOpportunities() as Promise<Record<string, unknown>[]>,
    throwOnError: (err) => {
      toastError('Failed to load opportunities', err);
      return false;
    },
  });
}

/** Fetch all CRM tasks */
export function useCrmTasksQuery() {
  const toastError = useErrorToast();
  return useQuery<Record<string, unknown>[]>({
    queryKey: queryKeys.crmTasks,
    queryFn: () => api.getCrmTasks() as Promise<Record<string, unknown>[]>,
    throwOnError: (err) => {
      toastError('Failed to load tasks', err);
      return false;
    },
  });
}

/** Fetch all CRM tickets */
export function useCrmTicketsQuery() {
  const toastError = useErrorToast();
  return useQuery<Record<string, unknown>[]>({
    queryKey: queryKeys.crmTickets,
    queryFn: () => api.getCrmTickets() as Promise<Record<string, unknown>[]>,
    throwOnError: (err) => {
      toastError('Failed to load tickets', err);
      return false;
    },
  });
}

/** Fetch all CRM knowledge articles */
export function useCrmKnowledgeArticlesQuery() {
  const toastError = useErrorToast();
  return useQuery<Record<string, unknown>[]>({
    queryKey: queryKeys.crmKnowledgeArticles,
    queryFn: () => api.getCrmKnowledgeArticles() as Promise<Record<string, unknown>[]>,
    throwOnError: (err) => {
      toastError('Failed to load knowledge articles', err);
      return false;
    },
  });
}

// ─── Storefront Queries ───────────────────────────────────────────────

/** Fetch all storefront CMS pages */
export function useStorefrontPagesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.storefrontPages,
    queryFn: () => api.getStorefrontPages(),
    throwOnError: (err) => {
      toastError('Failed to load storefront pages', err);
      return false;
    },
  });
}

/** Fetch all storefront blog posts */
export function useStorefrontBlogPostsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.storefrontBlogPosts,
    queryFn: () => api.getStorefrontBlogPosts(),
    throwOnError: (err) => {
      toastError('Failed to load blog posts', err);
      return false;
    },
  });
}

/** Fetch all storefront blog categories */
export function useStorefrontBlogCategoriesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.storefrontBlogCategories,
    queryFn: () => apiFetch<unknown[]>('/storefront/admin/blog/categories'),
    throwOnError: (err) => {
      toastError('Failed to load blog categories', err);
      return false;
    },
  });
}

/** Fetch all storefront carts */
export function useStorefrontCartsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.storefrontCarts,
    queryFn: () => apiFetch<unknown[]>('/storefront/admin/carts'),
    throwOnError: (err) => {
      toastError('Failed to load carts', err);
      return false;
    },
  });
}

/** Fetch all storefront admin orders */
export function useStorefrontOrdersQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.storefrontOrders,
    queryFn: () => apiFetch<unknown[]>('/storefront/admin/orders'),
    throwOnError: (err) => {
      toastError('Failed to load storefront orders', err);
      return false;
    },
  });
}

// ─── AI Queries ───────────────────────────────────────────────────────

/** Fetch all AI predictions */
export function useAIPredictionsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.aiPredictions,
    queryFn: () => api.getAiPredictions(),
    throwOnError: (err) => {
      toastError('Failed to load AI predictions', err);
      return false;
    },
  });
}

/** Fetch all AI price rules */
export function useAIPriceRulesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.aiPriceRules,
    queryFn: () => api.getAiPriceRules(),
    throwOnError: (err) => {
      toastError('Failed to load AI price rules', err);
      return false;
    },
  });
}

/** Fetch all AI automation rules */
export function useAIAutomationRulesQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.aiAutomationRules,
    queryFn: () => api.getAiAutomationRules(),
    throwOnError: (err) => {
      toastError('Failed to load AI automation rules', err);
      return false;
    },
  });
}

/** Fetch all AI automation logs */
export function useAIAutomationLogsQuery() {
  const toastError = useErrorToast();
  return useQuery({
    queryKey: queryKeys.aiAutomationLogs,
    queryFn: () => api.getAiAutomationLogs(),
    throwOnError: (err) => {
      toastError('Failed to load AI automation logs', err);
      return false;
    },
  });
}

// ─── Backward-Compat Aliases ──────────────────────────────────────────
// These allow gradual migration — components can switch from useCamps() to useCampsQuery()
// without changing all call sites at once.

export { useCampsQuery as useCampsRQ };
export { useRoomsQuery as useRoomsRQ };
export { useOrdersQuery as useOrdersRQ };
export { useProductsQuery as useProductsRQ };
export { useRatePlansQuery as useRatePlansRQ };
export { usePlansQuery as usePlansRQ };

// ─── Super Admin: Cross-Tenant Pillar Overview Hooks ─────────────────
// Query key factories for paginated list queries
const superKeys = {
  financials: ['admin', 'financials'] as const,
  financialsOverview: ['admin', 'financials', 'overview'] as const,
  financialsInvoices: (page: number) => ['admin', 'financials', 'invoices', page] as const,
  hr: ['admin', 'hr'] as const,
  hrOverview: ['admin', 'hr', 'overview'] as const,
  hrEmployees: (page: number) => ['admin', 'hr', 'employees', page] as const,
  supply: ['admin', 'supply'] as const,
  supplyOverview: ['admin', 'supply', 'overview'] as const,
  supplyPurchaseOrders: (page: number) => ['admin', 'supply', 'purchase-orders', page] as const,
  crm: ['admin', 'crm'] as const,
  crmOverview: ['admin', 'crm', 'overview'] as const,
  crmContacts: (page: number) => ['admin', 'crm', 'contacts', page] as const,
  crmOpportunities: (page: number) => ['admin', 'crm', 'opportunities', page] as const,
  storefront: ['admin', 'storefront'] as const,
  storefrontOverview: ['admin', 'storefront', 'overview'] as const,
  storefrontProducts: (page: number) => ['admin', 'storefront', 'products', page] as const,
  ai: ['admin', 'ai'] as const,
  aiOverview: ['admin', 'ai', 'overview'] as const,
  aiPredictions: (page: number) => ['admin', 'ai', 'predictions', page] as const,
};

// ── Financials ───────────────────────────────────────────────────────
export function useSuperFinancialsOverviewQuery() {
  return useQuery({
    queryKey: superKeys.financialsOverview,
    queryFn: api.getSuperFinancialsOverview,
  });
}

export function useSuperInvoicesQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: superKeys.financialsInvoices(page),
    queryFn: () => api.getSuperInvoices(page, limit),
  });
}

// ── HR ───────────────────────────────────────────────────────────────
export function useSuperHROverviewQuery() {
  return useQuery({
    queryKey: superKeys.hrOverview,
    queryFn: api.getSuperHROverview,
  });
}

export function useSuperEmployeesQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: superKeys.hrEmployees(page),
    queryFn: () => api.getSuperEmployees(page, limit),
  });
}

// ── Supply Chain ─────────────────────────────────────────────────────
export function useSuperSupplyOverviewQuery() {
  return useQuery({
    queryKey: superKeys.supplyOverview,
    queryFn: api.getSuperSupplyOverview,
  });
}

export function useSuperPurchaseOrdersQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: superKeys.supplyPurchaseOrders(page),
    queryFn: () => api.getSuperPurchaseOrders(page, limit),
  });
}

// ── CRM ──────────────────────────────────────────────────────────────
export function useSuperCRMOverviewQuery() {
  return useQuery({
    queryKey: superKeys.crmOverview,
    queryFn: api.getSuperCRMOverview,
  });
}

export function useSuperContactsQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: superKeys.crmContacts(page),
    queryFn: () => api.getSuperContacts(page, limit),
  });
}

export function useSuperOpportunitiesQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: superKeys.crmOpportunities(page),
    queryFn: () => api.getSuperOpportunities(page, limit),
  });
}

// ── Storefront ───────────────────────────────────────────────────────
export function useSuperStorefrontOverviewQuery() {
  return useQuery({
    queryKey: superKeys.storefrontOverview,
    queryFn: api.getSuperStorefrontOverview,
  });
}

export function useSuperStorefrontProductsQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: superKeys.storefrontProducts(page),
    queryFn: () => api.getSuperStorefrontProducts(page, limit),
  });
}

// ── AI & Insights ────────────────────────────────────────────────────
export function useSuperAIOverviewQuery() {
  return useQuery({
    queryKey: superKeys.aiOverview,
    queryFn: api.getSuperAIOverview,
  });
}

export function useSuperPredictionsQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: superKeys.aiPredictions(page),
    queryFn: () => api.getSuperPredictions(page, limit),
  });
}
export { useMealsQuery as useMealsRQ };
export { useCategoriesQuery as useCategoriesRQ };
export { useMealCategoriesQuery as useMealCategoriesRQ };
export { useMealSchedulesQuery as useMealSchedulesRQ };
export { useSettingsQuery as useSettingsRQ };

// ─── Tenant Billing ────────────────────────────────────────────────

/** Fetch tenant billing info (subscription, usage, plans, billing history) */
export function useTenantBillingQuery() {
  const toastError = useErrorToast();
  return useQuery<api.TenantBillingResponse>({
    queryKey: queryKeys.tenantBilling,
    queryFn: () => api.getTenantBilling(),
    throwOnError: (err) => {
      toastError('Failed to load billing info', err);
      return false;
    },
  });
}

// ─── Admin Users (Super Admin) ─────────────────────────────

/** Fetch all admin users for the platform */
export function useAdminUsersQuery() {
  return useQuery({
    queryKey: queryKeys.admins,
    queryFn: () => api.getAdmins(),
  });
}

// ─── Admin Audit (Super Admin) ─────────────────────────────

/** Fetch audit log entries */
export function useAdminAuditQuery(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => api.apiFetch('/admin/audit' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  });
}

// ─── Admin Health (Super Admin) ────────────────────────────

/** Fetch system health status */
export function useAdminHealthQuery() {
  return useQuery({
    queryKey: ['admin', 'health'],
    queryFn: () => api.apiFetch('/admin/health'),
  });
}

/** Fetch system health metrics */
export function useAdminHealthMetricsQuery() {
  return useQuery({
    queryKey: ['admin', 'healthMetrics'],
    queryFn: () => api.apiFetch('/admin/health/metrics'),
  });
}

// ─── Admin Performance (Super Admin) ───────────────────────

/** Fetch tenant performance data */
export function useAdminPerformanceQuery() {
  return useQuery({
    queryKey: ['admin', 'performance'],
    queryFn: () => api.apiFetch('/admin/performance'),
  });
}

// ─── Admin Reports (Super Admin) ───────────────────────────

/** Fetch report templates */
export function useAdminReportsQuery() {
  return useQuery({
    queryKey: ['admin', 'reports'],
    queryFn: () => api.apiFetch('/admin/reports'),
  });
}

/** Fetch scheduled reports */
export function useAdminScheduledReportsQuery() {
  return useQuery({
    queryKey: ['admin', 'scheduledReports'],
    queryFn: () => api.apiFetch('/admin/reports/scheduled'),
  });
}

// ─── Admin Settings (Super Admin) ──────────────────────────

/** Fetch admin system settings */
export function useAdminSettingsQuery() {
  return useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.getAdminSettings(),
  });
}

// ─── Admin Subscriptions (Super Admin) ─────────────────────

/** Fetch all tenant subscriptions */
export function useAdminSubscriptionsQuery(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['admin', 'subscriptions', params],
    queryFn: () => api.apiFetch('/admin/subscriptions' + (params ? '?' + new URLSearchParams(params).toString() : '')),
  });
}
