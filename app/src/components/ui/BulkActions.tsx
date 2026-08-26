import React from 'react';
import { cn } from '@/lib/utils';

interface BulkAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'danger';
  icon?: React.ReactNode;
  disabled?: boolean;
}

interface BulkActionsProps {
  /** Number of currently selected rows */
  selectedCount: number;
  /** Available actions to perform on selected rows */
  actions: BulkAction[];
  /** Callback to clear the current selection */
  onClearSelection: () => void;
  /** Additional className for the toolbar container */
  className?: string;
}

/**
 * Floating toolbar that appears when rows are selected in a DataTable.
 * Renders action buttons and a selection count / clear button.
 *
 * @example
 * ```tsx
 * <BulkActions
 *   selectedCount={selectedIds.length}
 *   actions={[
 *     { label: 'Export Selected', onClick: handleExport },
 *     { label: 'Delete', onClick: handleDelete, variant: 'danger' },
 *   ]}
 *   onClearSelection={() => setSelectedIds([])}
 * />
 * ```
 */
export function BulkActions({
  selectedCount,
  actions,
  onClearSelection,
  className,
}: BulkActionsProps) {
  if (selectedCount <= 0) return null;

  return (
    <div
      data-testid="bulk-actions"
      className={cn(
        'sticky bottom-0 z-20 mx-1 mb-4 flex items-center justify-between gap-3',
        'rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 shadow-lg',
        'animate-in fade-in slide-in-from-bottom-2 duration-200',
        className,
      )}
      role="toolbar"
      aria-label="Bulk actions"
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-brand-800">
          {selectedCount} row{selectedCount !== 1 ? 's' : ''} selected
        </span>
        <button
          onClick={onClearSelection}
          data-testid="clear-selection"
          className="rounded-md px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100 transition-colors cursor-pointer border-none bg-transparent"
          aria-label="Clear selection"
        >
          Clear
        </button>
      </div>
      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            disabled={action.disabled}
            data-testid={`bulk-action-${action.label.toLowerCase().replace(/\s+/g, '-')}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border-none cursor-pointer transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              action.variant === 'danger'
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-brand-600 text-white hover:bg-brand-700',
            )}
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
