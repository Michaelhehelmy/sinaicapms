import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recordPayment, getOrderPayments } from '@/lib/api';

global.fetch = vi.fn();

function setTestHostname(hostname: string) {
  Object.defineProperty(window, 'location', {
    value: { hostname, origin: `https://${hostname}`, search: '' },
    writable: true,
  });
}

function mockFetch(jsonResponse: unknown, ok = true) {
  setTestHostname('test.sinaicamps.com');
  vi.mocked(fetch).mockClear();
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(jsonResponse),
    headers: { get: () => 'application/json' },
  } as unknown as Response);
}

describe('recordPayment (P35 contract)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('POSTs to /orders/:id/record-payment with the payment body', async () => {
    const response = {
      success: true,
      payment: { id: 'pay_1', orderId: 'o1', amount: 150, method: 'cash' },
      order: { id: 'o1', totalAmount: 500, amountPaid: 350, paymentStatus: 'pending' },
    };
    mockFetch(response);

    const result = await recordPayment('o1', { amount: 150, method: 'cash' });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/orders/o1/record-payment');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body as string)).toEqual({ amount: 150, method: 'cash' });
    expect(result).toEqual(response);
  });

  it('sends split legs in one call', async () => {
    mockFetch({ success: true });
    await recordPayment('o2', {
      amount: 100,
      method: 'split',
      amountCash: 60,
      amountCard: 40,
      reference: 'V-123',
    });
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(opts.body as string)).toEqual({
      amount: 100,
      method: 'split',
      amountCash: 60,
      amountCard: 40,
      reference: 'V-123',
    });
  });
});

describe('getOrderPayments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('GETs /orders/:id/payments and returns a bare array', async () => {
    const payments = [{ id: 'pay_1', orderId: 'o1', amount: 150, method: 'cash' }];
    mockFetch(payments);
    const result = await getOrderPayments('o1');
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/orders/o1/payments');
    expect(result).toEqual(payments);
  });

  it('unwraps a { data } envelope', async () => {
    const payments = [{ id: 'pay_1', orderId: 'o1', amount: 150, method: 'cash' }];
    mockFetch({ data: payments });
    await expect(getOrderPayments('o1')).resolves.toEqual(payments);
  });

  it('returns [] for unexpected shapes', async () => {
    mockFetch({ success: true });
    await expect(getOrderPayments('o1')).resolves.toEqual([]);
  });
});
