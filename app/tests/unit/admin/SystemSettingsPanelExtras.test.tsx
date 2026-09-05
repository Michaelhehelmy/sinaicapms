/**
 * SystemSettingsPanel — Payments tab coverage (cov-t2a / "ListViewingsPanel").
 *
 * The existing suites (system.test.tsx, system-settings-extra.test.tsx) cover the
 * feature-flags / emails / defaults / branding tabs and their save paths, but the
 * P2 Payments tab (jsx 466-578) and the `activeTab === 'payments'` save branch
 * (149-160) were added later and were uncovered. These tests exercise the full
 * payments UI: toggling the gateway enable switch, filling every credential field,
 * the keep-existing secret semantics (omit when blank / include when typed), and
 * the error toast on a failed save — all asserting real payload output.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SystemSettingsPanel from '@/components/admin/SystemSettingsPanel';

const mockShowToast = vi.fn();
const mockUseAdminSettingsQuery = vi.fn();
const mockUpdateAdminSettings = vi.fn();

vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: {
    adminSettings: ['admin', 'settings'],
  },
  useAdminSettingsQuery: (...args: unknown[]) => mockUseAdminSettingsQuery(...args),
}));

vi.mock('@/lib/api', () => ({
  getAdminSettings: vi.fn(),
  updateAdminSettings: (...args: unknown[]) => mockUpdateAdminSettings(...args),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn().mockReturnValue({ user: { role: 'super_admin' } }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => String(d),
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, ...rest }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

// Render the real Select so the currency select can be changed.
import { QueryClientProvider as QCP } from '@tanstack/react-query';

const baseSettings = {
  featureFlags: { financials: true },
  emailTemplates: { welcome: { subject: 'Welcome', body: 'Hi' } },
  defaults: { taxRate: 14, currency: 'EGP', timezone: 'Africa/Cairo', dateFormat: 'YYYY-MM-DD' },
  branding: { platformName: 'SinaiCamps', logoUrl: null, faviconUrl: null, primaryColor: '#16a34a' },
  payment: {
    enabled: false,
    secretKeySet: true,
    hmacSecretSet: true,
    integrationIds: '1,2',
    baseUrl: 'https://accept.paymob.com',
    publicKey: 'pk_test_1',
    currency: 'EGP',
    marketplaceFeePct: 2.5,
  },
};

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QCP client={qc}>
      <SystemSettingsPanel />
    </QCP>,
  );
}

describe('SystemSettingsPanel — payments tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAdminSettingsQuery.mockReturnValue({ data: baseSettings, isLoading: false });
    mockUpdateAdminSettings.mockResolvedValue({ success: true });
  });

  it('switches to the payments tab and renders every credential field', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    expect(screen.getByText('Paymob Payments')).toBeInTheDocument();
    expect(screen.getByTestId('payment-enabled-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('payment-secret-key')).toBeInTheDocument();
    expect(screen.getByTestId('payment-hmac-secret')).toBeInTheDocument();
    expect(screen.getByTestId('payment-integration-ids')).toHaveValue('1,2');
    expect(screen.getByTestId('payment-base-url')).toHaveValue('https://accept.paymob.com');
    expect(screen.getByTestId('payment-public-key')).toHaveValue('pk_test_1');
    expect(screen.getByTestId('payment-marketplace-fee')).toHaveValue(2.5);
    // Configured badges for the two existing secrets
    expect(screen.getAllByText('Configured ✓').length).toBe(2);
  });

  it('toggles the gateway enable switch', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    const toggle = screen.getByTestId('payment-enabled-toggle');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('saves the payments payload including newly typed secret keys', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    fireEvent.click(screen.getByTestId('payment-enabled-toggle'));
    fireEvent.change(screen.getByTestId('payment-secret-key'), { target: { value: 'sk_test_abc' } });
    fireEvent.change(screen.getByTestId('payment-hmac-secret'), { target: { value: 'hmac_xyz' } });
    fireEvent.change(screen.getByTestId('payment-integration-ids'), { target: { value: '3,4,5' } });
    fireEvent.change(screen.getByTestId('payment-base-url'), { target: { value: 'https://custom.paymob.com' } });
    fireEvent.change(screen.getByTestId('payment-public-key'), { target: { value: 'pk_test_2' } });
    fireEvent.change(screen.getByTestId('payment-marketplace-fee'), { target: { value: '5' } });

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          payment: expect.objectContaining({
            enabled: true,
            secretKey: 'sk_test_abc',
            hmacSecret: 'hmac_xyz',
            integrationIds: '3,4,5',
            baseUrl: 'https://custom.paymob.com',
            publicKey: 'pk_test_2',
            marketplaceFeePct: 5,
          }),
        }),
      );
    });
    expect(mockShowToast).toHaveBeenCalledWith('Settings saved', 'success');
  });

  it('omits secret keys from the payload when left blank (keep-existing)', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalled();
    });
    const called = mockUpdateAdminSettings.mock.calls[0][0] as Record<string, any>;
    expect(called.payment).not.toHaveProperty('secretKey');
    expect(called.payment).not.toHaveProperty('hmacSecret');
    expect(called.payment.enabled).toBe(false);
  });

  it('saves the currency select and fee fields via the payments tab', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    fireEvent.change(screen.getByTestId('payment-currency'), { target: { value: 'USD' } });
    fireEvent.change(screen.getByTestId('payment-marketplace-fee'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          payment: expect.objectContaining({ currency: 'USD', marketplaceFeePct: 10 }),
        }),
      );
    });
  });

  it('shows an error toast when the payments save fails', async () => {
    mockUpdateAdminSettings.mockRejectedValue(new Error('network down'));
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Failed to save settings: network down', 'error');
    });
  });

  it('renders loading spinner before settings resolve', () => {
    mockUseAdminSettingsQuery.mockReturnValue({ data: undefined, isLoading: true });
    renderPanel();
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });
});
