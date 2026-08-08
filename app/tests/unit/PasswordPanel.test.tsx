import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PasswordPanel from '@/components/admin/PasswordPanel';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/api', () => ({
  changePassword: vi.fn(),
}));

import * as api from '@/lib/api';
const mockChangePassword = vi.mocked(api.changePassword);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PasswordPanel', () => {
  it('renders password form fields', () => {
    render(<PasswordPanel />);
    expect(screen.getByLabelText('Current Password')).toBeInTheDocument();
    expect(screen.getByLabelText('New Password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm New Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeInTheDocument();
  });

  it('shows helper text for new password', () => {
    render(<PasswordPanel />);
    expect(screen.getByText('Must be at least 8 characters')).toBeInTheDocument();
  });

  it('validates current password is required', async () => {
    render(<PasswordPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    await waitFor(() => {
      expect(screen.getByText('Current password is required')).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('validates new password minimum length', async () => {
    render(<PasswordPanel />);
    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('validates passwords must match', async () => {
    render(<PasswordPanel />);
    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    await waitFor(() => {
      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
    expect(mockChangePassword).not.toHaveBeenCalled();
  });

  it('submits password change successfully', async () => {
    mockChangePassword.mockResolvedValue({ success: true });
    render(<PasswordPanel />);
    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith('oldpass123', 'newpass123');
      expect(mockShowToast).toHaveBeenCalledWith('Password changed successfully!', 'success');
    });
  });

  it('handles server rejection', async () => {
    mockChangePassword.mockResolvedValue({ success: false });
    render(<PasswordPanel />);
    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error'), 'error');
    });
  });

  it('handles API error', async () => {
    mockChangePassword.mockRejectedValue(new Error('Network error'));
    render(<PasswordPanel />);
    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'oldpass123' } });
    fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'newpass123' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error changing password: Network error', 'error');
    });
  });

  it('clears form after successful change', async () => {
    mockChangePassword.mockResolvedValue({ success: true });
    render(<PasswordPanel />);
    const currentInput = screen.getByLabelText('Current Password');
    const newInput = screen.getByLabelText('New Password');
    const confirmInput = screen.getByLabelText('Confirm New Password');
    fireEvent.change(currentInput, { target: { value: 'oldpass123' } });
    fireEvent.change(newInput, { target: { value: 'newpass123' } });
    fireEvent.change(confirmInput, { target: { value: 'newpass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }));
    await waitFor(() => {
      expect(currentInput).toHaveValue('');
      expect(newInput).toHaveValue('');
      expect(confirmInput).toHaveValue('');
    });
  });
});
