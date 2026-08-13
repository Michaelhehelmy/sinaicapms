import React, { Children, cloneElement, useId } from 'react';
import { cn } from '@/lib/utils';

interface RadioItemProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  value: string;
  label: string;
  description?: string;
}

interface RadioGroupProps {
  name: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children:
    | React.ReactElement<RadioItemProps>
    | React.ReactElement<RadioItemProps>[];
}

/**
 * Accessible radio group. Renders a role="radiogroup" container; the native
 * radios share a single `name`, so browsers provide arrow-key navigation and
 * roving focus for free (no custom key handling needed).
 *
 * @example
 * <RadioGroup name="meal" value={meal} onChange={setMeal}>
 *   <RadioItem value="full" label="Full board" description="3 meals a day" />
 *   <RadioItem value="half" label="Half board" description="Breakfast + dinner" />
 * </RadioGroup>
 */
export function RadioGroup({
  name,
  value,
  defaultValue,
  onChange,
  disabled = false,
  className,
  children,
}: RadioGroupProps) {
  const controlled = value !== undefined;
  return (
    <div role="radiogroup" className={cn('flex flex-col gap-2', className)}>
      {Children.map(children, (child) =>
        cloneElement(child, {
          name,
          checked: controlled ? child.props.value === value : undefined,
          defaultChecked: !controlled && defaultValue !== undefined
            ? child.props.value === defaultValue
            : undefined,
          onChange: onChange
            ? (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)
            : child.props.onChange,
          disabled: disabled || child.props.disabled,
        }),
      )}
    </div>
  );
}

export function RadioItem({
  label,
  description,
  disabled,
  className,
  id: providedId,
  ...rest
}: RadioItemProps) {
  const autoId = useId();
  const id = providedId || autoId;
  const descId = description ? `${id}-desc` : undefined;

  return (
    <div className="flex items-start gap-2.5">
      <input
        type="radio"
        id={id}
        disabled={disabled}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 border-gray-300 text-brand-600 accent-brand-600',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-60',
          className,
        )}
        {...rest}
      />
      <div>
        <label
          htmlFor={id}
          className={cn('block text-sm font-medium text-gray-700', disabled && 'opacity-60')}
        >
          {label}
        </label>
        {description && (
          <p id={descId} className="mt-0.5 text-xs text-gray-500">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
