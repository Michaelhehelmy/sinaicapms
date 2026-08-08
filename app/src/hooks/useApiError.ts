/**
 * Unified error handling hook for SinaiCamps.
 *
 * Provides consistent error display via toast notifications and console logging.
 * Can be used with both React Query mutations and direct fetch calls.
 *
 * Usage:
 *   const { handleError } = useApiError();
 *
 *   // With try/catch:
 *   try { await api.someCall(); }
 *   catch (err) { handleError(err, 'Failed to load data'); }
 *
 *   // With React Query onError:
 *   useQuery({ ..., onError: (err) => handleError(err, 'Failed to load camps') })
 */
import { useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';

interface ApiErrorOptions {
  /** Show toast notification (default: true) */
  showToast?: boolean;
  /** Log to console (default: true in dev, false in prod) */
  logToConsole?: boolean;
  /** Custom fallback message if error has no message */
  fallbackMessage?: string;
  /** Toast variant (default: 'error') */
  variant?: 'error' | 'warning' | 'info';
}

export function useApiError() {
  const { showToast } = useToast();

  const handleError = useCallback(
    (err: unknown, contextMessage: string, options: ApiErrorOptions = {}) => {
      const {
        showToast: shouldToast = true,
        logToConsole = typeof window !== 'undefined' && window.location.hostname === 'localhost',
        fallbackMessage = 'An unexpected error occurred',
        variant = 'error',
      } = options;

      // Extract meaningful error message
      let errorMessage: string;
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String((err as { message: unknown }).message);
      } else {
        errorMessage = fallbackMessage;
      }

      // Sanitize error message — never show raw technical errors to users
      const userMessage = sanitizeErrorMessage(errorMessage);

      // Show toast notification
      if (shouldToast) {
        showToast(`${contextMessage}${userMessage ? `: ${userMessage}` : ''}`, variant);
      }

      // Log to console in development
      if (logToConsole) {
        console.error(`[API Error] ${contextMessage}:`, err);
      }
    },
    [showToast],
  );

  return { handleError };
}

/**
 * Sanitize error messages to avoid leaking technical details to users.
 * Converts raw error messages into user-friendly text.
 */
function sanitizeErrorMessage(message: string): string {
  // Don't show SQL errors
  if (message.includes('SQLITE') || message.includes('sql')) {
    return 'A database error occurred';
  }

  // Don't show JWT/auth technical errors
  if (message.includes('JWT') || message.includes('jwt') || message.includes('token')) {
    return 'Session expired. Please log in again.';
  }

  // Don't show fetch/network technical errors
  if (message.includes('fetch') || message.includes('NetworkError') || message.includes('Failed to fetch')) {
    return 'Network error. Please check your connection.';
  }

  // Don't show CORS errors
  if (message.includes('CORS') || message.includes('cors')) {
    return 'Connection error. Please try again.';
  }

  // Truncate very long messages
  if (message.length > 100) {
    return message.substring(0, 97) + '...';
  }

  return message;
}

export default useApiError;
