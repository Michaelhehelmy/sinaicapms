import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const DefaultIcon = () => (
  <svg
    className="mx-auto h-12 w-12 text-gray-300"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
    />
  </svg>
);

/**
 * EmptyState component for when lists, tables, or data views have no items.
 *
 * @example
 * <EmptyState
 *   title="No reservations yet"
 *   description="When a guest makes a reservation, it will appear here."
 *   action={{ label: 'New Reservation', onClick: handleCreate }}
 * />
 *
 * @example
 * <EmptyState
 *   icon={<CustomIcon />}
 *   title="No results found"
 *   description="Try adjusting your search or filter criteria."
 * />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-6 py-12 text-center',
        className,
      )}
      role="status"
    >
      <div className="mb-4">
        {icon || <DefaultIcon />}
      </div>

      <h3 className="text-lg font-semibold text-gray-700">{title}</h3>

      {description && (
        <p className="mt-1 text-sm text-gray-500 max-w-sm">{description}</p>
      )}

      {action && (
        <div className="mt-6">
          <Button variant="primary" size="md" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
