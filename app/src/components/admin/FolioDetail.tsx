import React, { useMemo, useState } from 'react';
import {
  useFolioDetailQuery,
  useAddFolioChargeMutation,
  useVoidFolioChargeMutation,
  useSettleFolioMutation,
  useVoidFolioMutation,
} from '@/hooks/useQueryHooks';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import type {
  FolioCharge,
  FolioChargeSource,
  FolioSettlement,
  FolioSettleMethod,
  FolioStatus,
} from '@/lib/api';
import type { Camp } from '@/hooks/useAdminData';
import FolioReceipt from './FolioReceipt';

interface FolioDetailProps {
  folioId: string;
  camps?: Camp[];
  onClose: () => void;
}

const CHARGE_SOURCES: FolioChargeSource[] = ['room', 'restaurant', 'spa', 'shop', 'other'];
const SETTLE_METHODS: FolioSettleMethod[] = ['cash', 'card', 'split'];

function statusVariant(status: FolioStatus): 'success' | 'info' | 'neutral' {
  if (status === 'open') return 'success';
  if (status === 'settled') return 'info';
  return 'neutral';
}

// ─── Folio detail modal (B.5) ─────────────────────────────────────
// Charges + settlements tables for one folio; add/void charge, settle
// (cash/card/split, amount must equal the folio total), and admin void-folio
// modals. Live rows are never deleted — voids are status flips. After a
// successful settle the printable FolioReceipt is shown. Project labels
// resolve project_id → camp name (fallback: the raw id).
// TanStack Query only.
export default function FolioDetail({ folioId, camps = [], onClose }: FolioDetailProps) {
  const { data, isLoading, isError } = useFolioDetailQuery(folioId);
  const addCharge = useAddFolioChargeMutation();
  const voidCharge = useVoidFolioChargeMutation();
  const settle = useSettleFolioMutation();
  const voidFolio = useVoidFolioMutation();

  const [showAdd, setShowAdd] = useState(false);
  const [showSettle, setShowSettle] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const [source, setSource] = useState<FolioChargeSource>('room');
  const [description, setDescription] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');
  const [projectId, setProjectId] = useState('');

  const [method, setMethod] = useState<FolioSettleMethod>('cash');
  const [amountCash, setAmountCash] = useState('');
  const [amountCard, setAmountCard] = useState('');
  const [approvedBy, setApprovedBy] = useState('');
  const [voidReason, setVoidReason] = useState('');

  const folio = data?.folio;
  const charges: FolioCharge[] = data?.charges ?? [];
  const settlements: FolioSettlement[] = data?.settlements ?? [];

  const projectNames = useMemo(() => {
    const map: Record<string, string> = {};
    (camps ?? []).forEach((c) => {
      map[String(c.id)] = c.name;
    });
    return map;
  }, [camps]);

  const projectLabel = (id: string | null | undefined) =>
    !id ? '—' : projectNames[id] || id;

  const liveCharges = useMemo(() => charges.filter((c) => !c.voidedAt), [charges]);
  const liveTotal = useMemo(
    () => Math.round(liveCharges.reduce((s, c) => s + Number(c.totalPrice || 0), 0) * 100) / 100,
    [liveCharges],
  );
  const settledTotal = useMemo(
    () => Math.round(settlements.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100,
    [settlements],
  );
  const balance = useMemo(
    () => Math.round((Number(folio?.totalAmount ?? liveTotal) - settledTotal) * 100) / 100,
    [folio, liveTotal, settledTotal],
  );

  const handleAdd = () => {
    addCharge.mutate(
      {
        id: folioId,
        input: {
          source,
          description: description.trim(),
          quantity: Math.max(1, parseInt(quantity, 10) || 1),
          unitPrice: Math.max(0, Number(unitPrice) || 0),
          ...(projectId ? { projectId } : {}),
        },
      },
      {
        onSuccess: () => {
          setShowAdd(false);
          setDescription('');
          setQuantity('1');
          setUnitPrice('0');
          setProjectId('');
        },
      },
    );
  };

  const handleSettle = () => {
    const total = Number(folio?.totalAmount ?? liveTotal);
    const cash = method === 'cash' ? total : method === 'card' ? 0 : Number(amountCash) || 0;
    const card = method === 'card' ? total : method === 'cash' ? 0 : Number(amountCard) || 0;
    settle.mutate(
      {
        id: folioId,
        input: {
          amount: total,
          method,
          ...(method === 'split' ? { amountCash: cash, amountCard: card } : {}),
          ...(approvedBy.trim() ? { approvedBy: approvedBy.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          setShowSettle(false);
          setShowReceipt(true);
        },
      },
    );
  };

  const handleVoidFolio = () => {
    voidFolio.mutate(
      { id: folioId, ...(voidReason.trim() ? { input: { reason: voidReason.trim() } } : {}) },
      { onSuccess: () => setShowVoid(false) },
    );
  };

  return (
    <Modal isOpen onClose={onClose} title={`Folio ${folioId}`} size="lg" testId="folio-detail">
      {isLoading && <div data-testid="folio-detail-loading">Loading folio…</div>}
      {isError && (
        <p className="text-sm text-red-600" role="alert">
          Failed to load folio
        </p>
      )}
      {folio && (
        <div className="space-y-4" data-testid="folio-detail-body">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusVariant(folio.status)} size="md" dot>
              {folio.status}
            </Badge>
            <span className="text-sm text-gray-500">
              Guest: {folio.guestId || 'Walk-in'}
            </span>
            <span className="text-sm font-semibold" data-testid="folio-detail-total">
              Total: {formatCurrency(Number(folio.totalAmount || 0))}
            </span>
            <span className="text-sm font-semibold" data-testid="folio-detail-balance">
              Balance: {formatCurrency(balance)}
            </span>
          </div>

          <div>
            <h3 className="text-sm font-bold">Charges ({liveCharges.length} live)</h3>
            {charges.length === 0 ? (
              <p className="text-sm text-gray-500">No charges posted yet.</p>
            ) : (
              <table className="mt-1 w-full text-sm" data-testid="folio-charges-table">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 pr-2">Description</th>
                    <th className="py-1 pr-2">Source</th>
                    <th className="py-1 pr-2">Project</th>
                    <th className="py-1 pr-2">Qty</th>
                    <th className="py-1 pr-2">Total</th>
                    <th className="py-1 pr-2">Status</th>
                    <th className="py-1">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((c) => (
                    <tr key={c.id} data-testid={`folio-charge-${c.id}`} className="border-t border-gray-100">
                      <td className="py-1 pr-2">{c.description}</td>
                      <td className="py-1 pr-2">
                        <Badge variant="info" size="sm">
                          {c.source}
                        </Badge>
                      </td>
                      <td className="py-1 pr-2" data-testid={`folio-charge-project-${c.id}`}>
                        {projectLabel(c.projectId)}
                      </td>
                      <td className="py-1 pr-2">{c.quantity}</td>
                      <td className="py-1 pr-2">{formatCurrency(Number(c.totalPrice || 0))}</td>
                      <td className="py-1 pr-2">{c.voidedAt ? 'voided' : 'live'}</td>
                      <td className="py-1">
                        {!c.voidedAt && folio.status === 'open' && (
                          <Button
                            variant="ghost"
                            size="md"
                            onClick={() => voidCharge.mutate({ id: folioId, chargeId: c.id })}
                            disabled={voidCharge.isPending}
                          >
                            Void
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold">Settlements ({settlements.length})</h3>
            {settlements.length === 0 ? (
              <p className="text-sm text-gray-500">No settlements yet.</p>
            ) : (
              <table className="mt-1 w-full text-sm" data-testid="folio-settlements-table">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-1 pr-2">Method</th>
                    <th className="py-1 pr-2">Amount</th>
                    <th className="py-1 pr-2">Received by</th>
                    <th className="py-1">At</th>
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s) => (
                    <tr key={s.id} data-testid={`folio-settlement-${s.id}`} className="border-t border-gray-100">
                      <td className="py-1 pr-2">{s.method}</td>
                      <td className="py-1 pr-2">{formatCurrency(Number(s.amount || 0))}</td>
                      <td className="py-1 pr-2">{s.receivedBy || '—'}</td>
                      <td className="py-1">{s.createdAt ? formatDate(String(s.createdAt)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {folio.status === 'open' && (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="md" onClick={() => setShowAdd(true)}>
                Add Charge
              </Button>
              <Button variant="secondary" size="md" onClick={() => setShowSettle(true)}>
                Settle
              </Button>
              <Button variant="ghost" size="md" onClick={() => setShowVoid(true)}>
                Void Folio
              </Button>
            </div>
          )}
          {folio.status !== 'open' && (
            <Button variant="secondary" size="md" onClick={() => setShowReceipt(true)}>
              View Receipt
            </Button>
          )}
        </div>
      )}

      {/* Add-charge modal */}
      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="Post charge" testId="folio-add-modal">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600">Source</span>
            <select
              aria-label="Charge source"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={source}
              onChange={(e) => setSource(e.target.value as FolioChargeSource)}
            >
              {CHARGE_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Description</span>
            <input
              aria-label="Charge description"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <label className="block flex-1 text-sm">
              <span className="text-gray-600">Qty</span>
              <input
                aria-label="Charge quantity"
                type="number"
                min={1}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>
            <label className="block flex-1 text-sm">
              <span className="text-gray-600">Unit price</span>
              <input
                aria-label="Charge unit price"
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">Project (optional)</span>
            <select
              aria-label="Charge project"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">No project</option>
              {(camps ?? []).map((c) => (
                <option key={String(c.id)} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {addCharge.isError && (
            <p className="text-sm text-red-600" role="alert">
              Failed to post charge
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              onClick={handleAdd}
              disabled={addCharge.isPending || !description.trim()}
            >
              {addCharge.isPending ? 'Posting…' : 'Post Charge'}
            </Button>
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Settle modal */}
      <Modal isOpen={showSettle} onClose={() => setShowSettle(false)} title="Settle folio" testId="folio-settle-modal">
        <div className="space-y-3">
          <p className="text-sm" data-testid="folio-settle-total">
            Amount due: {formatCurrency(Number(folio?.totalAmount ?? liveTotal))}
          </p>
          <label className="block text-sm">
            <span className="text-gray-600">Method</span>
            <select
              aria-label="Settle method"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as FolioSettleMethod)}
            >
              {SETTLE_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          {method === 'split' && (
            <div className="flex gap-2">
              <label className="block flex-1 text-sm">
                <span className="text-gray-600">Cash leg</span>
                <input
                  aria-label="Split cash amount"
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={amountCash}
                  onChange={(e) => setAmountCash(e.target.value)}
                />
              </label>
              <label className="block flex-1 text-sm">
                <span className="text-gray-600">Card leg</span>
                <input
                  aria-label="Split card amount"
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={amountCard}
                  onChange={(e) => setAmountCard(e.target.value)}
                />
              </label>
            </div>
          )}
          <label className="block text-sm">
            <span className="text-gray-600">Approved by (optional)</span>
            <input
              aria-label="Approved by"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
            />
          </label>
          {settle.isError && (
            <p className="text-sm text-red-600" role="alert">
              Failed to settle folio
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              onClick={handleSettle}
              disabled={settle.isPending}
            >
              {settle.isPending ? 'Settling…' : 'Settle in Full'}
            </Button>
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setShowSettle(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Void-folio modal (admin tier, enforced server-side) */}
      <Modal isOpen={showVoid} onClose={() => setShowVoid(false)} title="Void folio" testId="folio-void-modal">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Voiding flips the folio status — charges and settlements are retained for audit.
          </p>
          <label className="block text-sm">
            <span className="text-gray-600">Reason (optional)</span>
            <input
              aria-label="Void reason"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
            />
          </label>
          {voidFolio.isError && (
            <p className="text-sm text-red-600" role="alert">
              Failed to void folio
            </p>
          )}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="md"
              className="flex-1"
              onClick={handleVoidFolio}
              disabled={voidFolio.isPending}
            >
              {voidFolio.isPending ? 'Voiding…' : 'Void Folio'}
            </Button>
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setShowVoid(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {showReceipt && folio && (
        <FolioReceipt
          folio={folio}
          charges={charges}
          settlements={settlements}
          projectNames={projectNames}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </Modal>
  );
}
