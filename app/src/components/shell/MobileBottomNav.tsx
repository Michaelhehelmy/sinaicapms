import React from 'react';
import type { ShellNavItem } from './AppSidebar';

/**
 * Shared mobile bottom navigation (Phase 8).
 *
 * Fixed thumb-reach bar shown below `md` in both shells. Items render as
 * icon-over-label buttons with `aria-current="page"` on the active one.
 */

const NAV_CLASSES =
  'fixed bottom-0 left-0 right-0 z-[95] md:hidden bg-white border-t border-stone-200 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] flex';

function getItemClasses(active: boolean) {
  return `flex flex-1 flex-col items-center gap-1 py-2.5 px-1 border-none bg-transparent cursor-pointer text-[0.65rem] font-[inherit] tracking-[0.2px] transition-colors ${
    active ? 'text-brand-600 font-semibold' : 'text-stone-500 hover:text-stone-700'
  }`;
}

interface MobileBottomNavProps {
  testId: string;
  ariaLabel: string;
  items: ShellNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  /** e.g. `mobile-nav-${id}`. */
  getNavItemTestId: (id: string) => string;
}

export function MobileBottomNav({
  testId,
  ariaLabel,
  items,
  activeId,
  onNavigate,
  getNavItemTestId,
}: MobileBottomNavProps) {
  return (
    <nav data-testid={testId} className={NAV_CLASSES} aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.id === activeId;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            data-testid={getNavItemTestId(item.id)}
            aria-current={active ? 'page' : undefined}
            className={getItemClasses(active)}
          >
            {Icon && <Icon size={20} />}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
