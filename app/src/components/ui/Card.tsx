import React from 'react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Card                                                               */
/* ------------------------------------------------------------------ */

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap: Record<string, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

/**
 * Base Card component with optional hover elevation and configurable padding.
 *
 * @example
 * <Card hover padding="md">
 *   <CardBody>Content here</CardBody>
 * </Card>
 */
export function Card({
  children,
  className,
  hover = false,
  padding = 'md',
  ...rest
}: CardProps & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl shadow-card overflow-hidden',
        hover && 'hover:shadow-elevated transition-shadow duration-200',
        paddingMap[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CardHeader                                                         */
/* ------------------------------------------------------------------ */

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

/**
 * Card header with optional action slot (buttons, icons, etc.).
 *
 * @example
 * <CardHeader action={<Button size="sm">Edit</Button>}>
 *   <h3>Settings</h3>
 * </CardHeader>
 */
export function CardHeader({ children, className, action }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-6 py-4 border-b border-gray-100',
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="shrink-0 ml-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CardBody                                                           */
/* ------------------------------------------------------------------ */

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Card body — main content area.
 */
export function CardBody({ children, className }: CardBodyProps) {
  return (
    <div className={cn('px-6 py-4', className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CardFooter                                                         */
/* ------------------------------------------------------------------ */

interface CardFooterProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Card footer — typically for actions, separated by a top border.
 */
export function CardFooter({ children, className }: CardFooterProps) {
  return (
    <div
      className={cn(
        'px-6 py-4 border-t border-gray-100 bg-gray-50',
        className,
      )}
    >
      {children}
    </div>
  );
}
