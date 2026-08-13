import React, { useId } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

/**
 * Accessible multi-line input with label, error, and helper text, wired via
 * aria-invalid + aria-describedby (useId-generated ids).
 *
 * @example
 * <Textarea label="Special requests" rows={3} placeholder="Dietary needs, pickup time…" />
 *
 * @example
 * <Textarea label="Notes" error="Notes are required" />
 */
export function Textarea({
  label,
  error,
  helperText,
  disabled,
  className,
  id: providedId,
  ...rest
}: TextareaProps) {
  const autoId = useId();
  const id = providedId || autoId;
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className={cn('mb-1 block text-sm font-medium text-gray-700', disabled && 'opacity-60')}
        >
          {label}
        </label>
      )}
      <textarea
        id={id}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
        className={cn(
          'w-full rounded-lg border border-warm-200 bg-white px-3 py-2 text-sm text-gray-800 shadow-xs',
          'placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500',
          error
            ? 'border-error-500 focus:border-error-500 focus:ring-error-400'
            : 'focus:border-brand-500',
          'disabled:cursor-not-allowed disabled:bg-warm-50 disabled:opacity-60',
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-error-600">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="mt-1 text-xs text-gray-500">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
