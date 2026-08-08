import React from 'react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Skeleton – Animated placeholder loading states                      */
/*  Variants: text, circle, rect, card, table-row, table-header         */
/* ------------------------------------------------------------------ */

type SkeletonVariant = 'text' | 'circle' | 'rect' | 'card' | 'table-row' | 'table-header';

interface SkeletonProps {
  /** Visual shape variant */
  variant?: SkeletonVariant;
  /** Custom width (Tailwind class or CSS value) */
  width?: string;
  /** Custom height (Tailwind class or CSS value) */
  height?: string;
  /** Additional className overrides */
  className?: string;
  /** Number of rows to render (for table-row / text variants) */
  count?: number;
}

const variantDefaults: Record<SkeletonVariant, { width: string; height: string; className: string }> = {
  text: {
    width: 'w-full',
    height: 'h-4',
    className: 'rounded-md',
  },
  circle: {
    width: 'w-10',
    height: 'h-10',
    className: 'rounded-full',
  },
  rect: {
    width: 'w-full',
    height: 'h-20',
    className: 'rounded-xl',
  },
  card: {
    width: 'w-full',
    height: 'h-24',
    className: 'rounded-xl',
  },
  'table-row': {
    width: 'w-full',
    height: 'h-12',
    className: '',
  },
  'table-header': {
    width: 'w-full',
    height: 'h-10',
    className: '',
  },
};

/**
 * Reusable skeleton loading placeholder with animated pulse effect.
 * Matches the exact dimensions of the content it replaces.
 *
 * @example
 * <Skeleton variant="text" className="h-8 w-48" />
 *
 * @example
 * <Skeleton variant="circle" width="w-12" height="h-12" />
 *
 * @example
 * {[...Array(5)].map((_, i) => <Skeleton key={i} variant="table-row" />)}
 */
export function Skeleton({
  variant = 'rect',
  width,
  height,
  className,
  count = 1,
}: SkeletonProps) {
  const defaults = variantDefaults[variant];

  if (variant === 'table-row') {
    return (
      <tbody aria-hidden="true">
        {Array.from({ length: count }).map((_, i) => (
          <tr key={i} className="animate-pulse">
            {Array.from({ length: 5 }).map((_, j) => (
              <td key={j} className="px-4 py-3">
                <div
                  className={cn(
                    'bg-warm-200 rounded-md',
                    j === 0 ? 'h-4 w-20' : j === 4 ? 'h-6 w-16 rounded-full' : 'h-4 w-24',
                  )}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    );
  }

  if (variant === 'table-header') {
    return (
      <tr className="animate-pulse bg-warm-50" aria-hidden="true">
        {Array.from({ length: count || 5 }).map((_, j) => (
          <th key={j} className="px-4 py-3">
            <div className="h-3 w-16 bg-warm-300 rounded" />
          </th>
        ))}
      </tr>
    );
  }

  if (variant === 'card') {
    return (
      <div
        className={cn(
          'bg-white border border-warm-200 rounded-xl p-5 shadow-xs animate-pulse',
          width || defaults.width,
          height || defaults.height,
          className,
        )}
        role="status"
        aria-label="Loading content"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1 space-y-2.5">
            <div className="h-3 w-20 bg-warm-200 rounded" />
            <div className="h-7 w-16 bg-warm-300 rounded" />
          </div>
          <div className="h-10 w-10 bg-warm-200 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'bg-warm-200 animate-pulse',
        defaults.className,
        width || defaults.width,
        height || defaults.height,
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading content</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Composite Skeletons – Pre-built layouts for common patterns         */
/* ------------------------------------------------------------------ */

/**
 * Skeleton that mimics the DashboardPanel stat card grid.
 * Renders 12 placeholder stat cards in 3 rows of 4.
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Skeleton variant="text" className="h-7 w-32" />
      {[1, 2, 3].map((row) => (
        <div key={row} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} data-testid="stat-card" className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs animate-pulse">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2.5">
                  <div className="h-3 w-20 bg-warm-200 rounded" />
                  <div className="h-7 w-16 bg-warm-300 rounded" />
                </div>
                <div className="h-10 w-10 bg-warm-200 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      ))}
      {/* Recent reservations placeholder */}
      <div className="bg-white rounded-xl border border-warm-200 p-4 shadow-xs animate-pulse">
        <div className="h-4 w-40 bg-warm-200 rounded mb-3" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-warm-100 last:border-0">
            <div className="space-y-1.5">
              <div className="h-3 w-28 bg-warm-200 rounded" />
              <div className="h-2.5 w-16 bg-warm-100 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-20 bg-warm-200 rounded" />
              <div className="h-5 w-16 bg-warm-200 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Skeleton that mimics a DataTable with header + N rows.
 */
export function TableSkeleton({ rows = 5, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-4" aria-hidden="true">
      {/* Title + button */}
      <div className="flex items-center justify-between">
        <Skeleton variant="text" className="h-7 w-40" />
        <Skeleton variant="rect" className="h-10 w-28 rounded-lg" />
      </div>
      {/* Table skeleton */}
      <div className="border border-warm-200 rounded-xl overflow-hidden">
        <table className="min-w-full">
          <thead>
            <Skeleton variant="table-header" count={columns} />
          </thead>
          <Skeleton variant="table-row" count={rows} />
        </table>
      </div>
    </div>
  );
}

/**
 * Skeleton for POS product grid cards.
 */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border-2 border-warm-200 p-4 animate-pulse">
          <div className="w-full h-24 bg-warm-200 rounded-lg mb-3" />
          <div className="h-4 w-3/4 bg-warm-200 rounded mb-1.5" />
          <div className="h-3 w-1/3 bg-warm-100 rounded mb-2" />
          <div className="h-5 w-16 bg-warm-300 rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton for POS dashboard stat cards.
 */
export function POSDashboardSkeleton() {
  return (
    <div className="p-6 space-y-6" aria-hidden="true">
      <Skeleton variant="text" className="h-7 w-32" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} variant="card" />
        ))}
      </div>
      {/* Recent orders table skeleton */}
      <div className="bg-white rounded-xl border border-warm-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-warm-100">
          <Skeleton variant="text" className="h-5 w-32" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <Skeleton variant="table-header" count={5} />
            </thead>
            <Skeleton variant="table-row" count={3} />
          </table>
        </div>
      </div>
    </div>
  );
}
