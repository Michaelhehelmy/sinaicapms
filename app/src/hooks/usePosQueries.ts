// Phase 6 / Task 4 — POS data layer on TanStack Query (Unified Architecture Plan §6).
//
// Every POS read goes through these hooks with concern-namespaced keys under
// ['pos', ...]. POSApp owns the QueryClientProvider and MUST call
// queryClient.clear() on every auth transition (login/logout/401).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as apiClient from '@/lib/api';
import type { Shift } from '@/components/pos/types';

/** Concern-namespaced key factory — never construct POS keys ad hoc. */
export const posKeys = {
  all: ['pos'] as const,
  dashboard: () => ['pos', 'dashboard'] as const,
  products: () => ['pos', 'products'] as const,
  orders: () => ['pos', 'orders'] as const,
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
