import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormModal } from '@/components/ui/FormModal';

describe('FormModal', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <FormModal open={false} title="Edit" onClose={vi.fn()} onSubmit={vi.fn()}>
        <p>Form content</p>
      </FormModal>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows title and children when open', () => {
    render(
      <FormModal open={true} title="Edit User" onClose={vi.fn()} onSubmit={vi.fn()}>
        <p>Form content</p>
      </FormModal>,
    );
    expect(screen.getByText('Edit User')).toBeInTheDocument();
    expect(screen.getByText('Form content')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  it('calls onClose when Cancel button clicked', () => {
    const onClose = vi.fn();
    render(
      <FormModal open={true} title="Edit" onClose={onClose} onSubmit={vi.fn()}>
        <p>Content</p>
      </FormModal>,
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSubmit when Save button clicked', () => {
    const onSubmit = vi.fn();
    render(
      <FormModal open={true} title="Edit" onClose={vi.fn()} onSubmit={onSubmit}>
        <p>Content</p>
      </FormModal>,
    );
    fireEvent.click(screen.getByText('Save'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables submit button when submitDisabled is true', () => {
    render(
      <FormModal open={true} title="Edit" onClose={vi.fn()} onSubmit={vi.fn()} submitDisabled>
        <p>Content</p>
      </FormModal>,
    );
    const submitBtn = screen.getByRole('button', { name: 'Save' });
    expect(submitBtn).toBeDisabled();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <FormModal open={true} title="Edit" onClose={onClose} onSubmit={vi.fn()}>
        <p>Content</p>
      </FormModal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when closeOnEscape is false', () => {
    const onClose = vi.fn();
    render(
      <FormModal open={true} title="Edit" onClose={onClose} onSubmit={vi.fn()} closeOnEscape={false}>
        <p>Content</p>
      </FormModal>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes when clicking the overlay backdrop', () => {
    const onClose = vi.fn();
    render(
      <FormModal open={true} title="Edit" onClose={onClose} onSubmit={vi.fn()}>
        <p>Content</p>
      </FormModal>,
    );
    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close when clicking the overlay with closeOnOverlayClick false', () => {
    const onClose = vi.fn();
    render(
      <FormModal open={true} title="Edit" onClose={onClose} onSubmit={vi.fn()} closeOnOverlayClick={false}>
        <p>Content</p>
      </FormModal>,
    );
    fireEvent.click(screen.getByTestId('modal-overlay'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
