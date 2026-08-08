import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useApiError } from '@/hooks/useApiError';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

describe('useApiError', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    Object.defineProperty(window, 'location', {
      value: { hostname: 'localhost' },
      writable: true,
    });
  });

  it('returns handleError function', () => {
    const { result } = renderHook(() => useApiError());
    expect(typeof result.current.handleError).toBe('function');
  });

  it('shows toast with error message from Error instance', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('Something broke'), 'Failed to load');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Failed to load: Something broke', 'error');
  });

  it('shows toast with string error', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError('string error', 'Context');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Context: string error', 'error');
  });

  it('shows toast with object that has message property', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError({ message: 'obj error' }, 'Context');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Context: obj error', 'error');
  });

  it('uses fallback message for unknown error types', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(42, 'Context');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Context: An unexpected error occurred', 'error');
  });

  it('sanitizes SQL error messages', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('SQLITE_ERROR: something'), 'DB failed');
    });
    expect(mockShowToast).toHaveBeenCalledWith('DB failed: A database error occurred', 'error');
  });

  it('sanitizes JWT/token error messages', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('JWT token expired'), 'Auth');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Auth: Session expired. Please log in again.', 'error');
  });

  it('sanitizes network error messages', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('Failed to fetch'), 'API');
    });
    expect(mockShowToast).toHaveBeenCalledWith('API: Network error. Please check your connection.', 'error');
  });

  it('sanitizes CORS error messages', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('CORS error'), 'Connection');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Connection: Connection error. Please try again.', 'error');
  });

  it('truncates long messages', () => {
    const { result } = renderHook(() => useApiError());
    const longMsg = 'A'.repeat(150);
    act(() => {
      result.current.handleError(new Error(longMsg), 'Context');
    });
    const called = mockShowToast.mock.calls[0][0];
    expect(called.length).toBeLessThan(200);
    expect(called).toContain('...');
  });

  it('shows warning variant when specified', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('err'), 'Context', { variant: 'warning' });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Context: err', 'warning');
  });

  it('shows info variant when specified', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('err'), 'Context', { variant: 'info' });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Context: err', 'info');
  });

  it('suppresses toast when showToast option is false', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('err'), 'Context', { showToast: false });
    });
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('uses custom fallback message', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(null, 'Context', { fallbackMessage: 'Custom fallback' });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Context: Custom fallback', 'error');
  });

  it('logs to console when logToConsole is true', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('err'), 'Context', { logToConsole: true });
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not log to console by default on non-localhost', () => {
    Object.defineProperty(window, 'location', {
      value: { hostname: 'production.com' },
      writable: true,
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('err'), 'Context');
    });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('does not show context message when user message is empty after sanitization', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error(''), 'Context');
    });
    // Empty string message -> userMessage is '' -> format is "Context" (no colon)
    expect(mockShowToast).toHaveBeenCalledWith('Context', 'error');
  });

  it('handles null/undefined errors gracefully', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(undefined, 'Context');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Context: An unexpected error occurred', 'error');
  });

  it('sanitizes lowercase sql errors', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('sql error'), 'DB');
    });
    expect(mockShowToast).toHaveBeenCalledWith('DB: A database error occurred', 'error');
  });

  it('sanitizes NetworkError', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('NetworkError'), 'API');
    });
    expect(mockShowToast).toHaveBeenCalledWith('API: Network error. Please check your connection.', 'error');
  });

  it('sanitizes lowercase cors errors', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('cors policy'), 'Conn');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Conn: Connection error. Please try again.', 'error');
  });

  it('sanitizes lowercase jwt errors', () => {
    const { result } = renderHook(() => useApiError());
    act(() => {
      result.current.handleError(new Error('jwt malformed'), 'Auth');
    });
    expect(mockShowToast).toHaveBeenCalledWith('Auth: Session expired. Please log in again.', 'error');
  });
});
