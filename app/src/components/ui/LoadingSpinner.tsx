import React from 'react';
import { cn } from '@/lib/utils';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  /** Visual variant: classic spinner, bouncing dots, or pulsing circle */
  variant?: 'spinner' | 'dots' | 'pulse';
  /** Color palette using design tokens */
  color?: 'brand' | 'white' | 'gray';
  /** Render as a full-screen centered overlay */
  fullScreen?: boolean;
}

const sizeMap = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

const dotSizeMap = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2.5 w-2.5',
  lg: 'h-3.5 w-3.5',
};

const pulseSizeMap = {
  sm: 'h-8 w-8',
  md: 'h-14 w-14',
  lg: 'h-20 w-20',
};

const textSizeMap = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

const colorMap = {
  brand: {
    spinner: 'text-brand-600',
    dot: 'bg-brand-600',
    pulse: 'border-brand-600',
    text: 'text-warm-500',
  },
  white: {
    spinner: 'text-white',
    dot: 'bg-white',
    pulse: 'border-white',
    text: 'text-white/80',
  },
  gray: {
    spinner: 'text-warm-400',
    dot: 'bg-warm-400',
    pulse: 'border-warm-400',
    text: 'text-warm-400',
  },
};

/* ─── Variant renderers ─── */

function SpinnerVariant({
  size,
  color,
}: {
  size: 'sm' | 'md' | 'lg';
  color: 'brand' | 'white' | 'gray';
}) {
  return (
    <svg
      className={cn('animate-spin', sizeMap[size], colorMap[color].spinner)}
      fill="none"
      viewBox="0 0 24 24"
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
  );
}

function DotsVariant({
  size,
  color,
}: {
  size: 'sm' | 'md' | 'lg';
  color: 'brand' | 'white' | 'gray';
}) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'rounded-full animate-bounce',
            dotSizeMap[size],
            colorMap[color].dot,
          )}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

function PulseVariant({
  size,
  color,
}: {
  size: 'sm' | 'md' | 'lg';
  color: 'brand' | 'white' | 'gray';
}) {
  return (
    <div className={cn('relative', pulseSizeMap[size])} aria-hidden="true">
      <div
        className={cn(
          'absolute inset-0 rounded-full border-2 opacity-30 animate-ping',
          colorMap[color].pulse,
        )}
      />
      <div
        className={cn(
          'absolute inset-2 rounded-full border-2',
          colorMap[color].pulse,
        )}
      />
    </div>
  );
}

/**
 * Versatile loading indicator with spinner, dots, and pulse variants.
 * Supports full-screen mode and accessible status announcements.
 *
 * @example
 * <LoadingSpinner size="md" text="Loading..." />
 *
 * @example
 * <LoadingSpinner variant="dots" color="brand" />
 *
 * @example
 * <LoadingSpinner fullScreen text="Please wait..." />
 */
export function LoadingSpinner({
  size = 'md',
  text,
  variant = 'spinner',
  color = 'brand',
  fullScreen = false,
}: LoadingSpinnerProps) {
  const content = (
    <div
      data-testid="loading-spinner"
      className="flex flex-col items-center justify-center gap-3"
      role="status"
      aria-label={text || 'Loading'}
    >
      {variant === 'spinner' && <SpinnerVariant size={size} color={color} />}
      {variant === 'dots' && <DotsVariant size={size} color={color} />}
      {variant === 'pulse' && <PulseVariant size={size} color={color} />}

      {text && (
        <p className={cn('font-medium', textSizeMap[size], colorMap[color].text)}>
          {text}
        </p>
      )}
      {!text && <span className="sr-only">Loading</span>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-white/80 backdrop-blur-xs">
        {content}
      </div>
    );
  }

  return content;
}

/**
 * Skeleton placeholder for content areas — shows animated bars
 * representing lines of content.
 *
 * @example
 * <Skeleton lines={3} className="max-w-md" />
 */
export function Skeleton({
  lines = 3,
  className,
}: {
  /** Number of skeleton lines to render */
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading content">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded-lg bg-warm-200 animate-pulse"
          style={{ width: i === lines - 1 ? '60%' : `${85 + Math.random() * 15}%` }}
        />
      ))}
      <span className="sr-only">Loading content</span>
    </div>
  );
}
