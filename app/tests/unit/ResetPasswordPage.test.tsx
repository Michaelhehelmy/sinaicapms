import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResetPasswordPage from '@/components/admin/ResetPasswordPage';

const mockResetPassword = vi.fn();

vi.mock('@/lib/api', () => ({
  resetPassword: (...args: unknown[]) => mockResetPassword(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', {
    value: { search: '', hostname: 'localhost' },
    writable: true,
  });
});

describe('ResetPasswordPage', () => {
  it('shows token missing error when no token in URL', () => {
    render(<ResetPasswordPage />);
    expect(screen.getByText('No reset token found. Please request a new password reset link.')).toBeInTheDocument();
  });

  it('renders form when token is present', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=abc123', hostname: 'localhost' },
      writable: true,
    });
    render(<ResetPasswordPage />);
    expect(screen.getByText('Reset Your Password')).toBeInTheDocument();
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBe(2);
    expect(screen.getByText('Reset Password')).toBeInTheDocument();
  });

  it('hides form when token is missing', () => {
    render(<ResetPasswordPage />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    expect(passwordInputs.length).toBe(0);
  });

  it('shows error when password is too short', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=abc123', hostname: 'localhost' },
      writable: true,
    });
    render(<ResetPasswordPage />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0], { target: { value: 'short' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=abc123', hostname: 'localhost' },
      writable: true,
    });
    render(<ResetPasswordPage />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'different1' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('calls API on valid submission', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=abc123', hostname: 'localhost' },
      writable: true,
    });
    mockResetPassword.mockResolvedValueOnce({ success: true });
    render(<ResetPasswordPage />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(mockResetPassword).toHaveBeenCalledWith('abc123', 'password123');
    });
  });

  it('shows success state after successful reset', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=abc123', hostname: 'localhost' },
      writable: true,
    });
    mockResetPassword.mockResolvedValueOnce({ success: true });
    render(<ResetPasswordPage />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Password Reset Successfully')).toBeInTheDocument();
      expect(screen.getByText('Go to Login')).toBeInTheDocument();
    });
  });

  it('shows error on API failure', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=abc123', hostname: 'localhost' },
      writable: true,
    });
    mockResetPassword.mockRejectedValueOnce(new Error('Invalid token'));
    render(<ResetPasswordPage />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Failed to reset password. The link may be expired or invalid.')).toBeInTheDocument();
    });
  });

  it('shows error when API returns non-success', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=abc123', hostname: 'localhost' },
      writable: true,
    });
    mockResetPassword.mockResolvedValueOnce({ success: false });
    render(<ResetPasswordPage />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Failed to reset password. The link may be expired or invalid.')).toBeInTheDocument();
    });
  });

  it('shows Loading state while request is pending', async () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=abc123', hostname: 'localhost' },
      writable: true,
    });
    mockResetPassword.mockReturnValueOnce(new Promise(() => {}));
    render(<ResetPasswordPage />);
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(passwordInputs[0], { target: { value: 'password123' } });
    fireEvent.change(passwordInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Reset Password'));
    await waitFor(() => {
      expect(screen.getByText('Resetting...')).toBeInTheDocument();
    });
    expect(screen.getByText('Resetting...').closest('button')).toBeDisabled();
  });

  it('contains Back to Login link', () => {
    Object.defineProperty(window, 'location', {
      value: { search: '?token=abc123', hostname: 'localhost' },
      writable: true,
    });
    render(<ResetPasswordPage />);
    const backLink = screen.getByText(/Back to Login/);
    expect(backLink).toHaveAttribute('href', '/login');
  });
});
