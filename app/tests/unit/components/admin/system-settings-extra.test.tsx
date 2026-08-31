/**
 * Extra coverage tests for SystemSettingsPanel.
 *
 * Targets the 16 uncovered onChange handlers (8 inputs × 2 closures each)
 * plus uncovered branch paths:
 *   - settings.featureFlags || {}  and  settings.emailTemplates || {}  fallbacks
 *   - save error with non-Error value (String(err) branch)
 *   - tax-rate parseFloat fallback  (|| 0)
 *   - logoUrl / faviconUrl  || null  in onChange
 *   - branding tab save path
 *   - defaults tab full field coverage (currency, timezone, dateFormat)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SystemSettingsPanel from '@/components/admin/SystemSettingsPanel';

// ── Hook mocks ─────────────────────────────────────────────────────────
const mockUseAdminSettingsQuery = vi.fn();

vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: {
    adminSettings: ['admin', 'settings'],
  },
  useAdminSettingsQuery: (...args: unknown[]) => mockUseAdminSettingsQuery(...args),
}));

// ── lib/api mocks ──────────────────────────────────────────────────────
const mockUpdateAdminSettings = vi.fn();

vi.mock('@/lib/api', () => ({
  getAdminSettings: vi.fn(),
  updateAdminSettings: (...args: unknown[]) => mockUpdateAdminSettings(...args),
}));

// ── lib/auth + lib/utils mocks ─────────────────────────────────────────
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn().mockReturnValue({ user: { role: 'super_admin' } }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => String(d),
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

// ── UI primitives mocks ────────────────────────────────────────────────
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('@/components/ui/LoadingSpinner', () => ({
  LoadingSpinner: ({ text }: { text?: string }) => <div data-testid="loading-spinner">{text}</div>,
}));

vi.mock('@/components/ui/Button', () => ({
  Button: ({ children, onClick, ...rest }: { children: React.ReactNode; onClick?: () => void; [key: string]: unknown }) => (
    <button onClick={onClick} {...rest}>{children}</button>
  ),
}));

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <div data-testid="card" {...rest}>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ui/Badge', () => ({
  Badge: ({ children, ...rest }: { children: React.ReactNode; [key: string]: unknown }) => <span {...rest}>{children}</span>,
}));

vi.mock('@/components/ui/Select', () => ({
  Select: ({ label, options, value, onChange, ...rest }: { label?: string; options: { value: string; label: string }[]; value?: string; onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void; [key: string]: unknown }) => (
    <div>
      {label && <label>{label}</label>}
      <select value={value} onChange={onChange} {...rest}>
        {options.map((opt: { value: string; label: string }) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  ),
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({ open, title, children, onClose, onSubmit, submitLabel }: {
    open: boolean; title: string; children: React.ReactNode; onClose?: () => void; onSubmit?: () => void; submitLabel?: string;
  }) =>
    open ? (
      <div data-testid="form-modal">
        <h3>{title}</h3>
        {children}
        {onClose && <button data-testid="form-modal-close" onClick={onClose}>Close</button>}
        {onSubmit && <button data-testid="form-modal-submit" onClick={onSubmit}>{submitLabel || 'Submit'}</button>}
      </div>
    ) : null,
}));

// ── Test helpers ───────────────────────────────────────────────────────
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper });
}

const sampleSettings = {
  featureFlags: { financials: true, hr: false, supply: true, crm: false, storefront: true, ai: false },
  emailTemplates: {
    welcomeEmail: { subject: 'Welcome', body: 'Hello {{name}}' },
    bookingConfirmation: { subject: 'Booking', body: 'Your booking is confirmed' },
  },
  defaults: { taxRate: 15, currency: 'USD', timezone: 'UTC', dateFormat: 'YYYY-MM-DD' },
  branding: { platformName: 'SinaiCamps', logoUrl: 'https://example.com/logo.png', faviconUrl: 'https://example.com/favicon.ico', primaryColor: '#16a34a' },
};

/** Settings with undefined featureFlags / emailTemplates to hit || {} fallback */
const settingsWithMissing = {
  featureFlags: undefined as Record<string, boolean> | undefined,
  emailTemplates: undefined as Record<string, { subject: string; body: string }> | undefined,
  defaults: { taxRate: 10, currency: 'EUR', timezone: 'UTC', dateFormat: 'YYYY-MM-DD' },
  branding: { platformName: 'Test', logoUrl: null as string | null, faviconUrl: null as string | null, primaryColor: '#000000' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAdminSettingsQuery.mockReturnValue({ data: sampleSettings, isLoading: false });
  mockUpdateAdminSettings.mockResolvedValue({ success: true });
});

// ═══════════════════════════════════════════════════════════════════════
// Tab switching
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — tab switching', () => {
  it('switches between all tabs and renders correct content', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    // Default: features tab — "Feature Flags" appears in both tab button and card header
    expect(screen.getAllByText('Feature Flags').length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText('Financial Management')).toBeInTheDocument();

    // Switch to emails
    fireEvent.click(screen.getByText('Email Templates'));
    expect(await screen.findByText('welcome Email')).toBeInTheDocument();

    // Switch to defaults
    fireEvent.click(screen.getByText('Defaults'));
    expect(await screen.findByText('Platform Defaults')).toBeInTheDocument();

    // Switch to branding
    fireEvent.click(screen.getByText('Branding'));
    expect(await screen.findByText('Platform Branding')).toBeInTheDocument();

    // Switch back to features
    fireEvent.click(screen.getAllByText('Feature Flags')[0]);
    expect(await screen.findByText('Financial Management')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// onChange handlers — Defaults tab
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — defaults onChange handlers', () => {
  it('changes currency select and saves', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Defaults'));
    await screen.findByText('Platform Defaults');

    fireEvent.change(screen.getByTestId('setting-currency'), { target: { value: 'EUR' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalled();
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.defaults.currency).toBe('EUR');
    });
  });

  it('changes timezone select and saves', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Defaults'));
    await screen.findByText('Platform Defaults');

    fireEvent.change(screen.getByTestId('setting-timezone'), { target: { value: 'America/New_York' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.defaults.timezone).toBe('America/New_York');
    });
  });

  it('changes date format select and saves', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Defaults'));
    await screen.findByText('Platform Defaults');

    fireEvent.change(screen.getByTestId('setting-date-format'), { target: { value: 'DD/MM/YYYY' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.defaults.dateFormat).toBe('DD/MM/YYYY');
    });
  });

  it('handles non-numeric tax rate (parseFloat fallback to 0)', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Defaults'));
    await screen.findByText('Platform Defaults');

    fireEvent.change(screen.getByTestId('setting-tax-rate'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.defaults.taxRate).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// onChange handlers — Branding tab
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — branding onChange handlers', () => {
  it('changes logo URL and saves', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Branding'));
    await screen.findByText('Platform Branding');

    const logoInput = screen.getByDisplayValue('https://example.com/logo.png');
    fireEvent.change(logoInput, { target: { value: 'https://new.com/logo.svg' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.branding.logoUrl).toBe('https://new.com/logo.svg');
    });
  });

  it('changes favicon URL and saves', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Branding'));
    await screen.findByText('Platform Branding');

    const faviconInput = screen.getByDisplayValue('https://example.com/favicon.ico');
    fireEvent.change(faviconInput, { target: { value: 'https://new.com/favicon.png' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.branding.faviconUrl).toBe('https://new.com/favicon.png');
    });
  });

  it('clears favicon URL with empty string (|| null branch)', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Branding'));
    await screen.findByText('Platform Branding');

    const faviconInput = screen.getByDisplayValue('https://example.com/favicon.ico');
    fireEvent.change(faviconInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.branding.faviconUrl).toBeNull();
    });
  });

  it('clears logo URL with empty string (|| null branch)', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Branding'));
    await screen.findByText('Platform Branding');

    const logoInput = screen.getByDisplayValue('https://example.com/logo.png');
    fireEvent.change(logoInput, { target: { value: '' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.branding.logoUrl).toBeNull();
    });
  });

  it('changes primary color via color input', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Branding'));
    await screen.findByText('Platform Branding');

    fireEvent.change(screen.getByTestId('setting-primary-color'), { target: { value: '#ff0000' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.branding.primaryColor).toBe('#ff0000');
    });
  });

  it('changes primary color via text input', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Branding'));
    await screen.findByText('Platform Branding');

    // The text input for primary color shows the hex value
    const colorTextInput = screen.getAllByDisplayValue('#16a34a');
    // There are two inputs for primary color — the color picker and the text input
    // The text input is the one without data-testid
    expect(colorTextInput.length).toBeGreaterThan(0);
    fireEvent.change(colorTextInput[colorTextInput.length - 1], { target: { value: '#00ff00' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.branding.primaryColor).toBe('#00ff00');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// onChange handlers — Email templates body textarea
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — email template body editing', () => {
  it('edits email body textarea and saves', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Email Templates'));
    await screen.findByText('welcome Email');

    fireEvent.click(screen.getAllByText('Edit')[0]);
    expect(screen.getByTestId('form-modal')).toBeInTheDocument();

    // Find the textarea (it has 8 rows in the source)
    const textareas = document.querySelectorAll('textarea');
    expect(textareas.length).toBeGreaterThan(0);
    fireEvent.change(textareas[0], { target: { value: 'Updated body content' } });

    fireEvent.click(screen.getByTestId('form-modal-submit'));
    await waitFor(() => {
      expect(screen.queryByTestId('form-modal')).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.emailTemplates.welcomeEmail.body).toBe('Updated body content');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Branch coverage: settings with undefined featureFlags/emailTemplates
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — missing settings fallback branches', () => {
  it('handles settings with undefined featureFlags and emailTemplates (|| {} branches)', () => {
    mockUseAdminSettingsQuery.mockReturnValue({ data: settingsWithMissing, isLoading: false });
    renderWithProviders(<SystemSettingsPanel />);
    // Should render without crashing — defaults used for missing fields
    expect(screen.getByText('System Settings')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Branch coverage: save error with non-Error value
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — non-Error save failure', () => {
  it('handles save error thrown as a string (String(err) branch)', async () => {
    mockUpdateAdminSettings.mockRejectedValue('a string error');
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalled();
    });
  });

  it('handles save error thrown as a plain object', async () => {
    mockUpdateAdminSettings.mockRejectedValue({ code: 'UNKNOWN' });
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Save Changes'));
    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalled();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Branch coverage: branding tab save path
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — branding tab save', () => {
  it('saves branding payload when on branding tab', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Branding'));
    await screen.findByText('Platform Branding');

    fireEvent.change(screen.getByTestId('setting-platform-name'), { target: { value: 'NewCamp' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalled();
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.branding).toBeDefined();
      expect(payload.branding.platformName).toBe('NewCamp');
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Branch coverage: defaults tab save path
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — defaults tab save', () => {
  it('saves defaults payload when on defaults tab', async () => {
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Defaults'));
    await screen.findByText('Platform Defaults');

    fireEvent.change(screen.getByTestId('setting-tax-rate'), { target: { value: '25' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockUpdateAdminSettings).toHaveBeenCalled();
      const payload = mockUpdateAdminSettings.mock.calls[0][0];
      expect(payload.defaults).toBeDefined();
      expect(payload.defaults.taxRate).toBe(25);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Branch coverage: saving in progress state (saving → Saving...)
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — saving state', () => {
  it('shows Saving... text while save is in progress', async () => {
    // Make save slow
    let resolveSave: (v: unknown) => void;
    mockUpdateAdminSettings.mockImplementation(() => new Promise((resolve) => { resolveSave = resolve; }));

    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    // Resolve to clean up
    resolveSave!({ success: true });
    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Branch coverage: defaults tab with settings having null favicon/logoUrl
// ═══════════════════════════════════════════════════════════════════════
describe('SystemSettingsPanel — branding with null URLs', () => {
  it('renders empty inputs for null logoUrl and faviconUrl', () => {
    mockUseAdminSettingsQuery.mockReturnValue({
      data: {
        ...sampleSettings,
        branding: { ...sampleSettings.branding, logoUrl: null, faviconUrl: null },
      },
      isLoading: false,
    });
    renderWithProviders(<SystemSettingsPanel />);
    fireEvent.click(screen.getByText('Branding'));

    // Logo and favicon inputs should have empty string value
    expect(screen.getByPlaceholderText('https://example.com/logo.png')).toHaveValue('');
    expect(screen.getByPlaceholderText('https://example.com/favicon.ico')).toHaveValue('');
  });
});
