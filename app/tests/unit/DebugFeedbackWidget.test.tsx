import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { DebugFeedbackWidget } from '@/components/debug/DebugFeedbackWidget';

// ── Mocks ────────────────────────────────────────────────────────────
// The widget reads identity from the session kernel and dynamic-imports both
// html2canvas (screenshot) and the api client (submit) — mock all three.

const mockUser = { value: null as unknown };
vi.mock('@/lib/session', () => ({
  session: {
    getAccessToken: () => null,
    getUser: () => mockUser.value,
    onAuthChange: () => () => {},
  },
}));

const fakeCanvas = {
  width: 800,
  height: 600,
  toDataURL: () => 'data:image/jpeg;base64,AA==',
};
vi.mock('html2canvas', () => ({
  default: vi.fn(async () => fakeCanvas),
}));

const submitFeedback = vi.fn(async () => ({ success: true, id: 'fb_test' }));
vi.mock('@/lib/api', () => ({
  submitFeedback,
}));

const debugFlagKey = 'sc_debug';

function setDebugFlag(on: boolean) {
  if (on) window.localStorage.setItem(debugFlagKey, '1');
  else window.localStorage.removeItem(debugFlagKey);
}

beforeEach(() => {
  mockUser.value = null;
  setDebugFlag(false);
  vi.clearAllMocks();
  // jsdom has no canvas 2D implementation — stub the APIs the screenshot
  // pipeline touches so captures succeed deterministically in tests.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AA==');
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true, configurable: true });
  // Force public/no-session each render so tests are explicit about identity.
  vi.mocked(submitFeedback).mockClear();
});

describe('DebugFeedbackWidget', () => {
  it('renders the floating button for an admin session', () => {
    mockUser.value = { email: 'admin.test@acaciacamp.com', role: 'admin', fullName: 'Test Admin' };
    render(<DebugFeedbackWidget />);
    expect(screen.getByTestId('debug-feedback-open')).toBeInTheDocument();
  });

  it('renders the floating button for a POS session', () => {
    mockUser.value = { email: 'pos.test@acaciacamp.com', role: 'cashier', firstName: 'Cash', lastName: 'Test' };
    render(<DebugFeedbackWidget />);
    expect(screen.getByTestId('debug-feedback-open')).toBeInTheDocument();
  });

  it('renders nothing for a public visitor without the debug flag', () => {
    mockUser.value = null;
    render(<DebugFeedbackWidget />);
    expect(screen.queryByTestId('debug-feedback-open')).not.toBeInTheDocument();
  });

  it('renders the button for a public visitor with only the sc_debug cookie set', () => {
    // The layout strips `?debug=1` before hydration and persists the cookie —
    // the widget must trust that signal too.
    mockUser.value = null;
    document.cookie = 'sc_debug=1; path=/; max-age=2592000';
    render(<DebugFeedbackWidget />);
    expect(screen.getByTestId('debug-feedback-open')).toBeInTheDocument();
    document.cookie = 'sc_debug=1; path=/; max-age=0';
  });

  it('renders the button for a public visitor with the debug flag', () => {
    mockUser.value = null;
    setDebugFlag(true);
    render(<DebugFeedbackWidget />);
    expect(screen.getByTestId('debug-feedback-open')).toBeInTheDocument();
  });

  it('opens the modal and captures a screenshot on click', async () => {
    mockUser.value = { email: 'pos.test@acaciacamp.com', role: 'cashier', fullName: 'POS Tester' };
    render(<DebugFeedbackWidget />);
    fireEvent.click(screen.getByTestId('debug-feedback-open'));
    await waitFor(() => {
      expect(screen.getByTestId('debug-feedback-modal')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('debug-feedback-capture-status').textContent).toContain('Screenshot attached');
    });
  });

  it('blocks submit until category+message are filled (validation)', async () => {
    mockUser.value = { email: 'a@b.com', role: 'admin', fullName: 'A B' };
    render(<DebugFeedbackWidget />);
    fireEvent.click(screen.getByTestId('debug-feedback-open'));
    await waitFor(() => expect(screen.getByTestId('debug-feedback-modal')).toBeInTheDocument());

    // Default category is set; empty message should be rejected.
    fireEvent.input(screen.getByTestId('debug-feedback-message'), { target: { value: '   ' } });
    fireEvent.click(screen.getByTestId('debug-feedback-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('debug-feedback-error')).toBeInTheDocument();
    });
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it('submits the payload with URL, user agent, screenshot and identity', async () => {
    mockUser.value = { email: 'admin.test@acaciacamp.com', role: 'admin', fullName: 'Test Admin' };
    window.history.pushState({}, '', '/admin/bookings');
    render(<DebugFeedbackWidget />);
    fireEvent.click(screen.getByTestId('debug-feedback-open'));
    await waitFor(() => expect(screen.getByTestId('debug-feedback-modal')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId('debug-feedback-capture-status').textContent).toContain('Screenshot attached'));

    fireEvent.input(screen.getByTestId('debug-feedback-message'), { target: { value: 'Save button does nothing' } });
    fireEvent.input(screen.getByTestId('debug-feedback-personal-view'), { target: { value: 'Lost my changes.' } });
    fireEvent.click(screen.getByTestId('debug-feedback-submit'));

    await waitFor(() => {
      expect(submitFeedback).toHaveBeenCalledTimes(1);
    });
    const payload = submitFeedback.mock.calls[0][0];
    expect(payload).toMatchObject({
      category: 'bug',
      message: 'Save button does nothing',
      personalView: 'Lost my changes.',
      authorType: 'admin',
      authorName: 'Test Admin',
      authorEmail: 'admin.test@acaciacamp.com',
      role: 'admin',
      userAgent: navigator.userAgent,
    });
    expect(payload.pageUrl).toContain('/admin/bookings');
    expect(payload.screenshot).toContain('data:image/jpeg;base64,');
  });

  it('still submits when screenshot capture fails (graceful degradation)', async () => {
    // First render forces a successful capture; instead make html2canvas reject.
    const { default: html2canvasMock } = await import('html2canvas');
    (html2canvasMock as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('capture failed'));

    mockUser.value = { email: 'pos@acaciacamp.com', role: 'cashier', fullName: 'P Tester' };
    render(<DebugFeedbackWidget />);
    fireEvent.click(screen.getByTestId('debug-feedback-open'));
    await waitFor(() => {
      expect(screen.getByTestId('debug-feedback-capture-status').textContent).toContain('Screenshot unavailable');
    });
    fireEvent.input(screen.getByTestId('debug-feedback-message'), { target: { value: 'Something odd' } });
    fireEvent.click(screen.getByTestId('debug-feedback-submit'));
    await waitFor(() => expect(submitFeedback).toHaveBeenCalledTimes(1));
    const payload = submitFeedback.mock.calls[0][0];
    expect(payload.screenshot).toBeNull();
  });
});