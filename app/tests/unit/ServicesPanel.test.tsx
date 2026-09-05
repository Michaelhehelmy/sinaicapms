import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ServicesPanel from '@/components/admin/ServicesPanel';

const mockShowToast = vi.fn();
let mockDefs: unknown[] = [];
let mockItems: unknown[] = [];
let mockBookings: unknown[] = [];
let mockDefsLoading = false;
let mockItemsLoading = false;
let mockBookingsLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useServiceDefinitionsQuery: () => ({ data: mockDefs, isLoading: mockDefsLoading }),
  useServiceItemsQuery: () => ({ data: mockItems, isLoading: mockItemsLoading }),
  useServiceBookingsQuery: () => ({ data: mockBookings, isLoading: mockBookingsLoading }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  cn: (...c: (string | undefined | false | null)[]) => c.filter(Boolean).join(' '),
}));

vi.mock('@/lib/api', () => ({
  saveServiceDefinition: vi.fn(),
  saveServiceItem: vi.fn(),
  deleteServiceDefinition: vi.fn(),
  deleteServiceItem: vi.fn(),
  updateBookingStatus: vi.fn(),
}));

import * as api from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
  mockDefs = [];
  mockItems = [];
  mockBookings = [];
  mockDefsLoading = false;
  mockItemsLoading = false;
  mockBookingsLoading = false;
});

describe('ServicesPanel', () => {
  it('shows loading spinner', () => {
    mockDefsLoading = true;
    render(<ServicesPanel />);
    expect(screen.getByText('Loading services...')).toBeTruthy();
  });

  it('shows empty states for all tabs', () => {
    render(<ServicesPanel />);
    expect(screen.getByText(/No service types/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('tab-items'));
    expect(screen.getByText(/No bookable items/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('tab-bookings'));
    expect(screen.getByText(/No bookings yet/)).toBeTruthy();
  });

  it('opens add definition modal', async () => {
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Plumbing Services')).toBeTruthy(); });
  });

  it('validates definition name required', async () => {
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Plumbing Services')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
  });

  it('creates definition successfully', async () => {
    (api.saveServiceDefinition as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Plumbing Services')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('e.g. Plumbing Services'), { target: { value: 'Plumbing' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect((api.saveServiceDefinition as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  it('opens add item modal', async () => {
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Emergency Plumbing')).toBeTruthy(); });
  });

  it('validates item name required', async () => {
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Emergency Plumbing')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
  });

  it('validates item service type required', async () => {
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Emergency Plumbing')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('e.g. Emergency Plumbing'), { target: { value: 'Fix' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Service type is required.', 'warning');
    });
  });

  it('creates item successfully', async () => {
    mockDefs = [{ id: 'd1', name: 'Plumbing', is_active: 1 }];
    (api.saveServiceItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Emergency Plumbing')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('e.g. Emergency Plumbing'), { target: { value: 'Fix' } });
    // Select definition
    const sel = document.querySelectorAll('select');
    fireEvent.change(sel[0], { target: { value: 'd1' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect((api.saveServiceItem as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });
  });

  it('edits a definition', async () => {
    mockDefs = [{ id: 'd1', name: 'Plumbing', slug: 'plumbing', description: 'desc', is_active: 1 }];
    render(<ServicesPanel />);
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Plumbing Services')).toBeTruthy(); });
  });

  it('edits an item', async () => {
    mockItems = [{ id: 'i1', name: 'Fix', service_definition_id: 'd1', base_price: 100, status: 'active' }];
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Emergency Plumbing')).toBeTruthy(); });
  });

  it('deletes a definition', async () => {
    mockDefs = [{ id: 'd1', name: 'Plumbing' }];
    (api.deleteServiceDefinition as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<ServicesPanel />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => { expect(screen.getByText(/Are you sure/)).toBeTruthy(); });
  });

  it('deletes an item', async () => {
    mockItems = [{ id: 'i1', name: 'Fix' }];
    (api.deleteServiceItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => { expect(screen.getByText(/Are you sure/)).toBeTruthy(); });
  });

  it('opens booking status update', async () => {
    mockBookings = [{ id: 'b1', item_name: 'Fix', customer_name: 'Bob', scheduled_date: '2025-06-01', status: 'pending' }];
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Booking Status')).toBeTruthy(); });
  });

  it('updates booking status', async () => {
    mockBookings = [{ id: 'b1', item_name: 'Fix', customer_name: 'Bob', scheduled_date: '2025-06-01', status: 'pending' }];
    (api.updateBookingStatus as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Booking Status')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Confirmed'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Booking marked as confirmed.', 'success');
    });
  });

  it('renders definitions with data', () => {
    mockDefs = [{ id: 'd1', name: 'Plumbing', slug: 'plumbing', description: 'All plumbing', is_active: 1 }];
    render(<ServicesPanel />);
    expect(screen.getByText('Plumbing')).toBeTruthy();
  });

  it('renders items with data', () => {
    mockItems = [{ id: 'i1', name: 'Fix', base_price: 50, status: 'active', definition_name: 'Plumbing' }];
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    expect(screen.getByText('Fix')).toBeTruthy();
  });

  it('renders bookings with data', () => {
    mockBookings = [{ id: 'b1', item_name: 'Fix', customer_name: 'Bob', scheduled_date: '2025-06-01T00:00:00Z', status: 'completed' }];
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    expect(screen.getByText('Fix')).toBeTruthy();
  });

  it('closes the booking status modal via the close button', async () => {
    mockBookings = [{ id: 'b1', item_name: 'Fix', customer_name: 'Bob', scheduled_date: '2025-06-01', status: 'pending' }];
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Booking Status')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => { expect(screen.queryByText('Update Booking Status')).toBeNull(); });
  });

  it('shows error when saving definition fails', async () => {
    (api.saveServiceDefinition as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('network'));
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Plumbing Services')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('e.g. Plumbing Services'), { target: { value: 'Plumbing' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: network', 'error');
    });
  });

  it('shows error when saving item fails', async () => {
    mockDefs = [{ id: 'd1', name: 'Plumbing', is_active: 1 }];
    (api.saveServiceItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('item err'));
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Emergency Plumbing')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('e.g. Emergency Plumbing'), { target: { value: 'Fix' } });
    const sel = document.querySelectorAll('select');
    fireEvent.change(sel[0], { target: { value: 'd1' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: item err', 'error');
    });
  });

  it('shows error when deleting definition fails', async () => {
    mockDefs = [{ id: 'd1', name: 'Plumbing' }];
    (api.deleteServiceDefinition as ReturnType<typeof vi.fn>).mockReset();
    (api.deleteServiceDefinition as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('del fail'));
    render(<ServicesPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByText(/Are you sure/)).toBeTruthy(); });
    // Confirm button is inside the dialog; the row Delete button is also present
    const dialog = screen.getByRole('dialog', { name: /Delete Service Type/ });
    fireEvent.click(within(dialog).getByText('Delete'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: del fail', 'error');
    });
  });

  it('shows error when deleting item fails', async () => {
    mockItems = [{ id: 'i1', name: 'Fix' }];
    (api.deleteServiceItem as ReturnType<typeof vi.fn>).mockReset();
    (api.deleteServiceItem as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('item del'));
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByText(/Are you sure/)).toBeTruthy(); });
    const dialog = screen.getByRole('dialog', { name: /Delete Service Item/ });
    fireEvent.click(within(dialog).getByText('Delete'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: item del', 'error');
    });
  });

  it('shows error when updating booking status fails', async () => {
    mockBookings = [{ id: 'b1', item_name: 'Fix', customer_name: 'Bob', scheduled_date: '2025-06-01', status: 'pending' }];
    (api.updateBookingStatus as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('status err'));
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-bookings'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Booking Status')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Confirmed'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: status err', 'error');
    });
  });

  it('confirms and completes a definition delete', async () => {
    mockDefs = [{ id: 'd1', name: 'Plumbing' }];
    (api.deleteServiceDefinition as ReturnType<typeof vi.fn>).mockReset();
    (api.deleteServiceDefinition as ReturnType<typeof vi.fn>).mockResolvedValue({});
    render(<ServicesPanel />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByText(/Are you sure/)).toBeTruthy(); });
    const dialog = screen.getByRole('dialog', { name: /Delete Service Type/ });
    fireEvent.click(within(dialog).getByText('Delete'));
    await waitFor(() => {
      expect(api.deleteServiceDefinition).toHaveBeenCalledWith('d1');
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
  });

  it('confirms and completes an item delete', async () => {
    mockItems = [{ id: 'i1', name: 'Fix' }];
    (api.deleteServiceItem as ReturnType<typeof vi.fn>).mockReset();
    (api.deleteServiceItem as ReturnType<typeof vi.fn>).mockResolvedValue({});
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByText(/Are you sure/)).toBeTruthy(); });
    const dialog = screen.getByRole('dialog', { name: /Delete Service Item/ });
    fireEvent.click(within(dialog).getByText('Delete'));
    await waitFor(() => {
      expect(api.deleteServiceItem).toHaveBeenCalledWith('i1');
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
  });

  it('closes the definition form modal via close button', async () => {
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('add-def-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Plumbing Services')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => { expect(screen.queryByPlaceholderText('e.g. Plumbing Services')).toBeNull(); });
  });

  it('closes the item form modal via close button', async () => {
    mockDefs = [{ id: 'd1', name: 'Plumbing', is_active: 1 }];
    render(<ServicesPanel />);
    fireEvent.click(screen.getByTestId('tab-items'));
    fireEvent.click(screen.getByTestId('add-item-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('e.g. Emergency Plumbing')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => { expect(screen.queryByPlaceholderText('e.g. Emergency Plumbing')).toBeNull(); });
  });
});
