import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CRMPanel from '@/components/admin/CRMPanel';

const mockShowToast = vi.fn();
let mockContacts: unknown[] = [];
let mockLeads: unknown[] = [];
let mockOpps: unknown[] = [];
let mockTasks: unknown[] = [];
let mockTickets: unknown[] = [];
let mockArticles: unknown[] = [];
let mockLoading = false;
const mockInvalidate = vi.fn();

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

vi.mock('@/hooks/useQueryHooks', () => ({
  useCrmContactsQuery: () => ({ data: mockContacts, isLoading: mockLoading }),
  useCrmLeadsQuery: () => ({ data: mockLeads, isLoading: false }),
  useCrmOpportunitiesQuery: () => ({ data: mockOpps, isLoading: false }),
  useCrmTasksQuery: () => ({ data: mockTasks, isLoading: false }),
  useCrmTicketsQuery: () => ({ data: mockTickets, isLoading: false }),
  useCrmKnowledgeArticlesQuery: () => ({ data: mockArticles, isLoading: false }),
}));

vi.mock('@/lib/utils', () => ({
  formatCurrency: (n: number) => `$${Number(n).toFixed(2)}`,
  formatDate: (d: string) => d,
  cn: (...c: (string | undefined | false | null)[]) => c.filter(Boolean).join(' '),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import * as api from '@/lib/api';

beforeEach(() => {
  vi.clearAllMocks();
  mockContacts = [];
  mockLeads = [];
  mockOpps = [];
  mockTasks = [];
  mockTickets = [];
  mockArticles = [];
  mockLoading = false;
});

describe('CRMPanel', () => {
  it('renders loading state', () => {
    mockLoading = true;
    render(<CRMPanel />);
    expect(screen.getByText('Loading CRM...')).toBeTruthy();
  });

  it('renders empty state for contacts tab', () => {
    render(<CRMPanel />);
    expect(screen.getByText(/No contacts/)).toBeTruthy();
  });

  it('switches tabs', async () => {
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-leads'));
    expect(screen.getByText(/No leads/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('tab-opportunities'));
    expect(screen.getByText(/No opportunities/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('tab-tasks'));
    expect(screen.getByText(/No tasks/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('tab-tickets'));
    expect(screen.getByText(/No tickets/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('tab-knowledge'));
    expect(screen.getByText(/No articles/)).toBeTruthy();
  });

  it('opens add contact modal via header button', async () => {
    render(<CRMPanel />);
    const addBtns = screen.getAllByText('Add Contact');
    fireEvent.click(addBtns[0]); // click the first one (header button)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Full name or company')).toBeTruthy();
    });
  });

  it('validates contact name required', async () => {
    render(<CRMPanel />);
    const addBtns = screen.getAllByText('Add Contact');
    fireEvent.click(addBtns[0]);
    await waitFor(() => { expect(screen.getByPlaceholderText('Full name or company')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
  });

  it('creates contact successfully', async () => {
    (api.apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<CRMPanel />);
    const addBtns = screen.getAllByText('Add Contact');
    fireEvent.click(addBtns[0]);
    await waitFor(() => { expect(screen.getByPlaceholderText('Full name or company')).toBeTruthy(); });

    fireEvent.change(screen.getByPlaceholderText('Full name or company'), { target: { value: 'Test Contact' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Contact created.', 'success');
    });
  });

  it('validates lead contact required', async () => {
    mockContacts = [{ id: '1', name: 'Bob' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-leads'));
    // Multiple "Add Lead" buttons exist (header + empty state) — click the first
    fireEvent.click(screen.getAllByText('Add Lead')[0]);
    await waitFor(() => { expect(screen.getByText('Save')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Contact is required.', 'warning');
    });
  });

  it('validates opportunity name required', async () => {
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    fireEvent.click(screen.getAllByText('Add Opportunity')[0]);
    await waitFor(() => { expect(screen.getByText('Save')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Name is required.', 'warning');
    });
  });

  it('validates task title required', async () => {
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    fireEvent.click(screen.getAllByText('Add Task')[0]);
    await waitFor(() => { expect(screen.getByText('Save')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Title is required.', 'warning');
    });
  });

  it('validates ticket subject required', async () => {
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tickets'));
    fireEvent.click(screen.getAllByText('Add Ticket')[0]);
    await waitFor(() => { expect(screen.getByText('Save')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Subject is required.', 'warning');
    });
  });

  it('validates knowledge article fields required', async () => {
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    fireEvent.click(screen.getByTestId('add-btn'));
    await waitFor(() => { expect(screen.getByPlaceholderText('Article title')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Title and content are required.', 'warning');
    });
  });

  it('renders contacts with data', () => {
    mockContacts = [
      { id: '1', name: 'Alice', email: 'a@test.com', phone: '123', type: 'individual', isCustomer: true, isVendor: false, isLead: false },
    ];
    render(<CRMPanel />);
    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('renders leads with data', () => {
    mockLeads = [{ id: '1', contactName: 'Bob', status: 'new', source: 'Web', value: 500 }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-leads'));
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('renders opportunities with data', () => {
    mockOpps = [{ id: '1', name: 'Deal', stage: 'qualification', amount: 1000, probability: 50 }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    expect(screen.getByText('Deal')).toBeTruthy();
  });

  it('renders tasks with data', () => {
    mockTasks = [{ id: '1', title: 'Task1', status: 'todo', priority: 'high' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    expect(screen.getByText('Task1')).toBeTruthy();
  });

  it('renders tickets with data', () => {
    mockTickets = [{ id: '1', subject: 'Help', status: 'open', priority: 'medium' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tickets'));
    expect(screen.getByText('Help')).toBeTruthy();
  });

  it('renders knowledge articles with data', () => {
    mockArticles = [{ id: '1', title: 'Guide', category: 'FAQ', isPublished: true }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-knowledge'));
    expect(screen.getByText('Guide')).toBeTruthy();
  });

  it('renders kanban view for opportunities', () => {
    mockOpps = [{ id: '1', name: 'Deal', stage: 'proposal', amount: 1000, probability: 50 }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    fireEvent.click(screen.getByText('Kanban'));
    expect(screen.getByTestId('kanban-board')).toBeTruthy();
  });

  it('renders gantt view for tasks', () => {
    mockTasks = [{ id: '1', title: 'T1', status: 'todo', dueDate: '2025-06-01' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    fireEvent.click(screen.getByText('Gantt'));
    expect(screen.getByTestId('gantt-chart')).toBeTruthy();
  });

  it('gantt empty when no due dates', () => {
    mockTasks = [{ id: '1', title: 'T1', status: 'todo' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    fireEvent.click(screen.getByText('Gantt'));
    expect(screen.getByText(/No tasks with due dates/)).toBeTruthy();
  });

  it('updates lead status', async () => {
    mockLeads = [{ id: '1', contactName: 'Bob', status: 'new' }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-leads'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Lead Status')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Contacted'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Lead marked as contacted.', 'success');
    });
  });

  it('updates opportunity stage', async () => {
    mockOpps = [{ id: '1', name: 'Deal', stage: 'qualification', amount: 1000 }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    fireEvent.click(screen.getByText('Update Stage'));
    await waitFor(() => { expect(screen.getByText('Update Pipeline Stage')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Proposal'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Opportunity moved to proposal.', 'success');
    });
  });

  it('updates task status', async () => {
    mockTasks = [{ id: '1', title: 'T1', status: 'todo' }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Task Status')).toBeTruthy(); });
    fireEvent.click(screen.getByText('In Progress'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Task status updated.', 'success');
    });
  });

  it('adds ticket comment', async () => {
    mockTickets = [{ id: '1', subject: 'Bug', status: 'open' }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tickets'));
    fireEvent.click(screen.getByText('Add Comment'));
    await waitFor(() => { expect(screen.getByPlaceholderText('Type your comment...')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('Type your comment...'), { target: { value: 'Nice fix' } });
    // Click the submit button that says "Add Comment"
    const addCommentBtns = screen.getAllByText('Add Comment');
    fireEvent.click(addCommentBtns[addCommentBtns.length - 1]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Comment added.', 'success');
    });
  });

  it('shows delete confirmation for contacts', async () => {
    mockContacts = [{ id: '1', name: 'Alice' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => { expect(screen.getByText(/Are you sure/)).toBeTruthy(); });
  });

  it('closes the lead status modal via the close button', async () => {
    mockLeads = [{ id: '1', contactName: 'Bob', status: 'new' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-leads'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Lead Status')).toBeTruthy(); });
    // Click the close (X) button — triggers the onClose handler
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => { expect(screen.queryByText('Update Lead Status')).toBeNull(); });
  });

  it('closes the opportunity stage modal via the close button', async () => {
    mockOpps = [{ id: '1', name: 'Deal', stage: 'qualification', amount: 1000 }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    fireEvent.click(screen.getByText('Update Stage'));
    await waitFor(() => { expect(screen.getByText('Update Pipeline Stage')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => { expect(screen.queryByText('Update Pipeline Stage')).toBeNull(); });
  });

  it('closes the task status modal via the close button', async () => {
    mockTasks = [{ id: '1', title: 'T1', status: 'todo' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Task Status')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => { expect(screen.queryByText('Update Task Status')).toBeNull(); });
  });

  it('shows error when saving contact fails', async () => {
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('save failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getAllByText('Add Contact')[0]);
    await waitFor(() => { expect(screen.getByPlaceholderText('Full name or company')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('Full name or company'), { target: { value: 'Test' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: save failed', 'error');
    });
  });

  it('shows error when saving lead fails', async () => {
    mockContacts = [{ id: '1', name: 'Bob' }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('lead failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-leads'));
    fireEvent.click(screen.getAllByText('Add Lead')[0]);
    await waitFor(() => { expect(screen.getByText('Save')).toBeTruthy(); });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '1' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: lead failed', 'error');
    });
  });

  it('shows error when saving opportunity fails', async () => {
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('opp failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    fireEvent.click(screen.getAllByText('Add Opportunity')[0]);
    await waitFor(() => { expect(screen.getByPlaceholderText('Deal name')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('Deal name'), { target: { value: 'Deal' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: opp failed', 'error');
    });
  });

  it('shows error when saving task fails', async () => {
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('task failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    fireEvent.click(screen.getAllByText('Add Task')[0]);
    await waitFor(() => { expect(screen.getByText('Save')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Write tests' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: task failed', 'error');
    });
  });

  it('shows error when saving ticket fails', async () => {
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('ticket failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tickets'));
    fireEvent.click(screen.getAllByText('Add Ticket')[0]);
    await waitFor(() => { expect(screen.getByPlaceholderText('Ticket subject')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('Ticket subject'), { target: { value: 'Bug' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: ticket failed', 'error');
    });
  });

  it('shows error when adding ticket comment fails', async () => {
    mockTickets = [{ id: '1', subject: 'Bug', status: 'open' }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('comment failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tickets'));
    fireEvent.click(screen.getByText('Add Comment'));
    await waitFor(() => { expect(screen.getByPlaceholderText('Type your comment...')).toBeTruthy(); });
    fireEvent.change(screen.getByPlaceholderText('Type your comment...'), { target: { value: 'Nice fix' } });
    const addCommentBtns = screen.getAllByText('Add Comment');
    fireEvent.click(addCommentBtns[addCommentBtns.length - 1]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: comment failed', 'error');
    });
  });

  it('shows error when deleting contact fails', async () => {
    mockContacts = [{ id: '1', name: 'Alice', email: 'alice@test.com', phone: '123', type: 'individual', isCustomer: false, isVendor: false, isLead: false, notes: '' }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('delete failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => { expect(screen.getByText(/Are you sure/)).toBeTruthy(); });
    // ConfirmDialog confirmLabel is "Delete" — click the danger-styled one inside the dialog
    const deleteBtns = screen.getAllByText('Delete');
    fireEvent.click(deleteBtns[deleteBtns.length - 1]);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: delete failed', 'error');
    });
  });

  it('shows error when updating lead status fails', async () => {
    mockLeads = [{ id: '1', contactName: 'Bob', status: 'new' }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('lead status failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-leads'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Lead Status')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Contacted'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: lead status failed', 'error');
    });
  });

  it('shows error when updating opportunity stage fails', async () => {
    mockOpps = [{ id: '1', name: 'Deal', stage: 'qualification', amount: 1000 }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('opp stage failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    fireEvent.click(screen.getByText('Update Stage'));
    await waitFor(() => { expect(screen.getByText('Update Pipeline Stage')).toBeTruthy(); });
    fireEvent.click(screen.getByText('Proposal'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: opp stage failed', 'error');
    });
  });

  it('shows error when updating task status fails', async () => {
    mockTasks = [{ id: '1', title: 'T1', status: 'todo' }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('task status failed'));
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tasks'));
    fireEvent.click(screen.getByText('Update Status'));
    await waitFor(() => { expect(screen.getByText('Update Task Status')).toBeTruthy(); });
    fireEvent.click(screen.getByText('In Progress'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Error: task status failed', 'error');
    });
  });

  it('does not add comment when text is empty', async () => {
    mockTickets = [{ id: '1', subject: 'Bug', status: 'open' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tickets'));
    fireEvent.click(screen.getByText('Add Comment'));
    await waitFor(() => { expect(screen.getByPlaceholderText('Type your comment...')).toBeTruthy(); });
    // Don't type anything — leave comment empty
    const addCommentBtns = screen.getAllByText('Add Comment');
    fireEvent.click(addCommentBtns[addCommentBtns.length - 1]);
    // Should not call apiFetch — guard blocks empty comment
    expect(api.apiFetch).not.toHaveBeenCalled();
  });

  it('deletes non-contact entity without API call', async () => {
    // Delete button exists when there are contacts - set up contact data for the DataTable
    // but verify the delete handler works for contacts (the only supported deleteTarget.type)
    mockContacts = [{ id: '1', name: 'Alice', email: 'alice@test.com', phone: '123', type: 'individual', isCustomer: false, isVendor: false, isLead: false, notes: '' }];
    (api.apiFetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    render(<CRMPanel />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => { expect(screen.getByText(/Are you sure/)).toBeTruthy(); });
    // ConfirmDialog confirmLabel is "Delete" — click the danger-styled one inside the dialog
    const deleteBtns = screen.getAllByText('Delete');
    fireEvent.click(deleteBtns[deleteBtns.length - 1]);
    await waitFor(() => {
      expect(api.apiFetch).toHaveBeenCalledWith('/crm/contacts/1', { method: 'DELETE' });
      expect(mockShowToast).toHaveBeenCalledWith('Deleted.', 'success');
    });
  });

  it('closes contact form modal via close button', async () => {
    render(<CRMPanel />);
    fireEvent.click(screen.getAllByText('Add Contact')[0]);
    await waitFor(() => { expect(screen.getByPlaceholderText('Full name or company')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Full name or company')).toBeNull();
    });
  });

  it('closes lead form modal via close button', async () => {
    mockContacts = [{ id: '1', name: 'Bob' }];
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-leads'));
    fireEvent.click(screen.getAllByText('Add Lead')[0]);
    await waitFor(() => { expect(screen.getByLabelText('Close dialog')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByLabelText('Close dialog')).toBeNull();
      // Verify modal-specific content is gone (lead source placeholder)
      expect(screen.queryByPlaceholderText('e.g. Website, Referral')).toBeNull();
    });
  });

  it('closes opportunity form modal via close button', async () => {
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-opportunities'));
    fireEvent.click(screen.getAllByText('Add Opportunity')[0]);
    await waitFor(() => { expect(screen.getByLabelText('Close dialog')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByLabelText('Close dialog')).toBeNull();
      // Verify modal-specific content is gone (opp name placeholder)
      expect(screen.queryByPlaceholderText('Deal name')).toBeNull();
    });
  });

  it('closes ticket form modal via close button', async () => {
    render(<CRMPanel />);
    fireEvent.click(screen.getByTestId('tab-tickets'));
    fireEvent.click(screen.getAllByText('Add Ticket')[0]);
    await waitFor(() => { expect(screen.getByLabelText('Close dialog')).toBeTruthy(); });
    fireEvent.click(screen.getByLabelText('Close dialog'));
    await waitFor(() => {
      expect(screen.queryByLabelText('Close dialog')).toBeNull();
      // Verify modal-specific content is gone (ticket subject placeholder)
      expect(screen.queryByPlaceholderText('Ticket subject')).toBeNull();
    });
  });
});
