import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Context                                                            */
/* ------------------------------------------------------------------ */

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  tabIds: string[];
  registerTab: (value: string) => void;
  unregisterTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error('Tabs compound components must be used within <Tabs>');
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Tabs (root)                                                        */
/* ------------------------------------------------------------------ */

interface TabsProps {
  children: React.ReactNode;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  className?: string;
}

/**
 * Root Tabs container. Supports both controlled and uncontrolled usage.
 *
 * @example
 * // Uncontrolled
 * <Tabs defaultValue="overview">
 *   <TabList>
 *     <Tab value="overview" label="Overview" />
 *     <Tab value="details" label="Details" />
 *   </TabList>
 *   <TabPanel value="overview">Overview content</TabPanel>
 *   <TabPanel value="details">Details content</TabPanel>
 * </Tabs>
 *
 * @example
 * // Controlled
 * <Tabs value={active} onChange={setActive}>
 *   ...
 * </Tabs>
 */
export function Tabs({
  children,
  defaultValue,
  value,
  onChange,
  className,
}: TabsProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? '');
  const [tabOrder, setTabOrder] = useState<string[]>([]);

  const activeTab = isControlled ? value! : internalValue;

  const setActiveTab = useCallback(
    (v: string) => {
      if (!isControlled) {
        setInternalValue(v);
      }
      onChange?.(v);
    },
    [isControlled, onChange],
  );

  const registerTab = useCallback((v: string) => {
    setTabOrder((prev) => (prev.includes(v) ? prev : [...prev, v]));
  }, []);

  const unregisterTab = useCallback((v: string) => {
    setTabOrder((prev) => prev.filter((t) => t !== v));
  }, []);

  return (
    <TabsContext.Provider
      value={{ activeTab, setActiveTab, tabIds: tabOrder, registerTab, unregisterTab }}
    >
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  TabList                                                            */
/* ------------------------------------------------------------------ */

interface TabListProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Horizontal tab bar. Manages keyboard navigation across Tab children.
 */
export function TabList({ children, className }: TabListProps) {
  const { activeTab, tabIds } = useTabsContext();
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (tabIds.length === 0) return;

      const currentIndex = tabIds.indexOf(activeTab);
      let nextIndex = currentIndex;

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          nextIndex = (currentIndex + 1) % tabIds.length;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          nextIndex = (currentIndex - 1 + tabIds.length) % tabIds.length;
          break;
        case 'Home':
          e.preventDefault();
          nextIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          nextIndex = tabIds.length - 1;
          break;
        default:
          return;
      }

      const nextValue = tabIds[nextIndex];
      if (nextValue) {
        const nextBtn = listRef.current?.querySelector<HTMLElement>(
          `[data-tab-value="${CSS.escape(nextValue)}"]`,
        );
        nextBtn?.focus();
      }
    },
    [activeTab, tabIds],
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      data-testid="tab-list"
      className={cn(
        'flex border-b border-gray-200 overflow-x-auto',
        className,
      )}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Tab (button)                                                       */
/* ------------------------------------------------------------------ */

interface TabProps {
  value: string;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Individual tab trigger button.
 */
export function Tab({ value, label, icon, disabled = false, className }: TabProps) {
  const { activeTab, setActiveTab, registerTab, unregisterTab } = useTabsContext();
  const isActive = activeTab === value;

  useEffect(() => {
    registerTab(value);
    return () => unregisterTab(value);
  }, [value, registerTab, unregisterTab]);

  return (
    <button
      role="tab"
      id={`tab-${value}`}
      aria-selected={isActive}
      aria-controls={`tabpanel-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      data-tab-value={value}
      data-testid={`tab-${value}`}
      onClick={() => setActiveTab(value)}
      className={cn(
        'inline-flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium',
        'border-b-2 transition-colors duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        isActive
          ? 'border-brand-600 text-brand-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
        className,
      )}
    >
      {icon && (
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  TabPanel                                                           */
/* ------------------------------------------------------------------ */

interface TabPanelProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Content panel that is shown when its corresponding Tab is active.
 */
export function TabPanel({ value, children, className }: TabPanelProps) {
  const { activeTab } = useTabsContext();

  if (activeTab !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      tabIndex={0}
      data-testid={`tabpanel-${value}`}
      className={cn('py-4 focus:outline-none', className)}
    >
      {children}
    </div>
  );
}
