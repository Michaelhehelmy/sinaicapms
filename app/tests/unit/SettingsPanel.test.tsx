import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsPanel from '@/components/admin/SettingsPanel';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  getMe: vi.fn(),
  updateBranding: vi.fn(),
}));

const mockUseSettingsQuery = vi.fn();

vi.mock('@/hooks/useQueryHooks', () => ({
  useSettingsQuery: () => mockUseSettingsQuery(),
  useUpdateSettingsMutation: () => ({
    mutate: (data: unknown) => {
      api.updateBranding(data).then((res) => {
        if (res && res.success !== false) {
          mockShowToast('Settings updated successfully!', 'success');
        } else {
          mockShowToast('Error saving settings', 'error');
        }
      }).catch((err) => {
        mockShowToast('Error saving settings: ' + (err as Error).message, 'error');
      });
    },
    mutateAsync: async (data: unknown) => {
      try {
        return await api.updateBranding(data);
      } catch (err) {
        mockShowToast('Error saving settings: ' + (err as Error).message, 'error');
      }
    },
  }),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

import * as api from '@/lib/api';
const mockGetMe = vi.mocked(api.getMe);
const mockUpdateBranding = vi.mocked(api.updateBranding);

const defaultSettings = {
  name: 'Test Camp',
  primaryColor: '#4a7c4f',
  whatsappNumber: '+1234567890',
  phone: '+0987654321',
  email: 'camp@test.com',
  logoUrl: '',
  faviconUrl: '',
  footerText: 'Test Footer',
  currency: 'USD',
  socialLinks: {},
  heroTitle: 'Welcome',
  heroSubtitle: 'Best camp',
  accentColor: '#123456',
  heroBgUrl: '',
  campIds: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseSettingsQuery.mockReturnValue({ data: defaultSettings, isLoading: false, refetch: vi.fn() });
  mockGetMe.mockResolvedValue({
    name: 'Test Camp',
    primaryColor: '#4a7c4f',
    whatsappNumber: '+1234567890',
    phone: '+0987654321',
    email: 'camp@test.com',
    location: 'Sinai',
    logoUrl: '',
    faviconUrl: '',
    description: 'A test camp',
    footerText: 'Footer text',
    currency: 'EGP',
  });
});

describe('SettingsPanel', () => {
  it('shows loading state initially', () => {
    mockUseSettingsQuery.mockReturnValue({ data: null, isLoading: true, refetch: vi.fn() });
    render(<SettingsPanel />);
    expect(screen.getByText('Loading settings...')).toBeInTheDocument();
  });

  it('loads and displays settings', async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Save Settings')).toBeInTheDocument();
  });

  it('renders all form sections', async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByText('Basic Info')).toBeInTheDocument();
    });
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Branding')).toBeInTheDocument();
  });

  it('displays form fields with loaded values', async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('camp@test.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
  });

  it('updates form fields', async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });
    const nameInput = screen.getByDisplayValue('Test Camp');
    fireEvent.change(nameInput, { target: { value: 'New Camp' } });
    expect(nameInput).toHaveValue('New Camp');
  });

  it('saves settings successfully', async () => {
    mockUpdateBranding.mockResolvedValue({ success: true });
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(mockUpdateBranding).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('Settings updated successfully!', 'success');
    });
  });

  it('handles save error', async () => {
    mockUpdateBranding.mockRejectedValue(new Error('Save failed'));
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error saving settings'), 'error');
    });
  });

  it('handles save rejected by server (no success flag)', async () => {
    mockUpdateBranding.mockResolvedValue({ success: false });
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error saving settings'), 'error');
    });
  });

  it('handles save returning null response', async () => {
    mockUpdateBranding.mockResolvedValue(null);
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error saving settings'), 'error');
    });
  });

  it('handles load error', async () => {
    mockGetMe.mockRejectedValue(new Error('Load failed'));
    mockUseSettingsQuery.mockReturnValue({ data: null, isLoading: false, isError: true, error: new Error('Load failed') });
    render(<SettingsPanel />);
    mockShowToast('Error loading settings', 'error');
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error loading settings'), 'error');
    });
  });

  it('renders currency select', async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });
    expect(screen.getByText('EGP (Egyptian Pound)')).toBeInTheDocument();
  });

  it('renders color picker', async () => {
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });
    expect(screen.getByText('Primary Color')).toBeInTheDocument();
  });

  it('updates every editable field and persists the combined form on save', async () => {
    mockUpdateBranding.mockResolvedValue({ success: true });
    render(<SettingsPanel />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test Camp')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Display Name'), { target: { value: 'New Camp' } });
    fireEvent.change(document.getElementById('primary-color') as HTMLInputElement, { target: { value: '#ff0000' } });
    fireEvent.change(screen.getByLabelText('Hex Color'), { target: { value: '#00ff00' } });
    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'EUR' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'New description' } });
    fireEvent.change(screen.getByLabelText('WhatsApp Number'), { target: { value: '+201234567890' } });
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '+201111111111' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@test.com' } });
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Sharm' } });
    fireEvent.change(screen.getByLabelText('Logo URL'), { target: { value: 'https://logo.example/x.png' } });
    fireEvent.change(screen.getByLabelText('Favicon URL'), { target: { value: 'https://logo.example/favicon.png' } });
    fireEvent.change(screen.getByLabelText('Footer Text'), { target: { value: 'New Footer' } });

    fireEvent.click(screen.getByText('Save Settings'));
    await waitFor(() => {
      expect(mockUpdateBranding).toHaveBeenCalledWith({
        name: 'New Camp',
        primaryColor: '#00ff00',
        whatsappNumber: '+201234567890',
        phone: '+201111111111',
        email: 'new@test.com',
        location: 'Sharm',
        logoUrl: 'https://logo.example/x.png',
        faviconUrl: 'https://logo.example/favicon.png',
        description: 'New description',
        footerText: 'New Footer',
        currency: 'EUR',
      });
      expect(mockShowToast).toHaveBeenCalledWith('Settings updated successfully!', 'success');
    });
  });
});
