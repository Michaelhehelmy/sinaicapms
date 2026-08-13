import React, { useId } from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
}

/**
 * Accessible Checkbox with native keyboard + screen-reader semantics, optional
 * label/description/error wiring via useId-generated ids.
 *
 * @example
 * <Checkbox label="Send me booking confirmations" defaultChecked />
 *
 * @example
 * <Checkbox label="Terms" description="I agree to the terms of service" error="Required" />
 */
export function Checkbox({
  label,
  description,
  error,
  disabled,
  className,
  id: providedId,
  ...rest
}: CheckboxProps) {
  const autoId = useId();
  const id = providedId || autoId;
  const descId = description ? `${id}-desc` : undefined;
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex items-start gap-2.5">
      <input
        type="checkbox"
        id={id}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : description ? descId : undefined}
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 accent-brand-600',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      />
      {(label || description || error) && (
        <div className="select-none">
          {label && (
            <label
              htmlFor={id}
              className={cn('block text-sm font-medium text-gray-700', disabled && 'opacity-60')}
            >
              {label}
            </label>
          )}
          {description && (
            <p id={descId} className="mt-0.5 text-xs text-gray-500">
              {description}
            </p>
          )}
          {error && (
            <p id={errorId} className="mt-0.5 text-xs text-error-600">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
