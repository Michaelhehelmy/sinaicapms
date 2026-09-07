import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import SuperAIPanel from '@/components/admin/SuperAIPanel';

const mockShowToast = vi.fn();
let mockAuthUser: { role: string; id?: string } | null = { role: 'super_admin', id: 'u1' };
let mockTenantsResolve: unknown = [{ id: 't1', name: 'Camp' }];
let mockOverviewResolve: unknown = { totalPredictions: 5, totalAutomationRules: 3, totalLogs: 10, totalPriceRules: 2, tenantBreakdown: [{ tenantId: 't1', tenantName: 'Camp', predictionCount: 5, ruleCount: 3 }] };
let mockPredictionsResolve: unknown = { data: [{ id: 'p1', type: 'demand', confidence: 0.85, tenantName: 'Camp', createdAt: '2025-01-01' }], total: 1 };
let mockTenantsReject = false;
let mockOverviewReject = false;
let mockPredictionsReject = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: mockAuthUser }),
}));

vi.mock('@/lib/utils', () => ({
  formatDate: (d: string) => d,
  cn: (...c: (string | undefined | false | null)[]) => c.filter(Boolean).join(' '),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
  getAdminTenants: vi.fn(),
}));

import * as api from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthUser = { role: 'super_admin', id: 'u1' };
  mockTenantsResolve = [{ id: 't1', name: 'Camp' }];
  mockOverviewResolve = { totalPredictions: 5, totalAutomationRules: 3, totalLogs: 10, totalPriceRules: 2, tenantBreakdown: [{ tenantId: 't1', tenantName: 'Camp', predictionCount: 5, ruleCount: 3 }] };
  mockPredictionsResolve = { data: [{ id: 'p1', type: 'demand', confidence: 0.85, tenantName: 'Camp', createdAt: '2025-01-01' }], total: 1 };
  mockTenantsReject = false;
  mockOverviewReject = false;
  mockPredictionsReject = false;

  (api.getAdminTenants as ReturnType<typeof vi.fn>).mockImplementation(() =>
    mockTenantsReject ? Promise.reject(new Error('fail')) : Promise.resolve(mockTenantsResolve)
  );
  (api.apiFetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (mockOverviewReject && String(url).includes('overview')) return Promise.reject(new Error('fail overview'));
    if (mockPredictionsReject && String(url).includes('predictions')) return Promise.reject(new Error('fail predictions'));
    if (String(url).includes('overview')) return Promise.resolve(mockOverviewResolve);
    return Promise.resolve(mockPredictionsResolve);
  });
});

describe('SuperAIPanel', () => {
  it('shows access denied for non-super-admin', async () => {
    mockAuthUser = { role: 'admin' };
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeTruthy();
    });
  });

  it('shows loading state', async () => {
    mockTenantsResolve = new Promise(() => {}); // never resolves
    render(<SuperAIPanel />);
    expect(screen.getByText('Loading AI data...')).toBeTruthy();
  });

  it('renders overview stats', async () => {
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('AI & Automation Overview')).toBeTruthy();
    });
    expect(screen.getByText('Predictions')).toBeTruthy();
    expect(screen.getByText('Automation Rules')).toBeTruthy();
  });

  it('renders tenant breakdown', async () => {
    render(<SuperAIPanel />);
    await waitFor(() => {
      // The tenant name appears in the breakdown table and in the select dropdown.
      // Use getAllByText and check at least 2 occurrences.
      const camps = screen.getAllByText('Camp');
      expect(camps.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText('AI Activity by Tenant')).toBeTruthy();
    expect(screen.getByText('5 predictions')).toBeTruthy();
    expect(screen.getByText('3 rules')).toBeTruthy();
  });

  it('filters predictions by selected tenant and refreshes', async () => {
    render(<SuperAIPanel />);
    await waitFor(() => { expect(screen.getByText('demand')).toBeTruthy(); });

    // Change tenant filter — triggers loadPredictions with tenantId
    const select = screen.getByLabelText('Filter by Tenant');
    fireEvent.change(select, { target: { value: 't1' } });
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith(expect.stringContaining('tenantId=t1'));
    });

    // Click Refresh — re-triggers loadPredictions with selected tenant
    fireEvent.click(screen.getByText('Refresh'));
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith('/admin/ai/predictions?tenantId=t1');
    });
  });

  it('renders predictions table', async () => {
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('demand')).toBeTruthy();
    });
  });

  it('shows empty predictions state', async () => {
    mockPredictionsResolve = { data: [], total: 0 };
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('No predictions found')).toBeTruthy();
    });
  });

  it('handles tenant fetch error', async () => {
    mockTenantsReject = true;
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load tenants'),
        'error'
      );
    });
  });

  it('handles overview fetch error', async () => {
    mockOverviewReject = true;
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail overview'));
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load AI overview'),
        'error'
      );
    });
  });

  it('handles predictions fetch error', async () => {
    mockPredictionsReject = true;
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail predictions'));
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load predictions'),
        'error'
      );
    });
  });

  it('handles empty tenant array response', async () => {
    mockTenantsResolve = { data: [] };
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('AI & Automation Overview')).toBeTruthy();
    });
  });

  it('handles tenants as non-array response', async () => {
    mockTenantsResolve = null;
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('AI & Automation Overview')).toBeTruthy();
    });
  });

  it('renders with no tenantBreakdown', async () => {
    mockOverviewResolve = { totalPredictions: 0, totalAutomationRules: 0, totalLogs: 0, totalPriceRules: 0, tenantBreakdown: [] };
    render(<SuperAIPanel />);
    await waitFor(() => {
      expect(screen.getByText('AI & Automation Overview')).toBeTruthy();
    });
  });
});
