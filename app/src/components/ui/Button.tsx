import React from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500 shadow-xs hover:shadow-md',
  secondary:
    'bg-warm-100 text-gray-700 hover:bg-warm-200 focus:ring-warm-400 border border-warm-200',
  ghost:
    'bg-transparent text-gray-600 hover:bg-warm-100 focus:ring-warm-400',
  danger:
    'bg-error-600 text-white hover:bg-error-700 focus:ring-error-500 shadow-xs hover:shadow-md',
  success:
    'bg-success-600 text-white hover:bg-success-700 focus:ring-success-500 shadow-xs hover:shadow-md',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5 rounded-lg',
  md: 'px-4 py-2 text-sm gap-2 rounded-lg',
  lg: 'px-6 py-3 text-base gap-2.5 rounded-xl',
};

/**
 * Versatile Button component with variants, sizes, loading state, and icon support.
 *
 * @example
 * <Button variant="primary" size="md" loading={isSubmitting}>
 *   Save Changes
 * </Button>
 *
 * @example
 * <Button variant="danger" leftIcon={<TrashIcon />} onClick={handleDelete}>
 *   Delete
 * </Button>
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      className={cn(
        // Base
        'inline-flex items-center justify-center font-semibold',
        'transition-all duration-200',
        'focus:outline-none focus:ring-2 focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        // Variant
        variantStyles[variant],
        // Size
        sizeStyles[size],
        // Full width
        fullWidth && 'w-full',
        className,
      )}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      {...rest}
    >
      {loading ? (
        <svg
          className="animate-spin shrink-0"
          width={size === 'lg' ? 20 : size === 'sm' ? 14 : 16}
          height={size === 'lg' ? 20 : size === 'sm' ? 14 : 16}
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      ) : leftIcon ? (
        <span className="shrink-0" aria-hidden="true">
          {leftIcon}
        </span>
      ) : null}

      {children && <span>{children}</span>}

      {!loading && rightIcon && (
        <span className="shrink-0" aria-hidden="true">
          {rightIcon}
        </span>
      )}
    </button>
  );
}
