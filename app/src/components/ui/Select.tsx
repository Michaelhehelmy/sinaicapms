import React, { useId, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectGroup {
  label: string;
  options: SelectOption[];
}

interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[] | SelectGroup[];
  placeholder?: string;
  searchable?: boolean;
}

function isGroup(opt: SelectOption | SelectGroup): opt is SelectGroup {
  return 'options' in opt && Array.isArray((opt as SelectGroup).options);
}

function flattenOptions(options: (SelectOption | SelectGroup)[]): SelectOption[] {
  return options.reduce<SelectOption[]>((acc, opt) => {
    if (isGroup(opt)) {
      return acc.concat(opt.options);
    }
    return acc.concat(opt);
  }, []);
}

/**
 * Reusable Select component with label, error state, optional search filter,
 * and support for flat or grouped option lists.
 *
 * @example
 * <Select
 *   label="Country"
 *   options={[
 *     { value: 'us', label: 'United States' },
 *     { value: 'uk', label: 'United Kingdom' },
 *   ]}
 *   placeholder="Select a country"
 * />
 *
 * @example
 * <Select
 *   label="Category"
 *   searchable
 *   options={[
 *     { label: 'Fruit', options: [{ value: 'apple', label: 'Apple' }] },
 *     { label: 'Veg', options: [{ value: 'carrot', label: 'Carrot' }] },
 *   ]}
 * />
 */
export function Select({
  label,
  error,
  helperText,
  options,
  placeholder = 'Select an option',
  searchable = false,
  disabled,
  className,
  value,
  onChange,
  id: providedId,
  ...rest
}: SelectProps) {
  const autoId = useId();
  const id = providedId || autoId;
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  const listboxId = `${id}-listbox`;

  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const allFlat = useMemo(() => flattenOptions(options), [options]);

  // Filtered options when searchable
  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.toLowerCase();
    return options.reduce<(SelectOption | SelectGroup)[]>((acc, group) => {
      if (isGroup(group)) {
        const filtered = group.options.filter(
          (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
        );
        if (filtered.length > 0) acc.push({ ...group, options: filtered });
      } else {
        if (group.label.toLowerCase().includes(q) || group.value.toLowerCase().includes(q)) {
          acc.push(group);
        }
      }
      return acc;
    }, []);
  }, [options, query, searchable]);

  const flatFiltered = useMemo(() => flattenOptions(filteredOptions), [filteredOptions]);

  // Currently selected label
  const selectedLabel = useMemo(() => {
    const found = allFlat.find((o) => o.value === value);
    return found?.label || '';
  }, [allFlat, value]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [highlightIndex]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    setIsOpen((prev) => {
      if (!prev) {
        setHighlightIndex(-1);
        setQuery('');
      }
      return !prev;
    });
  }, [disabled]);

  const handleSelect = useCallback(
    (val: string) => {
      onChange?.({ target: { value: val } } as React.ChangeEvent<HTMLSelectElement>);
      setIsOpen(false);
      setQuery('');
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setIsOpen(true);
          setHighlightIndex(0);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev < flatFiltered.length - 1 ? prev + 1 : 0,
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIndex((prev) =>
            prev > 0 ? prev - 1 : flatFiltered.length - 1,
          );
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (highlightIndex >= 0 && flatFiltered[highlightIndex]) {
            const opt = flatFiltered[highlightIndex];
            if (!opt.disabled) handleSelect(opt.value);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setQuery('');
          break;
        case 'Home':
          e.preventDefault();
          setHighlightIndex(0);
          break;
        case 'End':
          e.preventDefault();
          setHighlightIndex(flatFiltered.length - 1);
          break;
      }
    },
    [isOpen, highlightIndex, flatFiltered, handleSelect],
  );

  // Determine the flat index offset for grouped options
  function getFlatIndex(groupIdx: number, optIdx: number): number {
    let offset = 0;
    for (let i = 0; i < groupIdx; i++) {
      const g = filteredOptions[i];
      offset += isGroup(g) ? g.options.length : 1;
    }
    return offset + optIdx;
  }

  // Render option groups or flat list
  const renderOptions = () => {
    const items: React.ReactNode[] = [];
    let flatIdx = 0;

    filteredOptions.forEach((groupOrOpt, gIdx) => {
      if (isGroup(groupOrOpt)) {
        items.push(
          <li key={`group-${gIdx}`} className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider select-none">
            {groupOrOpt.label}
          </li>,
        );
        groupOrOpt.options.forEach((opt, oIdx) => {
          const idx = getFlatIndex(gIdx, oIdx);
          items.push(
            <li
              key={opt.value}
              id={`${listboxId}-opt-${opt.value}`}
              role="option"
              aria-selected={opt.value === value}
              aria-disabled={opt.disabled || undefined}
              className={cn(
                'px-3 py-2 text-sm cursor-pointer rounded-md mx-1 transition-colors',
                opt.disabled && 'opacity-40 cursor-not-allowed',
                opt.value === value && 'bg-brand-50 text-brand-700 font-medium',
                opt.value !== value && !opt.disabled && 'text-gray-700 hover:bg-warm-100',
                idx === highlightIndex && 'bg-warm-100',
              )}
              onClick={() => !opt.disabled && handleSelect(opt.value)}
              onMouseEnter={() => setHighlightIndex(idx)}
            >
              {opt.label}
            </li>,
          );
          flatIdx++;
        });
      } else {
        const idx = getFlatIndex(gIdx, 0);
        items.push(
          <li
            key={groupOrOpt.value}
            id={`${listboxId}-opt-${groupOrOpt.value}`}
            role="option"
            aria-selected={groupOrOpt.value === value}
            aria-disabled={groupOrOpt.disabled || undefined}
            className={cn(
              'px-3 py-2 text-sm cursor-pointer rounded-md mx-1 transition-colors',
              groupOrOpt.disabled && 'opacity-40 cursor-not-allowed',
              groupOrOpt.value === value && 'bg-brand-50 text-brand-700 font-medium',
              groupOrOpt.value !== value && !groupOrOpt.disabled && 'text-gray-700 hover:bg-warm-100',
              idx === highlightIndex && 'bg-warm-100',
            )}
            onClick={() => !groupOrOpt.disabled && handleSelect(groupOrOpt.value)}
            onMouseEnter={() => setHighlightIndex(idx)}
          >
            {groupOrOpt.label}
          </li>,
        );
        flatIdx++;
      }
    });

    return items;
  };

  // If not searchable, render native <select>
  if (!searchable) {
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={id}
            className={cn(
              'block text-sm font-medium text-gray-700 mb-1',
              disabled && 'opacity-60',
            )}
          >
            {label}
          </label>
        )}

        <div className="relative">
          <select
            id={id}
            value={value}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={!!error || undefined}
            aria-describedby={
              error ? errorId : helperText ? helperId : undefined
            }
            className={cn(
              'w-full appearance-none rounded-lg border px-3 py-2 pr-10 text-sm',
              'bg-white text-gray-900',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500',
              error
                ? 'border-error-500 focus:ring-error-500 focus:border-error-500'
                : 'border-gray-200',
              disabled && 'bg-gray-50 cursor-not-allowed opacity-60',
              className,
            )}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((groupOrOpt) =>
              isGroup(groupOrOpt) ? (
                <optgroup key={groupOrOpt.label} label={groupOrOpt.label}>
                  {groupOrOpt.options.map((opt) => (
                    <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              ) : (
                <option key={groupOrOpt.value} value={groupOrOpt.value} disabled={groupOrOpt.disabled}>
                  {groupOrOpt.label}
                </option>
              ),
            )}
          </select>

          {/* Chevron icon */}
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden="true">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </div>

        {error && (
          <p id={errorId} className="text-sm text-error-500 mt-1" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={helperId} className="text-sm text-gray-500 mt-1">
            {helperText}
          </p>
        )}
      </div>
    );
  }

  // Searchable custom dropdown
  return (
    <div className="w-full">
      {label && (
        <label
          id={`${id}-label`}
          className={cn(
            'block text-sm font-medium text-gray-700 mb-1',
            disabled && 'opacity-60',
          )}
        >
          {label}
        </label>
      )}

      <div ref={containerRef} className="relative">
        {/* Trigger button */}
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={isOpen ? listboxId : undefined}
          aria-labelledby={label ? `${id}-label` : undefined}
          aria-invalid={!!error || undefined}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          disabled={disabled}
          onClick={handleToggle}
          onKeyDown={handleKeyDown}
          className={cn(
            'w-full appearance-none rounded-lg border px-3 py-2 pr-10 text-left text-sm',
            'bg-white text-gray-900',
            'transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500',
            error
              ? 'border-error-500 focus:ring-error-500 focus:border-error-500'
              : 'border-gray-200',
            disabled && 'bg-gray-50 cursor-not-allowed opacity-60',
            !selectedLabel && 'text-gray-500',
            className,
          )}
        >
          {selectedLabel || placeholder}
        </button>

        {/* Chevron */}
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" aria-hidden="true">
          <svg
            className={cn('h-4 w-4 transition-transform duration-200', isOpen && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>

        {/* Dropdown */}
        {isOpen && (
          <div className="absolute z-dropdown mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-elevated overflow-hidden">
            {/* Search input */}
            <div className="p-2 border-b border-gray-100">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHighlightIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type to search..."
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm bg-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                aria-label="Search options"
                autoFocus
              />
            </div>

            {/* Options list */}
            <ul
              ref={listRef}
              id={listboxId}
              role="listbox"
              aria-labelledby={label ? `${id}-label` : undefined}
              className="max-h-60 overflow-y-auto py-1"
            >
              {flatFiltered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-gray-500 text-center select-none">
                  No options found
                </li>
              ) : (
                renderOptions()
              )}
            </ul>
          </div>
        )}
      </div>

      {error && (
        <p id={errorId} className="text-sm text-error-500 mt-1" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={helperId} className="text-sm text-gray-500 mt-1">
          {helperText}
        </p>
      )}
    </div>
  );
}
