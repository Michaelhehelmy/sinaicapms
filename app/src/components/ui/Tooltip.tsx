import React, { useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Delay before the tooltip appears (ms). */
  delay?: number;
}

const sideClasses: Record<NonNullable<TooltipProps['side']>, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
};

/**
 * Accessible Tooltip — shows on hover AND keyboard focus, announced via
 * aria-describedby, closes on Escape/blur. Wraps a single child trigger.
 *
 * @example
 * <Tooltip content="Delete permanently">
 *   <Button variant="danger" aria-label="Delete">🗑</Button>
 * </Tooltip>
 */
export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 300,
}: TooltipProps) {
  const tooltipId = useId();
  const timerRef = useRef<number | null>(null);
  const [visible, setVisible] = useState(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const show = () => {
    clearTimer();
    timerRef.current = window.setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    clearTimer();
    setVisible(false);
  };

  const child = React.Children.only(children) as React.ReactElement;

  const trigger = React.cloneElement(child, {
    onMouseEnter: (e: React.MouseEvent) => {
      (child.props as { onMouseEnter?: React.MouseEventHandler })?.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      (child.props as { onMouseLeave?: React.MouseEventHandler })?.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      (child.props as { onFocus?: React.FocusEventHandler })?.onFocus?.(e);
      show();
    },
    onBlur: (e: React.FocusEvent) => {
      (child.props as { onBlur?: React.FocusEventHandler })?.onBlur?.(e);
      hide();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      (child.props as { onKeyDown?: React.KeyboardEventHandler })?.onKeyDown?.(e);
      if (e.key === 'Escape') {
        clearTimer();
        setVisible(false);
      }
    },
    'aria-describedby': visible ? tooltipId : undefined,
  });

  return (
    <span className="relative inline-flex">
      {trigger}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            'pointer-events-none absolute z-50 max-w-xs rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-md',
            sideClasses[side],
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
