import React, { useId } from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

/**
 * Accessible Switch with role="switch" and aria-checked. Toggles with a click
 * and Space/Enter (native button). Optional visible label wired via useId.
 *
 * @example
 * <Switch checked={dark} onCheckedChange={setDark} label="Dark mode" />
 */
export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled = false,
  className,
  id: providedId,
  ...rest
}: SwitchProps) {
  const autoId = useId();
  const id = providedId || autoId;

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          checked ? 'bg-brand-600' : 'bg-gray-300',
          className,
        )}
        {...rest}
      >
        <span
          aria-hidden="true"
          className={cn(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
      {label && (
        <label
          htmlFor={id}
          className={cn('select-none text-sm font-medium text-gray-700', disabled && 'opacity-60')}
        >
          {label}
        </label>
      )}
    </div>
  );
}
