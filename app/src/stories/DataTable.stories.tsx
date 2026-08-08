import type { Meta, StoryObj } from '@storybook/react';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import React, { useState } from 'react';

const meta: Meta<typeof DataTable> = {
  title: 'UI/DataTable',
  component: DataTable,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof DataTable>;

const sampleData = [
  { id: '1', name: 'John Doe', email: 'john@example.com', role: 'Admin', status: 'active' },
  { id: '2', name: 'Jane Smith', email: 'jane@example.com', role: 'Staff', status: 'inactive' },
  { id: '3', name: 'Bob Johnson', email: 'bob@example.com', role: 'Guest', status: 'active' },
  { id: '4', name: 'Alice Brown', email: 'alice@example.com', role: 'Staff', status: 'active' },
  { id: '5', name: 'Charlie Wilson', email: 'charlie@example.com', role: 'Guest', status: 'pending' },
];

const columns = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'email', header: 'Email', sortable: true },
  { key: 'role', header: 'Role', sortable: true },
  {
    key: 'status',
    header: 'Status',
    render: (item: Record<string, unknown>) => {
      const status = item.status as string;
      const variant = status === 'active' ? 'success' : status === 'inactive' ? 'neutral' : 'warning';
      return <Badge variant={variant as 'success' | 'neutral' | 'warning'} dot>{status}</Badge>;
    },
  },
];

export const Default: Story = {
  render: () => (
    <DataTable columns={columns} data={sampleData} rowKey="id" />
  ),
};

export const EmptyState: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={[]}
      rowKey="id"
      emptyMessage="No users found"
      emptyDescription="Create a new user to get started."
    />
  ),
};

export const Loading: Story = {
  render: () => (
    <DataTable columns={columns} data={[]} loading rowKey="id" />
  ),
};

export const WithPagination: Story = {
  render: () => {
    const [page, setPage] = useState(1);
    const pageSize = 2;
    const total = sampleData.length;
    const paginatedData = sampleData.slice((page - 1) * pageSize, page * pageSize);

    return (
      <DataTable
        columns={columns}
        data={paginatedData}
        rowKey="id"
        pagination={{
          page,
          total,
          pageSize,
          onChange: setPage,
        }}
      />
    );
  },
};

export const WithSearch: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleData}
      rowKey="id"
      searchable
      searchPlaceholder="Search users..."
      onSearch={(query) => console.log('Search:', query)}
    />
  ),
};

export const WithActions: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={sampleData}
      rowKey="id"
      actions={(item) => (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm">Edit</Button>
          <Button variant="danger" size="sm">Delete</Button>
        </div>
      )}
    />
  ),
};

export const Selectable: Story = {
  render: () => {
    const [selected, setSelected] = useState<string[]>([]);
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Selected: {selected.length > 0 ? selected.join(', ') : 'None'}
        </p>
        <DataTable
          columns={columns}
          data={sampleData}
          rowKey="id"
          selectable
          selectedRows={selected}
          onSelectionChange={setSelected}
        />
      </div>
    );
  },
};

export const Striped: Story = {
  render: () => (
    <DataTable columns={columns} data={sampleData} rowKey="id" variant="striped" />
  ),
};

export const Bordered: Story = {
  render: () => (
    <DataTable columns={columns} data={sampleData} rowKey="id" variant="bordered" />
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="space-y-8">
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-2">Small</h3>
        <DataTable columns={columns} data={sampleData} rowKey="id" size="sm" />
      </div>
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-2">Medium (default)</h3>
        <DataTable columns={columns} data={sampleData} rowKey="id" size="md" />
      </div>
      <div>
        <h3 className="text-sm font-medium text-gray-500 mb-2">Large</h3>
        <DataTable columns={columns} data={sampleData} rowKey="id" size="lg" />
      </div>
    </div>
  ),
};
