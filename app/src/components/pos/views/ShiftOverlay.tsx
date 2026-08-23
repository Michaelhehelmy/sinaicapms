import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { IconShift } from '@/components/ui/icons';
import { useOpenShiftMutation } from '@/hooks/usePosQueries';
import type { Shift } from '../types';

// ─── Shift Overlay (blocks POS until shift is open) ────────
// Phase 8: rebuilt on the shared ui/Modal (portal, focus trap, ESC handling)
// instead of a bespoke fixed-position overlay. Every dismissal path is
// disabled — a cashier MUST open a shift before taking orders.
export default function ShiftOverlay({ onShiftOpened }: { onShiftOpened: (shift: Shift) => void }) {
  const [cash, setCash] = useState('');
  const [error, setError] = useState('');
  // Input is not a forwardRef component — reach its <input> through the wrapper.
  const cashWrapRef = useRef<HTMLDivElement>(null);
  const openShift = useOpenShiftMutation();

  async function handleOpen() {
    const amount = parseFloat(cash);
    if (isNaN(amount) || amount < 0) { setError('Enter a valid opening cash amount'); return; }
    setError('');
    try {
      const res = await openShift.mutateAsync({ openingCash: amount });
      onShiftOpened((res as { shift: Shift }).shift);
    } catch (err: any) { setError(err.message); }
  }

  return (
    <Modal
      isOpen
      onClose={() => {}}
      size="sm"
      testId="shift-overlay"
      closeOnOverlay={false}
      closeOnEsc={false}
      showCloseButton={false}
      initialFocus={() => cashWrapRef.current?.querySelector('input')}
    >
      <div className="py-2 text-center">
        <div className="mb-4 flex justify-center text-gray-400"><IconShift size={40} strokeWidth={1.5} /></div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Open Cash Drawer</h2>
        <p className="text-sm text-gray-500 mb-6">Enter your starting cash balance to begin taking orders.</p>
        {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}
        <div className="mb-4" ref={cashWrapRef}>
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
          loading={openShift.isPending}
          onClick={handleOpen}
          data-testid="open-shift-btn"
          className="min-h-[48px]"
        >
          Open Shift
        </Button>
      </div>
    </Modal>
  );
}
