import React from 'react';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

export function ChartCard({ title, children, className, action }: ChartCardProps) {
  return (
    <Card padding="md" className={cn('h-full', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-700">{title}</h3>
        {action}
      </div>
      <div className="w-full">
        {children}
      </div>
    </Card>
  );
}
