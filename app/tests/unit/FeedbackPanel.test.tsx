import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import FeedbackPanel from '@/components/admin/FeedbackPanel';
import { ToastProvider } from '@/components/ui/Toast';
import type { FeedbackReport } from '@/lib/api';

// Hoisted mocks — referenced from vi.mock factories that run before test body
// initialization (avoids the Cannot access before initialization TDZ error).
const { listData, mutateAsync, getFeedback } = vi.hoisted(() => ({
  listData: vi.fn(),
  mutateAsync: vi.fn(async ({ id, status }: { id: string; status: string }) => ({ id, status })),
  getFeedback: vi.fn(async () => ({ screenshot: 'data:image/jpeg;base64,AA==' })),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useFeedbackListQuery: (...args: unknown[]) => listData(...args),
  useUpdateFeedbackStatusMutation: () => ({ mutateAsync }),
}));

vi.mock('@/lib/api', () => ({ getFeedback }));

const row: FeedbackReport = {
  id: 'fb_1',
  tenantId: 'tenant_abc',
  authorType: 'public',
  authorId: null,
  authorName: 'Sara Tester',
  authorEmail: null,
  role: null,
  category: 'flow',
  message: 'Checkout asks for payment before showing the total',
  personalView: 'I expected a summary screen first.',
  pageUrl: 'https://acaciacamp.com/book',
  userAgent: 'Mozilla/5.0 (vitest)',
  status: 'open',
  createdAt: '2026-09-09 10:00:00',
  resolvedAt: null,
  resolvedBy: null,
};

function renderPanel() {
  return render(
    <ToastProvider>
      <FeedbackPanel />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  listData.mockReturnValue({
    data: { data: [row], total: 1, page: 1, pageSize: 25, hasMore: false },
    isLoading: false,
  });
});

describe('FeedbackPanel', () => {
  it('renders the report list with status badge', () => {
    renderPanel();
    expect(screen.getByText('Human-Testing Feedback')).toBeInTheDocument();
    expect(screen.getByText(/Checkout asks for payment/)).toBeInTheDocument();
    expect(screen.getByText('flow')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
  });

  it('expands a row to load and show the screenshot detail', async () => {
    renderPanel();
    fireEvent.click(screen.getByText(/Checkout asks for payment/));
    await waitFor(() => {
      expect(screen.getByTestId('feedback-screenshot-img')).toBeInTheDocument();
    });
    expect(getFeedback).toHaveBeenCalledWith('fb_1');
    expect(screen.getByText('Report detail')).toBeInTheDocument();
    expect(screen.getAllByText(/Sara Tester/).length).toBeGreaterThan(0);
    expect(screen.getByText(/I expected a summary screen first\./)).toBeInTheDocument();
  });

  it('marks a report resolved through the mutation', async () => {
    renderPanel();
    fireEvent.click(screen.getByText(/Checkout asks for payment/));
    await waitFor(() => expect(screen.getByTestId('feedback-screenshot-img')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Resolved' }));
    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ id: 'fb_1', status: 'resolved' });
    });
  });

  it('shows the empty state', () => {
    listData.mockReturnValue({
      data: { data: [], total: 0, page: 1, pageSize: 25, hasMore: false },
      isLoading: false,
    });
    renderPanel();
    expect(screen.getByText(/No feedback reports yet/)).toBeInTheDocument();
  });
});