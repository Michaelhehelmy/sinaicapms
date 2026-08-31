import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataTable } from '@/components/ui/DataTable';

/*
 * DataTable below-`lg` card mode is driven by `window.matchMedia('(max-width: 1023.98px)')`.
 * The global setup mock always reports `matches: false`, so these tests override it to
 * simulate a mobile viewport and assert on the card list while the desktop table stays
 * rendered (visually hidden by CSS only).
 */

let restoreMatchMedia: () => void;

function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: '(max-width: 1023.98px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  const original = window.matchMedia;
  window.matchMedia = vi.fn().mockImplementation(() => mql);
  return () => {
    window.matchMedia = original;
  };
}

function cards() {
  return within(screen.getByTestId('data-table-cards'));
}

function cardEls() {
  return screen.getAllByTestId('data-table-card');
}

const columns = [
  { key: 'name', header: 'Name' },
  { key: 'email', header: 'Email', hideOnMobile: true },
  {
    key: 'status',
    header: 'Status',
    render: (row: { status?: string }) => <span>status:{row.status}</span>,
  },
];

const data = [
  { id: '1', name: 'Alice', email: 'alice@test.com', status: 'active' },
  { id: '2', name: 'Bob', email: 'bob@test.com', status: 'inactive' },
];

describe('DataTable mobile card mode', () => {
  beforeEach(() => {
    restoreMatchMedia = mockMatchMedia(true);
  });

  afterEach(() => {
    restoreMatchMedia?.();
  });

  it('renders one stacked card per row with label/value pairs below lg', () => {
    render(<DataTable columns={columns} data={data} rowKey="id" />);
    expect(cardEls()).toHaveLength(2);

    const firstCard = cardEls()[0];
    expect(within(firstCard).getByText('Name')).toBeInTheDocument();
    expect(within(firstCard).getByText('Alice')).toBeInTheDocument();
    expect(within(firstCard).getByText('Status')).toBeInTheDocument();
    expect(within(firstCard).getByText('status:active')).toBeInTheDocument();
  });

  it('keeps the classic table render when the media query does not match', () => {
    restoreMatchMedia();
    const { container } = render(<DataTable columns={columns} data={data} rowKey="id" />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.queryByTestId('data-table-cards')).not.toBeInTheDocument();
    expect(container.querySelectorAll('tr[data-testid="data-table-row"]')).toHaveLength(2);
  });

  it('honors hideOnMobile: column dropped from cards but kept in desktop table', () => {
    render(<DataTable columns={columns} data={data} rowKey="id" />);

    // Card list: Email header and values are absent…
    expect(cards().queryByText('Email')).not.toBeInTheDocument();
    expect(cards().queryByText('alice@test.com')).not.toBeInTheDocument();
    // …while the desktop table still renders the column.
    const table = within(screen.getByTestId('data-table'));
    expect(table.getByText('Email')).toBeInTheDocument();
    expect(table.getByText('alice@test.com')).toBeInTheDocument();
  });

  it('renders action buttons in card mode and does not bubble to the card click', () => {
    const onRowClick = vi.fn();
    const onAction = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        rowKey="id"
        onRowClick={onRowClick}
        actions={(row) => (
          <button onClick={() => onAction((row as { name: string }).name)}>View</button>
        )}
      />,
    );

    const firstCard = cardEls()[0];
    fireEvent.click(within(firstCard).getByRole('button', { name: 'View' }));
    expect(onAction).toHaveBeenCalledWith('Alice');
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(firstCard);
    expect(onRowClick).toHaveBeenCalledWith({ id: '1', name: 'Alice', email: 'alice@test.com', status: 'active' });
  });

  it('keeps row selection working in card mode without triggering onRowClick', () => {
    const onSelectionChange = vi.fn();
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        rowKey="id"
        selectable
        onSelectionChange={onSelectionChange}
        onRowClick={onRowClick}
      />,
    );

    const firstCard = cardEls()[0];
    const checkbox = within(firstCard).getByRole('checkbox', { name: 'Select row 1' });
    fireEvent.click(checkbox);
    expect(onSelectionChange).toHaveBeenCalledWith(['1']);
    expect(onRowClick).not.toHaveBeenCalled();

    fireEvent.click(firstCard);
    expect(onRowClick).toHaveBeenCalled();
  });

  it('supports controlled selectedRows in card mode', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        rowKey="id"
        selectable
        selectedRows={['2']}
        onSelectionChange={vi.fn()}
      />,
    );
    expect(cardEls()[0].querySelector('input[type="checkbox"]')).not.toBeChecked();
    expect(cardEls()[1].querySelector('input[type="checkbox"]')).toBeChecked();
  });

  it('shows a simplified loading skeleton in card mode with no data text', () => {
    const { container } = render(<DataTable columns={columns} data={data} loading rowKey="id" />);

    expect(screen.getByTestId('data-table-cards')).toBeInTheDocument();
    // Skeleton placeholders only — no real row values in card mode while loading.
    expect(cards().queryByText('Alice')).not.toBeInTheDocument();
    expect(cards().queryByText('status:active')).not.toBeInTheDocument();
    // Desktop skeleton rows still exist untouched.
    expect(container.querySelectorAll('tr.animate-pulse').length).toBe(5);
  });

  it('renders the empty message in card mode when there are no rows', () => {
    render(<DataTable columns={columns} data={[]} rowKey="id" emptyMessage="No records found" />);
    // The cards region shows the empty state (the desktop table keeps its row too).
    expect(within(screen.getByTestId('data-table-cards')).getByText('No records found')).toBeInTheDocument();
    expect(screen.queryAllByTestId('data-table-card')).toHaveLength(0);
  });

  it('applies the current sort order to cards', () => {
    const sortableCols = [{ key: 'name', header: 'Name', sortable: true }];
    render(<DataTable columns={sortableCols} data={data} rowKey="id" />);
    // First click sorts ascending (Alice first), second click descending (Bob first).
    fireEvent.click(within(screen.getByTestId('data-table')).getByText('Name'));
    fireEvent.click(within(screen.getByTestId('data-table')).getByText('Name'));
    const names = cardEls().map((el) => (el.textContent ?? '').trim());
    expect(names[0]).toContain('Bob');
    expect(names[1]).toContain('Alice');
  });

  it('card values never use text smaller than text-sm (size sm included)', () => {
    const { container } = render(<DataTable columns={columns} data={data} rowKey="id" size="sm" />);
    const firstCard = cardEls()[0];
    // Desktop sm cells use text-xs; card values and labels must not.
    const aliceValue = within(firstCard).getByText('Alice');
    expect(aliceValue.className).toMatch(/text-sm|text-base/);
    expect(aliceValue.className).not.toMatch(/text-xs/);
    const nameLabel = Array.from(firstCard.querySelectorAll('div')).find(
      (el) => (el.textContent ?? '').trim() === 'Name',
    );
    expect(nameLabel!.className).toMatch(/text-sm/);
    // The desktop table still applies the sm cell token.
    const smCell = Array.from(container.querySelectorAll('td')).find(
      (el) => (el.textContent ?? '').trim() === 'Alice',
    );
    expect(smCell!.className).toContain('text-xs');
  });
});