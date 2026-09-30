import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Folio, FolioCharge, FolioSettlement } from '@/lib/api';

interface FolioReceiptProps {
  folio: Folio;
  /** All charges (live + voided); voided rows render struck-through. */
  charges: FolioCharge[];
  /** Settlements applied (oldest first). */
  settlements: FolioSettlement[];
  /** project_id → display name; falls back to the raw id. */
  projectNames?: Record<string, string>;
  onClose: () => void;
}

export interface FolioReceiptGroup {
  projectId: string | null;
  label: string;
  charges: FolioCharge[];
  subtotal: number;
}

/** Group live charges by project for the project-grouped receipt layout. */
export function groupChargesByProject(
  charges: FolioCharge[],
  projectNames: Record<string, string> = {},
): FolioReceiptGroup[] {
  const live = charges.filter((c) => !c.voidedAt);
  const order: (string | null)[] = [];
  const buckets = new Map<string | null, FolioCharge[]>();
  for (const c of live) {
    const key = c.projectId ?? null;
    if (!buckets.has(key)) {
      buckets.set(key, []);
      order.push(key);
    }
    buckets.get(key)!.push(c);
  }
  return order.map((key) => {
    const rows = buckets.get(key)!;
    return {
      projectId: key,
      label: !key ? 'No project' : projectNames[key] || key,
      charges: rows,
      subtotal: Math.round(rows.reduce((s, c) => s + Number(c.totalPrice || 0), 0) * 100) / 100,
    };
  });
}

// ─── Folio receipt (printable, B.5) ─────────────────────────────────
// Payment-receipt style (same POS ReceiptModal pattern as PaymentReceipt:
// shared ui/Modal + `#folio-receipt-content` anchor + print stylesheet,
// thermal-style mono layout, window.print() footer). Charges render
// grouped by project with per-project subtotals; settlements render with
// cash/card legs; paid total + zero balance prove a full settle.
export default function FolioReceipt({
  folio,
  charges,
  settlements,
  projectNames = {},
  onClose,
}: FolioReceiptProps) {
  const groups = groupChargesByProject(charges, projectNames);
  const total = Number(folio.totalAmount || 0);
  const paidTotal =
    Math.round(settlements.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;
  const balance = Math.round((total - paidTotal) * 100) / 100;
  const latest = settlements[settlements.length - 1];
  const stampedAt = folio.closedAt
    ? new Date(String(folio.closedAt)).toLocaleString()
    : latest?.createdAt
      ? new Date(String(latest.createdAt)).toLocaleString()
      : new Date().toLocaleString();

  return (
    <Modal isOpen onClose={onClose} size="sm" testId="folio-receipt" showCloseButton={false}>
      <div id="folio-receipt-content">
        <style>{`
          @media print { body * { display: none !important; } #folio-receipt-content, #folio-receipt-content * { display: block !important; } }
        `}</style>
        <div className="font-mono text-xs space-y-1 text-center">
          <div className="text-lg font-bold">SinaiCamps</div>
          <div className="text-gray-500">Guest Folio Receipt</div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-left">Folio: {folio.id}</div>
          <div className="text-left">Guest: {folio.guestId || 'Walk-in'}</div>
          {folio.primaryOrderId && <div className="text-left">Order: {folio.primaryOrderId}</div>}
          <div className="text-left">Status: {folio.status}</div>
          {folio.openedAt && <div className="text-left">Opened: {formatDate(String(folio.openedAt))}</div>}
          <div className="border-t border-dashed border-gray-300 my-2" />
          {groups.map((g) => (
            <div key={g.projectId ?? 'none'} data-testid={`folio-receipt-group-${g.projectId ?? 'none'}`}>
              <div className="text-left font-bold">{g.label}</div>
              {g.charges.map((c) => (
                <div key={c.id} className="flex justify-between text-left" data-testid="folio-receipt-charge">
                  <span>
                    {c.description} × {c.quantity}
                  </span>
                  <span>{formatCurrency(Number(c.totalPrice || 0))}</span>
                </div>
              ))}
              <div className="flex justify-between text-left" data-testid="folio-receipt-subtotal">
                <span>Subtotal</span>
                <span>{formatCurrency(g.subtotal)}</span>
              </div>
              <div className="border-t border-dashed border-gray-300 my-2" />
            </div>
          ))}
          <div className="flex justify-between text-left font-bold">
            <span>Total</span>
            <span data-testid="folio-receipt-total">{formatCurrency(total)}</span>
          </div>
          {settlements.length > 0 && (
            <>
              <div className="border-t border-dashed border-gray-300 my-2" />
              <div className="text-left font-bold">Settlements</div>
              {settlements.map((s) => (
                <div key={s.id}>
                  <div className="flex justify-between text-left" data-testid="folio-receipt-settlement">
                    <span>{s.method}</span>
                    <span>{formatCurrency(Number(s.amount || 0))}</span>
                  </div>
                  {s.method === 'split' && (
                    <>
                      <div className="flex justify-between text-left pl-2">
                        <span>Cash</span>
                        <span>{formatCurrency(Number(s.amountCash || 0))}</span>
                      </div>
                      <div className="flex justify-between text-left pl-2">
                        <span>Card</span>
                        <span>{formatCurrency(Number(s.amountCard || 0))}</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </>
          )}
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="flex justify-between text-left font-bold">
            <span>Paid total</span>
            <span data-testid="folio-receipt-paid">{formatCurrency(paidTotal)}</span>
          </div>
          <div className="flex justify-between text-left font-bold">
            <span>Balance due</span>
            <span data-testid="folio-receipt-balance">{formatCurrency(balance)}</span>
          </div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-left">Settled by: {folio.settledBy || latest?.receivedBy || 'N/A'}</div>
          <div className="text-left">At: {stampedAt}</div>
          <div className="border-t border-dashed border-gray-300 my-2" />
          <div className="text-gray-500">Thank you!</div>
        </div>
      </div>
      <div className="mt-4 flex gap-2 w-full">
        <Button variant="secondary" size="md" className="flex-1" onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="primary" size="md" className="flex-1" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
