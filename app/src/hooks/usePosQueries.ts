// Phase 6 / Task 4 — POS data layer on TanStack Query (Unified Architecture Plan §6).
//
// Every POS read goes through these hooks with concern-namespaced keys under
// ['pos', ...]. POSApp owns the QueryClientProvider and MUST call
// queryClient.clear() on every auth transition (login/logout/401).
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import * as apiClient from '@/lib/api';
import type { Shift, Order } from '@/components/pos/types';

/** Concern-namespaced key factory — never construct POS keys ad hoc. */
export const posKeys = {
  all: ['pos'] as const,
  dashboard: () => ['pos', 'dashboard'] as const,
  products: () => ['pos', 'products'] as const,
  orders: () => ['pos', 'orders'] as const,
  orderDetail: (id: string | number) => ['pos', 'orders', 'detail', String(id)] as const,
  tables: () => ['pos', 'tables'] as const,
  activeShift: () => ['pos', 'active-shift'] as const,
};

export function usePosDashboard() {
  return useQuery({
    queryKey: posKeys.dashboard(),
    queryFn: () => apiClient.posGetDashboard(),
  });
}

export function usePosProducts() {
  return useQuery({
    queryKey: posKeys.products(),
    queryFn: () => apiClient.posGetProducts(),
  });
}

export function usePosOrders() {
  return useQuery({
    queryKey: posKeys.orders(),
    queryFn: () => apiClient.posGetOrders(),
  });
}

/**
 * Active-shift probe. A failed probe is non-fatal by design (the cashier can
 * still open a shift manually), so errors collapse to `{ active: false }`
 * instead of surfacing an error state.
 */
export function usePosActiveShift(enabled: boolean) {
  return useQuery({
    queryKey: posKeys.activeShift(),
    queryFn: async () => {
      try {
        return (await apiClient.posGetActiveShift()) as { active: boolean; shift?: Shift };
      } catch {
        return { active: false };
      }
    },
    enabled,
    retry: false,
    // The probe is cheap and gate-like; treat it as always-fresh per mount.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useOpenShiftMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { openingCash: number }) => apiClient.posOpenShift(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: posKeys.activeShift() });
    },
  });
}

export function useCloseShiftMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { actualClosingCash: number; notes?: string }) =>
      apiClient.posCloseShift(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: posKeys.activeShift() });
    },
  });
}

// ─── Restaurant pillar (0069): floor tables + kitchen board ────────────────
//
// The POS orders LIST endpoint predates 0069 and does not carry
// kitchen_status/table_id — only the DETAIL endpoint (t.*) does. Until the
// list SELECT gains those columns server-side, the kitchen board hydrates the
// most recent page of orders through per-order detail queries and derives the
// active tickets client-side. The cap keeps the fan-out bounded; TanStack
// dedupes the detail queries across views (same keys), so TableView's
// occupied-table lookup reuses whatever Kitchen already fetched.

/** Hydration window — a service board never needs more than the latest tickets. */
export const KITCHEN_BOARD_LIMIT = 50;

/** Auto-refresh cadence shared by every kitchen/floor query (30s). */
export const KITCHEN_REFRESH_MS = 30_000;

/** POS order enriched with the 0069 dine-in columns from its detail fetch. */
export type KitchenOrder = Order & {
  tableId?: string | null;
  kitchenStatus?: apiClient.KitchenStatus | null;
};

/**
 * Recent POS orders hydrated with their 0069 fields (kitchenStatus, tableId).
 * Rows whose detail fetch has not landed yet resolve to `null` so callers can
 * distinguish "still hydrating" from "not an active ticket".
 */
export function useEnrichedOrders(enabled: boolean) {
  const ordersQuery = useQuery({
    queryKey: posKeys.orders(),
    queryFn: () => apiClient.posGetOrders(),
    enabled,
    refetchInterval: KITCHEN_REFRESH_MS,
  });

  const recentOrders = (Array.isArray(ordersQuery.data) ? ordersQuery.data : []).slice(
    0,
    KITCHEN_BOARD_LIMIT,
  );

  const detailQueries = useQueries({
    queries: recentOrders.map((o) => ({
      queryKey: posKeys.orderDetail(o.id),
      queryFn: () => apiClient.posGetOrder(o.id),
      enabled,
      refetchInterval: KITCHEN_REFRESH_MS,
      // One failed detail must not sink the whole board row.
      retry: false,
    })),
  });

  const orders: (KitchenOrder | null)[] = recentOrders.map((o, i) => {
    const detail = detailQueries[i]?.data as Record<string, unknown> | undefined;
    // Detail not landed yet → null so callers can skip the row this pass.
    return detail ? ({ ...o, ...(detail as object) } as KitchenOrder) : null;
  });

  return {
    orders,
    isLoading: ordersQuery.isLoading || (recentOrders.length > 0 && detailQueries.some((q) => q.isLoading)),
    error: ordersQuery.error ?? detailQueries.find((q) => q.error)?.error ?? null,
  };
}

/** Floor tables grouped by section ({ sections, total }) for the grid view. */
export function usePosTables() {
  return useQuery({
    queryKey: posKeys.tables(),
    queryFn: () => apiClient.getPosTables(),
    refetchInterval: KITCHEN_REFRESH_MS,
  });
}

function useInvalidateTablesAndOrders() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: posKeys.tables() });
    queryClient.invalidateQueries({ queryKey: posKeys.orders() });
  };
}

export function useCreateTableMutation() {
  const invalidate = useInvalidateTablesAndOrders();
  return useMutation({
    mutationFn: (vars: { name: string; capacity?: number; section?: string }) =>
      apiClient.createPosTable(vars),
    onSuccess: invalidate,
  });
}

export function useUpdateTableStatusMutation() {
  const invalidate = useInvalidateTablesAndOrders();
  return useMutation({
    mutationFn: (vars: { id: string; status: apiClient.PosTable['status'] }) =>
      apiClient.updatePosTableStatus(vars.id, vars.status),
    onSuccess: invalidate,
  });
}

export function useDeleteTableMutation() {
  const invalidate = useInvalidateTablesAndOrders();
  return useMutation({
    mutationFn: (vars: { id: string }) => apiClient.deletePosTable(vars.id),
    onSuccess: invalidate,
  });
}

export function useUpdateKitchenStatusMutation() {
  const invalidate = useInvalidateTablesAndOrders();
  return useMutation({
    mutationFn: (vars: { orderId: string; kitchenStatus: apiClient.KitchenStatus }) =>
      apiClient.updateKitchenStatus(vars.orderId, vars.kitchenStatus),
    onSuccess: invalidate,
  });
}
