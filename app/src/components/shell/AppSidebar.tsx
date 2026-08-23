import React from 'react';
import type { IconProps } from '@/components/ui/icons';

/**
 * Shared app-shell sidebar (Phase 8).
 *
 * One component powering both shells:
 * - POS terminal  → static desktop column (`className` supplies layout).
 * - Admin console → off-canvas drawer on mobile, pinned ≥md (transform
 *   classes supplied by the caller via `className`, scrim via `backdrop`).
 *
 * The caller owns ALL styling decisions (aside classes, per-item classes,
 * icon wrap, nav padding) so each shell keeps byte-identical markup to its
 * pre-consolidation implementation; this component only owns structure.
 */

export interface ShellNavItem {
  id: string;
  label: string;
  icon?: React.ComponentType<IconProps>;
  /** Rendered after the label (unread badge pill etc.). */
  trailing?: React.ReactNode;
}

export interface ShellNavGroup {
  /** Optional prebuilt heading node rendered above the group items. */
  heading?: React.ReactNode;
  /** Wrapper classes for the group container (border separators etc.). */
  className?: string;
  items: ShellNavItem[];
}

interface AppSidebarProps {
  sidebarTestId: string;
  ariaLabel: string;
  /** Full className for the <aside> (layout + open/closed transform). */
  className: string;
  /** Branding/header block rendered above the nav. */
  header?: React.ReactNode;
  groups: ShellNavGroup[];
  activeId: string;
  onNavigate: (id: string) => void;
  /** e.g. `pos-nav-${id}` or `nav-tab-${id}`. */
  getNavItemTestId: (id: string) => string;
  /** Per-item classes; receives whether the item is currently active. */
  getItemClassName: (active: boolean) => string;
  /** Wrapper around each item's icon (POS uses `mr-3`, admin a fixed slot). */
  iconWrapClassName?: string;
  /** Bottom block (user identity, sign-out, version stamp…). */
  footer?: React.ReactNode;
  /** Testid + classes for the inner <nav> (admin exposes `sidebar-nav`). */
  navTestId?: string;
  navClassName?: string;
  /**
   * Drawer scrim. When provided and `open`, renders a dimmed backdrop under
   * the aside (non-portal, inside this component's fragment) that dismisses
   * the drawer on click.
   */
  backdrop?: { open: boolean; onDismiss: () => void };
}

export function AppSidebar({
  sidebarTestId,
  ariaLabel,
  className,
  header,
  groups,
  activeId,
  onNavigate,
  getNavItemTestId,
  getItemClassName,
  iconWrapClassName,
  footer,
  navTestId,
  navClassName = 'flex-1 py-3',
  backdrop,
}: AppSidebarProps) {
  return (
    <>
      {backdrop?.open && (
        <div
          data-testid="sidebar-backdrop"
          onClick={backdrop.onDismiss}
          className="fixed inset-0 bg-black/40 z-[90] md:hidden"
        />
      )}
      <aside data-testid={sidebarTestId} className={className}>
        {header}
        <nav
          data-testid={navTestId}
          role="navigation"
          aria-label={ariaLabel}
          className={navClassName}
        >
          {groups.map((group, gi) => (
            <div key={`group-${gi}`} className={group.className}>
              {group.heading}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate(item.id)}
                    data-testid={getNavItemTestId(item.id)}
                    className={getItemClassName(active)}
                  >
                    {Icon && (
                      <span className={iconWrapClassName ?? 'mr-3'}>
                        <Icon size={18} />
                      </span>
                    )}
                    {item.label}
                    {item.trailing}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        {footer}
      </aside>
    </>
  );
}
