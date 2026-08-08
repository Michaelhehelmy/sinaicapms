import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import {
  Skeleton,
  DashboardSkeleton,
  TableSkeleton,
  ProductGridSkeleton,
  POSDashboardSkeleton,
} from '@/components/ui/Skeleton';

describe('Skeleton', () => {
  it('renders rect variant by default', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  it('renders text variant', () => {
    const { container } = render(<Skeleton variant="text" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('animate-pulse');
    expect(el).toHaveClass('rounded-md');
  });

  it('renders circle variant', () => {
    const { container } = render(<Skeleton variant="circle" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('rounded-full');
  });

  it('renders card variant', () => {
    const { container } = render(<Skeleton variant="card" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass('animate-pulse');
    expect(el).toHaveClass('rounded-xl');
  });

  it('renders table-row variant', () => {
    const { container } = render(
      <table>
        <tbody>
          <Skeleton variant="table-row" />
        </tbody>
      </table>,
    );
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(1);
    const cells = rows[0].querySelectorAll('td');
    expect(cells.length).toBe(5);
  });

  it('renders multiple table rows with count', () => {
    const { container } = render(
      <table>
        <tbody>
          <Skeleton variant="table-row" count={3} />
        </tbody>
      </table>,
    );
    const rows = container.querySelectorAll('tr');
    expect(rows.length).toBe(3);
  });

  it('renders table-header variant', () => {
    const { container } = render(
      <table>
        <thead>
          <Skeleton variant="table-header" count={5} />
        </thead>
      </table>,
    );
    const rows = container.querySelectorAll('thead tr');
    expect(rows.length).toBe(1);
    const ths = rows[0].querySelectorAll('th');
    expect(ths.length).toBe(5);
  });

  it('renders table-header with custom count', () => {
    const { container } = render(
      <table>
        <thead>
          <Skeleton variant="table-header" count={3} />
        </thead>
      </table>,
    );
    const ths = container.querySelectorAll('th');
    expect(ths.length).toBe(3);
  });

  it('renders table-header with default count when count is falsy', () => {
    const { container } = render(
      <table>
        <thead>
          <Skeleton variant="table-header" count={0} />
        </thead>
      </table>,
    );
    const ths = container.querySelectorAll('th');
    expect(ths.length).toBe(5);
  });

  it('accepts custom width and height', () => {
    const { container } = render(<Skeleton width="w-48" height="h-10" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('w-48');
    expect(el.className).toContain('h-10');
  });

  it('accepts custom className', () => {
    const { container } = render(<Skeleton className="my-custom" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('my-custom');
  });

  it('has accessibility attributes', () => {
    const { container } = render(<Skeleton variant="text" />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveAttribute('role', 'status');
    expect(el).toHaveAttribute('aria-label', 'Loading');
  });
});

describe('DashboardSkeleton', () => {
  it('renders the dashboard skeleton layout', () => {
    const { container } = render(<DashboardSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
    // Should contain multiple skeleton cards
    const cards = container.querySelectorAll('.animate-pulse');
    expect(cards.length).toBeGreaterThan(0);
  });
});

describe('TableSkeleton', () => {
  it('renders with default rows', () => {
    const { container } = render(<TableSkeleton />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(5);
  });

  it('renders with custom row count', () => {
    const { container } = render(<TableSkeleton rows={3} />);
    const rows = container.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
  });

  it('renders with custom column count', () => {
    const { container } = render(<TableSkeleton columns={3} />);
    const ths = container.querySelectorAll('thead th');
    expect(ths.length).toBe(3);
  });
});

describe('ProductGridSkeleton', () => {
  it('renders with default count', () => {
    const { container } = render(<ProductGridSkeleton />);
    const cards = container.querySelectorAll('.animate-pulse');
    expect(cards.length).toBe(8);
  });

  it('renders with custom count', () => {
    const { container } = render(<ProductGridSkeleton count={4} />);
    const cards = container.querySelectorAll('.animate-pulse');
    expect(cards.length).toBe(4);
  });
});

describe('POSDashboardSkeleton', () => {
  it('renders the POS dashboard skeleton', () => {
    const { container } = render(<POSDashboardSkeleton />);
    expect(container.firstChild).toBeInTheDocument();
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
