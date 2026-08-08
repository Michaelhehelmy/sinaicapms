import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import RoomsPanel from '@/components/admin/RoomsPanel';

const mockShowToast = vi.fn();
const mockRefreshRooms = vi.fn();
const mockRefreshTypes = vi.fn();

const mockProducts = [
  { id: 'pt1', name: 'Standard Room', capacity: 4, basePrice: 100, description: 'Basic room', imageUrl: '', campIds: ['c1'] },
];

const mockRoomRows = [
  { id: 'r1', campId: 'c1', productId: 'pt1', name: 'Room 101', floor: '1', status: 'available', bedType: 'single', maxGuests: 2, basePrice: 100 },
  { id: 'r2', campId: 'c1', productId: 'pt1', name: 'Room 102', floor: '2', status: 'occupied', bedType: 'double', maxGuests: 3, basePrice: 150 },
];

const state = vi.hoisted(() => ({ rooms: [] as any[] }));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useAdminData', () => ({
  useRooms: () => ({ data: [], loading: false, refresh: mockRefreshRooms }),
  useProducts: () => ({ data: mockProducts, loading: false, refresh: mockRefreshTypes }),
  useCamps: () => ({ data: [] }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useRoomsQuery: () => ({ data: state.rooms, isLoading: false, refetch: mockRefreshRooms }),
  useProductsQuery: () => ({ data: mockProducts, isLoading: false, refetch: mockRefreshTypes }),
  useCampsQuery: () => ({ data: [] }),
  useSaveRoomMutation: (editId?: string) => ({
    mutateAsync: async (data: unknown) => {
      try {
        return await api.saveRoom(data, editId);
      } catch (err) {
        mockShowToast('Error saving room: ' + (err as Error).message, 'error');
      }
    },
  }),
  useDeleteRoomMutation: () => ({ mutateAsync: (id: string) => api.deleteRoom(id) }),
  useSaveProductMutation: (editId?: string) => ({
    mutateAsync: async (data: unknown) => {
      try {
        return await api.saveProduct(data, editId);
      } catch (err) {
        mockShowToast('Error saving product: ' + (err as Error).message, 'error');
      }
    },
  }),
  useDeleteProductMutation: () => ({ mutateAsync: (id: string) => api.deleteProduct(id) }),
}));

vi.mock('@/lib/api', () => ({
  saveRoom: vi.fn(),
  deleteRoom: vi.fn(),
  saveProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...classes: (string | undefined | false | null)[]) => classes.filter(Boolean).join(' '),
}));

import * as api from '@/lib/api';
const mockSaveRoom = vi.mocked(api.saveRoom);
const mockSaveProduct = vi.mocked(api.saveProduct);
const mockDeleteRoom = vi.mocked(api.deleteRoom);
const mockDeleteProduct = vi.mocked(api.deleteProduct);

const camps = [{ id: 'c1', name: 'Camp 1', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' }];

describe('RoomsPanel', () => {
  afterEach(() => {
    state.rooms = [];
    vi.clearAllMocks();
  });

  it('renders with rooms section by default', () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    expect(screen.getAllByText('Rooms').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Add Room').length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no rooms', () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('No rooms yet')).toBeInTheDocument();
  });

  it('switches to products section', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => {
      expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows product type summary when products exist', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => {
      expect(screen.getByText('Type Summary')).toBeInTheDocument();
      expect(screen.getAllByText('Standard Room').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('opens add room form', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    const addBtns = screen.getAllByText('Add Room');
    fireEvent.click(addBtns[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Room')).toBeInTheDocument();
    });
  });

  it('validates required fields on room save', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    const addBtns = screen.getAllByText('Add Room');
    fireEvent.click(addBtns[0]);
    await waitFor(() => { expect(screen.getByText('Add New Room')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Save Room'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Camp, product type, and room name are required.', 'warning');
    });
  });

  it('validates room name required when other fields present', async () => {
    mockSaveRoom.mockResolvedValue({} as any);
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    const addBtns = screen.getAllByText('Add Room');
    fireEvent.click(addBtns[0]);
    await waitFor(() => { expect(screen.getByText('Add New Room')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Save Room'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Camp, product type, and room name are required.', 'warning');
      expect(mockSaveRoom).not.toHaveBeenCalled();
    });
  });

  it('opens add product form', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Product')[0]);
    await waitFor(() => {
      expect(screen.getByText('Add New Product')).toBeInTheDocument();
    });
  });

  it('validates product name required', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Product')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Product')).toBeInTheDocument(); });
    fireEvent.click(screen.getByText('Save Product'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Product name is required.', 'warning');
    });
  });

  it('validates capacity > 0', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Product')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Product')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Room type name'), { target: { value: 'Type A' } });
    fireEvent.change(screen.getByLabelText('Capacity *'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save Product'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Capacity must be greater than 0.', 'warning');
    });
  });

  it('validates at least one camp assigned', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Product')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Product')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Room type name'), { target: { value: 'Type A' } });
    fireEvent.change(screen.getByLabelText('Capacity *'), { target: { value: '2' } });
    fireEvent.click(screen.getByText('Save Product'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Assign the product to at least one camp.', 'warning');
    });
  });

  it('saves product with valid data', async () => {
    mockSaveProduct.mockResolvedValue({} as any);
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Product')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Product')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Room type name'), { target: { value: 'Type A' } });
    fireEvent.change(screen.getByLabelText('Capacity *'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Camp 1'));
    fireEvent.click(screen.getByText('Save Product'));
    await waitFor(() => {
      expect(mockSaveProduct).toHaveBeenCalled();
    });
  });

  it('handles product save error', async () => {
    mockSaveProduct.mockRejectedValue(new Error('Save failed'));
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Product')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Product')).toBeInTheDocument(); });
    fireEvent.change(screen.getByPlaceholderText('Room type name'), { target: { value: 'Type A' } });
    fireEvent.change(screen.getByLabelText('Capacity *'), { target: { value: '2' } });
    fireEvent.click(screen.getByLabelText('Camp 1'));
    fireEvent.click(screen.getByText('Save Product'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Error saving product'), 'error');
    });
  });

  it('closes room form on cancel', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    const addBtns = screen.getAllByText('Add Room');
    fireEvent.click(addBtns[0]);
    await waitFor(() => { expect(screen.getByText('Add New Room')).toBeInTheDocument(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByText('Add New Room')).not.toBeInTheDocument();
    });
  });

  it('closes product form on cancel', async () => {
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getAllByText('Add Product')[0]);
    await waitFor(() => { expect(screen.getByText('Add New Product')).toBeInTheDocument(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByText('Add New Product')).not.toBeInTheDocument();
    });
  });

  it('renders room rows with camp, type, floor, and status info', () => {
    state.rooms = [...mockRoomRows];
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('Room 102')).toBeInTheDocument();
    expect(screen.getAllByText('Standard Room')).toHaveLength(2);
    expect(screen.getAllByText('Camp 1')).toHaveLength(2);
    expect(screen.getByText('available')).toBeInTheDocument();
    expect(screen.getByText('occupied')).toBeInTheDocument();
  });

  it('opens edit room form pre-filled and saves changes', async () => {
    state.rooms = [...mockRoomRows];
    mockSaveRoom.mockResolvedValue({} as any);
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Edit')[0]);
    await waitFor(() => { expect(screen.getByText('Edit Room')).toBeInTheDocument(); });
    expect(screen.getByLabelText('Room Name *')).toHaveValue('Room 101');
    fireEvent.change(screen.getByLabelText('Camp *'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Product Type *'), { target: { value: 'pt1' } });
    fireEvent.change(screen.getByLabelText('Room Name *'), { target: { value: 'Room 105' } });
    fireEvent.change(screen.getByLabelText('Floor'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Bed Type'), { target: { value: 'suite' } });
    fireEvent.change(screen.getByLabelText('Max Guests'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'maintenance' } });
    fireEvent.click(screen.getByText('Update Room'));
    await waitFor(() => {
      expect(mockSaveRoom).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Room 105', floor: '5', status: 'maintenance', bedType: 'suite' }),
        'r1',
      );
    });
  });

  it('deletes a room after confirmation', async () => {
    state.rooms = [...mockRoomRows];
    mockDeleteRoom.mockResolvedValue({} as any);
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete this room/)).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(mockDeleteRoom).toHaveBeenCalledWith('r1');
    });
  });

  it('cancels room delete', async () => {
    state.rooms = [...mockRoomRows];
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getAllByText('Delete')[0]);
    await waitFor(() => { expect(screen.getByRole('dialog')).toBeInTheDocument(); });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(mockDeleteRoom).not.toHaveBeenCalled();
  });

  it('opens edit product form and saves changes', async () => {
    mockSaveProduct.mockResolvedValue({} as any);
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => { expect(screen.getByText('Edit Product')).toBeInTheDocument(); });
    fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Deluxe Room' } });
    fireEvent.change(screen.getByLabelText('Base Price'), { target: { value: '250' } });
    fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: 'https://example.com/room.jpg' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Spacious deluxe room' } });
    fireEvent.click(screen.getByText('Update Product'));
    await waitFor(() => {
      expect(mockSaveProduct).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Deluxe Room', basePrice: 250, description: 'Spacious deluxe room' }),
        'pt1',
      );
    });
  });

  it('toggles camp off when editing product and warns', async () => {
    mockSaveProduct.mockResolvedValue({} as any);
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getByText('Edit'));
    await waitFor(() => { expect(screen.getByText('Edit Product')).toBeInTheDocument(); });
    const campCheckbox = screen.getByLabelText('Camp 1') as HTMLInputElement;
    expect(campCheckbox.checked).toBe(true);
    fireEvent.click(campCheckbox);
    fireEvent.click(screen.getByText('Update Product'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Assign the product to at least one camp.', 'warning');
      expect(mockSaveProduct).not.toHaveBeenCalled();
    });
  });

  it('deletes a product after confirmation', async () => {
    mockDeleteProduct.mockResolvedValue({} as any);
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to delete this product/)).toBeInTheDocument();
    });
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(mockDeleteProduct).toHaveBeenCalledWith('pt1');
    });
  });

  it('shows type summary counts derived from rooms', async () => {
    state.rooms = [...mockRoomRows];
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getByText('Type Summary')).toBeInTheDocument(); });
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getAllByText('1')).toHaveLength(2);
  });

  it('switches back to rooms section from products', async () => {
    state.rooms = [...mockRoomRows];
    render(<RoomsPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('Products'));
    await waitFor(() => { expect(screen.getAllByText('Add Product').length).toBeGreaterThanOrEqual(1); });
    fireEvent.click(screen.getByText('Rooms'));
    await waitFor(() => {
      expect(screen.getByTestId('rooms-table')).toBeInTheDocument();
    });
  });
});
