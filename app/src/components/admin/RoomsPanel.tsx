import React, { useState, useMemo, useCallback } from 'react';
import {
  useRoomsQuery,
  useProductsQuery,
  useSaveRoomMutation,
  useDeleteRoomMutation,
  useSaveProductMutation,
  useDeleteProductMutation,
} from '@/hooks/useQueryHooks';
import { DataTable } from '@/components/ui/DataTable';
import { FormModal } from '@/components/ui/FormModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusTag } from '@/components/ui/StatusTag';
import { useToast } from '@/components/ui/Toast';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Room, Product, Camp } from '@/hooks/useAdminData';

interface RoomsPanelProps {
  campIds: string[];
  camps: Camp[];
}

interface RoomForm {
  campId: string;
  productId: string;
  name: string;
  floor: string;
  status: string;
  bedType: string;
  maxGuests: string;
  basePrice: string;
}

interface ProductForm {
  name: string;
  capacity: string;
  basePrice: string;
  description: string;
  imageUrl: string;
  campIds: string[];
}

const emptyRoomForm: RoomForm = {
  campId: '',
  productId: '',
  name: '',
  floor: '1',
  status: 'available',
  bedType: 'single',
  maxGuests: '2',
  basePrice: '0',
};

const emptyProductForm: ProductForm = {
  name: '',
  capacity: '',
  basePrice: '',
  description: '',
  imageUrl: '',
  campIds: [],
};

const statusOptions = [
  { value: 'available', label: 'Available' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'reserved', label: 'Reserved' },
];

const bedTypeOptions = [
  { value: 'single', label: 'Single' },
  { value: 'double', label: 'Double' },
  { value: 'twin', label: 'Twin' },
  { value: 'suite', label: 'Suite' },
];

export default function RoomsPanel({ campIds, camps }: RoomsPanelProps) {
  const { data: rooms, isLoading: loadingRooms } = useRoomsQuery();
  const { data: products, isLoading: loadingTypes } = useProductsQuery();
  const { showToast } = useToast();

  const [activeSection, setActiveSection] = useState<'rooms' | 'types'>('rooms');
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editRoomId, setEditRoomId] = useState<string | null>(null);
  const [editTypeId, setEditTypeId] = useState<string | null>(null);
  const [roomForm, setRoomForm] = useState<RoomForm>(emptyRoomForm);
  const [typeForm, setTypeForm] = useState<ProductForm>(emptyProductForm);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'room' | 'roomType'; id: string } | null>(null);

  // NOTE: mutation hooks must be created after state so they can capture editRoomId/editTypeId
  const saveRoomMutation = useSaveRoomMutation(editRoomId ?? undefined);
  const deleteRoomMutation = useDeleteRoomMutation();
  const saveProductMutation = useSaveProductMutation(editTypeId ?? undefined);
  const deleteProductMutation = useDeleteProductMutation();

  const filteredRooms = useMemo(
    () => (rooms ?? []).filter((r) => campIds.includes(r.campId)),
    [rooms, campIds],
  );

  const filteredTypes = useMemo(
    () =>
      (products ?? []).filter(
        (p) => !p.campIds || p.campIds.length === 0 || p.campIds.some((cid) => campIds.includes(cid)),
      ),
    [products, campIds],
  );

  const typeMap = useMemo(() => {
    const map: Record<string, Product> = {};
    (products ?? []).forEach((p) => { map[p.id] = p; });
    return map;
  }, [products]);

  const campNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    camps.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [camps]);

  const productSelectOptions = useMemo(
    () => filteredTypes.map((p) => ({ value: p.id, label: `${p.name} (Cap: ${p.capacity})` })),
    [filteredTypes],
  );

  // Single-camp admin (B3): the tenant's one camp is always the room's camp.
  // Forms auto-fill it so there is no camp picker anywhere in the panel.
  const activeCampId = campIds.length > 0 ? campIds[0] : '';

  const openAddRoom = useCallback(() => {
    setEditRoomId(null);
    setRoomForm({ ...emptyRoomForm, campId: activeCampId });
    setShowRoomForm(true);
  }, [activeCampId]);

  const openEditRoom = useCallback((room: Room) => {
    setEditRoomId(room.id);
    setRoomForm({
      campId: room.campId || '',
      productId: room.productId || '',
      name: room.name || '',
      floor: String(room.floor ?? '1'),
      status: room.status || 'available',
      bedType: room.bedType || 'single',
      maxGuests: String(room.maxGuests ?? 2),
      basePrice: String(room.basePrice ?? 0),
    });
    setShowRoomForm(true);
  }, []);

  const handleSaveRoom = useCallback(async () => {
    if (!roomForm.productId || !roomForm.name.trim()) {
      showToast('Product type and room name are required.', 'warning');
      return;
    }
    try {
      await saveRoomMutation.mutateAsync({
        campId: roomForm.campId || activeCampId,
        productId: roomForm.productId,
        name: roomForm.name.trim(),
        floor: roomForm.floor || undefined,
        status: roomForm.status,
        bedType: roomForm.bedType,
        maxGuests: parseInt(roomForm.maxGuests) || 2,
        basePrice: parseFloat(roomForm.basePrice) || 0,
      });
      setShowRoomForm(false);
      setEditRoomId(null);
      setRoomForm(emptyRoomForm);
    } catch {
      // Error toast already shown by mutation's onError
    }
  }, [roomForm, editRoomId, showToast, saveRoomMutation, activeCampId]);

  const openAddType = useCallback(() => {
    setEditTypeId(null);
    setTypeForm({ ...emptyProductForm, campIds: activeCampId ? [activeCampId] : [] });
    setShowTypeForm(true);
  }, [activeCampId]);

  const openEditType = useCallback(
    (p: Product) => {
      setEditTypeId(p.id);
      setTypeForm({
        name: p.name || '',
        capacity: String(p.capacity ?? ''),
        basePrice: String(p.basePrice ?? ''),
        description: p.description || '',
        imageUrl: p.imageUrl || '',
        campIds: p.campIds && p.campIds.length > 0 ? p.campIds : activeCampId ? [activeCampId] : [],
      });
      setShowTypeForm(true);
    },
    [activeCampId],
  );

  const handleSaveType = useCallback(async () => {
    if (!typeForm.name.trim()) {
      showToast('Product name is required.', 'warning');
      return;
    }
    if (parseInt(typeForm.capacity) <= 0) {
      showToast('Capacity must be greater than 0.', 'warning');
      return;
    }
    // Rooms/types always belong to the tenant's single camp; keep the checkbox
    // assignment for legacy rows but fall back to the active camp.
    const resolvedCampIds = typeForm.campIds.length > 0 ? typeForm.campIds : activeCampId ? [activeCampId] : [];
    if (resolvedCampIds.length === 0) {
      showToast('Assign the product to the camp.', 'warning');
      return;
    }
    await saveProductMutation.mutateAsync({
      name: typeForm.name.trim(),
      capacity: parseInt(typeForm.capacity) || 1,
      basePrice: parseFloat(typeForm.basePrice) || 0,
      description: typeForm.description.trim(),
      imageUrl: typeForm.imageUrl.trim() || undefined,
      campIds: resolvedCampIds,
    });
    setShowTypeForm(false);
    setEditTypeId(null);
    setTypeForm(emptyProductForm);
  }, [typeForm, editTypeId, showToast, saveProductMutation, activeCampId]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'room') {
      await deleteRoomMutation.mutateAsync(deleteTarget.id);
    } else {
      await deleteProductMutation.mutateAsync(deleteTarget.id);
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteRoomMutation, deleteProductMutation]);

  const loading = loadingRooms || loadingTypes;
  const saving = saveRoomMutation.isPending || saveProductMutation.isPending;

  return (
    <Card padding="none" className="p-6" data-testid="rooms-panel">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h2 className="text-xl font-bold text-gray-800">Room Management</h2>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          <Button
            variant={activeSection === 'rooms' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('rooms')}
          >
            Rooms
          </Button>
          <Button
            variant={activeSection === 'types' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('types')}
          >
            Products
          </Button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-6">Manage rooms and room types for your camp — track availability and assignments.</p>

      {loading ? (
        <LoadingSpinner text="Loading rooms..." />
      ) : activeSection === 'rooms' ? (
        <div>
          <div className="flex justify-end mb-4">
            <Button
              variant="success"
              size="md"
              onClick={openAddRoom}
              data-testid="add-room-btn"
              leftIcon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Add Room
            </Button>
          </div>
          {filteredRooms.length === 0 ? (
            <EmptyState
              title="No rooms yet"
              description="Add your first room to start managing occupancy."
              action={{ label: 'Add Room', onClick: openAddRoom }}
            />
          ) : (
            <div data-testid="rooms-table">
            <DataTable<Room & Record<string, unknown>>
              columns={[
                { key: 'name', header: 'Room Name', sortable: true, render: (r) => <strong>{String(r.name)}</strong> },
                {
                  key: 'productId',
                  header: 'Type',
                  render: (r) => {
                    const p = typeMap[String(r.productId)];
                    return p ? p.name : 'Unknown';
                  },
                },
                {
                  key: 'campId',
                  header: 'Camp',
                  render: (r) => campNameMap[String(r.campId)] ?? 'N/A',
                },
                { key: 'floor', header: 'Floor', sortable: true, render: (r) => String(r.floor || '-') },
                {
                  key: 'status',
                  header: 'Status',
                  render: (r) => <StatusTag status={String(r.status)} />,
                },
              ]}
              data={filteredRooms as (Room & Record<string, unknown>)[]}
              emptyMessage="No rooms found."
              actions={(r) => (
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditRoom(r as unknown as Room)}
                    leftIcon={
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget({ type: 'room', id: r.id as string })}
                    leftIcon={
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    }
                  >
                    Delete
                  </Button>
                </div>
              )}
            />
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex justify-end mb-4">
            <Button
              variant="success"
              size="md"
              onClick={openAddType}
              leftIcon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Add Product
            </Button>
          </div>

          {filteredTypes.length > 0 && (
            <Card padding="sm" className="mb-6">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Type Summary</h3>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Type</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Total</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Available</th>
                    <th className="text-left py-2 px-2 text-xs font-semibold text-gray-500 uppercase">Occupied</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTypes.map((p) => {
                    const typeRooms = filteredRooms.filter((r) => r.productId === p.id);
                    return (
                      <tr key={p.id} className="border-b border-gray-50">
                        <td className="py-2 px-2 font-medium text-gray-800">{p.name}</td>
                        <td className="py-2 px-2 text-gray-600">{typeRooms.length}</td>
                        <td className="py-2 px-2 text-green-600">{typeRooms.filter((r) => r.status === 'available').length}</td>
                        <td className="py-2 px-2 text-yellow-600">{typeRooms.filter((r) => r.status === 'occupied').length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}

          {filteredTypes.length === 0 ? (
            <EmptyState
              title="No products yet"
              description="Add a product type to start organizing your rooms."
              action={{ label: 'Add Product', onClick: openAddType }}
            />
          ) : (
            <DataTable<Product & Record<string, unknown>>
              columns={[
                { key: 'name', header: 'Name', sortable: true, render: (p) => <strong>{String(p.name)}</strong> },
                { key: 'capacity', header: 'Capacity', sortable: true, render: (p) => String(p.capacity) },
                {
                  key: 'basePrice',
                  header: 'Base Price',
                  sortable: true,
                  render: (p) => `$${parseFloat(String(p.basePrice || 0)).toFixed(2)}`,
                },
                { key: 'description', header: 'Description', render: (p) => String(p.description || '') },
              ]}
              data={filteredTypes as (Product & Record<string, unknown>)[]}
              emptyMessage="No products configured."
              actions={(p) => (
                <div className="flex gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openEditType(p as unknown as Product)}
                    leftIcon={
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    }
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteTarget({ type: 'roomType', id: p.id as string })}
                    leftIcon={
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    }
                  >
                    Delete
                  </Button>
                </div>
              )}
            />
          )}
        </div>
      )}

      <FormModal
        open={showRoomForm}
        title={editRoomId ? 'Edit Room' : 'Add New Room'}
        onClose={() => { setShowRoomForm(false); setEditRoomId(null); }}
        onSubmit={handleSaveRoom}
        submitLabel={saving ? 'Saving...' : editRoomId ? 'Update Room' : 'Save Room'}
        submitDisabled={saving}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Product Type *"
            options={productSelectOptions}
            value={roomForm.productId}
            onChange={(e) => setRoomForm((prev) => ({ ...prev, productId: e.target.value }))}
            placeholder="Select Type"
          />
          <Input
            label="Room Name *"
            type="text"
            value={roomForm.name}
            onChange={(e) => setRoomForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Room 101"
          />
          <Input
            label="Floor"
            type="text"
            value={roomForm.floor}
            onChange={(e) => setRoomForm((prev) => ({ ...prev, floor: e.target.value }))}
            placeholder="e.g. 1"
          />
          <Select
            label="Bed Type"
            options={bedTypeOptions}
            value={roomForm.bedType}
            onChange={(e) => setRoomForm((prev) => ({ ...prev, bedType: e.target.value }))}
          />
          <Input
            label="Max Guests"
            type="number"
            value={roomForm.maxGuests}
            onChange={(e) => setRoomForm((prev) => ({ ...prev, maxGuests: e.target.value }))}
            min="1"
          />
          <div className="md:col-span-2">
            <Select
              label="Status"
              options={statusOptions}
              value={roomForm.status}
              onChange={(e) => setRoomForm((prev) => ({ ...prev, status: e.target.value }))}
            />
          </div>
        </div>
      </FormModal>

      <FormModal
        open={showTypeForm}
        title={editTypeId ? 'Edit Product' : 'Add New Product'}
        onClose={() => { setShowTypeForm(false); setEditTypeId(null); }}
        onSubmit={handleSaveType}
        submitLabel={saving ? 'Saving...' : editTypeId ? 'Update Product' : 'Save Product'}
        submitDisabled={saving}
        size="lg"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Name *"
            type="text"
            value={typeForm.name}
            onChange={(e) => setTypeForm((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Room type name"
          />
          <Input
            label="Capacity *"
            type="number"
            value={typeForm.capacity}
            onChange={(e) => setTypeForm((prev) => ({ ...prev, capacity: e.target.value }))}
            min="1"
          />
          <Input
            label="Base Price"
            type="number"
            value={typeForm.basePrice}
            onChange={(e) => setTypeForm((prev) => ({ ...prev, basePrice: e.target.value }))}
            min="0"
            step="0.01"
          />
          <Input
            label="Image URL"
            type="text"
            value={typeForm.imageUrl}
            onChange={(e) => setTypeForm((prev) => ({ ...prev, imageUrl: e.target.value }))}
            placeholder="https://..."
          />
          <div className="md:col-span-2">
            <label htmlFor="type-description" className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              id="type-description"
              value={typeForm.description}
              onChange={(e) => setTypeForm((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:border-brand-500 focus:ring-brand-500"
              rows={2}
            />
          </div>
        </div>
      </FormModal>

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete ${deleteTarget?.type === 'room' ? 'Room' : 'Product'}`}
        message={`Are you sure you want to delete this ${deleteTarget?.type === 'room' ? 'room' : 'product'}?`}
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Card>
  );
}
