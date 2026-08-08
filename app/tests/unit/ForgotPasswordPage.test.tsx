import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ForgotPasswordPage from '@/components/admin/ForgotPasswordPage';

const mockForgotPassword = vi.fn();

vi.mock('@/lib/api', () => ({
  forgotPassword: (...args: unknown[]) => mockForgotPassword(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPasswordPage', () => {
  it('renders the form with email input and submit button', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByText('Forgot Your Password?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByText('Send Reset Link')).toBeInTheDocument();
  });

  it('shows error when email is empty on submit', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    });
    expect(mockForgotPassword).not.toHaveBeenCalled();
  });

  it('shows error when email is whitespace only', async () => {
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
    });
  });

  it('calls API and shows sent state on success', async () => {
    mockForgotPassword.mockResolvedValueOnce({});
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
    expect(mockForgotPassword).toHaveBeenCalledWith('test@example.com');
  });

  it('shows sent state even on API error', async () => {
    mockForgotPassword.mockRejectedValueOnce(new Error('Network error'));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
  });

  it('displays the submitted email in the success message', async () => {
    mockForgotPassword.mockResolvedValueOnce({});
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@domain.com' },
    });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
      expect(screen.getByText('user@domain.com')).toBeInTheDocument();
    });
  });

  it('shows Loading state while request is pending', async () => {
    mockForgotPassword.mockReturnValueOnce(new Promise(() => {}));
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeInTheDocument();
    });
    expect(screen.getByText('Sending...').closest('button')).toBeDisabled();
  });

  it('contains Back to Login link on form page', () => {
    render(<ForgotPasswordPage />);
    const backLink = screen.getByText(/Back to Login/);
    expect(backLink).toHaveAttribute('href', '/login');
  });

  it('contains Back to Login link on success page', async () => {
    mockForgotPassword.mockResolvedValueOnce({});
    render(<ForgotPasswordPage />);
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.click(screen.getByText('Send Reset Link'));
    await waitFor(() => {
      expect(screen.getByText('Check Your Email')).toBeInTheDocument();
    });
    const loginLink = screen.getByText(/Back to Login/);
    expect(loginLink).toHaveAttribute('href', '/login');
  });
});
