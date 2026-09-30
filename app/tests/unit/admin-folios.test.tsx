import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FoliosPanel from '@/components/admin/FoliosPanel';
import FolioDetail from '@/components/admin/FolioDetail';
import FolioReceipt from '@/components/admin/FolioReceipt';
import type { FolioDetailResponse } from '@/lib/api';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const api = vi.hoisted(() => ({
  listFolios: vi.fn(),
  getFolio: vi.fn(),
  createFolio: vi.fn(),
  addFolioCharge: vi.fn(),
  voidFolioCharge: vi.fn(),
  settleFolio: vi.fn(),
  voidFolio: vi.fn(),
}));

vi.mock('@/lib/api', () => api);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, queryClient };
}

const camps = [{ id: 'c1', name: 'Acacia' } as never];

function openFolioFixture() {
  return {
    folio: {
      id: 'folio_1',
      guestId: 'g1',
      primaryOrderId: 'o1',
      status: 'open',
      totalAmount: 300,
      openedAt: '2026-09-30T10:00:00.000Z',
    },
    charges: [
      {
        id: 'chg_1',
        folioId: 'folio_1',
        projectId: 'c1',
        source: 'room',
        description: 'Room night',
        quantity: 1,
        unitPrice: 300,
        totalPrice: 300,
        voidedAt: null,
      },
    ],
    settlements: [],
  } as unknown as FolioDetailResponse;
}

describe('FoliosPanel (B.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists folios with status counts and filters by status', async () => {
    const { wrapper } = createWrapper();
    api.listFolios.mockResolvedValue({
      folios: [
        { id: 'folio_1', guestId: 'g1', status: 'open', totalAmount: 300, openedAt: '2026-09-30T10:00:00.000Z' },
        { id: 'folio_2', guestId: null, status: 'settled', totalAmount: 150, openedAt: '2026-09-29T10:00:00.000Z' },
      ],
      counts: { open: 1, settled: 1, voided: 0, total: 2 },
      total: 2,
      limit: 50,
      offset: 0,
    });
    render(<FoliosPanel campIds={['c1']} camps={camps} />, { wrapper });

    await waitFor(() => expect(screen.getByText('folio_1')).toBeInTheDocument());
    expect(screen.getByText('folio_2')).toBeInTheDocument();
    expect(screen.getByTestId('folios-stats')).toHaveTextContent('Open: 1');
    expect(api.listFolios).toHaveBeenCalledWith({});

    fireEvent.change(screen.getByLabelText('Status filter'), { target: { value: 'open' } });
    await waitFor(() => expect(api.listFolios).toHaveBeenCalledWith({ status: 'open' }));
  });

  it('add-live: posting a charge calls the API and invalidates list + detail', async () => {
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    api.getFolio.mockResolvedValue(openFolioFixture());
    api.addFolioCharge.mockResolvedValue({ success: true, id: 'chg_2', totalAmount: 350 });
    render(<FolioDetail folioId="folio_1" camps={camps} onClose={() => {}} />, { wrapper });

    await waitFor(() => expect(screen.getByTestId('folio-charge-chg_1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Add Charge'));
    fireEvent.change(screen.getByLabelText('Charge description'), { target: { value: 'Minibar' } });
    fireEvent.change(screen.getByLabelText('Charge unit price'), { target: { value: '50' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Post Charge'));
    });

    await waitFor(() => expect(api.addFolioCharge).toHaveBeenCalled());
    expect(api.addFolioCharge).toHaveBeenCalledWith(
      'folio_1',
      expect.objectContaining({ source: 'room', description: 'Minibar', unitPrice: 50 }),
    );
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'folios'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'folios', 'folio_1'] });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Charge posted', 'success');
  });

  it('void-live: voiding a live charge calls the API and invalidates list + detail', async () => {
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    api.getFolio.mockResolvedValue(openFolioFixture());
    api.voidFolioCharge.mockResolvedValue({ success: true, id: 'chg_1', totalAmount: 0 });
    render(<FolioDetail folioId="folio_1" camps={camps} onClose={() => {}} />, { wrapper });

    await waitFor(() => expect(screen.getByTestId('folio-charge-chg_1')).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText('Void'));
    });

    await waitFor(() => expect(api.voidFolioCharge).toHaveBeenCalledWith('folio_1', 'chg_1'));
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'folios'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'folios', 'folio_1'] });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Charge voided', 'success');
  });

  it('settle-balance: settling posts the full balance and the receipt shows zero due', async () => {
    const { wrapper, queryClient } = createWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const open = openFolioFixture();
    const settled = {
      folio: { ...open.folio, status: 'settled', closedAt: '2026-09-30T12:00:00.000Z', settledBy: 'admin-1' },
      charges: open.charges,
      settlements: [
        { id: 'stl_1', folioId: 'folio_1', amount: 300, method: 'cash', amountCash: 300, amountCard: 0, receivedBy: 'admin-1' },
      ],
    } as unknown as FolioDetailResponse;
    api.getFolio.mockResolvedValueOnce(open).mockResolvedValueOnce(settled).mockResolvedValue(settled);
    api.settleFolio.mockResolvedValue({ success: true });
    render(<FolioDetail folioId="folio_1" camps={camps} onClose={() => {}} />, { wrapper });

    await waitFor(() => expect(screen.getByTestId('folio-detail-balance')).toHaveTextContent('$300.00'));
    fireEvent.click(screen.getByText('Settle'));
    await act(async () => {
      fireEvent.click(screen.getByText('Settle in Full'));
    });

    await waitFor(() => expect(api.settleFolio).toHaveBeenCalled());
    // Full-balance settle: amount must equal the folio total exactly.
    expect(api.settleFolio).toHaveBeenCalledWith('folio_1', expect.objectContaining({ amount: 300, method: 'cash' }));
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'folios'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'folios', 'folio_1'] });
    });
    // Refetch serves the settled folio → receipt opens with zero balance due.
    await waitFor(() => expect(screen.getByTestId('folio-receipt')).toBeInTheDocument());
    expect(screen.getByTestId('folio-receipt-balance')).toHaveTextContent('$0.00');
    expect(screen.getByTestId('folio-receipt-paid')).toHaveTextContent('$300.00');
  });

  it('receipt-grouped: receipt groups live charges by project with subtotals', () => {
    const { wrapper } = createWrapper();
    const folio = {
      id: 'folio_9',
      guestId: 'g9',
      status: 'settled',
      totalAmount: 450,
      openedAt: '2026-09-30T10:00:00.000Z',
      closedAt: '2026-09-30T12:00:00.000Z',
      settledBy: 'admin-1',
    };
    const charges = [
      { id: 'chg_a', projectId: 'c1', source: 'room', description: 'Room night', quantity: 1, unitPrice: 300, totalPrice: 300, voidedAt: null },
      { id: 'chg_b', projectId: 'c2', source: 'restaurant', description: 'Dinner', quantity: 1, unitPrice: 100, totalPrice: 100, voidedAt: null },
      { id: 'chg_c', projectId: 'c2', source: 'spa', description: 'Massage', quantity: 1, unitPrice: 50, totalPrice: 50, voidedAt: null },
      // Voided rows are excluded from groups (status flip, retained for audit).
      { id: 'chg_d', projectId: 'c1', source: 'shop', description: 'Voided item', quantity: 1, unitPrice: 999, totalPrice: 999, voidedAt: '2026-09-30T11:00:00.000Z' },
    ];
    render(
      <FolioReceipt
        folio={folio as never}
        charges={charges as never}
        settlements={[]}
        projectNames={{ c1: 'Acacia', c2: 'Dahab Hub' }}
        onClose={() => {}}
      />,
      { wrapper },
    );

    expect(screen.getByTestId('folio-receipt-group-c1')).toHaveTextContent('Acacia');
    expect(screen.getByTestId('folio-receipt-group-c2')).toHaveTextContent('Dahab Hub');
    expect(screen.queryByText('Voided item')).not.toBeInTheDocument();
    expect(screen.getByTestId('folio-receipt')).toHaveTextContent('$450.00');
  });
});
