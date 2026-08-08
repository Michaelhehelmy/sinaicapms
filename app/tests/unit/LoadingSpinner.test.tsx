import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders with default md size', () => {
    const { container } = render(<LoadingSpinner />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg?.classList.contains('animate-spin')).toBe(true);
  });

  it('renders with sm size', () => {
    const { container } = render(<LoadingSpinner size="sm" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders with lg size', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders text when provided', () => {
    render(<LoadingSpinner text="Loading data..." />);
    expect(screen.getByText('Loading data...')).toBeInTheDocument();
  });

  it('does not render text when not provided', () => {
    const { container } = render(<LoadingSpinner />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });
});
