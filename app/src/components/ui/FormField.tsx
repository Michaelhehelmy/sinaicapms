import React, { useId } from 'react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  label?: string;
  /** htmlFor of the control (defaults to an auto-generated id). */
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * FormField — label + control + hint + error composition wrapper. Uses
 * useId to wire aria-describedby so hints/errors are announced to screen
 * readers. Wrap any input control (Input, Select, Textarea, Checkbox…).
 *
 * @example
 * <FormField label="Camp name" htmlFor="camp" hint="Shown on the marketplace" error={errors.name}>
 *   <Input id="camp" />
 * </FormField>
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  children,
  className,
}: FormFieldProps) {
  const autoId = useId();
  const controlId = htmlFor || autoId;

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label
          htmlFor={controlId}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          {label}
          {required && (
            <span className="ml-0.5 text-error-600" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${controlId}-error`} role="alert" className="mt-1 text-xs text-error-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${controlId}-hint`} className="mt-1 text-xs text-gray-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
