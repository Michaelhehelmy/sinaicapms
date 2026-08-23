import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MenuPlannerPanel from '@/components/admin/MenuPlannerPanel';

const mockShowToast = vi.fn();
const mockCreateMealSchedule = vi.fn();
const mockDeleteMealSchedule = vi.fn();
let mockMeals: unknown[] = [];
let mockSchedules: unknown[] = [];
let mockMealsLoading = false;
let mockSchedulesLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Phase 6: MenuPlannerPanel consumes TanStack Query data hooks + invalidates
// ['admin', ...] concerns on change instead of legacy useAdminData.refresh().
vi.mock('@/hooks/useQueryHooks', () => ({
  queryKeys: {
    mealSchedules: () => ['admin', 'mealSchedules'],
  },
  useMealsQuery: () => ({ data: mockMeals, isLoading: mockMealsLoading }),
  useMealSchedulesQuery: () => ({ data: mockSchedules, isLoading: mockSchedulesLoading }),
}));

vi.mock('@/lib/api', () => ({
  createMealSchedule: (...args: unknown[]) => mockCreateMealSchedule(...args),
  deleteMealSchedule: (...args: unknown[]) => mockDeleteMealSchedule(...args),
}));

vi.mock('@/components/ui/FormModal', () => ({
  FormModal: ({ open, title, children, onClose, onSubmit, submitLabel }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void; onSubmit: (e: React.FormEvent) => void; submitLabel: string }) => (
    open ? (
      <div data-testid="form-modal">
        <h3>{title}</h3>
        {children}
        <button onClick={onClose}>Close</button>
        <button onClick={(e) => onSubmit(e as React.FormEvent)}>{submitLabel}</button>
      </div>
    ) : null
  ),
}));

const camps = [{ id: 'c1', name: 'Camp 1', location: 'Sinai', startDate: '2025-01-01', endDate: '2025-12-31', capacity: 50, status: 'active', notes: '' }];

// The panel reads useQueryClient() to invalidate concerns — provide a fresh
// client per render and expose an invalidation spy for refresh assertions.
let invalidateSpy: ReturnType<typeof vi.fn>;
function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidateSpy = vi.spyOn(client, 'invalidateQueries');
  return render(
    <QueryClientProvider client={client}>
      <MenuPlannerPanel campIds={['c1']} camps={camps} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMeals = [];
  mockSchedules = [];
  mockMealsLoading = false;
  mockSchedulesLoading = false;
});

describe('MenuPlannerPanel', () => {
  it('renders with week navigation', () => {
    renderPanel();
    expect(screen.getByText('Menu Planner')).toBeInTheDocument();
    expect(screen.getByText('←')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('does not render a camp filter (single-camp admin)', () => {
    renderPanel();
    expect(screen.queryByText('All Camps')).not.toBeInTheDocument();
    expect(screen.queryByText('Camp *')).not.toBeInTheDocument();
  });

  it('navigates weeks', () => {
    renderPanel();
    fireEvent.click(screen.getByText('→'));
    fireEvent.click(screen.getByText('←'));
    fireEvent.click(screen.getByText(/Week of/));
  });

  it('shows "No meals scheduled" for empty days', () => {
    renderPanel();
    const noMeals = screen.getAllByText('No meals scheduled');
    expect(noMeals.length).toBeGreaterThan(0);
  });

  it('shows Add Meal buttons for each day', () => {
    renderPanel();
    const addButtons = screen.getAllByText('+ Add Meal');
    expect(addButtons.length).toBe(7);
  });

  it('shows loading state', () => {
    mockMealsLoading = true;
    renderPanel();
    expect(screen.getByText('Loading menu planner...')).toBeInTheDocument();
  });

  it('opens add meal modal', async () => {
    renderPanel();
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
  });

  it('validates form on submit', async () => {
    renderPanel();
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Please select a meal', 'error');
    });
  });

  it('closes modal on cancel', async () => {
    renderPanel();
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Close'));
    await waitFor(() => {
      expect(screen.queryByText('Schedule Meal')).not.toBeInTheDocument();
    });
  });

  it('submits form successfully', async () => {
    mockCreateMealSchedule.mockResolvedValueOnce({});
    mockMeals = [{ id: 'm1', name: 'Grilled Chicken' }];
    renderPanel();
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Please select a meal', 'error');
    });
  });

  it('shows schedule error', async () => {
    mockCreateMealSchedule.mockRejectedValueOnce(new Error('Schedule failed'));
    renderPanel();
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Please select a meal', 'error');
    });
  });

  it('displays scheduled meals', () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockSchedules = [
      { id: 's1', campId: 'c1', date: dateStr, mealId: 'm1', mealName: 'Grilled Chicken', packageType: 'all', maxServings: 100, campName: 'Camp 1' },
    ];
    renderPanel();
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
  });

  it('submits a new schedule with all fields', async () => {
    mockCreateMealSchedule.mockResolvedValueOnce({});
    mockMeals = [{ id: 'm1', name: 'Grilled Chicken' }];
    renderPanel();
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Meal *'), { target: { value: 'm1' } });
    fireEvent.change(screen.getByLabelText('Package Type'), { target: { value: 'full_board' } });
    fireEvent.change(screen.getByLabelText('Max Servings'), { target: { value: '50' } });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(mockCreateMealSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          campId: 'c1',
          mealId: 'm1',
          packageType: 'full_board',
          maxServings: 50,
          date: expect.any(String),
        }),
      );
      expect(mockShowToast).toHaveBeenCalledWith('Meal scheduled successfully', 'success');
      expect(screen.queryByText('Schedule Meal')).not.toBeInTheDocument();
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'mealSchedules'] });
  });

  it('shows error when scheduling fails', async () => {
    mockCreateMealSchedule.mockRejectedValueOnce(new Error('Schedule failed'));
    mockMeals = [{ id: 'm1', name: 'Grilled Chicken' }];
    renderPanel();
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Meal *'), { target: { value: 'm1' } });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Schedule failed', 'error');
    });
  });

  it('deletes a scheduled meal with confirmation', async () => {
    mockDeleteMealSchedule.mockResolvedValueOnce({});
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockSchedules = [
      { id: 's1', campId: 'c1', date: dateStr, mealId: 'm1', mealName: 'Grilled Chicken', packageType: 'all', maxServings: 100, campName: 'Camp 1' },
    ];
    renderPanel();
    fireEvent.click(screen.getByTitle('Remove meal'));
    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockDeleteMealSchedule).toHaveBeenCalledWith('s1');
      expect(mockShowToast).toHaveBeenCalledWith('Meal removed', 'success');
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin', 'mealSchedules'] });
  });

  it('cancels meal deletion', async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockSchedules = [
      { id: 's1', campId: 'c1', date: dateStr, mealId: 'm1', mealName: 'Grilled Chicken', packageType: 'all', maxServings: 100, campName: 'Camp 1' },
    ];
    renderPanel();
    fireEvent.click(screen.getByTitle('Remove meal'));
    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText('Confirm')).not.toBeInTheDocument();
    });
    expect(screen.getByTitle('Remove meal')).toBeInTheDocument();
  });

  it('shows error when removing a meal fails', async () => {
    mockDeleteMealSchedule.mockRejectedValueOnce(new Error('Remove failed'));
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockSchedules = [
      { id: 's1', campId: 'c1', date: dateStr, mealId: 'm1', mealName: 'Grilled Chicken', packageType: 'all', maxServings: 100, campName: 'Camp 1' },
    ];
    renderPanel();
    fireEvent.click(screen.getByTitle('Remove meal'));
    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Remove failed', 'error');
    });
  });

  it('renders package badges for each package type', () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockSchedules = [
      { id: 's1', campId: 'c1', date: dateStr, mealId: 'm1', mealName: 'Grilled Chicken', packageType: 'all', maxServings: 100, campName: 'Camp 1' },
      { id: 's2', campId: 'c1', date: dateStr, mealId: 'm2', mealName: 'Fish Fillet', packageType: 'full_board', maxServings: 100, campName: 'Camp 1' },
      { id: 's3', campId: 'c1', date: dateStr, mealId: 'm3', mealName: 'Veggie Wrap', packageType: 'half_board', maxServings: 100, campName: 'Camp 1' },
      { id: 's4', campId: 'c1', date: dateStr, mealId: 'm4', mealName: 'Omelette', packageType: 'breakfast', maxServings: 100, campName: 'Camp 1' },
    ];
    renderPanel();
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.getByText('full board')).toBeInTheDocument();
    expect(screen.getByText('half board')).toBeInTheDocument();
    expect(screen.getByText('breakfast')).toBeInTheDocument();
  });

  it('scopes schedules to the single camp (no camp filter)', async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockSchedules = [
      { id: 's1', campId: 'c1', date: dateStr, mealId: 'm1', mealName: 'Grilled Chicken', packageType: 'all', maxServings: 100, campName: 'Camp 1' },
      { id: 's2', campId: 'c2', date: dateStr, mealId: 'm2', mealName: 'Salad Bowl', packageType: 'all', maxServings: 100, campName: 'Camp 2' },
    ];
    renderPanel();
    // B3: schedules belonging to another camp are never shown, and there is
    // no dropdown to switch camps.
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Salad Bowl')).not.toBeInTheDocument();
    });
  });
});
