import React from 'react';
import { useLowStock, type LowStockItem } from '@/hooks/useQueryHooks';
import { DataTable } from '@/components/ui/DataTable';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/hooks/useI18n';
import { IconLowStock } from './icons';

function StatusBadge({ status }: { status: LowStockItem['status'] }) {
  if (status === 'out') {
    return (
      <Badge variant="error" dot>
        Out of Stock
      </Badge>
    );
  }
  return (
    <Badge variant="warning" dot>
      Low
    </Badge>
  );
}

/**
 * Low-stock inventory panel (tenant admin).
 *
 * Lists items whose stock has dropped to or below the configured minimum,
 * flagging which are completely out of stock vs merely low. Read-only table;
 * restocking happens in the POS inventory flow.
 */
export default function LowStockPanel() {
  const { t } = useI18n();
  const { data, isLoading, isError, refetch } = useLowStock();
  const items = data?.items ?? [];

  return (
    <Card padding="none" className="p-6" data-testid="low-stock-panel" aria-busy={isLoading || undefined}>
      <div className="flex items-center gap-3 mb-2">
        <span className="flex items-center justify-center h-9 w-9 rounded-xl bg-warning-100 text-warning-700">
          <IconLowStock size={20} />
        </span>
        <h2 className="text-xl font-bold text-gray-800">{t('pos.lowStockAlerts')}</h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Inventory items at or below their minimum stock level. Restock items flagged as out of stock as soon as possible.
      </p>

      {isLoading ? (
        <LoadingSpinner text="Loading low-stock items..." />
      ) : isError ? (
        <div data-testid="low-stock-error" className="text-center py-10">
          <p className="text-sm text-red-600 mb-3">Could not load low-stock inventory.</p>
          <Button variant="primary" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<IconLowStock size={32} />}
          title="All stocked up"
          description="No inventory items are below their minimum stock level right now."
        />
      ) : (
        <div data-testid="low-stock-list">
          <DataTable<LowStockItem & Record<string, unknown>>
            columns={[
              { key: 'name', header: 'Item', sortable: true, render: (m) => <strong>{String(m.name)}</strong> },
              { key: 'category', header: 'Category', render: (m) => String(m.category ?? '—') },
              {
                key: 'stockQuantity',
                header: 'Stock',
                sortable: true,
                render: (m) => String(m.stockQuantity),
              },
              {
                key: 'minStockLevel',
                header: 'Min Level',
                render: (m) => String(m.minStockLevel),
              },
              {
                key: 'status',
                header: 'Status',
                render: (m) => <StatusBadge status={m.status === 'out' ? 'out' : 'low'} />,
              },
            ]}
            data={items as (LowStockItem & Record<string, unknown>)[]}
            emptyMessage="No low-stock items found."
          />
        </div>
      )}
    </Card>
  );
}
