import React, { useState, useCallback, useEffect } from 'react';
import * as api from '@/lib/api';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';

type Tab = 'warehouses' | 'stock' | 'transfers' | 'purchaseOrders' | 'boms' | 'manufacturing';

interface Warehouse { id: string; name: string; location: string; is_active: number; }
interface StockRow { id: string; product_id: string; warehouse_id: string; quantity: number; reserved: number; product_name: string; warehouse_name: string; }
interface Transfer { id: string; from_warehouse_id: string; to_warehouse_id: string; product_id: string; quantity: number; status: string; from_warehouse_name: string; to_warehouse_name: string; product_name: string; }
interface PurchaseOrder { id: string; po_number: string; vendor_id: string; order_date: string; total_amount: number; status: string; }
interface BOM { id: string; product_id: string; name: string; version: number; product_name: string; lines: BOMLine[]; }
interface BOMLine { id?: string; component_id: string; quantity: number; unit: string; }
interface MO { id: string; product_id: string; quantity: number; status: string; produced_quantity: number; product_name: string; bom_name: string; }

interface WhForm { name: string; location: string; }
interface StockForm { productId: string; warehouseId: string; quantity: string; }
interface TransferForm { fromWarehouseId: string; toWarehouseId: string; productId: string; quantity: string; }
interface POLineForm { productId: string; quantity: string; unitPrice: string; }
interface POForm { vendorId: string; orderDate: string; expectedDelivery: string; notes: string; lines: POLineForm[]; }
interface BOMLineForm { componentId: string; quantity: string; unit: string; }
interface BOMForm { productId: string; name: string; lines: BOMLineForm[]; }
interface MOForm { bomId: string; productId: string; quantity: string; startDate: string; endDate: string; }

const emptyWhForm: WhForm = { name: '', location: '' };
const emptyStockForm: StockForm = { productId: '', warehouseId: '', quantity: '' };
const emptyTransferForm: TransferForm = { fromWarehouseId: '', toWarehouseId: '', productId: '', quantity: '' };
const emptyPOForm: POForm = { vendorId: '', orderDate: '', expectedDelivery: '', notes: '', lines: [{ productId: '', quantity: '', unitPrice: '' }] };
const emptyBOMForm: BOMForm = { productId: '', name: '', lines: [{ componentId: '', quantity: '', unit: 'each' }] };
const emptyMOForm: MOForm = { bomId: '', productId: '', quantity: '', startDate: '', endDate: '' };

const WH_STATUS_OPTIONS = [{ value: '1', label: 'Active' }, { value: '0', label: 'Inactive' }];

export default function SupplyPanel() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('warehouses');
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [pos, setPOs] = useState<PurchaseOrder[]>([]);
  const [boms, setBoms] = useState<BOM[]>([]);
  const [mos, setMOs] = useState<MO[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [showWhForm, setShowWhForm] = useState(false);
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [whForm, setWhForm] = useState<WhForm>(emptyWhForm);

  const [showStockForm, setShowStockForm] = useState(false);
  const [stockForm, setStockForm] = useState<StockForm>(emptyStockForm);

  const [showTransferForm, setShowTransferForm] = useState(false);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransferForm);

  const [showPOForm, setShowPOForm] = useState(false);
  const [poForm, setPOForm] = useState<POForm>(emptyPOForm);

  const [showBOMForm, setShowBOMForm] = useState(false);
  const [bomForm, setBOMForm] = useState<BOMForm>(emptyBOMForm);

  const [showMOForm, setShowMOForm] = useState(false);
  const [moForm, setMOForm] = useState<MOForm>(emptyMOForm);

  const [confirmTarget, setConfirmTarget] = useState<{ type: string; item: Record<string, unknown> } | null>(null);
  const [progressTarget, setProgressTarget] = useState<MO | null>(null);
  const [progressQty, setProgressQty] = useState('0');

  const loadData = useCallback(async () => {
    try {
      const [w, s, t, p, b, m] = await Promise.all([
        api.request('/supply/warehouses') as Promise<Warehouse[]>,
        api.request('/supply/stock') as Promise<StockRow[]>,
        api.request('/supply/stock-transfers') as Promise<Transfer[]>,
        api.request('/supply/purchase-orders') as Promise<PurchaseOrder[]>,
        api.request('/supply/boms') as Promise<BOM[]>,
        api.request('/supply/manufacturing-orders') as Promise<MO[]>,
      ]);
      setWarehouses(w);
      setStock(s);
      setTransfers(t);
      setPOs(p);
      setBoms(b);
      setMOs(m);
    } catch (err) {
      showToast('Failed to load supply data: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [showToast]);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  // ── Warehouse handlers ──────────────────────────────────────────────
  const openAddWh = useCallback(() => { setEditingWhId(null); setWhForm(emptyWhForm); setShowWhForm(true); }, []);
  const openEditWh = useCallback((w: Warehouse) => {
    setEditingWhId(w.id);
    setWhForm({ name: w.name, location: w.location || '' });
    setShowWhForm(true);
  }, []);

  const handleSaveWh = useCallback(async () => {
    if (!whForm.name.trim()) { showToast('Name is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.request('/supply/warehouses', {
        method: editingWhId ? 'PUT' : 'POST',
        body: JSON.stringify({ name: whForm.name.trim(), location: whForm.location || undefined }),
        urlParams: editingWhId ? `/${editingWhId}` : undefined,
      });
      showToast(editingWhId ? 'Warehouse updated.' : 'Warehouse created.', 'success');
      setShowWhForm(false);
      setEditingWhId(null);
      setWhForm(emptyWhForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [whForm, editingWhId, showToast, loadData]);

  const handleDeleteWh = useCallback(async () => {
    if (!confirmTarget || confirmTarget.type !== 'warehouse') return;
    try {
      await api.request(`/supply/warehouses/${confirmTarget.item.id}`, { method: 'DELETE' });
      showToast('Warehouse deactivated.', 'success');
      setConfirmTarget(null);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [confirmTarget, showToast, loadData]);

  // ── Stock handler ───────────────────────────────────────────────────
  const handleSaveStock = useCallback(async () => {
    if (!stockForm.productId.trim() || !stockForm.warehouseId) { showToast('Product and warehouse required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.request('/supply/stock', {
        method: 'POST',
        body: JSON.stringify({ productId: stockForm.productId.trim(), warehouseId: stockForm.warehouseId, quantity: parseInt(stockForm.quantity) || 0 }),
      });
      showToast('Stock adjusted.', 'success');
      setShowStockForm(false);
      setStockForm(emptyStockForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [stockForm, showToast, loadData]);

  // ── Transfer handlers ───────────────────────────────────────────────
  const handleSaveTransfer = useCallback(async () => {
    if (!transferForm.productId.trim() || !transferForm.fromWarehouseId || !transferForm.toWarehouseId) {
      showToast('All fields required.', 'warning'); return;
    }
    setSaving(true);
    try {
      await api.request('/supply/stock-transfers', {
        method: 'POST',
        body: JSON.stringify({
          productId: transferForm.productId.trim(),
          fromWarehouseId: transferForm.fromWarehouseId,
          toWarehouseId: transferForm.toWarehouseId,
          quantity: parseInt(transferForm.quantity) || 0,
        }),
      });
      showToast('Transfer created.', 'success');
      setShowTransferForm(false);
      setTransferForm(emptyTransferForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [transferForm, showToast, loadData]);

  const handleConfirmTransfer = useCallback(async () => {
    if (!confirmTarget || confirmTarget.type !== 'transfer') return;
    try {
      await api.request(`/supply/stock-transfers/${confirmTarget.item.id}/confirm`, { method: 'PATCH' });
      showToast('Transfer confirmed.', 'success');
      setConfirmTarget(null);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [confirmTarget, showToast, loadData]);

  // ── PO handlers ─────────────────────────────────────────────────────
  const handleSavePO = useCallback(async () => {
    if (!poForm.orderDate || poForm.lines.length === 0) { showToast('Order date and at least one line required.', 'warning'); return; }
    setSaving(true);
    try {
      const lines = poForm.lines.filter((l) => l.productId.trim()).map((l) => ({
        productId: l.productId.trim(),
        quantity: parseInt(l.quantity) || 1,
        unitPrice: parseFloat(l.unitPrice) || 0,
      }));
      if (lines.length === 0) { showToast('Add at least one valid line.', 'warning'); setSaving(false); return; }
      await api.request('/supply/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({ vendorId: poForm.vendorId || undefined, orderDate: poForm.orderDate, expectedDelivery: poForm.expectedDelivery || undefined, notes: poForm.notes || undefined, lines }),
      });
      showToast('Purchase order created.', 'success');
      setShowPOForm(false);
      setPOForm(emptyPOForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [poForm, showToast, loadData]);

  const handleReceivePO = useCallback(async () => {
    if (!confirmTarget || confirmTarget.type !== 'po') return;
    try {
      await api.request(`/supply/purchase-orders/${confirmTarget.item.id}/receive`, { method: 'PATCH' });
      showToast('Purchase order received.', 'success');
      setConfirmTarget(null);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [confirmTarget, showToast, loadData]);

  // ── BOM handler ─────────────────────────────────────────────────────
  const handleSaveBOM = useCallback(async () => {
    if (!bomForm.productId.trim() || !bomForm.name.trim()) { showToast('Product and name required.', 'warning'); return; }
    setSaving(true);
    try {
      const lines = bomForm.lines.filter((l) => l.componentId.trim()).map((l) => ({
        componentId: l.componentId.trim(),
        quantity: parseFloat(l.quantity) || 1,
        unit: l.unit || 'each',
      }));
      if (lines.length === 0) { showToast('Add at least one component.', 'warning'); setSaving(false); return; }
      await api.request('/supply/boms', {
        method: 'POST',
        body: JSON.stringify({ productId: bomForm.productId.trim(), name: bomForm.name.trim(), lines }),
      });
      showToast('BOM created.', 'success');
      setShowBOMForm(false);
      setBOMForm(emptyBOMForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [bomForm, showToast, loadData]);

  // ── MO handler ──────────────────────────────────────────────────────
  const handleSaveMO = useCallback(async () => {
    if (!moForm.bomId || !moForm.productId.trim() || !moForm.quantity) { showToast('BOM, product, and quantity required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.request('/supply/manufacturing-orders', {
        method: 'POST',
        body: JSON.stringify({
          bomId: moForm.bomId,
          productId: moForm.productId.trim(),
          quantity: parseInt(moForm.quantity) || 1,
          startDate: moForm.startDate || undefined,
          endDate: moForm.endDate || undefined,
        }),
      });
      showToast('Manufacturing order created.', 'success');
      setShowMOForm(false);
      setMOForm(emptyMOForm);
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    } finally { setSaving(false); }
  }, [moForm, showToast, loadData]);

  const handleProgressMO = useCallback(async () => {
    if (!progressTarget) return;
    try {
      const qty = parseInt(progressQty) || 0;
      const status = qty >= progressTarget.quantity ? 'completed' : 'in_production';
      await api.request(`/supply/manufacturing-orders/${progressTarget.id}/progress`, {
        method: 'PATCH',
        body: JSON.stringify({ producedQuantity: qty, status }),
      });
      showToast('Progress updated.', 'success');
      setProgressTarget(null);
      setProgressQty('0');
      await loadData();
    } catch (err) {
      showToast('Error: ' + (err instanceof Error ? err.message : String(err)), 'error');
    }
  }, [progressTarget, progressQty, showToast, loadData]);

  const statusBadge = (s: string) => {
    const map: Record<string, { text: string; variant: 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
      draft: { text: 'Draft', variant: 'neutral' },
      sent: { text: 'Sent', variant: 'info' },
      confirmed: { text: 'Confirmed', variant: 'info' },
      in_transit: { text: 'In Transit', variant: 'warning' },
      completed: { text: 'Completed', variant: 'success' },
      received: { text: 'Received', variant: 'success' },
      canceled: { text: 'Canceled', variant: 'danger' },
      planned: { text: 'Planned', variant: 'info' },
      in_production: { text: 'In Production', variant: 'warning' },
    };
    const cfg = map[s] || { text: s, variant: 'neutral' as const };
    return <Badge variant={cfg.variant} dot size="sm">{cfg.text}</Badge>;
  };

  if (loading) return <LoadingSpinner text="Loading supply chain..." />;

  return (
    <Card padding="none" className="p-6" data-testid="supply-panel">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xl font-bold text-gray-800">Supply Chain</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Manage warehouses, stock levels, transfers, purchase orders, BOMs, and manufacturing.
      </p>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {([
          ['warehouses', 'Warehouses'],
          ['stock', 'Stock'],
          ['transfers', 'Transfers'],
          ['purchaseOrders', 'Purchase Orders'],
          ['boms', 'BOMs'],
          ['manufacturing', 'Manufacturing'],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${tab === t ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            data-testid={`tab-${t}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Warehouses Tab ──────────────────────────────────── */}
      {tab === 'warehouses' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button variant="success" size="md" onClick={openAddWh}>Add Warehouse</Button>
          </div>
          {warehouses.length === 0 ? (
            <EmptyState title="No warehouses" description="Create your first warehouse to start tracking stock." action={{ label: 'Add Warehouse', onClick: openAddWh }} />
          ) : (
            <DataTable<Warehouse & Record<string, unknown>>
              columns={[
                { key: 'name', header: 'Name', sortable: true, render: (w) => <strong className="text-gray-900">{String(w.name)}</strong> },
                { key: 'location', header: 'Location', render: (w) => <span className="text-sm text-gray-600">{String(w.location || '-')}</span> },
                { key: 'is_active', header: 'Status', render: (w) => <Badge variant={Number(w.is_active) === 1 ? 'success' : 'neutral'} dot size="sm">{Number(w.is_active) === 1 ? 'Active' : 'Inactive'}</Badge> },
              ]}
              data={warehouses as (Warehouse & Record<string, unknown>)[]}
              emptyMessage="No warehouses."
              actions={(w) => (
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => openEditWh(w as unknown as Warehouse)}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => setConfirmTarget({ type: 'warehouse', item: w })}>Delete</Button>
                </div>
              )}
            />
          )}
        </div>
      )}

      {/* ── Stock Tab ───────────────────────────────────────── */}
      {tab === 'stock' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button variant="success" size="md" onClick={() => { setStockForm(emptyStockForm); setShowStockForm(true); }}>Adjust Stock</Button>
          </div>
          {stock.length === 0 ? (
            <EmptyState title="No stock records" description="Adjust stock to start tracking inventory." action={{ label: 'Adjust Stock', onClick: () => { setStockForm(emptyStockForm); setShowStockForm(true); } }} />
          ) : (
            <DataTable<StockRow & Record<string, unknown>>
              columns={[
                { key: 'product_name', header: 'Product', sortable: true, render: (r) => <strong className="text-gray-900">{String(r.product_name || r.product_id)}</strong> },
                { key: 'warehouse_name', header: 'Warehouse', render: (r) => <span className="text-sm text-gray-600">{String(r.warehouse_name || '-')}</span> },
                { key: 'quantity', header: 'Qty', render: (r) => <span className="font-medium">{Number(r.quantity)}</span> },
                { key: 'reserved', header: 'Reserved', render: (r) => <span className="text-sm text-gray-600">{Number(r.reserved)}</span> },
                { key: 'quantity', header: 'Available', render: (r) => <span className="font-medium text-emerald-700">{Number(r.quantity) - Number(r.reserved)}</span> },
              ]}
              data={stock as (StockRow & Record<string, unknown>)[]}
              emptyMessage="No stock records."
            />
          )}
        </div>
      )}

      {/* ── Transfers Tab ───────────────────────────────────── */}
      {tab === 'transfers' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button variant="success" size="md" onClick={() => { setTransferForm(emptyTransferForm); setShowTransferForm(true); }}>New Transfer</Button>
          </div>
          {transfers.length === 0 ? (
            <EmptyState title="No transfers" description="Create a stock transfer between warehouses." action={{ label: 'New Transfer', onClick: () => { setTransferForm(emptyTransferForm); setShowTransferForm(true); } }} />
          ) : (
            <DataTable<Transfer & Record<string, unknown>>
              columns={[
                { key: 'from_warehouse_name', header: 'From', render: (t) => <span className="text-sm text-gray-600">{String(t.from_warehouse_name || '-')}</span> },
                { key: 'to_warehouse_name', header: 'To', render: (t) => <span className="text-sm text-gray-600">{String(t.to_warehouse_name || '-')}</span> },
                { key: 'product_name', header: 'Product', render: (t) => <strong className="text-gray-900">{String(t.product_name || t.product_id)}</strong> },
                { key: 'quantity', header: 'Qty', render: (t) => <span className="font-medium">{Number(t.quantity)}</span> },
                { key: 'status', header: 'Status', render: (t) => statusBadge(String(t.status)) },
              ]}
              data={transfers as (Transfer & Record<string, unknown>)[]}
              emptyMessage="No transfers."
              actions={(t) => String(t.status) === 'draft' ? (
                <Button variant="success" size="sm" onClick={() => setConfirmTarget({ type: 'transfer', item: t })}>Confirm</Button>
              ) : null}
            />
          )}
        </div>
      )}

      {/* ── Purchase Orders Tab ─────────────────────────────── */}
      {tab === 'purchaseOrders' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button variant="success" size="md" onClick={() => { setPOForm(emptyPOForm); setShowPOForm(true); }}>New PO</Button>
          </div>
          {pos.length === 0 ? (
            <EmptyState title="No purchase orders" description="Create a purchase order to order goods from vendors." action={{ label: 'New PO', onClick: () => { setPOForm(emptyPOForm); setShowPOForm(true); } }} />
          ) : (
            <DataTable<PurchaseOrder & Record<string, unknown>>
              columns={[
                { key: 'po_number', header: 'PO#', sortable: true, render: (p) => <strong className="text-gray-900">{String(p.po_number)}</strong> },
                { key: 'vendor_id', header: 'Vendor', render: (p) => <span className="text-sm text-gray-600">{String(p.vendor_id || '-')}</span> },
                { key: 'order_date', header: 'Date', render: (p) => <span className="text-sm text-gray-600">{String(p.order_date).slice(0, 10)}</span> },
                { key: 'total_amount', header: 'Amount', render: (p) => <span className="font-medium">{formatCurrency(Number(p.total_amount))}</span> },
                { key: 'status', header: 'Status', render: (p) => statusBadge(String(p.status)) },
              ]}
              data={pos as (PurchaseOrder & Record<string, unknown>)[]}
              emptyMessage="No purchase orders."
              actions={(p) => String(p.status) === 'draft' || String(p.status) === 'sent' ? (
                <Button variant="success" size="sm" onClick={() => setConfirmTarget({ type: 'po', item: p })}>Receive</Button>
              ) : null}
            />
          )}
        </div>
      )}

      {/* ── BOMs Tab ────────────────────────────────────────── */}
      {tab === 'boms' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button variant="success" size="md" onClick={() => { setBOMForm(emptyBOMForm); setShowBOMForm(true); }}>New BOM</Button>
          </div>
          {boms.length === 0 ? (
            <EmptyState title="No bills of materials" description="Create a BOM to define components for manufacturing." action={{ label: 'New BOM', onClick: () => { setBOMForm(emptyBOMForm); setShowBOMForm(true); } }} />
          ) : (
            <DataTable<BOM & Record<string, unknown>>
              columns={[
                { key: 'name', header: 'Name', sortable: true, render: (b) => <strong className="text-gray-900">{String(b.name)}</strong> },
                { key: 'product_name', header: 'Product', render: (b) => <span className="text-sm text-gray-600">{String(b.product_name || b.product_id)}</span> },
                { key: 'version', header: 'Version', render: (b) => <span className="text-sm text-gray-600">v{Number(b.version)}</span> },
                { key: 'lines', header: 'Components', render: (b) => <span className="font-medium">{(b.lines || []).length}</span> },
              ]}
              data={boms as (BOM & Record<string, unknown>)[]}
              emptyMessage="No BOMs."
            />
          )}
        </div>
      )}

      {/* ── Manufacturing Tab ───────────────────────────────── */}
      {tab === 'manufacturing' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button variant="success" size="md" onClick={() => { setMOForm(emptyMOForm); setShowMOForm(true); }}>New Order</Button>
          </div>
          {mos.length === 0 ? (
            <EmptyState title="No manufacturing orders" description="Create a manufacturing order to produce goods." action={{ label: 'New Order', onClick: () => { setMOForm(emptyMOForm); setShowMOForm(true); } }} />
          ) : (
            <DataTable<MO & Record<string, unknown>>
              columns={[
                { key: 'product_name', header: 'Product', sortable: true, render: (m) => <strong className="text-gray-900">{String(m.product_name || m.product_id)}</strong> },
                { key: 'quantity', header: 'Qty', render: (m) => <span className="font-medium">{Number(m.quantity)}</span> },
                { key: 'status', header: 'Status', render: (m) => statusBadge(String(m.status)) },
                { key: 'produced_quantity', header: 'Progress', render: (m) => <span className="text-sm text-gray-600">{Number(m.produced_quantity)}/{Number(m.quantity)}</span> },
              ]}
              data={mos as (MO & Record<string, unknown>)[]}
              emptyMessage="No manufacturing orders."
              actions={(m) => String(m.status) !== 'completed' && String(m.status) !== 'canceled' ? (
                <Button variant="ghost" size="sm" onClick={() => { setProgressTarget(m as unknown as MO); setProgressQty(String(m.produced_quantity)); }}>Progress</Button>
              ) : null}
            />
          )}
        </div>
      )}

      {/* ── Warehouse Form Modal ────────────────────────────── */}
      <FormModal open={showWhForm} title={editingWhId ? 'Edit Warehouse' : 'Add Warehouse'} onClose={() => { setShowWhForm(false); setEditingWhId(null); }} onSubmit={handleSaveWh} submitLabel={saving ? 'Saving...' : editingWhId ? 'Update' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Name *" type="text" value={whForm.name} onChange={(e) => setWhForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Main Warehouse" />
          <Input label="Location" type="text" value={whForm.location} onChange={(e) => setWhForm((p) => ({ ...p, location: e.target.value }))} placeholder="e.g. Cairo, Egypt" />
        </div>
      </FormModal>

      {/* ── Stock Adjust Modal ──────────────────────────────── */}
      <FormModal open={showStockForm} title="Adjust Stock" onClose={() => setShowStockForm(false)} onSubmit={handleSaveStock} submitLabel={saving ? 'Saving...' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Product ID *" type="text" value={stockForm.productId} onChange={(e) => setStockForm((p) => ({ ...p, productId: e.target.value }))} placeholder="Product ID" />
          <Select label="Warehouse *" options={warehouses.filter((w) => Number(w.is_active) === 1).map((w) => ({ value: w.id, label: w.name }))} value={stockForm.warehouseId} onChange={(e) => setStockForm((p) => ({ ...p, warehouseId: e.target.value }))} />
          <Input label="Quantity (positive to add, negative to deduct) *" type="number" value={stockForm.quantity} onChange={(e) => setStockForm((p) => ({ ...p, quantity: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Transfer Form Modal ─────────────────────────────── */}
      <FormModal open={showTransferForm} title="New Transfer" onClose={() => setShowTransferForm(false)} onSubmit={handleSaveTransfer} submitLabel={saving ? 'Saving...' : 'Save'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Product ID *" type="text" value={transferForm.productId} onChange={(e) => setTransferForm((p) => ({ ...p, productId: e.target.value }))} placeholder="Product ID" />
          <Select label="From Warehouse *" options={warehouses.filter((w) => Number(w.is_active) === 1).map((w) => ({ value: w.id, label: w.name }))} value={transferForm.fromWarehouseId} onChange={(e) => setTransferForm((p) => ({ ...p, fromWarehouseId: e.target.value }))} />
          <Select label="To Warehouse *" options={warehouses.filter((w) => Number(w.is_active) === 1).map((w) => ({ value: w.id, label: w.name }))} value={transferForm.toWarehouseId} onChange={(e) => setTransferForm((p) => ({ ...p, toWarehouseId: e.target.value }))} />
          <Input label="Quantity *" type="number" value={transferForm.quantity} onChange={(e) => setTransferForm((p) => ({ ...p, quantity: e.target.value }))} min="1" />
        </div>
      </FormModal>

      {/* ── PO Form Modal ───────────────────────────────────── */}
      <FormModal open={showPOForm} title="New Purchase Order" onClose={() => setShowPOForm(false)} onSubmit={handleSavePO} submitLabel={saving ? 'Saving...' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Vendor ID" type="text" value={poForm.vendorId} onChange={(e) => setPOForm((p) => ({ ...p, vendorId: e.target.value }))} placeholder="Optional vendor ID" />
          <Input label="Order Date *" type="date" value={poForm.orderDate} onChange={(e) => setPOForm((p) => ({ ...p, orderDate: e.target.value }))} />
          <Input label="Expected Delivery" type="date" value={poForm.expectedDelivery} onChange={(e) => setPOForm((p) => ({ ...p, expectedDelivery: e.target.value }))} />
          <Input label="Notes" type="text" value={poForm.notes} onChange={(e) => setPOForm((p) => ({ ...p, notes: e.target.value }))} />
          <div className="border-t pt-3 mt-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Lines</p>
            {poForm.lines.map((line, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                <Input label="" type="text" value={line.productId} onChange={(e) => { const lines = [...poForm.lines]; lines[i] = { ...lines[i], productId: e.target.value }; setPOForm((p) => ({ ...p, lines })); }} placeholder="Product ID" />
                <Input label="" type="number" value={line.quantity} onChange={(e) => { const lines = [...poForm.lines]; lines[i] = { ...lines[i], quantity: e.target.value }; setPOForm((p) => ({ ...p, lines })); }} placeholder="Qty" min="1" />
                <Input label="" type="number" value={line.unitPrice} onChange={(e) => { const lines = [...poForm.lines]; lines[i] = { ...lines[i], unitPrice: e.target.value }; setPOForm((p) => ({ ...p, lines })); }} placeholder="Unit Price" min="0" step="0.01" />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setPOForm((p) => ({ ...p, lines: [...p.lines, { productId: '', quantity: '', unitPrice: '' }] }))}>+ Add Line</Button>
          </div>
        </div>
      </FormModal>

      {/* ── BOM Form Modal ──────────────────────────────────── */}
      <FormModal open={showBOMForm} title="New BOM" onClose={() => setShowBOMForm(false)} onSubmit={handleSaveBOM} submitLabel={saving ? 'Saving...' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Input label="Product ID *" type="text" value={bomForm.productId} onChange={(e) => setBOMForm((p) => ({ ...p, productId: e.target.value }))} placeholder="Product ID" />
          <Input label="Name *" type="text" value={bomForm.name} onChange={(e) => setBOMForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Standard Widget Assembly" />
          <div className="border-t pt-3 mt-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Components</p>
            {bomForm.lines.map((line, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                <Input label="" type="text" value={line.componentId} onChange={(e) => { const lines = [...bomForm.lines]; lines[i] = { ...lines[i], componentId: e.target.value }; setBOMForm((p) => ({ ...p, lines })); }} placeholder="Component ID" />
                <Input label="" type="number" value={line.quantity} onChange={(e) => { const lines = [...bomForm.lines]; lines[i] = { ...lines[i], quantity: e.target.value }; setBOMForm((p) => ({ ...p, lines })); }} placeholder="Qty" min="0.01" step="0.01" />
                <Input label="" type="text" value={line.unit} onChange={(e) => { const lines = [...bomForm.lines]; lines[i] = { ...lines[i], unit: e.target.value }; setBOMForm((p) => ({ ...p, lines })); }} placeholder="Unit" />
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setBOMForm((p) => ({ ...p, lines: [...p.lines, { componentId: '', quantity: '', unit: 'each' }] }))}>+ Add Component</Button>
          </div>
        </div>
      </FormModal>

      {/* ── MO Form Modal ───────────────────────────────────── */}
      <FormModal open={showMOForm} title="New Manufacturing Order" onClose={() => setShowMOForm(false)} onSubmit={handleSaveMO} submitLabel={saving ? 'Saving...' : 'Create'} submitDisabled={saving}>
        <div className="space-y-4">
          <Select label="BOM *" options={boms.map((b) => ({ value: b.id, label: `${b.name} (${b.product_name || b.product_id})` }))} value={moForm.bomId} onChange={(e) => setMOForm((p) => ({ ...p, bomId: e.target.value }))} />
          <Input label="Product ID *" type="text" value={moForm.productId} onChange={(e) => setMOForm((p) => ({ ...p, productId: e.target.value }))} placeholder="Product ID" />
          <Input label="Quantity *" type="number" value={moForm.quantity} onChange={(e) => setMOForm((p) => ({ ...p, quantity: e.target.value }))} min="1" />
          <Input label="Start Date" type="date" value={moForm.startDate} onChange={(e) => setMOForm((p) => ({ ...p, startDate: e.target.value }))} />
          <Input label="End Date" type="date" value={moForm.endDate} onChange={(e) => setMOForm((p) => ({ ...p, endDate: e.target.value }))} />
        </div>
      </FormModal>

      {/* ── Progress Modal ──────────────────────────────────── */}
      {progressTarget && (
        <FormModal open title="Update Production Progress" onClose={() => { setProgressTarget(null); setProgressQty('0'); }} onSubmit={handleProgressMO} submitLabel={saving ? 'Saving...' : 'Update'} submitDisabled={saving}>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Product: <strong>{progressTarget.product_name || progressTarget.product_id}</strong></p>
            <p className="text-sm text-gray-600">Target: {progressTarget.quantity}</p>
            <Input label="Produced Quantity" type="number" value={progressQty} onChange={(e) => setProgressQty(e.target.value)} min="0" />
          </div>
        </FormModal>
      )}

      {/* ── Confirm Dialog ──────────────────────────────────── */}
      <ConfirmDialog
        open={!!confirmTarget}
        title={`Confirm ${confirmTarget?.type === 'warehouse' ? 'Delete' : confirmTarget?.type === 'transfer' ? 'Transfer' : 'Receive PO'}`}
        message={
          confirmTarget?.type === 'warehouse'
            ? `Are you sure you want to deactivate "${String(confirmTarget?.item?.name || '')}"?`
            : confirmTarget?.type === 'transfer'
            ? 'Confirm this transfer? Stock will be moved immediately.'
            : 'Receive this purchase order? Stock will be updated.'
        }
        confirmLabel={confirmTarget?.type === 'warehouse' ? 'Deactivate' : 'Confirm'}
        danger={confirmTarget?.type === 'warehouse'}
        onConfirm={confirmTarget?.type === 'warehouse' ? handleDeleteWh : confirmTarget?.type === 'transfer' ? handleConfirmTransfer : handleReceivePO}
        onCancel={() => setConfirmTarget(null)}
      />
    </Card>
  );
}
