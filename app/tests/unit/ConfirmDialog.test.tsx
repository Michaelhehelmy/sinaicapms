import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    open: true,
    title: 'Delete Item',
    message: 'Are you sure you want to delete this?',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  it('renders nothing when open is false', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} open={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders title and message when open', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Delete Item')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to delete this?')).toBeInTheDocument();
  });

  it('renders default confirm and cancel labels', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders custom confirm and cancel labels', () => {
    render(
      <ConfirmDialog
        {...defaultProps}
        confirmLabel="Yes, Delete"
        cancelLabel="No, Keep"
      />,
    );
    expect(screen.getByText('Yes, Delete')).toBeInTheDocument();
    expect(screen.getByText('No, Keep')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay is clicked', () => {
    const onCancel = vi.fn();
    const { container } = render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    // Click the overlay (the fixed positioning outer div)
    const overlay = container.querySelector('.fixed.inset-0');
    fireEvent.click(overlay!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel when dialog content is clicked', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText('Delete Item'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape is pressed', () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...defaultProps} onCancel={onCancel} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders warning icon', () => {
    const { container } = render(<ConfirmDialog {...defaultProps} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders danger variant confirm button with red styling', () => {
    render(<ConfirmDialog {...defaultProps} danger />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-red-600');
  });

  it('renders non-danger confirm button with green styling', () => {
    render(<ConfirmDialog {...defaultProps} danger={false} />);
    const confirmBtn = screen.getByText('Confirm');
    expect(confirmBtn.className).toContain('bg-green-600');
  });

  it('traps focus with Tab (wraps from last focusable to first)', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const panel = document.querySelector('.fixed.inset-0')!.parentElement!;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    expect(focusables.length).toBeGreaterThanOrEqual(2);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(first).toHaveFocus();
  });

  it('traps focus with Shift+Tab (wraps from first focusable to last)', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const panel = document.querySelector('.fixed.inset-0')!.parentElement!;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
  });

  it('focuses the confirm button when opened', async () => {
    render(<ConfirmDialog {...defaultProps} />);
    await waitFor(() => expect(screen.getByText('Confirm')).toHaveFocus());
  });
});
