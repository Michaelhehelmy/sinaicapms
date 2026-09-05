import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginForm } from '@/components/shell/LoginForm';

vi.mock('@/lib/api', () => ({
  posLogin: vi.fn(),
}));

vi.mock('@/lib/session', () => ({
  session: { setTokens: vi.fn(), setUser: vi.fn() },
}));

import * as apiClient from '@/lib/api';
import { session } from '@/lib/session';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('LoginForm', () => {
  it('throws for admin realm without onAdminSubmit', () => {
    expect(() => {
      render(<LoginForm realm="admin" />);
    }).toThrow('LoginForm realm="admin" requires onAdminSubmit');
  });

  it('throws for pos realm without onPosSuccess', () => {
    expect(() => {
      render(<LoginForm realm="pos" />);
    }).toThrow('LoginForm realm="pos" requires onPosSuccess');
  });

  it('renders POS login form', () => {
    render(<LoginForm realm="pos" onPosSuccess={vi.fn()} />);
    expect(screen.getByTestId('pos-login')).toBeTruthy();
    expect(screen.getByTestId('pos-login-form')).toBeTruthy();
  });

  it('renders admin login form', () => {
    render(<LoginForm realm="admin" onAdminSubmit={vi.fn()} />);
    expect(screen.getByTestId('login-overlay')).toBeTruthy();
  });

  it('POS login shows error on failure', async () => {
    (apiClient.posLogin as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Wrong credentials'));
    render(<LoginForm realm="pos" onPosSuccess={vi.fn()} />);

    fireEvent.change(screen.getByTestId('pos-identifier'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByTestId('pos-password'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByTestId('pos-signin-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('pos-login-error')).toBeTruthy();
    });
  });

  it('POS login calls session.setTokens on success', async () => {
    const mockUser = { id: 1, name: 'Test' };
    (apiClient.posLogin as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
      token: 'tok123',
      user: mockUser,
    });
    const onSuccess = vi.fn();
    render(<LoginForm realm="pos" onPosSuccess={onSuccess} />);

    fireEvent.change(screen.getByTestId('pos-identifier'), { target: { value: 'user@test.com' } });
    fireEvent.change(screen.getByTestId('pos-password'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByTestId('pos-signin-btn'));

    await waitFor(() => {
      expect(session.setTokens).toHaveBeenCalledWith('pos', 'tok123');
      expect(session.setUser).toHaveBeenCalledWith('pos', mockUser);
      expect(onSuccess).toHaveBeenCalledWith(mockUser, 'tok123');
    });
  });

  it('POS login shows error when success=false', async () => {
    (apiClient.posLogin as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: false,
      token: '',
      user: null,
    });
    render(<LoginForm realm="pos" onPosSuccess={vi.fn()} />);

    fireEvent.change(screen.getByTestId('pos-identifier'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByTestId('pos-password'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByTestId('pos-signin-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('pos-login-error')).toBeTruthy();
    });
  });

  it('admin login shows validation error for empty fields', async () => {
    const onAdminSubmit = vi.fn();
    render(<LoginForm realm="admin" onAdminSubmit={onAdminSubmit} />);

    // The inputs have `required` + `type="email"` attributes which prevent
    // native form submit when empty/invalid. Use `fireEvent.submit` on the
    // <form> element to bypass native validation and trigger the React handler.
    const form = screen.getByTestId('login-email').closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeTruthy();
    });
  });

  it('admin login shows error on failed submit', async () => {
    const onAdminSubmit = vi.fn().mockResolvedValue({ success: false, error: 'Invalid' });
    render(<LoginForm realm="admin" onAdminSubmit={onAdminSubmit} />);

    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('login-error')).toBeTruthy();
    });
  });

  it('admin login success hides error', async () => {
    const onAdminSubmit = vi.fn().mockResolvedValue({ success: true });
    render(<LoginForm realm="admin" onAdminSubmit={onAdminSubmit} />);

    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(onAdminSubmit).toHaveBeenCalled();
    });
  });

  it('POS login disabled while loading', async () => {
    (apiClient.posLogin as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));
    render(<LoginForm realm="pos" onPosSuccess={vi.fn()} />);

    fireEvent.change(screen.getByTestId('pos-identifier'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByTestId('pos-password'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByTestId('pos-signin-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('pos-signin-btn')).toBeDisabled();
    });
  });

  it('admin login disabled while loading', async () => {
    const onAdminSubmit = vi.fn().mockImplementation(() => new Promise(() => {}));
    render(<LoginForm realm="admin" onAdminSubmit={onAdminSubmit} />);

    fireEvent.change(screen.getByTestId('login-email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByTestId('login-password'), { target: { value: 'pass1234' } });
    fireEvent.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('login-submit')).toBeDisabled();
    });
  });
});
