import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Error Boundary Component ──────────────────────────────
class TestErrorBoundary extends React.Component<
  { fallback?: React.ReactNode; children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || <div>Something went wrong</div>;
    }
    return this.props.children;
  }
}

// ── Component that throws ─────────────────────────────────
function BrokenComponent() {
  throw new Error('Test error');
}

// ── Component that renders fine ───────────────────────────
function GoodComponent() {
  return <div>Hello World</div>;
}

describe('React Error Boundary', () => {
  it('renders children when no error', () => {
    render(
      <TestErrorBoundary>
        <GoodComponent />
      </TestErrorBoundary>
    );
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('catches error and renders fallback', () => {
    render(
      <TestErrorBoundary fallback={<div>Error occurred</div>}>
        <BrokenComponent />
      </TestErrorBoundary>
    );
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('renders default fallback when no fallback prop', () => {
    render(
      <TestErrorBoundary>
        <BrokenComponent />
      </TestErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('calls onError callback with the error', () => {
    const onError = vi.fn();
    render(
      <TestErrorBoundary onError={onError}>
        <BrokenComponent />
      </TestErrorBoundary>
    );
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('does not crash sibling components', () => {
    const { container } = render(
      <div>
        <TestErrorBoundary>
          <BrokenComponent />
        </TestErrorBoundary>
        <GoodComponent />
      </div>
    );
    expect(screen.getByText('Hello World')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });
});

// ── Loading State Tests ───────────────────────────────────
describe('Loading States', () => {
  it('shows loading indicator during async operations', async () => {
    function AsyncComponent() {
      const [loading, setLoading] = React.useState(true);
      React.useEffect(() => {
        const timer = setTimeout(() => setLoading(false), 100);
        return () => clearTimeout(timer);
      }, []);
      return <div>{loading ? 'Loading...' : 'Done'}</div>;
    }

    render(<AsyncComponent />);
    expect(screen.getByText('Loading...')).toBeTruthy();

    // Wait for loading to finish
    await vi.waitFor(() => {
      expect(screen.getByText('Done')).toBeTruthy();
    });
  });

  it('button shows disabled state during submission', () => {
    function SubmitButton() {
      const [submitting, setSubmitting] = React.useState(false);
      return (
        <button
          disabled={submitting}
          onClick={() => setSubmitting(true)}
        >
          {submitting ? 'Submitting...' : 'Submit'}
        </button>
      );
    }

    render(<SubmitButton />);
    const btn = screen.getByRole('button');
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(btn).toBeDisabled();
    expect(screen.getByText('Submitting...')).toBeTruthy();
  });
});

// ── Form Validation Tests ─────────────────────────────────
describe('Form Validation', () => {
  it('prevents form submission with empty required fields', () => {
    const onSubmit = vi.fn();
    render(
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <input name="name" required aria-label="Name" />
        <button type="submit">Submit</button>
      </form>
    );

    const btn = screen.getByRole('button', { name: 'Submit' });
    fireEvent.click(btn);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('allows form submission with all required fields filled', () => {
    const onSubmit = vi.fn();
    render(
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <input name="name" required aria-label="Name" defaultValue="Test" />
        <button type="submit">Submit</button>
      </form>
    );

    const btn = screen.getByRole('button', { name: 'Submit' });
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

// ── Empty State Tests ─────────────────────────────────────
describe('Empty States', () => {
  it('shows empty message when list is empty', () => {
    function EmptyList({ items }: { items: string[] }) {
      if (items.length === 0) return <div>No items found</div>;
      return <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>;
    }

    render(<EmptyList items={[]} />);
    expect(screen.getByText('No items found')).toBeTruthy();
  });

  it('shows items when list has data', () => {
    function EmptyList({ items }: { items: string[] }) {
      if (items.length === 0) return <div>No items found</div>;
      return <ul>{items.map(i => <li key={i}>{i}</li>)}</ul>;
    }

    render(<EmptyList items={['Item 1', 'Item 2']} />);
    expect(screen.getByText('Item 1')).toBeTruthy();
    expect(screen.getByText('Item 2')).toBeTruthy();
  });
});
