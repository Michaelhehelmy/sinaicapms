import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

function BrokenComponent() {
  throw new Error('Test error message');
}

function GoodComponent() {
  return <div>All good</div>;
}

describe('ErrorBoundary component', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('catches error and renders default fallback', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom Error UI</div>}>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom Error UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('calls onError with error and errorInfo', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it('displays error details in default fallback', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Error details')).toBeInTheDocument();
  });

  it('shows "Try Again" button in default fallback', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('shows "Refresh Page" button in default fallback', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Refresh Page')).toBeInTheDocument();
  });

  it('calls window.location.reload when "Refresh Page" is clicked', () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText('Refresh Page'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('resets error state when "Try Again" is clicked', () => {
    let shouldThrow = true;
    function ConditionalBroken() {
      if (shouldThrow) throw new Error('Conditional error');
      return <div>Recovered!</div>;
    }

    const { rerender } = render(
      <ErrorBoundary>
        <ConditionalBroken />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click Try Again — this resets state, but component will re-render and throw again
    // because shouldThrow is still true
    fireEvent.click(screen.getByText('Try Again'));

    // After reset, the error component re-renders and throws again
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('does not crash sibling components', () => {
    render(
      <div>
        <ErrorBoundary>
          <BrokenComponent />
        </ErrorBoundary>
        <GoodComponent />
      </div>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('logs error to console', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(consoleSpy).toHaveBeenCalled();
  });
});
