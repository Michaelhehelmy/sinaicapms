import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import React from 'react';

function TestConsumer() {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('Hello!')}>Show</button>
      <button onClick={() => showToast('Success msg', 'success')}>Success</button>
      <button onClick={() => showToast('Error msg', 'error')}>Error</button>
      <button onClick={() => showToast('Warning msg', 'warning')}>Warning</button>
      <button onClick={() => showToast('Info msg', 'info')}>Info</button>
      <button onClick={() => showToast('With action', 'info', { action: { label: 'Undo', onClick: vi.fn() } })}>
        With Action
      </button>
      <button onClick={() => showToast('Custom duration', 'info', { duration: 500 })}>
        Custom Duration
      </button>
    </div>
  );
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when useToast is used outside ToastProvider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<TestConsumer />);
    }).toThrow('useToast must be used within a ToastProvider');
    consoleError.mockRestore();
  });

  it('shows toast message on showToast call', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByText('Hello!')).toBeInTheDocument();
  });

  it('renders toast with correct role', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders region with aria-label', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
  });

  it('shows success type toast', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Success'));
    expect(screen.getByText('Success msg')).toBeInTheDocument();
  });

  it('shows error type toast', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Error'));
    expect(screen.getByText('Error msg')).toBeInTheDocument();
  });

  it('shows warning type toast', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Warning'));
    expect(screen.getByText('Warning msg')).toBeInTheDocument();
  });

  it('shows info type toast (default)', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Info'));
    expect(screen.getByText('Info msg')).toBeInTheDocument();
  });

  it('renders action button when action is provided', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('With Action'));
    expect(screen.getByText('Undo')).toBeInTheDocument();
  });

  it('auto-dismisses toast after default duration', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByText('Hello!')).toBeInTheDocument();

    // Advance past the default 4000ms duration + 200ms animation
    act(() => {
      vi.advanceTimersByTime(4200);
    });

    // After auto-dismiss, toast should be gone
    expect(screen.queryByText('Hello!')).not.toBeInTheDocument();
  });

  it('dismiss button removes the toast', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Show'));
    expect(screen.getByText('Hello!')).toBeInTheDocument();

    const dismissBtn = screen.getByRole('button', { name: 'Dismiss notification' });
    fireEvent.click(dismissBtn);

    // Wait for exit animation (200ms)
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.queryByText('Hello!')).not.toBeInTheDocument();
  });

  it('renders with bottom-left position', () => {
    const { container } = render(
      <ToastProvider position="bottom-left">
        <TestConsumer />
      </ToastProvider>,
    );
    const region = container.querySelector('[role="region"]');
    expect(region?.className).toContain('bottom-5');
    expect(region?.className).toContain('left-5');
  });

  it('renders with top-right position by default', () => {
    const { container } = render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    const region = container.querySelector('[role="region"]');
    expect(region?.className).toContain('top-5');
    expect(region?.className).toContain('right-5');
  });

  it('shows multiple toasts', () => {
    render(
      <ToastProvider>
        <TestConsumer />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('Show'));
    fireEvent.click(screen.getByText('Success'));
    expect(screen.getByText('Hello!')).toBeInTheDocument();
    expect(screen.getByText('Success msg')).toBeInTheDocument();
  });
});
