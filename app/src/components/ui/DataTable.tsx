import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

interface Pagination {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyMessage?: string;
  emptyDescription?: string;
  pagination?: Pagination;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  actions?: (item: T) => React.ReactNode;
  onRowClick?: (item: T) => void;
  rowKey?: string;
  /** Visual variant: default, striped rows, or bordered cells */
  variant?: 'default' | 'striped' | 'bordered';
  /** Controls cell padding density */
  size?: 'sm' | 'md' | 'lg';
  /** Enable row checkbox selection */
  selectable?: boolean;
  /** Controlled selected row keys (requires selectable) */
  selectedRows?: string[];
  /** Callback when selection changes (requires selectable) */
  onSelectionChange?: (selectedKeys: string[]) => void;
  /** Make table header sticky when scrolling */
  stickyHeader?: boolean;
}

/* ─── Size tokens ─── */
const cellPad = { sm: 'px-3 py-2', md: 'px-4 py-3', lg: 'px-5 py-4' };
const headerPad = { sm: 'px-3 py-2', md: 'px-4 py-3', lg: 'px-5 py-4' };
const textSize = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' };

function SkeletonRow({ cols, size = 'md' }: { cols: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className={cellPad[size]}>
          <div className="h-4 bg-warm-200 rounded w-3/4" />
        </td>
      ))}
    </tr>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyMessage = 'No data available',
  emptyDescription,
  pagination,
  searchable = false,
  searchPlaceholder = 'Search...',
  onSearch,
  actions,
  onRowClick,
  rowKey = 'id',
  variant = 'default',
  size = 'md',
  selectable = false,
  selectedRows: controlledSelected,
  onSelectionChange,
  stickyHeader = false,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());

  /* Use controlled selection if provided, otherwise internal */
  const selectedKeys = controlledSelected ?? Array.from(internalSelected);
  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const toggleRow = useCallback(
    (key: string) => {
      setInternalSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        onSelectionChange?.(Array.from(next));
        return next;
      });
    },
    [onSelectionChange],
  );

  const toggleAll = useCallback(() => {
    setInternalSelected((prev) => {
      const allKeys = data.map((d) => String(d[rowKey] ?? ''));
      const allSelected = allKeys.every((k) => prev.has(k));
      const next = allSelected ? new Set<string>() : new Set(allKeys);
      onSelectionChange?.(Array.from(next));
      return next;
    });
  }, [data, rowKey, onSelectionChange]);

  const debouncedSearch = useMemo(() => {
    if (!onSearch) return Object.assign(() => {}, { cleanup: () => {} });
    let timer: ReturnType<typeof setTimeout> | null = null;
    const searchFn = (query: string) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onSearch(query), 300);
    };
    searchFn.cleanup = () => {
      if (timer) clearTimeout(timer);
    };
    return searchFn;
  }, [onSearch]);

  useEffect(() => {
    return () => {
      debouncedSearch.cleanup?.();
    };
  }, [debouncedSearch]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);
      debouncedSearch(value);
    },
    [debouncedSearch],
  );

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey],
  );

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDir === 'asc' ? -1 : 1;
      if (bVal == null) return sortDir === 'asc' ? 1 : -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [data, sortKey, sortDir]);

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;
  const startItem = pagination ? (pagination.page - 1) * pagination.pageSize + 1 : 1;
  const endItem = pagination
    ? Math.min(pagination.page * pagination.pageSize, pagination.total)
    : data.length;

  const getPageNumbers = (): (number | '...')[] => {
    if (!pagination) return [];
    const { page } = pagination;
    const pages: (number | '...')[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  const totalCols = columns.length + (actions ? 1 : 0) + (selectable ? 1 : 0);
  const allPageSelected =
    sortedData.length > 0 &&
    sortedData.every((d) => selectedSet.has(String(d[rowKey] ?? '')));

  return (
    <div className="w-full">
      {searchable && (
        <div className="mb-4">
          <div className="relative max-w-sm">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-warm-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              data-testid="table-search"
              className={cn(
                'w-full rounded-lg border border-warm-200 bg-white py-2 pl-10 pr-4 text-sm',
                'placeholder:text-warm-400',
                'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
                'transition-colors duration-150',
              )}
            />
          </div>
        </div>
      )}

      <div className={cn('overflow-x-auto rounded-xl border border-warm-200 bg-white')} aria-busy={loading || undefined}>
        <table data-testid="data-table" className="min-w-full divide-y divide-warm-200" aria-busy={loading || undefined}>
          <thead
            className={cn(
              'bg-warm-50',
              stickyHeader && 'sticky top-0 z-10',
            )}
          >
            <tr>
              {selectable && (
                <th className={cn(headerPad[size], 'w-10')}>
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleAll}
                    aria-label="Select all rows"
                    className="h-4 w-4 rounded border-warm-300 text-brand-600 focus:ring-brand-500 cursor-pointer accent-brand-600"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  data-testid={col.sortable ? 'table-header' : undefined}
                  className={cn(
                    headerPad[size],
                    'text-left text-xs font-bold uppercase tracking-wider text-warm-500',
                    col.sortable && 'cursor-pointer select-none hover:text-warm-700',
                    variant === 'bordered' && 'border-x border-warm-200',
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  {...(col.sortable
                    ? {
                        'aria-sort':
                          sortKey === col.key
                            ? sortDir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none',
                      }
                    : {})}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && sortKey === col.key && (
                      <svg className="h-3 w-3 text-brand-500" fill="currentColor" viewBox="0 0 20 20">
                        {sortDir === 'asc' ? (
                          <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                        ) : (
                          <path d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" />
                        )}
                      </svg>
                    )}
                    {col.sortable && sortKey !== col.key && (
                      <svg className="h-3 w-3 text-warm-300" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                      </svg>
                    )}
                  </span>
                </th>
              ))}
              {actions && (
                <th className={cn(headerPad[size], 'text-right text-xs font-bold uppercase tracking-wider text-warm-500')}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody
            className={cn(
              'divide-y divide-warm-100',
              variant === 'striped' ? 'bg-white' : 'bg-white',
            )}
          >
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={totalCols} size={size} />
              ))
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="px-6 py-20 text-center" data-testid="empty-state">
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-2xl bg-warm-100 p-4">
                      <svg
                        className="h-10 w-10 text-warm-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-warm-700">{emptyMessage}</p>
                    {emptyDescription && (
                      <p className="text-xs text-warm-600 max-w-xs">{emptyDescription}</p>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              sortedData.map((item, idx) => {
                const itemKey = String(item[rowKey] ?? idx);
                const isSelected = selectedSet.has(itemKey);
                return (
                  <tr
                    key={itemKey}
                    data-testid="data-table-row"
                    className={cn(
                      'transition-colors',
                      variant === 'striped' && idx % 2 === 1 && 'bg-warm-50/50',
                      onRowClick && 'cursor-pointer hover:bg-brand-50/40',
                      !onRowClick && 'hover:bg-warm-50',
                      isSelected && 'bg-brand-50/60',
                    )}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                  >
                    {selectable && (
                      <td className={cn(cellPad[size], 'w-10')}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(itemKey)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select row ${itemKey}`}
                          className="h-4 w-4 rounded border-warm-300 text-brand-600 focus:ring-brand-500 cursor-pointer accent-brand-600"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          cellPad[size],
                          textSize[size],
                          'whitespace-nowrap text-warm-700',
                          variant === 'bordered' && 'border-x border-warm-200',
                        )}
                      >
                        {col.render ? col.render(item) : String(item[col.key] ?? '')}
                      </td>
                    ))}
                    {actions && (
                      <td className={cn(cellPad[size], 'whitespace-nowrap text-right')}>
                        <div
                          className="flex items-center justify-end gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {actions(item)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <nav data-testid="table-pagination" className="mt-4 flex flex-col items-center justify-between gap-4 sm:flex-row" aria-label="Table pagination">
          <p className="text-sm text-warm-700">
            Showing {startItem}–{endItem} of {pagination.total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => pagination.onChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              aria-label="Go to previous page"
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                pagination.page <= 1
                  ? 'cursor-not-allowed text-warm-300'
                  : 'text-warm-700 hover:bg-warm-100',
              )}
            >
              Previous
            </button>
            {getPageNumbers().map((num, i) =>
              num === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-sm text-warm-600">
                  …
                </span>
              ) : (
                <button
                  key={num}
                  onClick={() => pagination.onChange(num)}
                  aria-label={`Go to page ${num}`}
                  aria-current={pagination.page === num ? 'page' : undefined}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                    pagination.page === num
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'text-warm-700 hover:bg-warm-100',
                  )}
                >
                  {num}
                </button>
              ),
            )}
            <button
              onClick={() => pagination.onChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              aria-label="Go to next page"
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-150',
                pagination.page >= totalPages
                  ? 'cursor-not-allowed text-warm-300'
                  : 'text-warm-700 hover:bg-warm-100',
              )}
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
