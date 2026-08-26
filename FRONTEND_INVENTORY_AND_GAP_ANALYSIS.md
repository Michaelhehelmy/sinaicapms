# Frontend Admin Panel Inventory & Gap Analysis

**Date**: August 26, 2026  
**Scope**: Complete analysis of `app/src/components/admin/`, `app/src/pages/admin/`, shell components, hooks, and API layer

---

## 1. Executive Summary

### Strengths
- **Solid architecture**: TanStack Query for data fetching, lazy-loaded panels, clean separation of concerns
- **Comprehensive UI library**: 18 shared components (DataTable, FormModal, StatCard, Badge, etc.)
- **New pillars well-structured**: Financial, HR, Supply, CRM, Storefront, AI panels have consistent CRUD patterns
- **Mobile support**: Bottom nav, responsive grid layouts, off-canvas sidebar
- **Tenant isolation**: Proper scoping via `getTenantId()` and `setTenantScope()` for super admin drill-down

### Weaknesses
- **Super Admin dashboard is minimal**: Only 6 stat cards, 2 quick actions, no charts, no real activity feed
- **No cross-tenant analytics**: Can't compare tenants, view system-wide trends, or aggregate metrics
- **Missing critical Super Admin panels**: No System Settings, Audit Log, Subscriptions/Billing management
- **New pillars not visible to Super Admin**: Financial, HR, Supply, CRM, Storefront, AI panels only accessible at tenant level
- **No charts/visualizations**: All panels are tables and forms—no bar charts, line graphs, pie charts
- **Client-side pagination**: DataTable doesn't support server-side pagination (all data loaded at once)
- **No URL-based filters**: Filters aren't shareable via URL parameters
- **No bulk actions**: Can't select multiple rows for bulk operations

### Priorities
1. **Critical**: Super Admin dashboard needs real analytics, charts, and system-wide visibility
2. **Critical**: Add missing Super Admin panels (System Settings, Audit Log, Subscriptions)
3. **High**: Make new pillars visible to Super Admin with cross-tenant aggregation
4. **High**: Add chart library and visualize key metrics
5. **Medium**: Improve DataTable with server-side pagination and URL-based filters
6. **Low**: Add bulk actions, loading skeletons, error boundaries

---

## 2. Complete Admin Panel Inventory

### Navigation Structure

| Role | Sidebar Items | Count |
|------|---------------|-------|
| **Super Admin** | Super Dashboard, Tenants, All Orders | 3 |
| **Tenant Admin** | Dashboard, Projects, Rooms, Rate Plans, Orders, Inbox, Booking Calendar, Meals, Menu Planner, Menu Page, Planning, Reports, Analytics, Low Stock, Promotions, Services, Service Bookings, Staff, Financials, HR & Payroll, Supply Chain, CRM, Storefront, AI & Intelligence, Billing, Settings | 26 |

### Panel Details

| Panel Name | ID | Visibility | Sub-tabs | Key Components | Data Source | Quality | Missing Features |
|------------|-----|------------|----------|----------------|-------------|---------|------------------|
| **Super Dashboard** | super_dashboard | Super Admin | None | StatCard (×6), Quick Actions (×2), Card (activity placeholder) | `useAdminStatsQuery` → `/api/admin/stats` | Moderate | Charts, real activity feed, system health, tenant comparison, revenue trends |
| **Tenants** | super_tenants | Super Admin | None | Tenant cards, Create/Edit forms, Admin CRUD, TenantDrilldown | `getAdminTenants`, `getAdmins`, `createTenant`, `updateAdminTenant` | Good | Search/filter, bulk actions, subscription status, usage metrics, export |
| **All Orders** | super_reservations | Super Admin | None | DataTable, Tenant selector, CSV export | `getAdminTenants`, `getOrders` | Moderate | Date range filter, status filter, revenue aggregation, bulk actions |
| **Dashboard** | dashboard | Tenant Admin | None | StatCard (×8), Recent Orders table, Low Stock card | `useOrdersQuery`, `useRoomsQuery`, `useProductsQuery`, `useMealsQuery`, `useLowStock` | Good | Charts (occupancy trend, revenue trend), date range picker |
| **Projects (Camps)** | camps | Tenant Admin | None | DataTable, FormModal, CRUD | `useCampsQuery` | Good | Bulk actions, export |
| **Rooms** | rooms | Tenant Admin | None | DataTable, FormModal, CRUD | `useRoomsQuery` | Good | Bulk actions, availability calendar view |
| **Rate Plans** | rateplans | Tenant Admin | None | DataTable, FormModal, CRUD | `useRatePlansQuery` | Good | Pricing comparison view |
| **Orders** | reservations | Tenant Admin | None | DataTable, Status filters, State change, Delete | `useOrdersQuery`, `useSaveOrderMutation`, `useDeleteOrderMutation` | Good | Date range, bulk status change, export |
| **Inbox** | inbox | Tenant Admin | None | Real-time SSE, Message list | `useSseInbox`, `getInbox`, `updateInboxItem` | Good | Message templates, auto-categorization |
| **Booking Calendar** | calendar | Tenant Admin | None | Calendar grid | `useOrdersQuery`, `useRoomsQuery` | Good | Drag-and-drop, month/week/day views |
| **Meals** | meals | Tenant Admin | None | DataTable, FormModal, CRUD | `useMealsQuery` | Good | Nutrition info, allergen tags |
| **Menu Planner** | menu-planner | Tenant Admin | None | Schedule grid, Meal assignment | `useMealSchedulesQuery` | Good | Drag-and-drop scheduling |
| **Menu Page** | menu | Tenant Admin | None | Public menu preview | `useMealsQuery` | Good | Customization options |
| **Planning** | planning | Tenant Admin | None | Timeline view | `usePlansQuery` | Good | Gantt chart, dependencies |
| **Reports** | reports | Tenant Admin | None | Report cards, Export | `getReports`, `exportReport` | Moderate | Custom date ranges, charts, scheduled reports |
| **Analytics** | analytics | Tenant Admin | None | Basic stats | `getAnalytics` | Poor | Charts, trends, comparisons |
| **Low Stock** | low-stock | Tenant Admin | None | Alert list | `useLowStock` | Good | Auto-reorder, supplier links |
| **Promotions** | promotions | Tenant Admin | None | DataTable, FormModal, CRUD | `getPromotions` | Good | Coupon codes, bulk create |
| **Services** | services | Tenant Admin | None | DataTable, FormModal, CRUD | `getServices` | Good | Booking calendar integration |
| **Service Bookings** | service-bookings | Tenant Admin | None | DataTable, Status management | `getServiceBookings` | Good | Calendar view, staff assignment |
| **Staff** | staff | Tenant Admin | None | DataTable, FormModal, CRUD | `getStaff` | Good | Schedule, payroll integration |
| **Financials** | financials | Tenant Admin | Accounts, Journals, Entries, Invoices, Payments, Taxes | DataTable, FormModal, CRUD per tab | `getFinancialAccounts`, etc. | Good | Charts (P&L, cash flow), bank reconciliation |
| **HR & Payroll** | hr | Tenant Admin | Employees, Leave Types, Leave Requests, Payroll, Recruitment | DataTable, FormModal, CRUD per tab | `getHREmployees`, etc. | Good | Org chart, time tracking, payslip PDF |
| **Supply Chain** | supply | Tenant Admin | Warehouses, Stock, Transfers, POs, BOMs, Manufacturing | DataTable, FormModal, CRUD per tab | `getSupplyWarehouses`, etc. | Good | Inventory valuation, demand forecasting |
| **CRM** | crm | Tenant Admin | Contacts, Leads, Opportunities, Tasks, Tickets, Knowledge | DataTable, Kanban, Gantt, FormModal | `getCRMContacts`, etc. | Good | Email integration, activity timeline |
| **Storefront** | storefront | Tenant Admin | Products, Cart, Checkout, Orders, Pages, Blog | DataTable, FormModal, CRUD per tab | `getStorefrontProducts`, etc. | Good | SEO preview, analytics |
| **AI & Intelligence** | ai | Tenant Admin | Predictions, Price Rules, Automation Rules, Automation Logs, Forecast | DataTable, FormModal, CRUD per tab | `getAIPredictions`, etc. | Moderate | Visualizations, model training UI |
| **Billing** | billing | Tenant Admin | None | Static plan comparison, Usage bars | Hardcoded data | Poor | Real subscription data, payment history, upgrade flow |
| **Settings** | settings | Tenant Admin | General, Password | Form, Password change | `useSettingsQuery`, `updateSettings` | Good | Email templates, feature flags |
| **Password** | (merged with settings) | Tenant Admin | None | Password form | `changePassword` | Good | 2FA setup |

### Shared UI Components (18 total)

| Component | Purpose | Usage |
|-----------|---------|-------|
| `DataTable` | Sortable, searchable, selectable table with pagination | All panels |
| `FormModal` | CRUD form in modal | All panels |
| `StatCard` | Metric display with icon | Dashboard, Super Dashboard |
| `Badge` | Status/type badges | All panels |
| `StatusTag` | Colored status indicator | Orders, CRM |
| `Button` | Styled button with variants | All panels |
| `Card` | Container with optional header | All panels |
| `Select` | Dropdown select | All panels |
| `Input` | Text input with label | All panels |
| `ConfirmDialog` | Delete confirmation | All panels |
| `LoadingSpinner` | Loading state | All panels |
| `EmptyState` | No data placeholder | All panels |
| `ErrorBoundary` | Error catching | AdminApp shell |
| `Skeleton` | Loading skeleton | Dashboard, Orders |
| `Toast` | Notification messages | All panels |
| `Modal` | Base modal | FormModal wraps this |
| `icons` | SVG icon components | Shell, panels |
| `SafeImage` | Safe image rendering | Public components |

### State Management

| Pattern | Implementation | Usage |
|---------|----------------|-------|
| **TanStack Query** | `useQuery`, `useMutation`, `useQueryClient` | All data fetching |
| **React useState** | Local component state | Forms, modals, filters |
| **React Context** | `useAuth`, `useToast` | Auth, notifications |
| **Module-level** | `_tenantScopeOverride` in api.ts | Super admin drill-down |
| **URL state** | `parseHashTab`, `push` | Tab navigation |

---

## 3. Gap Analysis

### Super Admin Dashboard — Critical Gaps

| Gap | Priority | Current State | Required |
|-----|----------|---------------|----------|
| **No charts** | Critical | 6 StatCards only | Revenue trend line, occupancy bar, tenant comparison bar, order status pie |
| **No activity feed** | Critical | "Coming soon" placeholder | Real-time log of tenant actions, orders, system events |
| **No system health** | Critical | Not shown | API response times, error rates, D1 usage, KV usage |
| **No tenant comparison** | High | Not possible | Side-by-side metrics, ranking table |
| **No revenue aggregation** | High | Single "Total Revenue" number | Revenue by tenant, by period, by category |
| **No date range picker** | High | Shows all-time | Today, 7d, 30d, 90d, custom range |

### Missing Super Admin Panels — Critical

| Panel | Priority | Description | Backend Endpoint |
|-------|----------|-------------|------------------|
| **System Settings** | Critical | Feature flags, email templates, default tax rates, platform config | Needs new: `GET/PUT /api/admin/settings` |
| **Users Management** | High | List all admin users, roles, permissions, last login | Exists: `getAdmins` (in Tenants panel) — needs dedicated panel |
| **Audit Log** | High | Cross-tenant audit trail, security events | Exists: `getAuditLogs` — needs super admin view |
| **Subscriptions/Billing** | High | All tenant subscriptions, payment history, plan management | Needs new: `GET /api/admin/subscriptions` |
| **Reports** | Medium | System-wide reports, custom date ranges, export | Needs new: `GET /api/admin/reports` |

### New Pillars — Super Admin Visibility

| Pillar | Tenant Visible | Super Admin Visible | Cross-tenant Aggregation |
|--------|----------------|---------------------|--------------------------|
| Financials | ✅ Full CRUD | ❌ Not visible | ❌ No |
| HR & Payroll | ✅ Full CRUD | ❌ Not visible | ❌ No |
| Supply Chain | ✅ Full CRUD | ❌ Not visible | ❌ No |
| CRM | ✅ Full CRUD | ❌ Not visible | ❌ No |
| Storefront | ✅ Full CRUD | ❌ Not visible | ❌ No |
| AI & Intelligence | ✅ Full CRUD | ❌ Not visible | ❌ No |

### DataTable Limitations

| Issue | Current | Required |
|-------|---------|----------|
| **Pagination** | Client-side only (all data loaded) | Server-side pagination for large datasets |
| **URL filters** | Not supported | Filters reflected in URL for shareable links |
| **Bulk actions** | Not supported | Select multiple rows, bulk delete/export/status change |
| **Column visibility** | Not configurable | User can show/hide columns |
| **Export** | Manual CSV per panel | Unified export with format options (CSV, Excel, PDF) |

### Performance Concerns

| Issue | Impact | Solution |
|-------|--------|----------|
| **All data loaded at once** | Slow initial load for large datasets | Server-side pagination, infinite scroll |
| **No virtualization** | Large lists cause jank | React Virtual or TanStack Virtual |
| **Excessive re-renders** | Possible with large state objects | Memoization, useMemo, useCallback |
| **Bundle size** | 30+ lazy-loaded panels | Already code-split, but monitor growth |

---

## 4. Recommendation Roadmap

### Phase 1: Quick Wins (1-2 weeks)

1. **Add chart library** (Recharts or Nivo) to admin panels
2. **Enhance Super Dashboard** with:
   - Revenue trend line chart (last 30 days)
   - Tenant comparison bar chart
   - Order status pie chart
   - System health cards (API latency, error rate)
3. **Add date range picker** to Super Dashboard and Super Orders
4. **Move Admin Users to dedicated panel** (currently buried in Tenants)
5. **Add search/filter** to Super Tenants panel

### Phase 2: Missing Super Admin Panels (2-3 weeks)

1. **System Settings panel**:
   - Feature flags (toggle features per tenant)
   - Email templates (booking confirmation, password reset)
   - Default settings (tax rate, currency, timezone)
   - Platform branding

2. **Audit Log panel**:
   - Cross-tenant activity log
   - Security events (failed logins, permission changes)
   - Filter by tenant, user, action type, date range

3. **Subscriptions panel**:
   - List all tenant subscriptions
   - View payment history
   - Upgrade/downgrade plans
   - Usage metrics per tenant

4. **Reports panel**:
   - System-wide revenue reports
   - Tenant performance comparison
   - Custom date ranges
   - Export to PDF/Excel

### Phase 3: Cross-Tenant Pillar Views (2 weeks)

1. **Super Admin Financials** (aggregated):
   - Total revenue across all tenants
   - Revenue by tenant breakdown
   - Outstanding invoices summary

2. **Super Admin HR** (aggregated):
   - Total employees across tenants
   - Headcount by tenant
   - Payroll summary

3. **Super Admin Supply** (aggregated):
   - Total inventory value
   - Low stock alerts across tenants
   - Purchase order summary

4. **Super Admin CRM** (aggregated):
   - Total contacts/leads
   - Pipeline value across tenants
   - Ticket volume by tenant

### Phase 4: UI/UX Polish (1-2 weeks)

1. **Server-side pagination** for DataTable
2. **URL-based filters** for shareable links
3. **Bulk actions** (select, delete, export, status change)
4. **Loading skeletons** for all panels
5. **Error boundaries** per panel
6. **Responsive improvements** for mobile
7. **Keyboard shortcuts** for power users

---

## 5. Technical Recommendations

### New Backend Endpoints Needed

```
# System Settings
GET    /api/admin/settings          # Platform-wide settings
PUT    /api/admin/settings          # Update settings
GET    /api/admin/feature-flags     # List feature flags
PUT    /api/admin/feature-flags/:id # Toggle flag

# Subscriptions
GET    /api/admin/subscriptions     # List all subscriptions
GET    /api/admin/subscriptions/:id # Subscription details
PUT    /api/admin/subscriptions/:id # Update subscription

# Cross-tenant Aggregation
GET    /api/admin/analytics/revenue       # Revenue by tenant
GET    /api/admin/analytics/occupancy     # Occupancy by tenant
GET    /api/admin/analytics/orders        # Orders by tenant
GET    /api/admin/analytics/hr            # HR metrics aggregate
GET    /api/admin/analytics/supply        # Supply metrics aggregate

# Audit Log (super admin view)
GET    /api/admin/audit             # Cross-tenant audit logs

# Reports
GET    /api/admin/reports/revenue   # Revenue report
GET    /api/admin/reports/tenants   # Tenant performance
POST   /api/admin/reports/export    # Export report
```

### Shared Components to Build

| Component | Description | Priority |
|-----------|-------------|----------|
| `DateRangePicker` | Date range selection with presets | High |
| `ChartCard` | Wrapper for charts with title, legend | High |
| `BarChart` | Vertical/horizontal bar chart | High |
| `LineChart` | Time series line chart | High |
| `PieChart` | Donut/pie chart for distributions | Medium |
| `MetricCard` | StatCard with trend indicator | Medium |
| `DataTableServer` | Server-side paginated DataTable | Medium |
| `BulkActions` | Toolbar for selected row actions | Medium |
| `FilterBar` | URL-synced filter controls | Medium |
| `ExportButton` | Multi-format export (CSV, Excel, PDF) | Low |

### Data Fetching Patterns

```typescript
// Current: Direct API calls in panels
const loadData = useCallback(async () => {
  const data = await api.getFinancialAccounts();
  setAccounts(data);
}, []);

// Recommended: TanStack Query with pagination
function useFinancialAccounts(page: number, pageSize: number) {
  return useQuery({
    queryKey: ['admin', 'financials', 'accounts', { page, pageSize }],
    queryFn: () => api.getFinancialAccounts({ page, pageSize }),
    keepPreviousData: true,
  });
}

// Recommended: Prefetching for navigation
const queryClient = useQueryClient();
const prefetchAccounts = () => {
  queryClient.prefetchQuery({
    queryKey: ['admin', 'financials', 'accounts', { page: 1, pageSize: 20 }],
    queryFn: () => api.getFinancialAccounts({ page: 1, pageSize: 20 }),
    staleTime: 30_000,
  });
};
```

---

## 6. Estimated Effort

### Phase 1: Quick Wins
| Task | Hours | Notes |
|------|-------|-------|
| Add Recharts dependency | 1 | Setup and config |
| Super Dashboard charts | 8 | 3-4 charts with mock data |
| Date range picker component | 4 | Reusable, with presets |
| Move Admin Users to panel | 3 | Extract from Tenants |
| Add search to Tenants | 2 | Simple text filter |
| **Total** | **18 hours** | ~2.5 days |

### Phase 2: Missing Super Admin Panels
| Task | Hours | Notes |
|------|-------|-------|
| System Settings panel | 12 | Feature flags, templates, defaults |
| Audit Log panel | 10 | Cross-tenant, filters, pagination |
| Subscriptions panel | 10 | List, details, payment history |
| Reports panel | 12 | Charts, date ranges, export |
| Backend endpoints (all) | 20 | 6-8 new endpoints |
| **Total** | **64 hours** | ~8 days |

### Phase 3: Cross-Tenant Pillar Views
| Task | Hours | Notes |
|------|-------|-------|
| Aggregation endpoints | 12 | 5-6 new endpoints |
| Super Financials view | 6 | Aggregated metrics |
| Super HR view | 5 | Headcount, payroll summary |
| Super Supply view | 5 | Inventory, alerts |
| Super CRM view | 5 | Pipeline, contacts |
| **Total** | **33 hours** | ~4 days |

### Phase 4: UI/UX Polish
| Task | Hours | Notes |
|------|-------|-------|
| Server-side pagination | 10 | DataTable refactor |
| URL-based filters | 8 | Query string sync |
| Bulk actions | 8 | Selection, toolbar, API |
| Loading skeletons | 4 | All panels |
| Error boundaries | 3 | Per-panel |
| Responsive fixes | 5 | Mobile improvements |
| **Total** | **38 hours** | ~5 days |

---

## Grand Total: ~153 hours (~19 working days)

---

## Appendix A: File Inventory

### Admin Components (30 files)
```
app/src/components/admin/
├── AdminApp.tsx              # Main SPA shell, routing, nav
├── DashboardPanel.tsx        # Tenant dashboard (good)
├── CampsPanel.tsx            # Projects CRUD (good)
├── RoomsPanel.tsx            # Rooms CRUD (good)
├── RatePlansPanel.tsx        # Rate plans CRUD (good)
├── OrdersPanel.tsx           # Orders CRUD (good)
├── InboxPanel.tsx            # Real-time messages (good)
├── BookingCalendar.tsx       # Calendar view (good)
├── MealsPanel.tsx            # Meals CRUD (good)
├── MenuPlannerPanel.tsx      # Menu scheduling (good)
├── MenuPanel.tsx             # Public menu preview (good)
├── PlanningPanel.tsx         # Planning timeline (good)
├── ReportsPanel.tsx          # Reports (moderate)
├── AnalyticsPanel.tsx        # Analytics (poor)
├── LowStockPanel.tsx         # Low stock alerts (good)
├── PromotionsPanel.tsx       # Promotions CRUD (good)
├── ServicesPanel.tsx         # Services CRUD (good)
├── ServiceBookingsPanel.tsx  # Service bookings (good)
├── StaffPanel.tsx            # Staff CRUD (good)
├── BillingPanel.tsx          # Billing (poor - hardcoded)
├── SettingsPanel.tsx         # Settings (good)
├── PasswordPanel.tsx         # Password change (good)
├── SuperDashboardPanel.tsx   # Super admin dashboard (moderate)
├── SuperTenantsPanel.tsx     # Tenant directory (good)
├── SuperOrdersPanel.tsx      # All orders (moderate)
├── TenantDrilldown.tsx       # Tenant drill-down (good)
├── FinancialPanel.tsx        # Financials (good)
├── HRPanel.tsx               # HR & Payroll (good)
├── SupplyPanel.tsx           # Supply Chain (good)
├── CRMPanel.tsx              # CRM (good)
├── StorefrontPanel.tsx       # Storefront (good)
├── AIPanel.tsx               # AI & Intelligence (moderate)
├── icons.tsx                 # SVG icons
└── __tests__/                # Test files
```

### Shell Components
```
app/src/components/shell/
├── AppSidebar.tsx            # Shared sidebar
├── AppTopbar.tsx             # Top bar
├── MobileBottomNav.tsx       # Mobile nav
└── LoginForm.tsx             # Auth form
```

### UI Components
```
app/src/components/ui/
├── Badge.tsx
├── Button.tsx
├── Card.tsx
├── ConfirmDialog.tsx
├── DataTable.tsx
├── EmptyState.tsx
├── ErrorBoundary.tsx
├── FormModal.tsx
├── Input.tsx
├── LoadingSpinner.tsx
├── Modal.tsx
├── Select.tsx
├── Skeleton.tsx
├── StatCard.tsx
├── StatusTag.tsx
├── Toast.tsx
├── icons.tsx
└── SafeImage.astro
```

### Hooks
```
app/src/hooks/
├── useAdminData.ts           # Legacy data types
├── useApiError.ts            # Error handling
├── usePosQueries.ts          # POS queries
├── useQueryHooks.ts          # TanStack Query hooks (904 lines)
├── useSseInbox.ts            # SSE for inbox
└── useSseOrders.ts           # SSE for orders
```

### API Layer
```
app/src/lib/
├── api.ts                    # 1,949 lines - all API functions
├── api-types.ts              # Generated OpenAPI types
├── auth.tsx                  # Auth context
├── session.ts                # Token management
├── routeZones.ts             # Zone routing
├── navigation.ts             # URL management
├── theme.ts                  # Tenant theming
├── utils.ts                  # Utility functions
└── plausible.ts              # Analytics
```

---

## Appendix B: Backend API Endpoints (Business OS)

### Existing Endpoints (99 total)

| Module | Endpoints | Router File |
|--------|-----------|-------------|
| Financials | 16+2 | `financials.js` |
| HR | 17 | `hr.js` |
| Supply | 15 | `supply.js` |
| CRM | 19 | `crm.js` |
| Storefront | 19 | `storefront.js` |
| AI | 13+5 | `ai.js` |
| **Total** | **104** | |

### Endpoints Needing Super Admin Versions

| Endpoint | Current | Super Admin Version |
|----------|---------|---------------------|
| `GET /api/financials/accounts` | Tenant-scoped | `GET /api/admin/financials/accounts` (all tenants) |
| `GET /api/hr/employees` | Tenant-scoped | `GET /api/admin/hr/employees` (all tenants) |
| `GET /api/supply/warehouses` | Tenant-scoped | `GET /api/admin/supply/warehouses` (all tenants) |
| `GET /api/crm/contacts` | Tenant-scoped | `GET /api/admin/crm/contacts` (all tenants) |
| `GET /api/storefront/products` | Tenant-scoped | `GET /api/admin/storefront/products` (all tenants) |
| `GET /api/ai/predictions` | Tenant-scoped | `GET /api/admin/ai/predictions` (all tenants) |

---

*Report generated by Orchestrator Agent — August 26, 2026*
