import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import { useCloseShiftMutation } from '@/hooks/usePosQueries';
import type { Shift } from '../types';
import type { components } from '@/lib/api-types';

type ShiftCloseResult = components['schemas']['PosShiftCloseResponse']['shift'];

// ─── Shift Dashboard View ──────────────────────────────────
export default function ShiftDashboard({ shift, onShiftClosed }: { shift: Shift | null; onShiftClosed: () => void }) {
  const [closingCash, setClosingCash] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ShiftCloseResult | null>(null);
  const closeShift = useCloseShiftMutation();

  async function handleClose() {
    const amount = parseFloat(closingCash);
    if (isNaN(amount)) { setError('Enter closing cash amount'); return; }
    setError('');
    try {
      const res = await closeShift.mutateAsync({ actualClosingCash: amount, notes: '' });
      setResult((res as components['schemas']['PosShiftCloseResponse']).shift);
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Failed to close shift'); }
  }

  // If the shift was just closed (result exists), show the summary regardless of whether the parent
  // still has activeShift (it may have been nullified by polling after the close API succeeded).
  if (result) {
    return (
      <div className="p-6 space-y-4" data-testid="shift-dashboard">
        <h2 className="text-xl font-bold text-gray-900">Shift Closed</h2>
        <Card>
          <CardBody className="space-y-3">
            <div className="flex justify-between text-sm"><span className="text-gray-500">Opening Cash</span><span className="font-medium">${result.openingCash.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Cash Sales</span><span className="font-medium">${result.totalCashSales.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Expected Closing</span><span className="font-medium">${result.expectedClosingCash.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Actual Closing</span><span className="font-medium">${result.actualClosingCash.toFixed(2)}</span></div>
            <div className="border-t pt-3 flex justify-between">
              <span className="font-semibold">Discrepancy</span>
              <Badge variant={result.discrepancy === 0 ? 'success' : 'error'} size="md">
                {result.discrepancy === 0 ? 'Balanced' : `$${result.discrepancy > 0 ? '+' : ''}${result.discrepancy.toFixed(2)}`}
              </Badge>
            </div>
          </CardBody>
        </Card>
        <Button variant="primary" size="md" onClick={onShiftClosed}>
          Back to POS
        </Button>
      </div>
    );
  }

  // No active shift and no close result — show a "no shift" state with action to open one.
  if (!shift) {
    return (
      <div className="p-6 space-y-4" data-testid="shift-dashboard">
        <h2 className="text-xl font-bold text-gray-900">No Active Shift</h2>
        <Card>
          <CardBody>
            <p className="text-gray-500 mb-4">There is no active shift. Open a new shift to start taking orders.</p>
            <Button variant="primary" size="md" onClick={onShiftClosed}>
              Open Shift
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4" data-testid="shift-dashboard">
      <h2 className="text-xl font-bold text-gray-900">Current Shift</h2>
      <Card>
        <CardBody className="space-y-3">
          <div className="flex justify-between text-sm"><span className="text-gray-500">Shift ID</span><span className="font-mono text-xs">{shift.id}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Opened</span><span className="font-medium">{new Date(shift.openingTime).toLocaleString()}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-500">Opening Cash</span><span className="font-medium">${shift.openingCash.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Status</span>
            <Badge variant="success" size="sm" dot>{shift.status}</Badge>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardBody className="space-y-3">
          <h3 className="font-semibold text-gray-900">Close Shift</h3>
          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
          <Input
            label="Actual Closing Cash ($)"
            type="number"
            step="0.01"
            value={closingCash}
            onChange={(e) => setClosingCash(e.target.value)}
            placeholder="0.00"
            className="min-h-[48px]"
          />
          <Button
            variant="danger"
            size="lg"
            fullWidth
            loading={closeShift.isPending}
            onClick={handleClose}
            className="min-h-[48px]"
          >
            Close Shift
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
