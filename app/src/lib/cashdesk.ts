/**
 * Phase 3.5 Admin Cash Desk v1 — shared types + pure math helpers.
 *
 * The record-payment wire contract is owned by P35-B (backend):
 *   POST /api/orders/:id/record-payment
 * This module holds everything the frontend can own without the backend:
 * method enum (mirrors the POS canonical enum cash|card|split from
 * backend/src/routes/pos/index.js:24), client-side validation (including the
 * overpayment guard), and receipt-totals math. Zero raw fetch, zero globals.
 */

export const PAYMENT_METHODS = ['cash', 'card', 'split'] as const;
export type CashPaymentMethod = (typeof PAYMENT_METHODS)[number];

/** One applied payment against a booking order (P35-B record shape). */
export interface PaymentRecord {
  id: string;
  orderId: string;
  amount: number;
  method: string;
  amountCash?: number | null;
  amountCard?: number | null;
  reference?: string | null;
  notes?: string | null;
  receivedBy?: string | null;
  approvedBy?: string | null;
  createdAt?: string | null;
  /** Optional project tag echoed by the backend — rendered when present. */
  projectTag?: string | null;
  campName?: string | null;
}

/** POST /api/orders/:id/record-payment request body. */
export interface RecordPaymentInput {
  amount: number;
  method: CashPaymentMethod;
  /** Required when method === 'split': cash leg of the payment. */
  amountCash?: number;
  /** Required when method === 'split': card leg of the payment. */
  amountCard?: number;
  reference?: string;
  notes?: string;
}

/** POST /api/orders/:id/record-payment response (P35-B contract). */
export interface RecordPaymentResponse {
  success: boolean;
  payment: PaymentRecord;
  order: {
    id: string;
    totalAmount: number;
    amountPaid: number;
    paymentStatus: string;
  };
}

/** Minimal order shape needed for balance math (mirrors useAdminData Order). */
export interface BalanceOrder {
  totalAmount: number | null | undefined;
  amountPaid: number | null | undefined;
}

/** Float tolerance (EGP cents) for balance/overpayment comparisons. */
export const BALANCE_EPSILON = 0.005;
/** Float tolerance for split-leg sum checks (±0.01 per POS precedent). */
export const SPLIT_EPSILON = 0.011;

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Derived balance — there is no `balance` column (recon §1.1). */
export function orderBalance(order: BalanceOrder): number {
  return round2(Number(order.totalAmount || 0) - Number(order.amountPaid || 0));
}

export function isOutstanding(order: BalanceOrder): boolean {
  return orderBalance(order) > BALANCE_EPSILON;
}

export function isOverpayment(order: BalanceOrder, amount: number): boolean {
  return Number(amount) - orderBalance(order) > BALANCE_EPSILON;
}

export function isPaymentMethod(value: unknown): value is CashPaymentMethod {
  return (
    typeof value === 'string' &&
    (PAYMENT_METHODS as readonly string[]).includes(value)
  );
}

/**
 * Client-side validation for the Record Payment form.
 * Returns a human-readable error, or null when the input is submittable.
 * The backend re-validates everything (overpayment → 400); this only
 * prevents obviously-invalid submissions. No folio required.
 */
export function validateRecordPayment(
  order: BalanceOrder,
  input: RecordPaymentInput,
): string | null {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Enter an amount greater than zero.';
  }
  if (!isPaymentMethod(input.method)) {
    return 'Choose a payment method (cash, card, or split).';
  }
  if (input.method === 'split') {
    const cash = Number(input.amountCash);
    const card = Number(input.amountCard);
    if (!Number.isFinite(cash) || cash < 0 || !Number.isFinite(card) || card < 0) {
      return 'Enter the cash and card legs of the split payment.';
    }
    if (Math.abs(cash + card - amount) > SPLIT_EPSILON) {
      return 'Cash + card legs must equal the payment amount.';
    }
  }
  if (isOverpayment(order, amount)) {
    return `Amount exceeds the outstanding balance of ${orderBalance(order).toFixed(2)}.`;
  }
  return null;
}

export function sumPayments(payments: Pick<PaymentRecord, 'amount'>[]): number {
  return round2(payments.reduce((sum, p) => sum + Number(p.amount || 0), 0));
}

export interface ReceiptTotals {
  total: number;
  paidBefore: number;
  paymentsTotal: number;
  paidTotal: number;
  balance: number;
}

/**
 * Receipt totals math: totals + payments applied + remaining balance.
 * `paidBefore` is the order's amountPaid minus the payments in this batch
 * (clamped at zero) so the receipt shows before/after consistently even when
 * the backend already folded the new payment into amountPaid.
 */
export function computeReceiptTotals(
  order: BalanceOrder,
  payments: Pick<PaymentRecord, 'amount'>[],
): ReceiptTotals {
  const total = round2(Number(order.totalAmount || 0));
  const paidTotal = round2(Number(order.amountPaid || 0));
  const paymentsTotal = sumPayments(payments);
  const paidBefore = round2(Math.max(0, paidTotal - paymentsTotal));
  return {
    total,
    paidBefore,
    paymentsTotal,
    paidTotal,
    balance: round2(Math.max(0, total - paidTotal)),
  };
}

/** True when an ISO timestamp falls on the local calendar day "today". */
export function isTodayIso(value: string | null | undefined, now = new Date()): boolean {
  if (!value) return false;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function filterTodayPayments<T extends Pick<PaymentRecord, 'createdAt'>>(
  payments: T[],
  now = new Date(),
): T[] {
  return payments.filter((p) => isTodayIso(p.createdAt, now));
}

/**
 * Today's cash intake: cash payments in full plus the cash leg of splits.
 * Card-only payments never count toward the cash drawer.
 */
export function sumTodayCash(
  payments: Pick<PaymentRecord, 'method' | 'amount' | 'amountCash' | 'createdAt'>[],
  now = new Date(),
): number {
  return round2(
    filterTodayPayments(
      payments as Pick<PaymentRecord, 'createdAt'>[],
      now,
    ).reduce((sum, p) => {
      const rec = p as Pick<PaymentRecord, 'method' | 'amount' | 'amountCash'>;
      if (rec.method === 'cash') return sum + Number(rec.amount || 0);
      if (rec.method === 'split') return sum + Number(rec.amountCash || 0);
      return sum;
    }, 0),
  );
}
