import React from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: { value: number; label: string };
  color?: 'green' | 'blue' | 'yellow' | 'red' | 'purple';
}

const colorMap = {
  green: {
    bg: 'bg-brand-50',
    icon: 'text-brand-700',
    trend: 'text-brand-700',
  },
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    trend: 'text-blue-600',
  },
  yellow: {
    bg: 'bg-yellow-50',
    icon: 'text-yellow-600',
    trend: 'text-yellow-600',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    trend: 'text-red-600',
  },
  purple: {
    bg: 'bg-purple-50',
    icon: 'text-purple-600',
    trend: 'text-purple-600',
  },
};

export function StatCard({ title, value, icon, trend, color = 'green', ...rest }: StatCardProps & React.HTMLAttributes<HTMLDivElement>) {
  const palette = colorMap[color];

  return (
    <div data-testid="stat-card" {...rest} className="rounded-xl border border-warm-100 bg-white p-5 shadow-card transition-shadow hover:shadow-elevated">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p data-testid="stat-label" className="truncate text-sm font-medium text-warm-500">{title}</p>
          <p data-testid="stat-value" className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {trend && (
            <div className={cn('mt-2 flex items-center gap-1 text-xs font-medium', palette.trend)}>
              <span className="inline-flex items-center" aria-label={`${Math.abs(trend.value)}% ${trend.value > 0 ? 'increase' : trend.value < 0 ? 'decrease' : 'change'}`}>
                {trend.value > 0 ? (
                  <svg className="mr-0.5 h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : trend.value < 0 ? (
                  <svg className="mr-0.5 h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : null}
                {Math.abs(trend.value)}%
              </span>
              <span className="text-gray-500">{trend.label}</span>
            </div>
          )}
        </div>
        {icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', palette.bg, palette.icon)} aria-hidden="true">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
