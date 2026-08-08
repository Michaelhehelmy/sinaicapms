import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable } from '@/components/ui/DataTable';

const columns = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'age', header: 'Age' },
];

const data = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 },
];

describe('DataTable', () => {
  it('renders table headers and data rows', () => {
    render(<DataTable columns={columns} data={data} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Age')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('shows empty message when data is empty', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="No records found" />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows loading skeleton rows when loading is true', () => {
    const { container } = render(<DataTable columns={columns} data={data} loading />);
    const skeletonRows = container.querySelectorAll('tr.animate-pulse');
    expect(skeletonRows.length).toBe(5);
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
  });

  it('sorts data when sortable column header is clicked', () => {
    render(<DataTable columns={columns} data={data} />);
    const nameHeader = screen.getByText('Name');
    fireEvent.click(nameHeader);
    const cells = screen.getAllByRole('row');
    expect(cells[1].textContent).toContain('Alice');
    expect(cells[2].textContent).toContain('Bob');
    expect(cells[3].textContent).toContain('Charlie');
    fireEvent.click(nameHeader);
    const cellsDesc = screen.getAllByRole('row');
    expect(cellsDesc[1].textContent).toContain('Charlie');
    expect(cellsDesc[2].textContent).toContain('Bob');
    expect(cellsDesc[3].textContent).toContain('Alice');
  });

  it('renders pagination controls with correct page count', () => {
    const onChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{ page: 1, total: 25, pageSize: 10, onChange }}
      />,
    );
    expect(screen.getByText('Showing 1–10 of 25')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Next')).toBeInTheDocument();
    fireEvent.click(screen.getByText('2'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('calls onChange when Previous and Next buttons are clicked', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{ page: 2, total: 50, pageSize: 10, onChange }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));
    expect(onChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(onChange).toHaveBeenCalledWith(3);
    expect(screen.getByText('Showing 11–20 of 50')).toBeInTheDocument();
    rerender(
      <DataTable
        columns={columns}
        data={data}
        pagination={{ page: 1, total: 50, pageSize: 10, onChange }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
  });

  it('renders ellipsis page numbers for large page counts', () => {
    render(
      <DataTable
        columns={columns}
        data={data}
        pagination={{ page: 5, total: 200, pageSize: 10, onChange: vi.fn() }}
      />,
    );
    expect(screen.getAllByText('…')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Go to page 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 5' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Go to page 6' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Go to page 20' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go to page 7' })).not.toBeInTheDocument();
  });

  it('filters via search input with debounce when onSearch provided', () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        searchable
        onSearch={onSearch}
        searchPlaceholder="Search people"
      />,
    );
    const input = screen.getByTestId('table-search');
    expect(screen.getByLabelText('Search people')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Ali' } });
    vi.advanceTimersByTime(299);
    expect(onSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onSearch).toHaveBeenCalledWith('Ali');
    fireEvent.change(input, { target: { value: 'Bo' } });
    vi.advanceTimersByTime(100);
    fireEvent.change(input, { target: { value: 'Bob' } });
    vi.advanceTimersByTime(300);
    expect(onSearch).toHaveBeenCalledTimes(2);
    expect(onSearch).toHaveBeenLastCalledWith('Bob');
    vi.useRealTimers();
  });

  it('toggles individual rows and selects all rows', () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <DataTable
        columns={columns}
        data={data}
        rowKey="name"
        selectable
        selectedKeys={[]}
        onSelectionChange={onSelectionChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Alice' }));
    expect(onSelectionChange).toHaveBeenCalledWith(['Alice']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select row Alice' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith(['Alice', 'Bob', 'Charlie']);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows' }));
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
    expect(container.querySelectorAll('tr[data-testid="data-table-row"]').length).toBe(3);
  });

  it('calls onRowClick and keeps action clicks from bubbling to the row', () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={data}
        rowKey="name"
        onRowClick={onRowClick}
        actions={(row) => (
          <button onClick={() => onRowClick(`action:${row.name}`)}>View</button>
        )}
      />,
    );
    fireEvent.click(screen.getByRole('row', { name: /Alice/ }));
    expect(onRowClick).toHaveBeenLastCalledWith({ name: 'Alice', age: 30 });
    fireEvent.click(screen.getAllByRole('button', { name: 'View' })[0]);
    expect(onRowClick).toHaveBeenLastCalledWith('action:Alice');
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('sorts rows with null values and numeric columns in both directions', () => {
    const sortableCols = [
      { key: 'name', header: 'Name' },
      { key: 'age', header: 'Age', sortable: true },
    ];
    const mixedData = [
      { name: 'Alpha', age: 30 },
      { name: 'Beta', age: 25 },
      { name: 'Gamma', age: null },
      { name: 'Delta' },
    ];
    render(<DataTable columns={sortableCols} data={mixedData} />);
    fireEvent.click(screen.getByText('Age'));
    let cells = screen.getAllByRole('row').map((r) => r.textContent);
    expect(cells[1]).toContain('Gamma');
    expect(cells[2]).toContain('Delta');
    expect(cells[3]).toContain('Beta');
    expect(cells[4]).toContain('Alpha');
    fireEvent.click(screen.getByText('Age'));
    cells = screen.getAllByRole('row').map((r) => r.textContent);
    expect(cells[1]).toContain('Alpha');
    expect(cells[2]).toContain('Beta');
    expect(cells[3]).toContain('Gamma');
    expect(cells[4]).toContain('Delta');
  });

  it('sorts null-first data without crashing (non-null vs null comparisons)', () => {
    const sortableCols = [
      { key: 'name', header: 'Name' },
      { key: 'age', header: 'Age', sortable: true },
    ];
    render(
      <DataTable
        columns={sortableCols}
        data={[
          { name: 'First', age: null },
          { name: 'Second', age: 30 },
          { name: 'Third', age: 25 },
        ]}
      />,
    );
    fireEvent.click(screen.getByText('Age'));
    const cells = screen.getAllByRole('row').map((r) => r.textContent);
    expect(cells[1]).toContain('First');
    expect(cells[2]).toContain('Third');
    expect(cells[3]).toContain('Second');
  });

  it('renders empty description when provided', () => {
    render(<DataTable columns={columns} data={[]} emptyMessage="None" emptyDescription="Add some rows" />);
    expect(screen.getByText('None')).toBeInTheDocument();
    expect(screen.getByText('Add some rows')).toBeInTheDocument();
  });
});
