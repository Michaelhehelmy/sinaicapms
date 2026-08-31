import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SignupPage from '@/components/public/SignupPage';
import OnboardingWizard from '@/components/public/OnboardingWizard';
import MarketplaceDirectory from '@/components/public/MarketplaceDirectory';

// ── lib/utils mock (identity passthrough avoids transitive theme import) ─
vi.mock('@/lib/utils', () => ({
  escHtml: (s: string) => String(s),
  getLocationDisplay: (s: string | null | undefined) => s || 'Sinai, Egypt',
}));

// ── lib/api mock ────────────────────────────────────────────────────────
const mockSignupTenant = vi.fn();
const mockGetOnboardingStatus = vi.fn();
const mockUpdateOnboardingTenant = vi.fn();
const mockCompleteOnboarding = vi.fn();
const mockGetMarketplaceListings = vi.fn();
const mockGetMarketplaceCategories = vi.fn();

vi.mock('@/lib/api', () => ({
  signupTenant: (...args: unknown[]) => mockSignupTenant(...args),
  getOnboardingStatus: (...args: unknown[]) => mockGetOnboardingStatus(...args),
  updateOnboardingTenant: (...args: unknown[]) => mockUpdateOnboardingTenant(...args),
  completeOnboarding: (...args: unknown[]) => mockCompleteOnboarding(...args),
  getMarketplaceListings: (...args: unknown[]) => mockGetMarketplaceListings(...args),
  getMarketplaceCategories: (...args: unknown[]) => mockGetMarketplaceCategories(...args),
}));

// ── Sample data ─────────────────────────────────────────────────────────
const categories = [
  { id: 'c1', name: 'Adventure Camps', slug: 'adventure', description: null, icon: null, sortOrder: 1, projectCount: 2 },
  { id: 'c2', name: 'Luxury Glamping', slug: 'luxury', description: null, icon: null, sortOrder: 2, projectCount: 0 },
];

const listings = [
  {
    tenantId: 't1',
    tenantName: 'Acacia Camp',
    subdomain: 'acaciacamp',
    tenantDescription: 'A beautiful desert camp',
    primaryColor: '#1e40af',
    location: 'Dahab, Egypt',
    projectId: 'p1',
    projectName: 'Desert Trek',
    projectDescription: 'Guided desert treks',
    projectType: 'adventure',
    capacity: 40,
    slug: 'desert-trek',
    reviewCount: 12,
    avgRating: 4.5,
  },
  {
    tenantId: 't2',
    tenantName: 'Starlight Glamping',
    subdomain: 'starlight',
    tenantDescription: null,
    primaryColor: null,
    location: null,
    projectId: 'p2',
    projectName: 'Luxury Tents',
    projectDescription: null,
    projectType: 'luxury',
    capacity: null,
    slug: null,
    reviewCount: 3,
    avgRating: 0,
  },
];

const listingsResult = { data: listings, total: 2, page: 1, pageSize: 12, hasMore: false };

// ── Onboarding helpers ──────────────────────────────────────────────────
const onboardingStatus = {
  tenant_id: 't1',
  name: 'Acacia Camp',
  subdomain: 'acaciacamp',
  email: 'owner@acacia.com',
  status: 'onboarding',
  onboarding_status: 'pending',
  setup_complete: false,
  profile: {
    location: 'Dahab',
    phone: '+20 123 456 7890',
    description: 'A scenic desert camp',
    primary_color: '#123456',
    capacity: 50,
    currency: 'USD',
  },
};

const completeStatus = {
  ...onboardingStatus,
  setup_complete: true,
};

// ── React Query wrapper (for MarketplaceDirectory) ──────────────────────
function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(ui, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Ensure a clean query string for each test
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

// ════════════════════════════════════════════════════════════════════════
//  SignupPage
// ════════════════════════════════════════════════════════════════════════
describe('SignupPage', () => {
  it('renders the signup form', () => {
    render(<SignupPage />);
    expect(screen.getByText('Get Started with SinaiCamps')).toBeInTheDocument();
    expect(screen.getByTestId('signup-first-name')).toBeInTheDocument();
    expect(screen.getByTestId('signup-submit')).toBeInTheDocument();
  });

  it('shows validation error when names are missing', () => {
    render(<SignupPage />);
    fireEvent.click(screen.getByTestId('signup-submit'));
    expect(screen.getByTestId('signup-error')).toHaveTextContent('Full name is required');
    expect(mockSignupTenant).not.toHaveBeenCalled();
  });

  it('shows error when email is missing', () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.click(screen.getByTestId('signup-submit'));
    expect(screen.getByTestId('signup-error')).toHaveTextContent('Email is required');
  });

  it('shows error for invalid email', () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByTestId('signup-submit'));
    expect(screen.getByTestId('signup-error')).toHaveTextContent('Please enter a valid email');
  });

  it('shows error when password is too short', () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: '123' } });
    fireEvent.click(screen.getByTestId('signup-submit'));
    expect(screen.getByTestId('signup-error')).toHaveTextContent('Password must be at least 6 characters');
  });

  it('shows error when business name is missing', () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: 'secret1' } });
    fireEvent.click(screen.getByTestId('signup-submit'));
    expect(screen.getByTestId('signup-error')).toHaveTextContent('Business name is required');
  });

  it('shows error for invalid subdomain characters', () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByTestId('signup-business-name'), { target: { value: 'Acacia' } });
    // Leading/trailing hyphens are allowed by the input sanitizer but fail the regex
    fireEvent.change(screen.getByTestId('signup-subdomain'), { target: { value: '-acacia-' } });
    fireEvent.click(screen.getByTestId('signup-submit'));
    expect(screen.getByTestId('signup-error')).toHaveTextContent(
      'Subdomain must be lowercase with hyphens'
    );
  });

  it('shows error when subdomain is empty', () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByTestId('signup-business-name'), { target: { value: 'Acacia' } });
    fireEvent.change(screen.getByTestId('signup-subdomain'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('signup-submit'));
    expect(screen.getByTestId('signup-error')).toHaveTextContent('Subdomain is required');
  });

  it('auto-generates the subdomain from the business name', () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-business-name'), { target: { value: 'Acacia   Camp' } });
    expect(screen.getByTestId('signup-subdomain')).toHaveValue('acacia-camp');
  });

  it('preserves a custom subdomain when the business name changes', () => {
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-subdomain'), { target: { value: 'my-custom-super' } });
    fireEvent.change(screen.getByTestId('signup-business-name'), { target: { value: 'Acacia Camp' } });
    expect(screen.getByTestId('signup-subdomain')).toHaveValue('my-custom-super');
  });

  it('submits successfully and shows the success step', async () => {
    mockSignupTenant.mockResolvedValue({
      success: true,
      tenant_id: 't1',
      onboarding_token: 'tok123',
      message: 'ok',
    });
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByTestId('signup-business-name'), { target: { value: 'Acacia Camp' } });
    fireEvent.change(screen.getByTestId('signup-business-type'), { target: { value: 'supermarket' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signup-submit'));
    });

    expect(mockSignupTenant).toHaveBeenCalledWith({
      name: 'Acacia Camp',
      subdomain: 'acacia-camp',
      business_type: 'supermarket',
      email: 'john@example.com',
      password: 'secret1',
      first_name: 'John',
      last_name: 'Doe',
    });
    expect(screen.getByText('Account Created!')).toBeInTheDocument();
    const link = screen.getByTestId('onboarding-link');
    expect(link).toHaveAttribute('href', '/onboarding?token=tok123');
  });

  it('shows error when the API rejects', async () => {
    mockSignupTenant.mockRejectedValue(new Error('Something went wrong'));
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByTestId('signup-business-name'), { target: { value: 'Acacia Camp' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signup-submit'));
    });

    expect(screen.getByTestId('signup-error')).toHaveTextContent('Something went wrong');
    expect(screen.queryByText('Account Created!')).not.toBeInTheDocument();
  });

  it('shows generic error when signup returns success=false', async () => {
    mockSignupTenant.mockResolvedValue({ success: false, tenant_id: '', onboarding_token: '', message: 'nope' });
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByTestId('signup-business-name'), { target: { value: 'Acacia Camp' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signup-submit'));
    });

    expect(screen.getByTestId('signup-error')).toHaveTextContent('Signup failed');
  });

  it('shows loading state on the button while submitting', async () => {
    let resolve: (v: unknown) => void = () => {};
    mockSignupTenant.mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    render(<SignupPage />);
    fireEvent.change(screen.getByTestId('signup-first-name'), { target: { value: 'John' } });
    fireEvent.change(screen.getByTestId('signup-last-name'), { target: { value: 'Doe' } });
    fireEvent.change(screen.getByTestId('signup-email'), { target: { value: 'john@example.com' } });
    fireEvent.change(screen.getByTestId('signup-password'), { target: { value: 'secret1' } });
    fireEvent.change(screen.getByTestId('signup-business-name'), { target: { value: 'Acacia Camp' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('signup-submit'));
    });

    expect(screen.getByTestId('signup-submit')).toHaveTextContent('Creating Account...');
    expect(screen.getByTestId('signup-submit')).toBeDisabled();

    await act(async () => {
      resolve({ success: true, tenant_id: 't1', onboarding_token: 'tok', message: 'ok' });
    });
    expect(screen.getByText('Account Created!')).toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════
//  OnboardingWizard
// ════════════════════════════════════════════════════════════════════════
describe('OnboardingWizard', () => {
  it('shows invalid link error when no token is present', async () => {
    mockGetOnboardingStatus.mockResolvedValue(completeStatus);
    render(<OnboardingWizard />);
    expect(await screen.findByText('Invalid onboarding link. Please sign up first.')).toBeInTheDocument();
    expect(mockGetOnboardingStatus).not.toHaveBeenCalled();
  });

  it('shows the loading state while fetching status', () => {
    mockGetOnboardingStatus.mockImplementation(() => new Promise(() => {}));
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);
    expect(screen.getByText('Loading setup wizard...')).toBeInTheDocument();
  });

  it('shows the complete screen when setup is already complete', async () => {
    mockGetOnboardingStatus.mockResolvedValue(completeStatus);
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);

    expect(await screen.findByText('Your Site is Live!')).toBeInTheDocument();
    const visitLink = screen.getByTestId('visit-site-link');
    expect(visitLink).toHaveAttribute('href', 'https://acaciacamp.sinaicamps.com');
    expect(screen.getByText('Go to Admin Dashboard')).toHaveAttribute('href', '/admin');
  });

  it('prefills profile fields and shows the profile step', async () => {
    mockGetOnboardingStatus.mockResolvedValue(onboardingStatus);
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);

    expect(await screen.findByText('Set Up Acacia Camp')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-location')).toHaveValue('Dahab');
    expect(screen.getByTestId('onboarding-phone')).toHaveValue('+20 123 456 7890');
    expect(screen.getByTestId('onboarding-description')).toHaveValue('A scenic desert camp');
    expect(screen.getByTestId('onboarding-capacity')).toHaveValue(50);
    expect(screen.getByTestId('onboarding-currency')).toHaveValue('USD');
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
  });

  it('updates form fields as the user types', async () => {
    mockGetOnboardingStatus.mockResolvedValue(onboardingStatus);
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);
    await screen.findByText('Set Up Acacia Camp');

    fireEvent.change(screen.getByTestId('onboarding-location'), { target: { value: 'Nuweiba' } });
    fireEvent.change(screen.getByTestId('onboarding-activities'), { target: { value: 'Diving, Safari' } });
    expect(screen.getByTestId('onboarding-location')).toHaveValue('Nuweiba');
    expect(screen.getByTestId('onboarding-activities')).toHaveValue('Diving, Safari');
  });

  it('saves profile and advances to the branding step', async () => {
    mockGetOnboardingStatus.mockResolvedValue(onboardingStatus);
    mockUpdateOnboardingTenant.mockResolvedValue({ success: true, tenant_id: 't1' });
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);
    await screen.findByText('Set Up Acacia Camp');

    fireEvent.change(screen.getByTestId('onboarding-location'), { target: { value: 'Nuweiba' } });
    fireEvent.change(screen.getByTestId('onboarding-capacity'), { target: { value: '75' } });
    fireEvent.change(screen.getByTestId('onboarding-currency'), { target: { value: 'EUR' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    });

    expect(mockUpdateOnboardingTenant).toHaveBeenCalledWith({
      token: 'abc',
      location: 'Nuweiba',
      phone: '+20 123 456 7890',
      description: 'A scenic desert camp',
      capacity: 75,
      currency: 'EUR',
      activities: undefined,
    });

    expect(screen.getByText('Branding', { selector: 'h2' })).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-complete')).toBeInTheDocument();
  });

  it('shows error when saving profile fails', async () => {
    mockGetOnboardingStatus.mockResolvedValue(onboardingStatus);
    mockUpdateOnboardingTenant.mockRejectedValue(new Error('Save failed'));
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);
    await screen.findByText('Set Up Acacia Camp');

    await act(async () => {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    });

    expect(screen.getByTestId('onboarding-error')).toHaveTextContent('Save failed');
    expect(screen.queryByText('Branding', { selector: 'h2' })).not.toBeInTheDocument();
  });

  it('goes back from branding to profile step', async () => {
    mockGetOnboardingStatus.mockResolvedValue(onboardingStatus);
    mockUpdateOnboardingTenant.mockResolvedValue({ success: true, tenant_id: 't1' });
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);
    await screen.findByText('Set Up Acacia Camp');

    await act(async () => {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    });
    expect(screen.getByText('Branding', { selector: 'h2' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
  });

  it('changes the primary color on the branding step', async () => {
    mockGetOnboardingStatus.mockResolvedValue(onboardingStatus);
    mockUpdateOnboardingTenant.mockResolvedValue({ success: true, tenant_id: 't1' });
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);
    await screen.findByText('Set Up Acacia Camp');

    await act(async () => {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    });
    expect(screen.getByTestId('onboarding-color')).toHaveValue('#123456');

    fireEvent.change(screen.getByTestId('onboarding-color'), { target: { value: '#dc2626' } });
    expect(screen.getByTestId('onboarding-color')).toHaveValue('#dc2626');
  });

  it('completes setup and shows the live screen', async () => {
    mockGetOnboardingStatus.mockResolvedValue(onboardingStatus);
    mockUpdateOnboardingTenant.mockResolvedValue({ success: true, tenant_id: 't1' });
    mockCompleteOnboarding.mockResolvedValue({
      success: true,
      tenant_id: 't1',
      message: 'done',
      site_url: 'https://acaciacamp.sinaicamps.com',
    });
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);
    await screen.findByText('Set Up Acacia Camp');

    await act(async () => {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    });

    fireEvent.change(screen.getByTestId('onboarding-color'), { target: { value: '#dc2626' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('onboarding-complete'));
    });

    expect(mockCompleteOnboarding).toHaveBeenCalledWith({
      token: 'abc',
      location: 'Dahab',
      phone: '+20 123 456 7890',
      description: 'A scenic desert camp',
      primary_color: '#dc2626',
      capacity: 50,
      currency: 'USD',
      activities: undefined,
    });

    expect(screen.getByText('Your Site is Live!')).toBeInTheDocument();
    const link = screen.getByTestId('visit-site-link');
    expect(link).toHaveAttribute('href', 'https://acaciacamp.sinaicamps.com');
  });

  it('shows error when completing setup fails', async () => {
    mockGetOnboardingStatus.mockResolvedValue(onboardingStatus);
    mockUpdateOnboardingTenant.mockResolvedValue({ success: true, tenant_id: 't1' });
    mockCompleteOnboarding.mockRejectedValue(new Error('Launch failed'));
    window.history.replaceState({}, '', '/?token=abc');
    render(<OnboardingWizard />);
    await screen.findByText('Set Up Acacia Camp');

    await act(async () => {
      fireEvent.click(screen.getByTestId('onboarding-next'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('onboarding-complete'));
    });

    expect(screen.getByTestId('onboarding-error')).toHaveTextContent('Launch failed');
    expect(screen.queryByText('Your Site is Live!')).not.toBeInTheDocument();
  });
});

// ════════════════════════════════════════════════════════════════════════
//  MarketplaceDirectory
// ════════════════════════════════════════════════════════════════════════
describe('MarketplaceDirectory', () => {
  it('shows a loading state with skeleton cards', async () => {
    mockGetMarketplaceCategories.mockImplementation(() => new Promise(() => {}));
    mockGetMarketplaceListings.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<MarketplaceDirectory />);
    expect(screen.getByText('Discover Camps')).toBeInTheDocument();
    expect(screen.getAllByText('', { selector: 'div.animate-pulse' }).length).toBeGreaterThan(0);
  });

  it('renders listing cards and category pills', async () => {
    mockGetMarketplaceCategories.mockResolvedValue(categories);
    mockGetMarketplaceListings.mockResolvedValue(listingsResult);
    renderWithProviders(<MarketplaceDirectory />);

    expect(await screen.findByText('Acacia Camp')).toBeInTheDocument();
    expect(await screen.findByText('Starlight Glamping')).toBeInTheDocument();
    expect(screen.getByText('Adventure Camps')).toBeInTheDocument();
    expect(screen.getByText('Luxury Glamping')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2 camps')).toBeInTheDocument();

    const viewCamp = screen.getAllByText('View Camp');
    expect(viewCamp[0].closest('a')).toHaveAttribute('href', 'https://acaciacamp.sinaicamps.com');
  });

  it('renders the reader-facing CTA for listings without a subdomain', async () => {
    mockGetMarketplaceCategories.mockResolvedValue([]);
    const noSubdomain = { ...listings[1], subdomain: '' };
    mockGetMarketplaceListings.mockResolvedValue({
      data: [noSubdomain],
      total: 1,
      page: 1,
      pageSize: 12,
      hasMore: false,
    });
    renderWithProviders(<MarketplaceDirectory />);
    const link = (await screen.findByText('View Camp')).closest('a');
    expect(link).toHaveAttribute('href', '/camp/t2');
  });

  it('shows the empty state when no listings match', async () => {
    mockGetMarketplaceCategories.mockResolvedValue([]);
    mockGetMarketplaceListings.mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 12, hasMore: false });
    renderWithProviders(<MarketplaceDirectory />);

    expect(await screen.findByText('No camps match your search')).toBeInTheDocument();
    expect(screen.getByText('No camps found')).toBeInTheDocument();
  });

  it('searches and passes the debounced query to the API', async () => {
    mockGetMarketplaceCategories.mockResolvedValue([]);
    mockGetMarketplaceListings.mockImplementation((params) => {
      if (params?.search === 'Acacia') {
        return Promise.resolve({ data: [listings[0]], total: 1, page: 1, pageSize: 12, hasMore: false });
      }
      return Promise.resolve(listingsResult);
    });
    renderWithProviders(<MarketplaceDirectory />);
    await screen.findByText('Acacia Camp');

    fireEvent.change(screen.getByLabelText('Search camps'), { target: { value: 'Acacia' } });

    await waitFor(() => {
      expect(mockGetMarketplaceListings).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'Acacia' }),
      );
    });
  });

  it('filters by category when a pill is clicked', async () => {
    mockGetMarketplaceCategories.mockResolvedValue(categories);
    mockGetMarketplaceListings.mockImplementation((params) => {
      if (params?.category === 'adventure') {
        return Promise.resolve({ data: [listings[0]], total: 1, page: 1, pageSize: 12, hasMore: false });
      }
      return Promise.resolve(listingsResult);
    });
    renderWithProviders(<MarketplaceDirectory />);
    await screen.findByText('Acacia Camp');

    fireEvent.click(screen.getByText('Adventure Camps'));

    await waitFor(() => {
      expect(mockGetMarketplaceListings).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'adventure' }),
      );
    });

    // After the category-filtered re-query, Starlight should be gone
    await waitFor(() => {
      expect(screen.queryByText('Starlight Glamping')).not.toBeInTheDocument();
    });
  });

  it('shows the error state and retries', async () => {
    mockGetMarketplaceCategories.mockResolvedValue([]);
    mockGetMarketplaceListings
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(listingsResult);
    renderWithProviders(<MarketplaceDirectory />);

    expect(await screen.findByText('Could not load camps')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Try Again'));
    expect(await screen.findByText('Acacia Camp')).toBeInTheDocument();
  });

  it('shows pagination when there are multiple pages', async () => {
    mockGetMarketplaceCategories.mockResolvedValue([]);
    mockGetMarketplaceListings.mockImplementation((params) => {
      const page = params?.page ?? 1;
      const pageData = page === 1 ? [listings[0]] : [listings[1]];
      return Promise.resolve({
        data: pageData,
        total: 13, // PAGE_SIZE (12) hardcoded in component => 2 pages
        page,
        pageSize: 12,
        hasMore: page === 1,
      });
    });
    renderWithProviders(<MarketplaceDirectory />);

    expect(await screen.findByText('Acacia Camp')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next'));

    expect(await screen.findByText('Starlight Glamping')).toBeInTheDocument();
    expect(screen.queryByText('Acacia Camp')).not.toBeInTheDocument();
  });
});
