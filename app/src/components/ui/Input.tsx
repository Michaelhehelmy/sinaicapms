import React, { useId } from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

/**
 * Reusable Input component with label, error state, helper text, and icon support.
 *
 * @example
 * <Input label="Email" type="email" placeholder="you@example.com" />
 *
 * @example
 * <Input
 *   label="Password"
 *   type="password"
 *   error="Password must be at least 8 characters"
 * />
 *
 * @example
 * <Input
 *   label="Search"
 *   leftIcon={<SearchIcon />}
 *   rightIcon={<XIcon />}
 * />
 */
export function Input({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  disabled,
  className,
  id: providedId,
  ...rest
}: InputProps) {
  const autoId = useId();
  const id = providedId || autoId;
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className={cn(
            'block text-sm font-medium text-gray-700 mb-1',
            disabled && 'opacity-60',
          )}
        >
          {label}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}

        <input
          id={id}
          className={cn(
            // Base
            'w-full rounded-lg border px-3 py-2 text-sm',
            'bg-white text-gray-900 placeholder:text-gray-500',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500',
            // Icon padding
            leftIcon ? 'pl-10' : '',
            rightIcon ? 'pr-10' : '',
            // Error state
            error
              ? 'border-error-500 focus:ring-error-500 focus:border-error-500'
              : 'border-warm-200 border-gray-200',
            // Disabled state
            disabled && 'bg-gray-50 cursor-not-allowed opacity-60',
            className,
          )}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          {...rest}
        />

        {rightIcon && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        )}
      </div>

      {error && (
        <p id={errorId} className="text-sm text-error-500 mt-1" role="alert">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p id={helperId} className="text-sm text-gray-500 mt-1">
          {helperText}
        </p>
      )}
    </div>
  );
}
