import React from 'react';

/**
 * Command Center inline SVG icon set (shared across Admin, POS, and shell).
 *
 * Promoted from components/admin/icons.tsx in Phase 8 so both app shells and
 * any future surface consume ONE canonical icon module. Small, dependency-free
 * stroke icons (heroicons-style 24px grid). Every icon:
 * - is inline SVG (no emoji, no icon library)
 * - inherits `currentColor` so it follows surrounding text/theme colors
 * - defaults to a 20px box, overridable via the `size` prop
 * - is hidden from assistive tech (`aria-hidden`) and non-focusable
 *
 * `components/admin/icons.tsx` re-exports this module for backward
 * compatibility — import from `@/components/ui/icons` going forward.
 */

export interface IconProps {
  /** Render size in px (both width and height). Default 20. */
  size?: number;
  className?: string;
  /** Stroke width for outline icons. Default 2. */
  strokeWidth?: number;
}

function IconBase({
  size = 20,
  className,
  strokeWidth = 2,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Dashboard — 2x2 grid of panes */
export function IconDashboard(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </IconBase>
  );
}

/** Camps — desert tent */
export function IconCamps(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3 2.5 20h19L12 3z" />
      <path d="M12 9v11" />
      <path d="M6.4 20 12 10.5 17.6 20" />
    </IconBase>
  );
}

/** Rooms — building with door */
export function IconRooms(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M4 21h16" />
      <path d="M6 21V7l6-4 6 4v14" />
      <path d="M10 21v-4h4v4" />
      <path d="M9.5 9.5h.01" />
      <path d="M9.5 12.5h.01" />
      <path d="M14.5 9.5h.01" />
      <path d="M14.5 12.5h.01" />
    </IconBase>
  );
}

/** Orders — clipboard with list lines */
export function IconOrders(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <path d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      <path d="M9.75 13.5h4.5" />
      <path d="M9.75 16.5h4.5" />
      <path d="M9.75 10.5h.01" />
    </IconBase>
  );
}

/** Booking Calendar — month grid */
export function IconCalendar(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M8 7V3m8 4V3" />
      <path d="M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      <path d="M3 11h18" />
    </IconBase>
  );
}

/** Rate Plans — currency */
export function IconRatePlans(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </IconBase>
  );
}

/** Meals — fork & knife */
export function IconMeals(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
    </IconBase>
  );
}

/** Planning — clipboard with check */
export function IconPlanning(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <path d="M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      <path d="m9.5 14 1.75 1.75 3.25-3.5" />
    </IconBase>
  );
}

/** Reports — bar chart */
export function IconReports(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M3 3v18h18" />
      <path d="M8 17v-4m4 4V7m4 10v-6" />
    </IconBase>
  );
}

/** Menu Page — document with lines */
export function IconMenu(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25" />
      <path d="M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      <path d="M8.25 14.25h7.5" />
      <path d="M8.25 17.25h4.5" />
    </IconBase>
  );
}

/** Settings — cog */
export function IconSettings(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.108 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.108-1.204l-.526-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </IconBase>
  );
}

/** Password — lock */
export function IconPassword(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75" />
      <path d="M6.75 10.5h10.5a2.25 2.25 0 012.25 2.25v6.75a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25v-6.75a2.25 2.25 0 012.25-2.25z" />
      <path d="M12 14.25v3.75" />
    </IconBase>
  );
}

/** Low Stock — warning triangle with exclamation */
export function IconLowStock(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
      <path d="M12 15.75h.007v.008H12v-.008z" />
    </IconBase>
  );
}

/** Inbox — tray receiving incoming guest leads + bookings */
export function IconInbox(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 3v10.5m0 0l-3.75-3.75M12 13.5l3.75-3.75" />
      <path d="M3.75 15.75v3a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-3" />
    </IconBase>
  );
}

/** POS — shopping cart */
export function IconPos(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
    </IconBase>
  );
}

/** Staff — user group (POS team) */
export function IconStaff(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </IconBase>
  );
}

/** Products — retail box/package (POS catalog) */
export function IconProducts(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
    </IconBase>
  );
}

/** Shift — clock face (POS shift lifecycle) */
export function IconShift(props: IconProps) {
  return (
    <IconBase {...props}>
      <path d="M12 6v6h4.5" />
      <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </IconBase>
  );
}
