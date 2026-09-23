import React, { useMemo, useState } from 'react';
import { FormModal } from '@/components/ui/FormModal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useRecordPaymentMutation, useOrderPaymentsQuery } from '@/hooks/useQueryHooks';
import {
  orderBalance,
  validateRecordPayment,
  type CashPaymentMethod,
  type PaymentRecord,
  type RecordPaymentResponse,
} from '@/lib/cashdesk';
import { formatCurrency } from '@/lib/utils';
import type { Order } from '@/hooks/useAdminData';
import PaymentReceipt from './PaymentReceipt';

interface RecordPaymentModalProps {
  order: Order;
  open: boolean;
  onClose: () => void;
}

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'split', label: 'Split (cash + card)' },
];

function errorMessage(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  return 'Failed to record payment.';
}

// ─── Record Payment modal ───────────────────────────────────────
// Phase 3.5: entry point from the order-detail modal (OrdersPanel) and the
// Cash Desk panel. Amount + method (cash|card|split) + optional reference /
// notes; overpayment is guarded client-side AND the server 400 is surfaced.
// No folio required. On success the view flips to the printable receipt.
export default function RecordPaymentModal({ order, open, onClose }: RecordPaymentModalProps) {
  const balance = orderBalance(order);
  const [amount, setAmount] = useState<string>(balance > 0 ? balance.toFixed(2) : '');
  const [method, setMethod] = useState<CashPaymentMethod>('cash');
  const [amountCash, setAmountCash] = useState('');
  const [amountCard, setAmountCard] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [receipt, setReceipt] = useState<{
    payments: PaymentRecord[];
    highlightIds: string[];
    order: Order;
  } | null>(null);

  const recordMutation = useRecordPaymentMutation();
  const { data: priorPayments } = useOrderPaymentsQuery(open && !receipt ? order.id : null);

  const toNumber = (raw: string): number => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };

  const clientError = useMemo(() => {
    if (receipt) return null;
    return validateRecordPayment(
      order,
      {
        amount: toNumber(amount),
        method,
        amountCash: method === 'split' ? toNumber(amountCash) : undefined,
        amountCard: method === 'split' ? toNumber(amountCard) : undefined,
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, amount, method, amountCash, amountCard, receipt]);

  const serverError = recordMutation.error ? errorMessage(recordMutation.error) : '';

  const handleClose = () => {
    if (recordMutation.isPending) return;
    setReceipt(null);
    onClose();
  };

  const handleSubmit = () => {
    if (clientError || recordMutation.isPending) return;
    const payload = {
      amount: toNumber(amount),
      method,
      ...(method === 'split'
        ? { amountCash: toNumber(amountCash), amountCard: toNumber(amountCard) }
        : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    recordMutation.mutate(
      { id: order.id, input: payload },
      {
        onSuccess: (resp: RecordPaymentResponse) => {
          const fresh: PaymentRecord[] = [
            ...(priorPayments ?? []),
            ...(resp?.payment ? [resp.payment] : []),
          ];
          const updated: Order = resp?.order
            ? {
                ...order,
                totalAmount: resp.order.totalAmount ?? order.totalAmount,
                amountPaid: resp.order.amountPaid ?? order.amountPaid,
                paymentStatus: resp.order.paymentStatus ?? order.paymentStatus,
              }
            : order;
          setReceipt({
            payments: fresh,
            highlightIds: resp?.payment ? [resp.payment.id] : [],
            order: updated,
          });
        },
      },
    );
  };

  if (!open) return null;

  if (receipt) {
    return (
      <PaymentReceipt
        order={receipt.order}
        payments={receipt.payments}
        highlightPaymentIds={receipt.highlightIds}
        onClose={handleClose}
      />
    );
  }

  return (
    <FormModal
      open
      title={`Record payment — ${order.reference || order.id}`}
      onClose={handleClose}
      onSubmit={handleSubmit}
      submitLabel={recordMutation.isPending ? 'Recording…' : 'Record payment'}
      submitDisabled={!!clientError || recordMutation.isPending}
      loading={recordMutation.isPending}
    >
      <div className="space-y-4 text-sm" data-testid="record-payment-form">
        <div className="bg-gray-50 rounded-lg p-3 flex flex-wrap gap-x-6 gap-y-1">
          <span>
            <strong>Total:</strong> {formatCurrency(order.totalAmount || 0)}
          </span>
          <span>
            <strong>Paid:</strong> {formatCurrency(order.amountPaid || 0)}
          </span>
          <span data-testid="record-payment-balance">
            <strong>Balance due:</strong> {formatCurrency(balance)}
          </span>
        </div>

        <Input
          label="Amount"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
          placeholder="0.00"
          data-testid="record-payment-amount"
        />

        <Select
          label="Method"
          options={METHOD_OPTIONS}
          value={method}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            setMethod(e.target.value as CashPaymentMethod)
          }
          data-testid="record-payment-method"
        />

        {method === 'split' && (
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Cash leg"
              type="number"
              min="0"
              step="0.01"
              value={amountCash}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmountCash(e.target.value)}
              placeholder="0.00"
              data-testid="record-payment-cash"
            />
            <Input
              label="Card leg"
              type="number"
              min="0"
              step="0.01"
              value={amountCard}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmountCard(e.target.value)}
              placeholder="0.00"
              data-testid="record-payment-card"
            />
          </div>
        )}

        <Input
          label="Reference (optional)"
          value={reference}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReference(e.target.value)}
          placeholder="Receipt / voucher ref"
          data-testid="record-payment-reference"
        />

        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotes(e.target.value)}
          placeholder="Cashier note"
          data-testid="record-payment-notes"
        />

        {clientError && (
          <p role="alert" data-testid="record-payment-error" className="text-sm text-red-600">
            {clientError}
          </p>
        )}
        {serverError && (
          <p role="alert" data-testid="record-payment-server-error" className="text-sm text-red-600">
            {serverError}
          </p>
        )}
      </div>
    </FormModal>
  );
}
