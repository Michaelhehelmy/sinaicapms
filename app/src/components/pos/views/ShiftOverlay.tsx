import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import * as apiClient from '@/lib/api';
import type { Shift } from '../types';

// ─── Shift Overlay (blocks POS until shift is open) ────────
export default function ShiftOverlay({ onShiftOpened }: { onShiftOpened: (shift: Shift) => void }) {
  const [cash, setCash] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleOpen() {
    const amount = parseFloat(cash);
    if (isNaN(amount) || amount < 0) { setError('Enter a valid opening cash amount'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.posOpenShift({ openingCash: amount });
      onShiftOpened(res.shift);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="shift-overlay">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
        <div className="text-4xl mb-4">🕐</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Open Cash Drawer</h2>
        <p className="text-sm text-gray-500 mb-6">Enter your starting cash balance to begin taking orders.</p>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <div className="mb-4">
          <Input
            label="Opening Cash ($)"
            type="number"
            step="0.01"
            min="0"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            placeholder="0.00"
            autoFocus
            className="min-h-[48px]"
          />
        </div>
        <Button
          variant="primary"
          size="lg"
          fullWidth
          loading={loading}
          onClick={handleOpen}
          data-testid="open-shift-btn"
          className="min-h-[48px]"
        >
          Open Shift
        </Button>
      </div>
    </div>
  );
}
