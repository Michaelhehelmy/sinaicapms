import React from 'react';

/**
 * Shared app-shell top bar (Phase 8).
 *
 * A thin horizontal frame rendered above the content area. On narrow
 * viewports it hosts the hamburger toggle that opens the off-canvas sidebar;
 * `children` carry app-specific chrome (active-camp badge, user menu, etc.).
 *
 * The caller owns all styling via `className` / `menuButtonClassName` so each
 * shell keeps byte-identical markup to its pre-consolidation implementation.
 */

const DEFAULT_CLASSES =
  'bg-white/95 backdrop-blur-sm px-3 py-3 sm:px-6 sm:py-3.5 border-b border-warm-200 flex items-center gap-3 sm:gap-4 flex-wrap shadow-[0_1px_4px_rgba(0,0,0,0.05)] sticky top-0 z-50';

const DEFAULT_MENU_CLASSES =
  'md:hidden bg-brand-600 text-white border-none text-xl px-3 py-2 rounded-lg cursor-pointer hover:bg-brand-700 transition-colors flex items-center justify-center';

interface AppTopbarProps {
  testId?: string;
  className?: string;
  /** When provided, renders the mobile hamburger (`data-testid="mobile-toggle"`). */
  onMenuClick?: () => void;
  menuButtonClassName?: string;
  children?: React.ReactNode;
}

export function AppTopbar({
  testId = 'admin-topbar',
  className,
  onMenuClick,
  menuButtonClassName,
  children,
}: AppTopbarProps) {
  return (
    <div data-testid={testId} className={className ?? DEFAULT_CLASSES}>
      {onMenuClick && (
        <button
          type="button"
          data-testid="mobile-toggle"
          aria-label="Toggle navigation menu"
          className={menuButtonClassName ?? DEFAULT_MENU_CLASSES}
          onClick={onMenuClick}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}
      {children}
    </div>
  );
}
