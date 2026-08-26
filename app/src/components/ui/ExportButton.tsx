import React, { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ExportButtonProps {
  /** Callback when an export format is selected */
  onExport: (format: 'csv' | 'excel' | 'pdf') => void;
  /** Whether the export is currently in progress */
  disabled?: boolean;
  /** Whether export is loading */
  loading?: boolean;
}

/**
 * Multi-format export dropdown button.
 * Renders a button that opens a dropdown with CSV / Excel / PDF options.
 *
 * @example
 * ```tsx
 * <ExportButton
 *   onExport={(fmt) => handleExport(fmt)}
 *   loading={isExporting}
 * />
 * ```
 */
export function ExportButton({ onExport, disabled = false, loading = false }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = useCallback(
    (format: 'csv' | 'excel' | 'pdf') => {
      setOpen(false);
      onExport(format);
    },
    [onExport],
  );

  const formats = [
    { value: 'csv' as const, label: 'CSV', icon: '📄' },
    { value: 'excel' as const, label: 'Excel', icon: '📊' },
    { value: 'pdf' as const, label: 'PDF', icon: '📕' },
  ];

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled || loading}
        data-testid="export-button"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-warm-200 bg-white px-3 py-2 text-xs font-semibold text-warm-700',
          'hover:bg-warm-50 transition-colors cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        )}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {loading ? (
          <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        )}
        Export
      </button>

      {open && (
        <div
          role="menu"
          data-testid="export-menu"
          className="absolute right-0 z-30 mt-1 w-40 rounded-lg border border-warm-200 bg-white py-1 shadow-lg"
        >
          {formats.map((fmt) => (
            <button
              key={fmt.value}
              role="menuitem"
              onClick={() => handleSelect(fmt.value)}
              data-testid={`export-${fmt.value}`}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-warm-700 hover:bg-warm-50 transition-colors cursor-pointer border-none bg-transparent text-left"
            >
              <span>{fmt.icon}</span>
              Export as {fmt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
