import React from 'react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  trend?: 'up' | 'down' | 'flat';
  trendValue?: string;
  color?: string;
  icon?: React.ReactNode;
}

const trendColors = {
  up: 'text-green-600',
  down: 'text-red-600',
  flat: 'text-gray-500',
};

const trendBg = {
  up: 'bg-green-50',
  down: 'bg-red-50',
  flat: 'bg-gray-50',
};

export function MetricCard({ title, value, trend, trendValue, color = '#22c55e', icon }: MetricCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-xs">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-500 truncate">{title}</p>
          <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
          {trend && trendValue && (
            <div className={cn('mt-2 inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full', trendBg[trend], trendColors[trend])}>
              {trend === 'up' && (
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {trend === 'down' && (
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {trendValue}
            </div>
          )}
        </div>
        {icon && (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${color}15`, color }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
