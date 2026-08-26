import React, { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface DateRange {
  startDate: string;
  endDate: string;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  className?: string;
}

const PRESETS: Array<{ label: string; getRange: () => DateRange }> = [
  {
    label: 'Today',
    getRange: () => {
      const today = new Date().toISOString().slice(0, 10);
      return { startDate: today, endDate: today };
    },
  },
  {
    label: 'Last 7 Days',
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 86400_000);
      return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
    },
  },
  {
    label: 'Last 30 Days',
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86400_000);
      return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
    },
  },
  {
    label: 'Last 90 Days',
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 90 * 86400_000);
      return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
    },
  },
];

export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false);

  const handlePreset = useCallback(
    (preset: typeof PRESETS[number]) => {
      onChange(preset.getRange());
      setShowCustom(false);
    },
    [onChange],
  );

  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          onClick={() => handlePreset(preset)}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors',
            !showCustom &&
              value.startDate === preset.getRange().startDate &&
              value.endDate === preset.getRange().endDate
              ? 'bg-green-600 text-white border-green-600'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
          )}
        >
          {preset.label}
        </button>
      ))}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className={cn(
          'px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors',
          showCustom
            ? 'bg-green-600 text-white border-green-600'
            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
        )}
      >
        Custom
      </button>
      {showCustom && (
        <div className="flex items-center gap-2 ml-2">
          <input
            type="date"
            value={value.startDate}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-green-500"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={value.endDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs focus:outline-none focus:border-green-500"
          />
        </div>
      )}
    </div>
  );
}
