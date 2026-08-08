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
import type { Paginated } from '@/lib/api';
// T8-C: spec-derived wire types — the typed api client is the contract source.
import type { components } from '@/lib/api-types';

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
  camps: ['camps'] as const,
  camp: (id: string) => ['camps', id] as const,
  products: ['products'] as const,
  rooms: ['rooms'] as const,
  orders: (params?: Record<string, string>) => ['orders', params] as const,
  order: (id: string) => ['orders', id] as const,
  ratePlans: ['ratePlans'] as const,
  plans: ['plans'] as const,
  meals: ['meals'] as const,
  categories: ['categories'] as const,
  mealCategories: ['mealCategories'] as const,
  mealSchedules: (params?: Record<string, string>) => ['mealSchedules', params] as const,
  settings: ['settings'] as const,
  lowStock: ['inventory', 'low-stock'] as const,
  adminStats: ['adminStats'] as const,
  tenants: ['tenants'] as const,
  admins: ['admins'] as const,
  availability: (params: Record<string, string>) => ['availability', params] as const,
  priceOverrides: (params: Record<string, string>) => ['price-overrides', params] as const,
  inbox: (params?: Record<string, string>) => ['inbox', params] as const,
  inboxUnread: ['inbox', 'unread'] as const,
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rooms });
      showToast(editId ? 'Room updated' : 'Room created', 'success');
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
export function usePriceOverridesQuery(params: { productId: string; from?: string; to?: string }) {
  const toastError = useErrorToast();
  return useQuery<Schemas['PriceOverrideList']>({
    queryKey: queryKeys.priceOverrides(params),
    queryFn: () => api.getPriceOverrides(params),
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
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['price-overrides'] });
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
      queryClient.invalidateQueries({ queryKey: ['availability'] });
      queryClient.invalidateQueries({ queryKey: ['price-overrides'] });
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
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      queryClient.invalidateQueries({ queryKey: ['inbox', 'unread'] });
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
      queryClient.invalidateQueries({ queryKey: ['inbox'] });
      queryClient.invalidateQueries({ queryKey: ['inbox', 'unread'] });
      showToast('Lead deleted', 'success');
    },
    onError: (err) => toastError('Failed to delete lead', err),
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
export { useMealsQuery as useMealsRQ };
export { useCategoriesQuery as useCategoriesRQ };
export { useMealCategoriesQuery as useMealCategoriesRQ };
export { useMealSchedulesQuery as useMealSchedulesRQ };
export { useSettingsQuery as useSettingsRQ };
