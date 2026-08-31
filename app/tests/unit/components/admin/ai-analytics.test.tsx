import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AIPanel from '@/components/admin/AIPanel';
import SuperAIPanel from '@/components/admin/SuperAIPanel';
import AnalyticsPanel from '@/components/admin/AnalyticsPanel';

// ─── 1. Hoisted mock state (must use vi.hoisted so vi.mock factories see it) ─
const h = vi.hoisted(() => {
  const mockShowToast = vi.fn();
  const mockCreatePriceRule = vi.fn();
  const mockUpdatePriceRule = vi.fn();
  const mockDeletePriceRule = vi.fn();
  const mockCreateAutomation = vi.fn();
  const mockUpdateAutomation = vi.fn();
  const mockToggleAutomation = vi.fn();
  const mockRunForecast = vi.fn();
  const mockApiFetch = vi.fn();
  const mockGetAdminTenants = vi.fn();
  const mockUseAuth = vi.fn();

  const mockState = {
    mockPredictions: [] as unknown[],
    mockPriceRules: [] as unknown[],
    mockAutomationRules: [] as unknown[],
    mockAutomationLogs: [] as unknown[],
    mockAiLoading: false,
    mockRevenueData: null as unknown,
    mockOccupancyData: null as unknown,
    mockTopProducts: { top_products: [] } as unknown,
    mockKitchen: null as unknown,
    mockLowStock: { low_stock: [] } as unknown,
    mockRevenueBreakdown: null as unknown,
    mockCustomerMetrics: null as unknown,
    mockSeasonal: null as unknown,
    mockAnalyticsLoading: false,
  };

  return {
    mockShowToast,
    mockCreatePriceRule,
    mockUpdatePriceRule,
    mockDeletePriceRule,
    mockCreateAutomation,
    mockUpdateAutomation,
    mockToggleAutomation,
    mockRunForecast,
    mockApiFetch,
    mockGetAdminTenants,
    mockUseAuth,
    mockState,
  };
});

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: h.mockShowToast }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => String(d),
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

// Mock the custom Select dropdown with a native <select> so drive-change is simple.
vi.mock('@/components/ui/Select', () => ({
  Select: ({ label, options, value, onChange }: {
    label?: string;
    options: { value: string; label: string }[];
    value?: string;
    onChange: (e: { target: { value: string } }) => void;
  }) => (
    <label data-testid={label ? undefined : 'unlabeled-select'}>
      {label}
      <select
        data-testid="native-select"
        value={value || ''}
        onChange={onChange}
      >
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  ),
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

// Mock @/hooks/useQueryHooks (all AI + Analytics hooks)
vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: { ai: ['admin', 'ai'] },
  useAIPredictionsQuery: () => ({ data: h.mockState.mockPredictions, isLoading: h.mockState.mockAiLoading }),
  useAIPriceRulesQuery: () => ({ data: h.mockState.mockPriceRules, isLoading: h.mockState.mockAiLoading }),
  useAIAutomationRulesQuery: () => ({ data: h.mockState.mockAutomationRules, isLoading: h.mockState.mockAiLoading }),
  useAIAutomationLogsQuery: () => ({ data: h.mockState.mockAutomationLogs, isLoading: h.mockState.mockAiLoading }),
  useRevenueReportQuery: () => ({ data: h.mockState.mockRevenueData, isLoading: h.mockState.mockAnalyticsLoading }),
  useOccupancyReportQuery: () => ({ data: h.mockState.mockOccupancyData, isLoading: h.mockState.mockAnalyticsLoading }),
  useTopProductsQuery: () => ({ data: h.mockState.mockTopProducts, isLoading: h.mockState.mockAnalyticsLoading }),
  useKitchenPerformanceQuery: () => ({ data: h.mockState.mockKitchen, isLoading: h.mockState.mockAnalyticsLoading }),
  useAnalyticsLowStockQuery: () => ({ data: h.mockState.mockLowStock, isLoading: h.mockState.mockAnalyticsLoading }),
  useRevenueBreakdownQuery: () => ({ data: h.mockState.mockRevenueBreakdown, isLoading: h.mockState.mockAnalyticsLoading }),
  useCustomerMetricsQuery: () => ({ data: h.mockState.mockCustomerMetrics, isLoading: h.mockState.mockAnalyticsLoading }),
  useSeasonalComparisonQuery: () => ({ data: h.mockState.mockSeasonal, isLoading: h.mockState.mockAnalyticsLoading }),
}));

// Mock @/lib/api (named fns for AIPanel + apiFetch/getAdminTenants for SuperAIPanel)
vi.mock('@/lib/api', () => ({
  createAIPriceRule: h.mockCreatePriceRule,
  updateAIPriceRule: h.mockUpdatePriceRule,
  deleteAIPriceRule: h.mockDeletePriceRule,
  createAIAutomationRule: h.mockCreateAutomation,
  updateAIAutomationRule: h.mockUpdateAutomation,
  toggleAIAutomationRule: h.mockToggleAutomation,
  runAIForecast: h.mockRunForecast,
  apiFetch: h.mockApiFetch,
  getAdminTenants: h.mockGetAdminTenants,
}));

// Mock @/lib/auth (SuperAIPanel)
vi.mock('@/lib/auth', () => ({
  useAuth: () => h.mockUseAuth(),
}));

// ─── 5. QueryClient wrapper ──────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderWithQuery(ui: React.ReactElement) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

// ─── Test fixtures ────────────────────────────────────────────────────────────
const prediction = {
  id: 'p1',
  modelType: 'demand',
  targetId: 't1',
  predictedValue: '42',
  confidence: 0.85,
  createdAt: '2025-07-01 10:00:00',
};

const priceRule = {
  id: 'r1',
  name: 'Summer Pricing',
  productId: null,
  ruleType: 'dynamic',
  minPrice: 80,
  maxPrice: 150,
  adjustmentPercent: 10,
  isActive: 1,
  createdAt: '2025-07-01',
};

const automationRule = {
  id: 'a1',
  name: 'Low Stock Alert',
  triggerEvent: 'stock.low',
  isActive: 1,
  lastTriggeredAt: '2025-07-01 12:00:00',
  triggerCount: 5,
  createdAt: '2025-06-01',
};

const automationLog = {
  id: 'l1',
  ruleId: 'a1',
  ruleName: 'Low Stock Alert',
  triggerEvent: 'stock.low',
  executedAction: 'email',
  result: 'success',
  error: null,
  createdAt: '2025-07-01 13:00:00',
};

const revenueSummary = {
  summary: { totalRevenue: 12500, totalCollected: 10000, totalOutstanding: 2500, totalOrders: 42 },
  details: [{ date: '2025-07-01', total: 500, count: 10 }],
};

const occupancy = { occupiedRooms: 7, totalRooms: 10, occupancyRate: 70 };

// Local aliases to the vi.hoisted mocks so describe bodies stay terse.
const {
  mockShowToast,
  mockCreatePriceRule,
  mockUpdatePriceRule,
  mockDeletePriceRule,
  mockCreateAutomation,
  mockUpdateAutomation,
  mockToggleAutomation,
  mockRunForecast,
  mockApiFetch,
  mockGetAdminTenants,
  mockUseAuth,
} = h;
const S = h.mockState;

beforeEach(() => {
  vi.clearAllMocks();
  // AIPanel
  S.mockPredictions = [];
  S.mockPriceRules = [];
  S.mockAutomationRules = [];
  S.mockAutomationLogs = [];
  S.mockAiLoading = false;
  // AnalyticsPanel
  S.mockRevenueData = null;
  S.mockOccupancyData = null;
  S.mockTopProducts = { top_products: [] };
  S.mockKitchen = null;
  S.mockLowStock = { low_stock: [] };
  S.mockRevenueBreakdown = null;
  S.mockCustomerMetrics = null;
  S.mockSeasonal = null;
  S.mockAnalyticsLoading = false;
  // SuperAIPanel
  mockUseAuth.mockReturnValue({ user: { role: 'super_admin' } });
  mockGetAdminTenants.mockResolvedValue([]);
  mockApiFetch.mockResolvedValue({});
});

// ═════════════════════════════════════════════════════════════════════════════
// AIPanel
// ═════════════════════════════════════════════════════════════════════════════
describe('AIPanel', () => {
  it('renders loading spinner before data loads', () => {
    S.mockAiLoading = true;
    renderWithQuery(<AIPanel />);
    expect(screen.getByText('Loading AI intelligence...')).toBeInTheDocument();
  });

  it('renders header, subtitle and all five tabs with default empty states', () => {
    renderWithQuery(<AIPanel />);
    expect(screen.getByTestId('ai-panel')).toBeInTheDocument();
    expect(screen.getByText('AI & Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Dynamic pricing, demand forecasting, anomaly detection, and automation rules.')).toBeInTheDocument();
    expect(screen.getByText('Predictions')).toBeInTheDocument();
    expect(screen.getByText('Price Rules')).toBeInTheDocument();
    expect(screen.getByText('Automation Rules')).toBeInTheDocument();
    expect(screen.getByText('Logs')).toBeInTheDocument();
    expect(screen.getByText('Forecast')).toBeInTheDocument();
    // default tab is predictions → empty state
    expect(screen.getByText('No predictions yet')).toBeInTheDocument();
  });

  it('shows empty state for price rules tab', () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    expect(screen.getByText('No price rules')).toBeInTheDocument();
  });

  it('shows empty state for automation rules tab', () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    expect(screen.getByText('No automation rules')).toBeInTheDocument();
  });

  it('shows empty state for logs tab', () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationLogs'));
    expect(screen.getByText('No automation logs')).toBeInTheDocument();
  });

  it('shows empty state for forecast tab', () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-forecast'));
    expect(screen.getByText('No forecast data')).toBeInTheDocument();
  });

  it('renders predictions data in the table', () => {
    S.mockPredictions = [prediction];
    renderWithQuery(<AIPanel />);
    expect(screen.getByText('demand')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('renders price rules data and opens the add modal', () => {
    S.mockPriceRules = [priceRule];
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    expect(screen.getByText('Summer Pricing')).toBeInTheDocument();
    expect(screen.getByText('dynamic')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('add-price-rule-btn'));
    // Modal opens (title + header button both say "Add Price Rule")
    expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    expect(screen.getAllByText('Add Price Rule').length).toBeGreaterThan(0);
  });

  it('validates price rule name on save', async () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByTestId('add-price-rule-btn'));
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
  });

  it('creates a price rule via the add modal', async () => {
    mockCreatePriceRule.mockResolvedValue({ id: 'new', success: true });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByTestId('add-price-rule-btn'));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Shoulder Special' } });
    fireEvent.change(screen.getByDisplayValue('0'), { target: { value: '5' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockCreatePriceRule).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Shoulder Special', ruleType: 'dynamic', adjustmentPercent: 5 }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Price rule created.', 'success');
    });
    // Modal should be closed after a successful save
    expect(screen.queryByTestId('modal-content')).not.toBeInTheDocument();
  });

  it('edits an existing price rule', async () => {
    S.mockPriceRules = [priceRule];
    mockUpdatePriceRule.mockResolvedValue({ success: true });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Edit Price Rule')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Renamed Rule' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockUpdatePriceRule).toHaveBeenCalledWith(
        'r1',
        expect.objectContaining({ name: 'Renamed Rule' }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Price rule updated.', 'success');
    });
  });

  it('deletes a price rule after confirmation', async () => {
    S.mockPriceRules = [priceRule];
    mockDeletePriceRule.mockResolvedValue({ success: true });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Delete Price Rule')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockDeletePriceRule).toHaveBeenCalledWith('r1');
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
    expect(screen.queryByText('Delete Price Rule')).not.toBeInTheDocument();
  });

  it('surfaces an error when creating a price rule fails', async () => {
    mockCreatePriceRule.mockRejectedValue(new Error('boom'));
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByTestId('add-price-rule-btn'));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: boom', 'error');
    });
  });

  it('renders automation rules with toggle and edit actions', () => {
    S.mockAutomationRules = [automationRule];
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();
    expect(screen.getByText('stock.low')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Deactivate')).toBeInTheDocument();
  });

  it('toggles an automation rule', async () => {
    S.mockAutomationRules = [automationRule];
    mockToggleAutomation.mockResolvedValue({ success: true });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    fireEvent.click(screen.getByText('Deactivate'));
    await waitFor(() => {
      expect(mockToggleAutomation).toHaveBeenCalledWith('a1');
      expect(mockShowToast).toHaveBeenCalledWith('Rule toggled.', 'success');
    });
  });

  it('validates automation rule name and trigger are required', async () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    fireEvent.click(screen.getByTestId('add-automation-btn'));
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
    // Now fill name but leave trigger empty
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Rule' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Trigger event is required.', 'warning');
    });
  });

  it('creates an automation rule', async () => {
    mockCreateAutomation.mockResolvedValue({ id: 'new', success: true });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    fireEvent.click(screen.getByTestId('add-automation-btn'));
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'New Rule' } });
    fireEvent.change(screen.getByLabelText('Trigger Event *'), { target: { value: 'order.completed' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockCreateAutomation).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Rule', triggerEvent: 'order.completed' }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Rule created.', 'success');
    });
  });

  it('edits an automation rule', async () => {
    S.mockAutomationRules = [automationRule];
    mockUpdateAutomation.mockResolvedValue({ success: true });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    fireEvent.click(screen.getByText('Edit'));
    expect(screen.getByText('Edit Automation Rule')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockUpdateAutomation).toHaveBeenCalledWith('a1', expect.objectContaining({ name: 'Renamed' }));
      expect(mockShowToast).toHaveBeenCalledWith('Rule updated.', 'success');
    });
  });

  it('validates product id is required for forecast', async () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-forecast'));
    fireEvent.click(screen.getByTestId('run-forecast-btn'));
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Product ID is required.', 'warning');
    });
  });

  it('runs a forecast and renders the forecast dashboard', async () => {
    mockRunForecast.mockResolvedValue({
      forecasts: [
        { date: '2025-07-01', predictedDemand: 30, confidence: 0.8 },
        { date: '2025-07-02', predictedDemand: 60, confidence: 0.6 },
      ],
    });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-forecast'));
    fireEvent.click(screen.getByTestId('run-forecast-btn'));
    fireEvent.change(screen.getByLabelText('Product ID *'), { target: { value: 'prod-1' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockRunForecast).toHaveBeenCalledWith({ productId: 'prod-1', periodDays: 30 });
      expect(mockShowToast).toHaveBeenCalledWith('Forecast generated.', 'success');
    });
    expect(screen.getByText('Demand Forecast (2 days)')).toBeInTheDocument();
    expect(screen.getByText('2025-07-01')).toBeInTheDocument();
    expect(screen.getByText('2025-07-02')).toBeInTheDocument();
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('renders automation logs data', () => {
    S.mockAutomationLogs = [automationLog];
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationLogs'));
    expect(screen.getByText('Low Stock Alert')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// AnalyticsPanel
// ═════════════════════════════════════════════════════════════════════════════
describe('AnalyticsPanel', () => {
  it('renders loading spinner before data loads', () => {
    S.mockAnalyticsLoading = true;
    render(<AnalyticsPanel />);
    expect(screen.getByText('Loading analytics...')).toBeInTheDocument();
  });

  it('renders header, period select and all six tabs', () => {
    render(<AnalyticsPanel />);
    expect(screen.getByTestId('analytics-panel')).toBeInTheDocument();
    expect(screen.getByText('Analytics')).toBeInTheDocument();
    for (const t of ['Overview', 'Top Products', 'Kitchen', 'Inventory', 'Revenue', 'Customers']) {
      expect(screen.getByText(t)).toBeInTheDocument();
    }
    // Default period select present
    expect(screen.getByTestId('unlabeled-select')).toBeInTheDocument();
  });

  it('renders overview stat cards and occupancy', () => {
    S.mockRevenueData = revenueSummary;
    S.mockOccupancyData = occupancy;
    S.mockKitchen = {
      by_status: [
        { status: 'completed', count: 8 },
        { status: 'pending', count: 3 },
      ],
      daily_trend: [{ date: '2025-07-01', completed: 5, ready: 2, pending: 1 }],
    };
    S.mockSeasonal = {
      accommodation_monthly: [{ month: '2025-07', revenue: 4000 }],
      pos_monthly: [{ month: '2025-07', revenue: 1200 }],
    };
    render(<AnalyticsPanel />);
    expect(screen.getByText('Total Revenue')).toBeInTheDocument();
    expect(screen.getByText('$12500.00')).toBeInTheDocument();
    expect(screen.getByText('Total Orders')).toBeInTheDocument();
    // occupancy
    expect(screen.getByText('7 of 10 rooms occupied')).toBeInTheDocument();
    expect(screen.getByText('70%')).toBeInTheDocument();
    // kitchen status
    expect(screen.getByText('Completed')).toBeInTheDocument();
    // seasonal
    expect(screen.getByText('Monthly Revenue Trend')).toBeInTheDocument();
    expect(screen.getByText('Accommodation Revenue')).toBeInTheDocument();
    expect(screen.getByText('POS Revenue')).toBeInTheDocument();
  });

  it('changes period via the select', () => {
    S.mockRevenueData = revenueSummary;
    render(<AnalyticsPanel />);
    const periodSelect = within(screen.getByTestId('unlabeled-select')).getByRole('combobox');
    fireEvent.change(periodSelect, { target: { value: '7' } });
    // The sub text reflects the selected period
    expect(screen.getByText('7 day period')).toBeInTheDocument();
  });

  it('renders empty occupancy state', () => {
    render(<AnalyticsPanel />);
    expect(screen.getByText('No occupancy data')).toBeInTheDocument();
    expect(screen.getByText('No revenue data')).toBeInTheDocument();
    expect(screen.getByText('No kitchen data')).toBeInTheDocument();
    expect(screen.getByText('No seasonal data yet')).toBeInTheDocument();
  });

  it('renders top products tab with table', () => {
    S.mockTopProducts = {
      top_products: [
        { id: 1, name: 'Tea', total_qty: 40, total_revenue: 200, order_count: 25 },
        { id: 2, name: 'Cake', total_qty: 30, total_revenue: 150, order_count: 20 },
      ],
    };
    render(<AnalyticsPanel />);
    fireEvent.click(screen.getByTestId('analytics-tab-products'));
    expect(screen.getByText('Best Sellers (by quantity)')).toBeInTheDocument();
    // Product names appear in both the chart and the details table
    expect(screen.getAllByText('Tea').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cake').length).toBeGreaterThan(0);
    expect(screen.getByText('$200.00')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
  });

  it('renders kitchen tab with status cards and daily trend', () => {
    S.mockKitchen = {
      by_status: [
        { status: 'completed', count: 8 },
        { status: 'pending', count: 3 },
        { status: 'in_progress', count: 2 },
      ],
      daily_trend: [
        { date: '2025-07-01', completed: 5, ready: 2, pending: 1 },
      ],
    };
    render(<AnalyticsPanel />);
    fireEvent.click(screen.getByTestId('analytics-tab-kitchen'));
    expect(screen.getByText('Daily Kitchen Trend')).toBeInTheDocument();
    // Status labels appear in both the stat cards and the trend legend
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0);
  });

  it('renders inventory tab with low stock table', () => {
    S.mockLowStock = {
      low_stock: [
        { id: 1, name: 'Tomatoes', stock_quantity: 2, min_stock_level: 10, status: 'low', unit: 'kg' },
        { id: 2, name: 'Salt', stock_quantity: 4, min_stock_level: 8, status: 'low', unit: 'kg' },
      ],
    };
    render(<AnalyticsPanel />);
    fireEvent.click(screen.getByTestId('analytics-tab-inventory'));
    expect(screen.getByText('Tomatoes')).toBeInTheDocument();
    expect(screen.getByText('Salt')).toBeInTheDocument();
    // Stat card header labels
    expect(screen.getByText('Low Stock Items')).toBeInTheDocument();
    // "Low Stock" appears as a StatCard label and as the table Badge
    expect(screen.getAllByText('Low Stock').length).toBeGreaterThan(0);
  });

  it('renders inventory empty state', () => {
    S.mockLowStock = { low_stock: [] };
    render(<AnalyticsPanel />);
    fireEvent.click(screen.getByTestId('analytics-tab-inventory'));
    expect(screen.getByText('All products are well-stocked')).toBeInTheDocument();
  });

  it('renders revenue breakdown tab', () => {
    S.mockRevenueBreakdown = {
      accommodation: { revenue: 8000, order_count: 20 },
      by_product_type: [{ type: 'food', revenue: 4000, order_count: 30 }],
      by_payment_method: [{ method: 'card', revenue: 3000 }],
    };
    render(<AnalyticsPanel />);
    fireEvent.click(screen.getByTestId('analytics-tab-revenue'));
    expect(screen.getByText('Accommodation Revenue')).toBeInTheDocument();
    expect(screen.getByText('$8000.00')).toBeInTheDocument();
    expect(screen.getByText('Revenue by Product Type')).toBeInTheDocument();
    expect(screen.getByText('Revenue by Payment Method')).toBeInTheDocument();
  });

  it('renders customers tab with metrics and composition', () => {
    S.mockCustomerMetrics = {
      total_customers: 100,
      new_customers: 60,
      repeat_customers: 40,
      avg_order_value: 25,
      avg_collected: 22,
    };
    render(<AnalyticsPanel />);
    fireEvent.click(screen.getByTestId('analytics-tab-customers'));
    expect(screen.getByText('Total Customers')).toBeInTheDocument();
    expect(screen.getByText('New Customers')).toBeInTheDocument();
    expect(screen.getByText('Repeat Customers')).toBeInTheDocument();
    expect(screen.getByText('Avg Order Value')).toBeInTheDocument();
    expect(screen.getByText('Customer Composition')).toBeInTheDocument();
    expect(screen.getByText('60% of total')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SuperAIPanel
// ═════════════════════════════════════════════════════════════════════════════
describe('SuperAIPanel', () => {
  it('shows access denied for non-super-admin', async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'admin' } });
    render(<SuperAIPanel />);
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    expect(screen.getByText('Super Admin access required.')).toBeInTheDocument();
  });

  it('renders loading spinner while tenants/overview load', () => {
    mockGetAdminTenants.mockReturnValue(new Promise(() => {}));
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    render(<SuperAIPanel />);
    expect(screen.getByText('Loading AI data...')).toBeInTheDocument();
  });

  it('renders overview stats, tenant breakdown and prediction table', async () => {
    mockGetAdminTenants.mockResolvedValue([
      { id: 't1', name: 'Acacia Camp', subdomain: 'acacia', status: 'active' },
      { id: 't2', name: 'Sinai Lodge', subdomain: 'sinai', status: 'active' },
    ]);
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/admin/ai/overview')) {
        return Promise.resolve({
          totalPredictions: 12,
          totalAutomationRules: 5,
          totalLogs: 30,
          totalPriceRules: 3,
          tenantBreakdown: [
            { tenant_id: 't1', tenant_name: 'Acacia Camp', prediction_count: 8, automation_count: 4 },
            { tenant_id: 't2', tenant_name: 'Sinai Lodge', prediction_count: 4, automation_count: 1 },
          ],
        });
      }
      return Promise.resolve({
        data: [
          { id: 'pr1', type: 'demand', confidence: 0.9, tenant_name: 'Acacia Camp', created_at: '2025-07-01' },
        ],
        total: 1,
      });
    });
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('AI & Automation Overview')).toBeInTheDocument();
    });
    // Stat cards
    expect(screen.getByText('Predictions')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Automation Rules')).toBeInTheDocument();
    expect(screen.getByText('AI Logs')).toBeInTheDocument();
    expect(screen.getByText('Price Rules')).toBeInTheDocument();
    // Tenant breakdown (name also appears as a select option)
    expect(screen.getByText('AI Activity by Tenant')).toBeInTheDocument();
    expect(screen.getAllByText('Acacia Camp').length).toBeGreaterThan(0);
    // Predictions table
    expect(screen.getByText('demand')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
  });

  it('shows empty state when no predictions match the filter', async () => {
    mockGetAdminTenants.mockResolvedValue([]);
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/admin/ai/overview')) {
        return Promise.resolve({ totalPredictions: 0, totalAutomationRules: 0, totalLogs: 0, totalPriceRules: 0, tenantBreakdown: [] });
      }
      return Promise.resolve({ data: [], total: 0 });
    });
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('No predictions found')).toBeInTheDocument();
    });
  });

  it('filters predictions by tenant through the select', async () => {
    mockGetAdminTenants.mockResolvedValue([
      { id: 't1', name: 'Acacia Camp', subdomain: 'acacia', status: 'active' },
    ]);
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/admin/ai/overview')) {
        return Promise.resolve({ totalPredictions: 1, totalAutomationRules: 0, totalLogs: 0, totalPriceRules: 0, tenantBreakdown: [] });
      }
      if (url.includes('/admin/ai/predictions')) {
        if (url.includes('tenantId=t1')) {
          return Promise.resolve({ data: [], total: 0 });
        }
        return Promise.resolve({
          data: [{ id: 'pr1', type: 'demand', confidence: 0.8, tenant_name: 'Acacia Camp', created_at: '2025-07-01' }],
          total: 1,
        });
      }
      return Promise.resolve({});
    });
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('demand')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Filter by Tenant'), { target: { value: 't1' } });
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('tenantId=t1'));
      expect(screen.getByText('No predictions found')).toBeInTheDocument();
    });
  });

  it('refreshes predictions via the refresh button', async () => {
    mockGetAdminTenants.mockResolvedValue([]);
    mockApiFetch.mockImplementation((url: string) => {
      if (url.includes('/admin/ai/overview')) {
        return Promise.resolve({ totalPredictions: 0, totalAutomationRules: 0, totalLogs: 0, totalPriceRules: 0, tenantBreakdown: [] });
      }
      return Promise.resolve({ data: [], total: 0 });
    });
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });
    const callsBefore = mockApiFetch.mock.calls.filter((c) => String(c[0]).includes('/admin/ai/predictions')).length;
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      const callsAfter = mockApiFetch.mock.calls.filter((c) => String(c[0]).includes('/admin/ai/predictions')).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});
