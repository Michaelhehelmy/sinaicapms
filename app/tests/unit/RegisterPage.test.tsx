import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RegisterPage from '@/components/admin/RegisterPage';

const mockRegisterUser = vi.fn();
const mockGetTenantId = vi.fn().mockReturnValue('test-tenant');

vi.mock('@/lib/api', () => ({
  registerUser: (...args: unknown[]) => mockRegisterUser(...args),
  getTenantId: () => mockGetTenantId(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, 'location', {
    value: { search: '', hostname: 'localhost' },
    writable: true,
  });
});

describe('RegisterPage', () => {
  it('renders the registration form', () => {
    render(<RegisterPage />);
    expect(screen.getByText('Create Your Account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByText('Register')).toBeInTheDocument();
  });

  it('shows error when name is empty', async () => {
    render(<RegisterPage />);
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(screen.getByText('Full name is required')).toBeInTheDocument();
    });
    expect(mockRegisterUser).not.toHaveBeenCalled();
  });

  it('shows error when email is empty', async () => {
    render(<RegisterPage />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'John' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });
  });

  it('shows error when password is too short', async () => {
    render(<RegisterPage />);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'John' } });
    fireEvent.change(textboxes[1], { target: { value: 'john@test.com' } });
    const allInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(allInputs[0], { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
  });

  it('shows error when passwords do not match', async () => {
    render(<RegisterPage />);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'John' } });
    fireEvent.change(textboxes[1], { target: { value: 'john@test.com' } });
    const allInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(allInputs[0], { target: { value: 'password123' } });
    fireEvent.change(allInputs[1], { target: { value: 'different' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  it('calls API with correct data on valid submission', async () => {
    mockRegisterUser.mockResolvedValueOnce({ success: true });
    render(<RegisterPage />);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'John Doe' } });
    fireEvent.change(textboxes[1], { target: { value: 'john@test.com' } });
    const allInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(allInputs[0], { target: { value: 'password123' } });
    fireEvent.change(allInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(mockRegisterUser).toHaveBeenCalledWith({
        name: 'John Doe',
        email: 'john@test.com',
        password: 'password123',
        tenantId: 'test-tenant',
      });
    });
  });

  it('shows success state after successful registration', async () => {
    mockRegisterUser.mockResolvedValueOnce({ success: true });
    render(<RegisterPage />);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'John Doe' } });
    fireEvent.change(textboxes[1], { target: { value: 'john@test.com' } });
    const allInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(allInputs[0], { target: { value: 'password123' } });
    fireEvent.change(allInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(screen.getByText('Registration Successful')).toBeInTheDocument();
      expect(screen.getByText('Go to Login')).toBeInTheDocument();
    });
  });

  it('shows error on API failure', async () => {
    mockRegisterUser.mockRejectedValueOnce(new Error('Network error'));
    render(<RegisterPage />);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'John Doe' } });
    fireEvent.change(textboxes[1], { target: { value: 'john@test.com' } });
    const allInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(allInputs[0], { target: { value: 'password123' } });
    fireEvent.change(allInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(screen.getByText('Registration failed. Please try again or contact support.')).toBeInTheDocument();
    });
  });

  it('shows error when API returns non-success', async () => {
    mockRegisterUser.mockResolvedValueOnce({ success: false });
    render(<RegisterPage />);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'John Doe' } });
    fireEvent.change(textboxes[1], { target: { value: 'john@test.com' } });
    const allInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(allInputs[0], { target: { value: 'password123' } });
    fireEvent.change(allInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(screen.getByText('Registration failed. Please try again or contact support.')).toBeInTheDocument();
    });
  });

  it('shows Loading state while request is pending', async () => {
    mockRegisterUser.mockReturnValueOnce(new Promise(() => {}));
    render(<RegisterPage />);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'John Doe' } });
    fireEvent.change(textboxes[1], { target: { value: 'john@test.com' } });
    const allInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(allInputs[0], { target: { value: 'password123' } });
    fireEvent.change(allInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      expect(screen.getByText('Registering...')).toBeInTheDocument();
    });
    expect(screen.getByText('Registering...').closest('button')).toBeDisabled();
  });

  it('contains Login link', () => {
    render(<RegisterPage />);
    const loginLink = screen.getByText('Login');
    expect(loginLink).toHaveAttribute('href', '/login');
  });

  it('contains Go to Login link on success page', async () => {
    mockRegisterUser.mockResolvedValueOnce({ success: true });
    render(<RegisterPage />);
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0], { target: { value: 'John' } });
    fireEvent.change(textboxes[1], { target: { value: 'john@test.com' } });
    const allInputs = document.querySelectorAll('input[type="password"]');
    fireEvent.change(allInputs[0], { target: { value: 'password123' } });
    fireEvent.change(allInputs[1], { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Register'));
    await waitFor(() => {
      const goToLogin = screen.getByText('Go to Login');
      expect(goToLogin).toHaveAttribute('href', '/login');
    });
  });
});
