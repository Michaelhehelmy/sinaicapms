import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';

type ToastType = 'success' | 'error' | 'warning' | 'info';
type ToastPosition =
  | 'top-right'
  | 'top-left'
  | 'bottom-right'
  | 'bottom-left'
  | 'top-center'
  | 'bottom-center';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  duration: number;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (
    message: string,
    type?: ToastType,
    options?: { duration?: number; action?: ToastAction },
  ) => void;
  /** Dismiss a specific toast by ID */
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/* ─── Position classes ─── */
const positionClasses: Record<ToastPosition, string> = {
  'top-right': 'top-5 right-5',
  'top-left': 'top-5 left-5',
  'bottom-right': 'bottom-5 right-5',
  'bottom-left': 'bottom-5 left-5',
  'top-center': 'top-5 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-5 left-1/2 -translate-x-1/2',
};

/* ─── Type-based styles ─── */
const typeStyles: Record<ToastType, string> = {
  success: 'bg-success-600 text-white',
  error: 'bg-error-600 text-white',
  warning: 'bg-warning-600 text-white',
  info: 'bg-info-600 text-white',
};

const typeIcons: Record<ToastType, React.ReactNode> = {
  success: (
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  info: (
    <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const DEFAULT_DURATION = 4000;

interface ToastProviderProps {
  children: ReactNode;
  /** Default position for all toasts */
  position?: ToastPosition;
}

export function ToastProvider({ children, position = 'top-right' }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (
      message: string,
      type: ToastType = 'info',
      options?: { duration?: number; action?: ToastAction },
    ) => {
      const id = nextId.current++;
      const duration = options?.duration ?? DEFAULT_DURATION;
      setToasts((prev) => [...prev, { id, message, type, duration, action: options?.action }]);
      setTimeout(() => {
        dismissToast(id);
      }, duration);
    },
    [dismissToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div
        className={cn(
          'fixed z-[10000] flex flex-col gap-2.5 pointer-events-none',
          positionClasses[position],
        )}
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((t) => (
          <ToastItemComponent key={t.id} toast={t} onDismiss={dismissToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItemComponent({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [exiting, setExiting] = useState(false);

  const handleDismiss = useCallback(() => {
    setExiting(true);
    setTimeout(() => onDismiss(toast.id), 200);
  }, [onDismiss, toast.id]);

  return (
    <div
      className={cn(
        'pointer-events-auto min-w-[280px] max-w-[420px] rounded-xl px-4 py-3 text-sm font-medium shadow-toast',
        'flex items-center gap-3',
        'transition-all duration-200',
        typeStyles[toast.type],
        exiting ? 'opacity-0 translate-x-4' : 'animate-[toastSlideIn_0.35s_cubic-bezier(0.22,1,0.36,1)]',
      )}
      role="alert"
      aria-live="assertive"
    >
      {typeIcons[toast.type]}
      <span className="flex-1">{toast.message}</span>
      {toast.action && (
        <button
          onClick={toast.action.onClick}
          className="shrink-0 rounded-md bg-white/20 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/30 transition-colors duration-150 cursor-pointer border-none"
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={handleDismiss}
        className="shrink-0 border-none bg-transparent text-white opacity-60 hover:opacity-100 cursor-pointer p-0.5 rounded transition-opacity duration-150"
        aria-label="Dismiss notification"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
