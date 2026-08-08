import React, { useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      // Focus trap
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onCancel],
  );

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    document.addEventListener('keydown', handleKeyDown);
    // Focus the confirm button on open
    const timer = setTimeout(() => {
      confirmRef.current?.focus();
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === overlayRef.current) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div
        ref={panelRef}
        className="w-full max-w-sm mx-4 rounded-xl bg-white shadow-2xl border border-gray-200 p-6 text-center"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
          <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h3 id="confirm-dialog-title" className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-500 mb-6">{message}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={cn(
              'rounded-lg px-4 py-2 text-sm font-medium text-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2',
              danger
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                : 'bg-green-600 hover:bg-green-700 focus:ring-green-500',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
