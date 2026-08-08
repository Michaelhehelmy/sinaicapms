import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody } from '@/components/ui/Card';
import * as apiClient from '@/lib/api';
import type { Shift } from '../types';

// ─── Shift Dashboard View ──────────────────────────────────
export default function ShiftDashboard({ shift, onShiftClosed }: { shift: Shift; onShiftClosed: () => void }) {
  const [closingCash, setClosingCash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  async function handleClose() {
    const amount = parseFloat(closingCash);
    if (isNaN(amount)) { setError('Enter closing cash amount'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.posCloseShift({ actualClosingCash: amount, notes: '' });
      setResult(res.shift);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

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
            loading={loading}
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
