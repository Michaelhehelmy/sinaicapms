import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Phase 4d — POS login project picker + shell project name (design §6.3).
// Picker states: single ⇒ none; multi ⇒ picker; null ⇒ picker;
// mismatch ⇒ blocked quoting the server binding; server 4xx ⇒ surfaced.

vi.mock('@/lib/api', () => ({
  posLogin: vi.fn(),
  getCamps: vi.fn(),
}));

vi.mock('@/lib/posUrl', () => ({
  posUrl: (path: string) => path,
}));

vi.mock('@/hooks/usePosQueries', () => ({
  posKeys: { all: ['pos'] },
  usePosActiveShift: () => ({
    data: {
      active: true,
      shift: { id: 'sh1', status: 'open', openingTime: '2026-09-24T08:00:00Z', openingCash: 100 },
    },
    isLoading: false,
  }),
  usePosDashboard: () => ({
    data: { todayRevenue: 0, todayOrders: 0, activeProducts: 0, recentOrders: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import * as api from '@/lib/api';
import { session } from '@/lib/session';
import LoginView from '@/components/pos/views/LoginView';
import POSApp, { posProjectLabel } from '@/components/pos/POSApp';

const mockPosLogin = vi.mocked(api.posLogin);
const mockGetCamps = vi.mocked(api.getCamps);

const CAMP = { id: 'p_camp', tenantId: 't1', name: 'Camp' };
const REST = { id: 'p_rest', tenantId: 't1', name: 'Restaurant' };

function boundUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cash1',
    username: 'cashier',
    email: 'cash@test.com',
    firstName: 'Camp',
    lastName: 'Cashier',
    role: 'cashier',
    organizationId: 1,
    storeId: 1,
    projectId: 'p_camp',
    taxRate: 0.1,
    ...overrides,
  };
}

async function submitCredentials() {
  fireEvent.change(screen.getByTestId('pos-identifier'), { target: { value: 'cashier' } });
  fireEvent.change(screen.getByTestId('pos-password'), { target: { value: 'pass1234' } });
  fireEvent.click(screen.getByTestId('pos-signin-btn'));
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

// ─── single ⇒ none ────────────────────────────────────────────
describe('single-store login skips the picker', () => {
  it('bound project + one project ⇒ no picker, implicit active project recorded', async () => {
    mockPosLogin.mockResolvedValue({
      success: true,
      token: 'tok',
      refreshToken: 'rt',
      user: boundUser(),
    } as never);
    mockGetCamps.mockResolvedValue([CAMP] as never);

    const onLogin = vi.fn();
    render(<LoginView onLogin={onLogin} />);
    await submitCredentials();

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
    const [user, token] = onLogin.mock.calls[0];
    expect(token).toBe('tok');
    expect(user.activeProjectId).toBe('p_camp');
    expect(user.activeProjectName).toBe('Camp');
    expect(screen.queryByTestId('pos-project-picker')).toBeNull();
    // Persisted for the shell header across reloads.
    expect(session.getUser<Record<string, unknown>>('pos')).toMatchObject({
      activeProjectId: 'p_camp',
      activeProjectName: 'Camp',
    });
  });
});

// ─── multi ⇒ picker ───────────────────────────────────────────
describe('multi-project login shows the picker', () => {
  it('lists tenant projects with the bound one assigned, confirm proceeds', async () => {
    mockPosLogin.mockResolvedValue({
      success: true,
      token: 'tok',
      refreshToken: 'rt',
      user: boundUser(),
    } as never);
    mockGetCamps.mockResolvedValue([CAMP, REST] as never);

    const onLogin = vi.fn();
    render(<LoginView onLogin={onLogin} />);
    await submitCredentials();

    await waitFor(() => {
      expect(screen.getByTestId('pos-project-picker')).toBeInTheDocument();
    });
    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByText('Camp')).toBeInTheDocument();
    expect(screen.getByText('Restaurant')).toBeInTheDocument();
    expect(screen.getByText('Assigned')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pos-picker-confirm'));
    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
    expect(onLogin.mock.calls[0][0]).toMatchObject({
      activeProjectId: 'p_camp',
      activeProjectName: 'Camp',
    });
  });
});

// ─── null ⇒ picker ────────────────────────────────────────────
describe('null project binding shows the picker', () => {
  it('unbound cashier picks explicitly, no assigned badge', async () => {
    mockPosLogin.mockResolvedValue({
      success: true,
      token: 'tok',
      refreshToken: 'rt',
      user: boundUser({ storeId: 1, projectId: null }),
    } as never);
    mockGetCamps.mockResolvedValue([CAMP] as never);

    const onLogin = vi.fn();
    render(<LoginView onLogin={onLogin} />);
    await submitCredentials();

    await waitFor(() => {
      expect(screen.getByTestId('pos-project-picker')).toBeInTheDocument();
    });
    expect(screen.queryByText('Assigned')).toBeNull();

    fireEvent.click(screen.getByTestId('pos-project-option-p_camp'));
    fireEvent.click(screen.getByTestId('pos-picker-confirm'));
    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
    expect(onLogin.mock.calls[0][0]).toMatchObject({
      activeProjectId: 'p_camp',
      activeProjectName: 'Camp',
    });
  });
});

// ─── mismatch ⇒ blocked, server binding quoted ────────────────
describe('mismatched pick is blocked', () => {
  it('selecting outside the server-bound project errors and never logs in', async () => {
    mockPosLogin.mockResolvedValue({
      success: true,
      token: 'tok',
      refreshToken: 'rt',
      user: boundUser(),
    } as never);
    mockGetCamps.mockResolvedValue([CAMP, REST] as never);

    const onLogin = vi.fn();
    render(<LoginView onLogin={onLogin} />);
    await submitCredentials();

    await waitFor(() => {
      expect(screen.getByTestId('pos-project-picker')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('pos-project-option-p_rest'));
    fireEvent.click(screen.getByTestId('pos-picker-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('pos-picker-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('pos-picker-error').textContent).toMatch(/server bound/);
    expect(screen.getByTestId('pos-picker-error').textContent).toMatch(/403/);
    expect(onLogin).not.toHaveBeenCalled();
  });
});

// ─── server 4xx ⇒ surfaced ────────────────────────────────────
describe('directory server errors surface', () => {
  it('getCamps 403 shows the server message with retry + continue escape', async () => {
    mockPosLogin.mockResolvedValue({
      success: true,
      token: 'tok',
      refreshToken: 'rt',
      user: boundUser(),
    } as never);
    const serverErr = Object.assign(new Error('Forbidden: project scope mismatch'), { status: 403 });
    mockGetCamps.mockRejectedValueOnce(serverErr);

    const onLogin = vi.fn();
    render(<LoginView onLogin={onLogin} />);
    await submitCredentials();

    await waitFor(() => {
      expect(screen.getByTestId('pos-directory-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('pos-directory-error-text').textContent).toMatch(
      /Forbidden: project scope mismatch/,
    );
    expect(onLogin).not.toHaveBeenCalled();

    // Retry recovers into the implicit path (single project).
    mockGetCamps.mockResolvedValueOnce([CAMP] as never);
    fireEvent.click(screen.getByTestId('pos-directory-retry'));
    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
  });

  it('continue-without-selection escape proceeds implicit on persistent outage', async () => {
    mockPosLogin.mockResolvedValue({
      success: true,
      token: 'tok',
      refreshToken: 'rt',
      user: boundUser(),
    } as never);
    mockGetCamps.mockRejectedValue(new Error('Server error (500): non-JSON response'));

    const onLogin = vi.fn();
    render(<LoginView onLogin={onLogin} />);
    await submitCredentials();

    await waitFor(() => {
      expect(screen.getByTestId('pos-picker-continue')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('pos-picker-continue'));
    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
  });
});

// ─── shell project name ───────────────────────────────────────
describe('posProjectLabel', () => {
  it('prefers the recorded active project name', () => {
    expect(
      posProjectLabel({ ...boundUser(), activeProjectName: 'Camp' } as never),
    ).toBe('Camp');
  });

  it('falls back to the raw project id', () => {
    expect(posProjectLabel(boundUser() as never)).toBe('Project p_camp');
  });

  it('returns null with no project context', () => {
    expect(
      posProjectLabel(boundUser({ projectId: null, activeProjectId: null }) as never),
    ).toBeNull();
  });
});

describe('POS shell header', () => {
  it('shows the active project name from the session', async () => {
    session.setTokens('pos', 'tok', 'rt');
    session.setUser('pos', boundUser({ activeProjectId: 'p_camp', activeProjectName: 'Camp' }));
    render(<POSApp />);
    await waitFor(() => {
      expect(screen.getByTestId('pos-project-name')).toBeInTheDocument();
    });
    expect(screen.getByTestId('pos-project-name').textContent).toBe('Camp');
    expect(mockGetCamps).not.toHaveBeenCalled();
  });

  it('backfills the name from the directory for legacy sessions', async () => {
    session.setTokens('pos', 'tok', 'rt');
    session.setUser('pos', boundUser());
    mockGetCamps.mockResolvedValue([CAMP, REST] as never);
    render(<POSApp />);
    await waitFor(() => {
      expect(screen.getByTestId('pos-project-name').textContent).toBe('Camp');
    });
  });

  it('omits the label with no project context', async () => {
    session.setTokens('pos', 'tok', 'rt');
    session.setUser('pos', boundUser({ projectId: null, activeProjectId: null }));
    render(<POSApp />);
    await waitFor(() => {
      expect(screen.getByTestId('pos-sidebar')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('pos-project-name')).toBeNull();
  });
});
