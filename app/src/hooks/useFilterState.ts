import { useCallback, useMemo } from 'react';
import { push, onNavigation } from '@/lib/navigation';
import { useState, useEffect } from 'react';

/**
 * URL-synced filter state hook.
 *
 * Reads/writes filter values to URL search params so filters survive
 * page refreshes, back/forward navigation, and deep-link sharing.
 *
 * @example
 * ```tsx
 * const { filters, setFilter, resetFilters, setPage } = useFilterState({
 *   status: 'all',
 *   search: '',
 *   page: '1',
 * });
 * ```
 *
 * Navigates to `/admin/super_tenants?status=active&search=acacia&page=2`
 * when filters change.
 */
export function useFilterState<T extends Record<string, string>>(
  defaults: T,
): {
  filters: T;
  setFilter: <K extends keyof T>(key: K, value: T[K]) => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
} {
  /* Read initial state from URL, falling back to defaults */
  const readParams = useCallback((): T => {
    if (typeof window === 'undefined') return { ...defaults };
    const params = new URLSearchParams(window.location.search);
    const result = { ...defaults };
    for (const key of Object.keys(defaults) as Array<keyof T>) {
      const val = params.get(String(key));
      if (val !== null) {
        result[key] = val as T[typeof key];
      }
    }
    return result;
  }, [defaults]);

  const [filters, setFilters] = useState<T>(readParams);

  /* Re-sync when the URL changes externally (browser back/forward, external push) */
  useEffect(() => {
    return onNavigation(() => {
      setFilters(readParams());
    });
  }, [readParams]);

  const setFilter = useCallback(
    <K extends keyof T>(key: K, value: T[K]) => {
      setFilters((prev) => {
        const next = { ...prev, [key]: value };
        /* Persist to URL */
        const params = new URLSearchParams(window.location.search);
        if (value === defaults[key]) {
          params.delete(String(key));
        } else {
          params.set(String(key), String(value));
        }
        /* Preserve existing path (tab segment) */
        const basePath = window.location.pathname;
        const qs = params.toString();
        push(`${basePath}${qs ? `?${qs}` : ''}`);
        return next;
      });
    },
    [defaults],
  );

  const resetFilters = useCallback(() => {
    setFilters({ ...defaults });
    const basePath = window.location.pathname;
    push(basePath);
  }, [defaults]);

  const setPage = useCallback(
    (page: number) => {
      setFilter('page' as keyof T, String(page) as T[keyof T]);
    },
    [setFilter],
  );

  return useMemo(() => ({ filters, setFilter, resetFilters, setPage }), [filters, setFilter, resetFilters, setPage]);
}
