import React from 'react';
import { cn } from '@/lib/utils';

interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  /** Set false to expose the separator to screen readers. */
  decorative?: boolean;
}

/**
 * Separator — horizontal or vertical rule. Decorative by default
 * (role="none", hidden from AT); pass decorative={false} to render a
 * semantic role="separator".
 *
 * @example
 * <Separator />
 * <Separator orientation="vertical" className="mx-4 self-stretch" />
 */
export function Separator({
  orientation = 'horizontal',
  decorative = true,
  className,
  ...rest
}: SeparatorProps) {
  return (
    <div
      role={decorative ? 'none' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        'bg-gray-200',
        orientation === 'horizontal' ? 'h-px w-full' : 'w-px self-stretch',
        className,
      )}
      {...rest}
    />
  );
}
