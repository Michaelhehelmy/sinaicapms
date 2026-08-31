import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'neutral' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  removable?: boolean;
  onRemove?: () => void;
  className?: string;
}

const variantStyles: Record<string, { bg: string; text: string; dot: string }> = {
  default: {
    bg: 'bg-warm-100',
    text: 'text-gray-700',
    dot: 'bg-gray-400',
  },
  success: {
    bg: 'bg-success-100',
    text: 'text-success-700',
    dot: 'bg-success-500',
  },
  warning: {
    bg: 'bg-warning-100',
    text: 'text-warning-700',
    dot: 'bg-warning-500',
  },
  error: {
    bg: 'bg-error-100',
    text: 'text-error-700',
    dot: 'bg-error-500',
  },
  info: {
    bg: 'bg-info-100',
    text: 'text-info-700',
    dot: 'bg-info-500',
  },
  neutral: {
    bg: 'bg-gray-100',
    text: 'text-gray-600',
    dot: 'bg-gray-400',
  },
  // `danger` is accepted across many admin panels (ServicesPanel, CRMPanel,
  // HRPanel, FinancialPanel, etc.) — alias it to the error palette. This
  // prevents a TypeError (`variantStyles['danger']` was undefined) whenever a
  // status like `canceled` / `overdue` / `blocked` / `danger` rendered a Badge.
  danger: {
    bg: 'bg-error-100',
    text: 'text-error-700',
    dot: 'bg-error-500',
  },
};

const sizeStyles: Record<string, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-0.5 text-xs',
  lg: 'px-3 py-1 text-sm',
};

/**
 * Versatile Badge component for status indicators, labels, and tags.
 *
 * @example
 * <Badge variant="success" size="md">Active</Badge>
 *
 * @example
 * <Badge variant="error" dot removable onRemove={() => handleRemove()}>
 *   Failed
 * </Badge>
 *
 * @example
 * <Badge variant="danger" dot>Blocked</Badge>
 */
export function Badge({
  children,
  variant = 'default',
  size = 'md',
  dot = false,
  removable = false,
  onRemove,
  className,
  ...rest
}: BadgeProps & React.HTMLAttributes<HTMLSpanElement>) {
  const style = variantStyles[variant];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        style.bg,
        style.text,
        sizeStyles[size],
        className,
      )}
      role="status"
      {...rest}
    >
      {dot && (
        <span
          className={cn('mr-1.5 h-1.5 w-1.5 rounded-full shrink-0', style.dot)}
          aria-hidden="true"
        />
      )}

      {children}

      {removable && (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            'ml-1 -mr-1 inline-flex h-4 w-4 items-center justify-center rounded-full',
            'transition-colors duration-150',
            'hover:bg-black/10 focus:outline-none focus:ring-1 focus:ring-current',
          )}
          aria-label="Remove"
        >
          <svg
            className="h-2.5 w-2.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
