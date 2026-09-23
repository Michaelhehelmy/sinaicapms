import { describe, it, expect } from 'vitest';
import {
  orderBalance,
  isOutstanding,
  isOverpayment,
  isPaymentMethod,
  validateRecordPayment,
  sumPayments,
  computeReceiptTotals,
  isTodayIso,
  filterTodayPayments,
  sumTodayCash,
  round2,
} from '@/lib/cashdesk';

describe('orderBalance', () => {
  it('derives balance as total minus paid', () => {
    expect(orderBalance({ totalAmount: 500, amountPaid: 200 })).toBe(300);
  });

  it('treats missing amounts as zero', () => {
    expect(orderBalance({ totalAmount: null, amountPaid: undefined })).toBe(0);
  });

  it('rounds float dust to cents', () => {
    expect(orderBalance({ totalAmount: 100.1, amountPaid: 33.33 })).toBe(66.77);
  });
});

describe('isOutstanding / isOverpayment', () => {
  it('flags positive balances as outstanding', () => {
    expect(isOutstanding({ totalAmount: 500, amountPaid: 499.99 })).toBe(true);
    expect(isOutstanding({ totalAmount: 500, amountPaid: 500 })).toBe(false);
  });

  it('ignores sub-cent float dust', () => {
    expect(isOutstanding({ totalAmount: 100, amountPaid: 99.999 })).toBe(false);
  });

  it('flags amounts above the balance as overpayment', () => {
    const order = { totalAmount: 500, amountPaid: 200 };
    expect(isOverpayment(order, 300)).toBe(false);
    expect(isOverpayment(order, 300.01)).toBe(true);
  });
});

describe('isPaymentMethod', () => {
  it('accepts only the POS canonical enum', () => {
    expect(isPaymentMethod('cash')).toBe(true);
    expect(isPaymentMethod('card')).toBe(true);
    expect(isPaymentMethod('split')).toBe(true);
    expect(isPaymentMethod('bank_transfer')).toBe(false);
    expect(isPaymentMethod('paymob')).toBe(false);
    expect(isPaymentMethod(undefined)).toBe(false);
  });
});

describe('validateRecordPayment', () => {
  const order = { totalAmount: 500, amountPaid: 200 };

  it('accepts a valid cash payment within the balance', () => {
    expect(validateRecordPayment(order, { amount: 300, method: 'cash' })).toBeNull();
  });

  it('rejects zero and negative amounts', () => {
    expect(validateRecordPayment(order, { amount: 0, method: 'cash' })).toMatch(/greater than zero/);
    expect(validateRecordPayment(order, { amount: -5, method: 'card' })).toMatch(/greater than zero/);
    expect(validateRecordPayment(order, { amount: NaN, method: 'cash' })).toMatch(/greater than zero/);
  });

  it('rejects unknown methods', () => {
    expect(
      validateRecordPayment(order, { amount: 10, method: 'bank_transfer' as never }),
    ).toMatch(/payment method/);
  });

  it('guards overpayment client-side', () => {
    expect(validateRecordPayment(order, { amount: 300.01, method: 'cash' })).toMatch(
      /exceeds the outstanding balance of 300\.00/,
    );
  });

  it('requires split legs that sum to the amount', () => {
    expect(
      validateRecordPayment(order, { amount: 100, method: 'split', amountCash: 60, amountCard: 40 }),
    ).toBeNull();
    expect(
      validateRecordPayment(order, { amount: 100, method: 'split', amountCash: 60, amountCard: 30 }),
    ).toMatch(/must equal/);
    expect(validateRecordPayment(order, { amount: 100, method: 'split' })).toMatch(/cash and card/);
  });
});

describe('sumPayments / computeReceiptTotals', () => {
  it('sums payment amounts to cents', () => {
    expect(sumPayments([{ amount: 100.1 }, { amount: 33.33 }])).toBe(133.43);
    expect(sumPayments([])).toBe(0);
  });

  it('computes before/after totals with the balance due', () => {
    const totals = computeReceiptTotals(
      { totalAmount: 500, amountPaid: 350 },
      [{ amount: 150 }],
    );
    expect(totals).toEqual({
      total: 500,
      paidBefore: 200,
      paymentsTotal: 150,
      paidTotal: 350,
      balance: 150,
    });
  });

  it('clamps paid-before at zero and balance at zero', () => {
    const totals = computeReceiptTotals(
      { totalAmount: 500, amountPaid: 500 },
      [{ amount: 500 }],
    );
    expect(totals.paidBefore).toBe(0);
    expect(totals.balance).toBe(0);
  });
});

describe('today helpers', () => {
  const now = new Date('2026-09-23T12:00:00');
  const todayIso = '2026-09-23T08:15:00.000Z';
  const yesterdayIso = '2026-09-22T08:15:00.000Z';

  it('detects local-calendar today', () => {
    expect(isTodayIso(new Date('2026-09-23T00:00:01').toISOString(), now)).toBe(true);
    expect(isTodayIso(yesterdayIso, now)).toBe(false);
    expect(isTodayIso(null, now)).toBe(false);
    expect(isTodayIso('not-a-date', now)).toBe(false);
  });

  it('filters to today-only payments', () => {
    const payments = [
      { id: 'a', createdAt: todayIso },
      { id: 'b', createdAt: yesterdayIso },
    ];
    expect(filterTodayPayments(payments, now).map((p) => p.id)).toEqual(['a']);
  });

  it('sums cash intake: cash in full plus split cash legs, never card', () => {
    const payments = [
      { method: 'cash', amount: 100, amountCash: null, createdAt: todayIso },
      { method: 'split', amount: 80, amountCash: 30, createdAt: todayIso },
      { method: 'card', amount: 50, amountCash: null, createdAt: todayIso },
      { method: 'cash', amount: 999, amountCash: null, createdAt: yesterdayIso },
    ];
    expect(sumTodayCash(payments, now)).toBe(130);
  });

  it('round2 normalizes cents', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(NaN as unknown as number)).toBe(0);
  });
});
