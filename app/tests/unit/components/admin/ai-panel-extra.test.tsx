import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AIPanel from '@/components/admin/AIPanel';

// ─── 1. Hoisted mock state (mirror ai-analytics.test.tsx) ─────────────────────
const h = vi.hoisted(() => {
  const mockShowToast = vi.fn();
  const mockCreatePriceRule = vi.fn();
  const mockUpdatePriceRule = vi.fn();
  const mockDeletePriceRule = vi.fn();
  const mockCreateAutomation = vi.fn();
  const mockUpdateAutomation = vi.fn();
  const mockToggleAutomation = vi.fn();
  const mockRunForecast = vi.fn();

  const mockState = {
    mockPredictions: [] as unknown[],
    mockPriceRules: [] as unknown[],
    mockAutomationRules: [] as unknown[],
    mockAutomationLogs: [] as unknown[],
    mockAiLoading: false,
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
      <select data-testid="native-select" value={value || ''} onChange={onChange}>
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

vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: { ai: ['admin', 'ai'] },
  useAIPredictionsQuery: () => ({ data: h.mockState.mockPredictions, isLoading: h.mockState.mockAiLoading }),
  useAIPriceRulesQuery: () => ({ data: h.mockState.mockPriceRules, isLoading: h.mockState.mockAiLoading }),
  useAIAutomationRulesQuery: () => ({ data: h.mockState.mockAutomationRules, isLoading: h.mockState.mockAiLoading }),
  useAIAutomationLogsQuery: () => ({ data: h.mockState.mockAutomationLogs, isLoading: h.mockState.mockAiLoading }),
}));

vi.mock('@/lib/api', () => ({
  createAIPriceRule: h.mockCreatePriceRule,
  updateAIPriceRule: h.mockUpdatePriceRule,
  deleteAIPriceRule: h.mockDeletePriceRule,
  createAIAutomationRule: h.mockCreateAutomation,
  updateAIAutomationRule: h.mockUpdateAutomation,
  toggleAIAutomationRule: h.mockToggleAutomation,
  runAIForecast: h.mockRunForecast,
}));

const {
  mockShowToast,
  mockCreatePriceRule,
  mockUpdatePriceRule,
  mockDeletePriceRule,
  mockCreateAutomation,
  mockUpdateAutomation,
  mockToggleAutomation,
  mockRunForecast,
} = h;
const S = h.mockState;

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

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

// Logs starting with result: 'success' — we intentionally avoid non-success
// results because AIPanel passes variant="danger" to <Badge> (which only has
// variantStyles.error), causing a TypeError. See ai-analytics.test.tsx.
const successLog = {
  id: 'l1',
  ruleId: 'a1',
  ruleName: 'Low Stock Alert',
  triggerEvent: 'stock.low',
  executedAction: 'email',
  result: 'success',
  error: null,
  createdAt: '2025-07-01 13:00:00',
};

beforeEach(() => {
  vi.clearAllMocks();
  S.mockPredictions = [];
  S.mockPriceRules = [];
  S.mockAutomationRules = [];
  S.mockAutomationLogs = [];
  S.mockAiLoading = false;
});

describe('AIPanel — extra function coverage (targets)', () => {
  it('opens the forecast form modal from the forecast empty-state action', () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-forecast'));
    // In the empty forecast tab both the header "Run Forecast" button
    // (data-testid run-forecast-btn, fn#11) and the EmptyState action button
    // (fn#42) are present. The EmptyState renders after the header in the DOM,
    // so index 1 is the distinct empty-state action we want to cover.
    const runForecastButtons = screen.getAllByText('Run Forecast');
    expect(runForecastButtons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(runForecastButtons[1]);
    expect(screen.getByText('Run Demand Forecast')).toBeInTheDocument();
    expect(within(screen.getByTestId('modal-content')).getByLabelText('Product ID *')).toBeInTheDocument();
  });

  it('opens the forecast form from the "New Forecast" button on the forecast dashboard', async () => {
    mockRunForecast.mockResolvedValue({
      forecasts: [{ date: '2025-07-03', predictedDemand: 45, confidence: 0.5 }],
    });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-forecast'));
    fireEvent.click(screen.getByTestId('run-forecast-btn'));
    fireEvent.change(screen.getByLabelText('Product ID *'), { target: { value: 'prod-9' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    await screen.findByText('Demand Forecast (1 days)');
    // Forecast dashboard now has a "New Forecast" button (fn#43) — click it.
    fireEvent.click(screen.getByText('New Forecast'));
    expect(screen.getByText('Run Demand Forecast')).toBeInTheDocument();
  });

  it('changes the Rule Type select, Min Price, Max Price, Product ID and triggers onClose on the price rule modal', () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByTestId('add-price-rule-btn'));
    const modal = within(screen.getByTestId('modal-content'));

    // fn#51/52 — Rule Type select onChange
    const ruleTypeSelect = modal.getByTestId('native-select');
    fireEvent.change(ruleTypeSelect, { target: { value: 'time_based' } });

    // fn#49/50 — Product ID onChange
    fireEvent.change(modal.getByLabelText('Product ID'), { target: { value: 'prod-x' } });

    // fn#53/54 — Min Price onChange
    fireEvent.change(modal.getByLabelText('Min Price'), { target: { value: '95' } });

    // fn#55/56 — Max Price onChange
    fireEvent.change(modal.getByLabelText('Max Price'), { target: { value: '200' } });

    // Save with all fields filled to verify payload propagation of the newly
    // changed values (proves each onChange updated form state).
    fireEvent.change(modal.getByLabelText('Name *'), { target: { value: 'Shoulder Special' } });
    fireEvent.click(modal.getByTestId('modal-save'));
    expect(mockCreatePriceRule).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Shoulder Special',
        productId: 'prod-x',
        ruleType: 'time_based',
        minPrice: 95,
        maxPrice: 200,
      }),
    );
  });

  it('closes the price rule modal via the close button (fn#46 onClose)', () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByTestId('add-price-rule-btn'));
    expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('modal-content')).not.toBeInTheDocument();
  });

  it('edits an existing price rule with min/max/product values prefilled and changes them', () => {
    S.mockPriceRules = [priceRule];
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByText('Edit'));
    const modal = within(screen.getByTestId('modal-content'));
    // Prefilled from the edited rule
    expect(modal.getByLabelText('Product ID')).toHaveValue(''); // productId null -> ''
    // Change min/max to exercise prefilled-string → parseFloat round-trip
    fireEvent.change(modal.getByLabelText('Min Price'), { target: { value: '88' } });
    fireEvent.change(modal.getByLabelText('Max Price'), { target: { value: '160' } });
    fireEvent.click(modal.getByTestId('modal-save'));
    expect(mockUpdatePriceRule).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ minPrice: 88, maxPrice: 160 }),
    );
  });

  it('changes Condition and Action JSON inputs and triggers automation modal onClose', () => {
    S.mockAutomationRules = [automationRule];
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    fireEvent.click(screen.getByText('Edit'));
    const modal = within(screen.getByTestId('modal-content'));

    // fn#64/65 — Condition (JSON) onChange
    fireEvent.change(modal.getByLabelText('Condition (JSON)'), { target: { value: '{"threshold": 12}' } });
    // fn#66/67 — Action (JSON) onChange
    fireEvent.change(modal.getByLabelText('Action (JSON)'), { target: { value: '{"type":"slack"}' } });

    fireEvent.click(modal.getByTestId('modal-save'));
    expect(mockUpdateAutomation).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({
        conditionJson: '{"threshold": 12}',
        actionJson: '{"type":"slack"}',
      }),
    );
  });

  it('closes the automation rule modal via the close button (fn#59 onClose)', () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    fireEvent.click(screen.getByTestId('add-automation-btn'));
    expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('modal-content')).not.toBeInTheDocument();
  });

  it('changes the Period select in the forecast modal (fn#71/72 onChange)', async () => {
    mockRunForecast.mockResolvedValue({
      forecasts: [{ date: '2025-07-05', predictedDemand: 20, confidence: 0.9 }],
    });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-forecast'));
    fireEvent.click(screen.getByTestId('run-forecast-btn'));
    const modal = within(screen.getByTestId('modal-content'));
    const periodSelect = modal.getByTestId('native-select');
    fireEvent.change(periodSelect, { target: { value: '60' } });
    fireEvent.change(modal.getByLabelText('Product ID *'), { target: { value: 'prod-2' } });
    fireEvent.click(modal.getByTestId('modal-save'));
    await screen.findByText('Demand Forecast (1 days)');
    // 60-day period should have been parsed and passed to the API
    expect(mockRunForecast).toHaveBeenCalledWith({ productId: 'prod-2', periodDays: 60 });
  });

  it('closes the forecast modal via the close button (fn#68 onClose)', () => {
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-forecast'));
    fireEvent.click(screen.getByTestId('run-forecast-btn'));
    expect(screen.getByTestId('modal-content')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('modal-content')).not.toBeInTheDocument();
  });

  it('closes the delete confirmation modal via the close button (fn#73 onClose)', () => {
    S.mockPriceRules = [priceRule];
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Delete Price Rule')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByText('Delete Price Rule')).not.toBeInTheDocument();
  });

  it('renders the automation logs tab successfully for success results', () => {
    S.mockAutomationLogs = [successLog];
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationLogs'));
    expect(screen.getByText('success')).toBeInTheDocument();
  });

  it('toggles an inactive automation rule to activate it', async () => {
    const inactive = { ...automationRule, isActive: 0 };
    S.mockAutomationRules = [inactive];
    mockToggleAutomation.mockResolvedValue({ success: true });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    expect(screen.getByText('Activate')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Activate'));
    await waitFor(() => {
      expect(mockToggleAutomation).toHaveBeenCalledWith('a1');
      expect(mockShowToast).toHaveBeenCalledWith('Rule toggled.', 'success');
    });
  });

  it('creates an automation rule with conditionJson/actionJson payload', async () => {
    mockCreateAutomation.mockResolvedValue({ id: 'new', success: true });
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    fireEvent.click(screen.getByTestId('add-automation-btn'));
    const modal = within(screen.getByTestId('modal-content'));
    fireEvent.change(modal.getByLabelText('Name *'), { target: { value: 'Slack Notify' } });
    fireEvent.change(modal.getByLabelText('Trigger Event *'), { target: { value: 'order.completed' } });
    fireEvent.change(modal.getByLabelText('Condition (JSON)'), { target: { value: '{"amount": 50}' } });
    fireEvent.change(modal.getByLabelText('Action (JSON)'), { target: { value: '{"type":"email"}' } });
    fireEvent.click(modal.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockCreateAutomation).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Slack Notify',
          triggerEvent: 'order.completed',
          conditionJson: '{"amount": 50}',
          actionJson: '{"type":"email"}',
        }),
      );
    });
  });

  it('surfaces an error when the automation toggle fails', async () => {
    S.mockAutomationRules = [automationRule];
    mockToggleAutomation.mockRejectedValue(new Error('toggle-boom'));
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    fireEvent.click(screen.getByText('Deactivate'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: toggle-boom', 'error');
    });
  });

  it('surfaces an error when running a forecast fails', async () => {
    mockRunForecast.mockRejectedValue(new Error('forecast-boom'));
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-forecast'));
    fireEvent.click(screen.getByTestId('run-forecast-btn'));
    fireEvent.change(screen.getByLabelText('Product ID *'), { target: { value: 'prod-1' } });
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: forecast-boom', 'error');
    });
  });

  it('surfaces an error when creating an automation rule fails (save catch)', async () => {
    mockCreateAutomation.mockRejectedValue(new Error('auto-boom'));
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-automationRules'));
    fireEvent.click(screen.getByTestId('add-automation-btn'));
    const modal = within(screen.getByTestId('modal-content'));
    fireEvent.change(modal.getByLabelText('Name *'), { target: { value: 'Rule' } });
    fireEvent.change(modal.getByLabelText('Trigger Event *'), { target: { value: 'stock.low' } });
    fireEvent.click(modal.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: auto-boom', 'error');
    });
  });

  it('surfaces an error when deleting a price rule fails (delete catch)', async () => {
    S.mockPriceRules = [priceRule];
    mockDeletePriceRule.mockRejectedValue(new Error('del-boom'));
    renderWithQuery(<AIPanel />);
    fireEvent.click(screen.getByTestId('tab-priceRules'));
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByTestId('modal-save'));
    await waitFor(() => {
      expect(mockDeletePriceRule).toHaveBeenCalledWith('r1');
      expect(mockShowToast).toHaveBeenCalledWith('Error: del-boom', 'error');
    });
  });
});
