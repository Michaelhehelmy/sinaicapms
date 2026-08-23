import { useState, useEffect, useCallback, useRef } from 'react';
import * as api from '@/lib/api';
import type { Paginated } from '@/lib/api';

export interface Camp {
  id: string;
  name: string;
  location: string;
  startDate: string;
  endDate: string;
  capacity: number;
  status: string;
  notes: string;
  /** Unified-architecture discriminator (projects.project_type, wire camelCase). */
  projectType?: string;
}

export interface Product {
  id: string;
  tenantId: string;
  categoryId: string | null;
  sku: string | null;
  basePrice: number;
  capacity: number;
  imageUrl: string | null;
  isActive: number;
  name?: string;
  description?: string;
  shortDescription?: string;
  campIds?: string[];
}

export interface Room {
  id: string;
  campId: string;
  productId: string;
  name: string;
  status: string;
  bedType: string;
  maxGuests: number;
  basePrice: number;
  floor: string | null;
  notes: string | null;
  isActive: number;
}

export interface Order {
  id: string;
  tenantId: string;
  campId: string;
  roomId: string;
  customerId: string | null;
  orderStateId: string;
  checkInDate: string;
  checkOutDate: string;
  numberOfPeople: number;
  totalAmount: number;
  amountPaid: number;
  // T8-C: these 4 are detail-only (GET /api/orders/:id) — absent from list rows.
  // Use getOrder()/OrderDetail when you need them.
  paymentMethod?: string | null;
  paymentStatus: string;
  reference: string;
  notes?: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  roomName: string | null;
  stateName: string | null;
}

export interface RatePlan {
  id: string;
  tenantId: string;
  productId: string;
  name: string;
  season: string;
  startDate: string | null;
  endDate: string | null;
  pricePerNight: number;
  minStay: number;
  isActive: number;
}

export interface Plan {
  id: string;
  campId: string;
  name: string;
  description: string | null;
  date: string | null;
  time: string | null;
  capacity: number | null;
  status: string;
  category: string | null;
}

export interface TenantSettings {
  name: string;
  primaryColor: string;
  whatsappNumber: string;
  phone: string;
  email: string;
  location: string;
  logoUrl: string;
  faviconUrl: string;
  description: string;
  footerText: string;
  currency: string;
  [key: string]: unknown;
}

export interface Meal {
  id: string;
  name: string;
  mealCategoryId: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
  isActive: number;
  categoryName?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  active: number;
  position: number;
}

export interface MealCategory {
  id: string;
  name: string;
  position: number;
}

export interface MealSchedule {
  id: string;
  tenantId: string;
  campId: string;
  campName: string;
  date: string;
  mealId: string;
  mealName: string;
  packageType: string;
  maxServings: number;
  createdAt: string;
}

function useCachedData<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): { data: T; loading: boolean; error: string | null; refresh: () => void } {
  const [data, setData] = useState<T>(Array.isArray(fetcher.toString()) ? [] as unknown as T : (undefined as unknown as T));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetcher();
        if (!cancelled && mountedRef.current) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled && mountedRef.current) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled && mountedRef.current) {
          setLoading(false);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey]);

  return { data, loading, error, refresh };
}

export function useCamps() {
  return useCachedData<Camp[]>(() => api.getCamps() as Promise<Camp[]>, []);
}

export function useProducts() {
  return useCachedData<Product[]>(() => api.getProducts() as Promise<Product[]>, []);
}

export function useRooms() {
  return useCachedData<Room[]>(() => api.getRooms() as Promise<Room[]>, []);
}

export function useOrders() {
  return useCachedData<Paginated<Order>>(() => api.getOrders() as Promise<Paginated<Order>>, []);
}

export function useRatePlans() {
  return useCachedData<RatePlan[]>(() => api.getRatePlans() as Promise<RatePlan[]>, []);
}

export function usePlans() {
  return useCachedData<Plan[]>(() => api.getPlans() as Promise<Plan[]>, []);
}

export function useMeals() {
  return useCachedData<Meal[]>(() => api.getMeals() as Promise<Meal[]>, []);
}

export function useCategories() {
  return useCachedData<Category[]>(() => api.getCategories() as Promise<Category[]>, []);
}

export function useMealCategories() {
  return useCachedData<MealCategory[]>(() => api.getMealCategories() as Promise<MealCategory[]>, []);
}

export function useMealSchedules(params?: Record<string, string>) {
  return useCachedData<MealSchedule[]>(
    () => api.getMealSchedules(params) as Promise<MealSchedule[]>,
    [JSON.stringify(params ?? {})]
  );
}

export function useSettings() {
  return useCachedData<TenantSettings>(() => api.getMe() as Promise<TenantSettings>, []);
}

// Backward-compat aliases
export const useRoomTypes = useProducts;
export const useReservations = useOrders;
