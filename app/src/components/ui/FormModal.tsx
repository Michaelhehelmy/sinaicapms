import React, { useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface FormModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitDisabled?: boolean;
  /** @deprecated Use `size` instead. Kept for backward compatibility. */
  width?: 'sm' | 'md' | 'lg' | 'xl';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  /** Show a loading spinner on the submit button */
  loading?: boolean;
  /** Close modal when clicking the overlay backdrop (default: true) */
  closeOnOverlayClick?: boolean;
  /** Close modal when pressing Escape (default: true) */
  closeOnEscape?: boolean;
  /** Danger mode — red accent for delete confirmations */
  danger?: boolean;
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[90vw]',
};

export function FormModal({
  open,
  title,
  onClose,
  onSubmit,
  submitLabel = 'Save',
  submitDisabled = false,
  width,
  size = 'md',
  children,
  loading = false,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  danger = false,
}: FormModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /* `width` prop takes precedence for backward compat; otherwise use `size` */
  const resolvedSize = (width ?? size) as keyof typeof sizeMap;
  const effectiveSize = sizeMap[resolvedSize] || sizeMap.md;

  const handleClose = useCallback(() => {
    if (!loading) onClose();
  }, [loading, onClose]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, closeOnEscape, handleClose]);

  /* Focus trap: focus the panel when modal opens */
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      data-testid="modal-overlay"
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-xs animate-fade-in"
      onClick={(e) => {
        if (closeOnOverlayClick && e.target === overlayRef.current) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        data-testid="modal-content"
        className={cn(
          'w-full rounded-2xl bg-white shadow-2xl border',
          danger ? 'border-error-200' : 'border-warm-200',
          effectiveSize,
          'mx-4 max-h-[90vh] flex flex-col',
          'animate-[modalSlideUp_0.25s_cubic-bezier(0.22,1,0.36,1)]',
          'outline-none',
        )}
      >
        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between border-b px-6 py-4',
            danger ? 'border-error-100 bg-error-50/30' : 'border-warm-200',
          )}
        >
          <h2 className={cn('text-lg font-bold', danger ? 'text-error-700' : 'text-warm-900')}>
            {title}
          </h2>
          <button
            onClick={handleClose}
            disabled={loading}
            data-testid="modal-close"
            className="rounded-lg p-1.5 text-warm-400 hover:bg-warm-100 hover:text-warm-600 cursor-pointer border-none bg-transparent transition-colors duration-150 disabled:opacity-50"
            aria-label="Close dialog"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 flex-1">{children}</div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-warm-200 px-6 py-4">
          <Button
            variant="ghost"
            size="md"
            onClick={handleClose}
            disabled={loading}
            data-testid="modal-cancel"
          >
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size="md"
            onClick={onSubmit}
            disabled={submitDisabled}
            loading={loading}
            data-testid="modal-save"
          >
            {submitLabel}
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes modalSlideUp {
          from { transform: translateY(16px) scale(0.98); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
