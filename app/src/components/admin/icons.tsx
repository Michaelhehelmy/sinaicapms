/**
 * Admin icon re-exports.
 *
 * Phase 8 promoted the canonical icon set to `@/components/ui/icons` so the
 * shared shell (AppSidebar / MobileBottomNav) and the POS shell consume one
 * module. This file remains as a backward-compatible re-export — existing
 * admin panels import from './icons'.
 */
export type { IconProps } from '@/components/ui/icons';
export {
  IconAnalytics,
  IconCalendar,
  IconCamps,
  IconCRM,
  IconDashboard,
  IconAI,
  IconFinancials,
  IconHR,
  IconInbox,
  IconLowStock,
  IconMeals,
  IconMenu,
  IconOrders,
  IconPassword,
  IconPlanning,
  IconPos,
  IconProducts,
  IconPromotions,
  IconRatePlans,
  IconReports,
  IconRooms,
  IconServices,
  IconSettings,
  IconShift,
  IconStaff,
  IconStorefront,
  IconSupply,
} from '@/components/ui/icons';
