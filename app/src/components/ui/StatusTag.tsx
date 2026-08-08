import React from 'react';
import { cn } from '@/lib/utils';

interface StatusTagProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusColorMap: Record<string, { bg: string; text: string }> = {
  confirmed:   { bg: 'bg-green-100', text: 'text-green-800' },
  active:      { bg: 'bg-green-100', text: 'text-green-800' },
  completed:   { bg: 'bg-green-100', text: 'text-green-800' },
  pending:     { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  processing:  { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  cancelled:   { bg: 'bg-red-100', text: 'text-red-800' },
  rejected:    { bg: 'bg-red-100', text: 'text-red-800' },
  failed:      { bg: 'bg-red-100', text: 'text-red-800' },
  'checked-in':  { bg: 'bg-blue-100', text: 'text-blue-800' },
  'checked-out': { bg: 'bg-gray-100', text: 'text-gray-600' },
  inactive:    { bg: 'bg-gray-100', text: 'text-gray-600' },
  dormant:     { bg: 'bg-gray-100', text: 'text-gray-600' },
};

const defaultColors = { bg: 'bg-gray-100', text: 'text-gray-600' };

export function StatusTag({ status, size = 'sm' }: StatusTagProps) {
  const normalized = status.toLowerCase().trim();
  const colors = statusColorMap[normalized] ?? defaultColors;

  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center rounded-full font-medium capitalize',
        colors.bg,
        colors.text,
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      )}
    >
      {status}
    </span>
  );
}
