import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TenantDrilldown from '@/components/admin/TenantDrilldown';

const mockSetTenantScope = vi.fn();
const mockGetCamps = vi.fn();

vi.mock('@/lib/api', () => ({
  setTenantScope: (...args: unknown[]) => mockSetTenantScope(...args),
  getCamps: (...args: unknown[]) => mockGetCamps(...args),
}));

// Stub the existing admin panels so this test focuses on scope + tab wiring.
vi.mock('@/components/admin/CampsPanel', () => ({
  default: () => <div data-testid="panel-stub-camps">CAMPS_PANEL_STUB</div>,
}));
vi.mock('@/components/admin/RoomsPanel', () => ({
  default: ({ campIds, camps }: { campIds: string[]; camps: { id: string }[] }) => (
    <div data-testid="panel-stub-rooms">ROOMS:{campIds.length}:{camps.length}</div>
  ),
}));
vi.mock('@/components/admin/RatePlansPanel', () => ({
  default: () => <div data-testid="panel-stub-rateplans">RATEPLANS_PANEL_STUB</div>,
}));
vi.mock('@/components/admin/OrdersPanel', () => ({
  default: () => <div data-testid="panel-stub-orders">ORDERS_PANEL_STUB</div>,
}));
vi.mock('@/components/admin/MenuPanel', () => ({
  default: () => <div data-testid="panel-stub-menu">MENU_PANEL_STUB</div>,
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useCampsQuery: () => ({
    data: [
      { id: 'c1', name: 'Camp One' },
      { id: 'c2', name: 'Camp Two' },
    ],
    isLoading: false,
  }),
  queryKeys: { camps: ['admin', 'camps'] },
}));

const sampleTenant = {
  id: 'acaciacamp',
  name: 'Acacia Camp',
  subdomain: 'acacia',
  type: 'camp',
};

const sampleTenantWithCustomDomain = {
  id: 'acaciacamp',
  name: 'Acacia Camp',
  subdomain: 'acacia',
  customDomain: 'acaciacamp.com',
  type: 'camp',
};

const onBack = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TenantDrilldown (T9 super-admin drill-down)', () => {
  it('renders tenant header, type badge and Camps panel by default', async () => {
    render(<TenantDrilldown tenant={sampleTenant} onBack={onBack} />);
    await waitFor(() => {
      expect(screen.getByText('Acacia Camp')).toBeInTheDocument();
      expect(screen.getByTestId('drilldown-tenant-type-badge')).toHaveTextContent('Camp');
      expect(screen.getByTestId('panel-stub-camps')).toBeInTheDocument();
      expect(screen.getByText('acacia.sinaicamps.com')).toBeInTheDocument();
    });
  });

  it('shows ONLY the custom domain in the header when one exists', async () => {
    render(<TenantDrilldown tenant={sampleTenantWithCustomDomain} onBack={onBack} />);
    await waitFor(() => {
      expect(screen.getByText('acaciacamp.com')).toBeInTheDocument();
      expect(screen.queryByText('acacia.sinaicamps.com')).not.toBeInTheDocument();
    });
  });

  it('sets the tenant scope on mount and clears it on unmount', async () => {
    const { unmount } = render(<TenantDrilldown tenant={sampleTenant} onBack={onBack} />);
    await waitFor(() => {
      expect(mockSetTenantScope).toHaveBeenCalledWith('acaciacamp');
    });
    unmount();
    expect(mockSetTenantScope).toHaveBeenLastCalledWith(null);
  });

  it('switches sub-tabs and passes the single camp to the panels', async () => {
    render(<TenantDrilldown tenant={sampleTenant} onBack={onBack} />);
    await waitFor(() => {
      expect(screen.getByTestId('panel-stub-camps')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('drilldown-tab-rooms'));
    await waitFor(() => {
      // B3: the drilldown hub pins every panel to the tenant's one camp —
      // camps[0] only, even if the API returns more.
      expect(screen.getByTestId('panel-stub-rooms')).toHaveTextContent('ROOMS:1:1');
    });
    fireEvent.click(screen.getByTestId('drilldown-tab-rateplans'));
    await waitFor(() => {
      expect(screen.getByTestId('panel-stub-rateplans')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('drilldown-tab-orders'));
    await waitFor(() => {
      expect(screen.getByTestId('panel-stub-orders')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('drilldown-tab-menu'));
    await waitFor(() => {
      expect(screen.getByTestId('panel-stub-menu')).toBeInTheDocument();
    });
  });

  it('calls onBack from the back button', async () => {
    render(<TenantDrilldown tenant={sampleTenant} onBack={onBack} />);
    await waitFor(() => {
      expect(screen.getByTestId('drilldown-back-btn')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('drilldown-back-btn'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
