import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Modal                                                              */
/* ------------------------------------------------------------------ */

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlay?: boolean;
  closeOnEsc?: boolean;
  showCloseButton?: boolean;
  className?: string;
}

const sizeMap: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  full: 'max-w-4xl',
};

/**
 * Accessible modal dialog with overlay, animations, focus trap, and body scroll lock.
 *
 * @example
 * <Modal isOpen={open} onClose={() => setOpen(false)} title="Confirm">
 *   <p>Are you sure?</p>
 * </Modal>
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  closeOnOverlay = true,
  closeOnEsc = true,
  showCloseButton = true,
  className,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // ── ESC key handler ──
  useEffect(() => {
    if (!isOpen || !closeOnEsc) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeOnEsc, onClose]);

  // ── Body scroll lock + focus management ──
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    // Focus the modal container after render
    const timer = setTimeout(() => {
      modalRef.current?.focus();
    }, 0);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = overflow;
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  // ── Focus trap ──
  useEffect(() => {
    if (!isOpen) return;
    const container = modalRef.current;
    if (!container) return;

    const trapFocus = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      const focusable = container.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      data-testid="modal-overlay"
      className="fixed inset-0 z-[9000] flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 transition-opacity duration-200"
        onClick={closeOnOverlay ? onClose : undefined}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        ref={modalRef}
        tabIndex={-1}
        data-testid="modal-content"
        className={cn(
          'relative w-full bg-white rounded-xl shadow-2xl',
          'animate-in zoom-in-95 fade-in duration-200',
          'focus:outline-none',
          sizeMap[size],
          className,
        )}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <ModalHeader title={title} titleId={titleId} onClose={onClose} showCloseButton={showCloseButton} />
        )}

        {/* Body */}
        <ModalBody>{children}</ModalBody>

        {/* Footer */}
        {footer && <ModalFooter>{footer}</ModalFooter>}
      </div>
    </div>
  );

  // SSR guard: only use portal in browser
  if (typeof document === 'undefined') return null;
  return createPortal(modalContent, document.body);
}

/* ------------------------------------------------------------------ */
/*  ModalHeader                                                        */
/* ------------------------------------------------------------------ */

interface ModalHeaderProps {
  title?: string;
  titleId: string;
  onClose: () => void;
  showCloseButton: boolean;
}

export function ModalHeader({ title, titleId, onClose, showCloseButton }: ModalHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
      {title && (
        <h2 id={titleId} className="text-lg font-semibold text-gray-900 truncate pr-4">
          {title}
        </h2>
      )}
      {showCloseButton && (
        <button
          onClick={onClose}
          data-testid="modal-close"
          className={cn(
            'shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-gray-600',
            'hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2',
            'transition-colors duration-150',
          )}
          aria-label="Close modal"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M15 5L5 15M5 5l10 10" />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ModalBody                                                          */
/* ------------------------------------------------------------------ */

interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={cn('px-6 py-4 overflow-y-auto max-h-[calc(100vh-8rem)]', className)}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ModalFooter                                                        */
/* ------------------------------------------------------------------ */

interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
