import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MenuPlannerPanel from '@/components/admin/MenuPlannerPanel';

const mockShowToast = vi.fn();
const mockRefreshSchedules = vi.fn();
const mockCreateMealSchedule = vi.fn();
const mockDeleteMealSchedule = vi.fn();
let mockMeals: unknown[] = [];
let mockSchedules: unknown[] = [];
let mockMealsLoading = false;
let mockSchedulesLoading = false;

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useAdminData', () => ({
  useMeals: () => ({ data: mockMeals, loading: mockMealsLoading }),
  useMealSchedules: () => ({ data: mockSchedules, loading: mockSchedulesLoading, refresh: mockRefreshSchedules }),
  useCamps: () => ({ data: [] }),
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

beforeEach(() => {
  vi.clearAllMocks();
  mockMeals = [];
  mockSchedules = [];
  mockMealsLoading = false;
  mockSchedulesLoading = false;
});

describe('MenuPlannerPanel', () => {
  it('renders with week navigation', () => {
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Menu Planner')).toBeInTheDocument();
    expect(screen.getByText('←')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('shows camp filter', () => {
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('All Camps')).toBeInTheDocument();
  });

  it('navigates weeks', () => {
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByText('→'));
    fireEvent.click(screen.getByText('←'));
    fireEvent.click(screen.getByText(/Week of/));
  });

  it('shows "No meals scheduled" for empty days', () => {
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    const noMeals = screen.getAllByText('No meals scheduled');
    expect(noMeals.length).toBeGreaterThan(0);
  });

  it('shows Add Meal buttons for each day', () => {
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    const addButtons = screen.getAllByText('+ Add Meal');
    expect(addButtons.length).toBe(7);
  });

  it('shows loading state', () => {
    mockMealsLoading = true;
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Loading menu planner...')).toBeInTheDocument();
  });

  it('opens add meal modal', async () => {
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
  });

  it('validates form on submit', async () => {
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Please select a camp and a meal', 'error');
    });
  });

  it('closes modal on cancel', async () => {
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Please select a camp and a meal', 'error');
    });
  });

  it('shows schedule error', async () => {
    mockCreateMealSchedule.mockRejectedValueOnce(new Error('Schedule failed'));
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Schedule'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Please select a camp and a meal', 'error');
    });
  });

  it('displays scheduled meals', () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockSchedules = [
      { id: 's1', campId: 'c1', date: dateStr, mealId: 'm1', mealName: 'Grilled Chicken', packageType: 'all', maxServings: 100, campName: 'Camp 1' },
    ];
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
  });

  it('submits a new schedule with all fields', async () => {
    mockCreateMealSchedule.mockResolvedValueOnce({});
    mockMeals = [{ id: 'm1', name: 'Grilled Chicken' }];
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Camp *'), { target: { value: 'c1' } });
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
    expect(mockRefreshSchedules).toHaveBeenCalled();
  });

  it('shows error when scheduling fails', async () => {
    mockCreateMealSchedule.mockRejectedValueOnce(new Error('Schedule failed'));
    mockMeals = [{ id: 'm1', name: 'Grilled Chicken' }];
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    const addButtons = screen.getAllByText('+ Add Meal');
    fireEvent.click(addButtons[0]);
    await waitFor(() => {
      expect(screen.getByText('Schedule Meal')).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText('Camp *'), { target: { value: 'c1' } });
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
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    fireEvent.click(screen.getByTitle('Remove meal'));
    await waitFor(() => {
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockDeleteMealSchedule).toHaveBeenCalledWith('s1');
      expect(mockShowToast).toHaveBeenCalledWith('Meal removed', 'success');
    });
    expect(mockRefreshSchedules).toHaveBeenCalled();
  });

  it('cancels meal deletion', async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockSchedules = [
      { id: 's1', campId: 'c1', date: dateStr, mealId: 'm1', mealName: 'Grilled Chicken', packageType: 'all', maxServings: 100, campName: 'Camp 1' },
    ];
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
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
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
    expect(screen.getByText('full board')).toBeInTheDocument();
    expect(screen.getByText('half board')).toBeInTheDocument();
    expect(screen.getByText('breakfast')).toBeInTheDocument();
  });

  it('filters schedules by camp', async () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    mockSchedules = [
      { id: 's1', campId: 'c1', date: dateStr, mealId: 'm1', mealName: 'Grilled Chicken', packageType: 'all', maxServings: 100, campName: 'Camp 1' },
      { id: 's2', campId: 'c2', date: dateStr, mealId: 'm2', mealName: 'Salad Bowl', packageType: 'all', maxServings: 100, campName: 'Camp 2' },
    ];
    render(<MenuPlannerPanel campIds={['c1']} camps={camps} />);
    expect(screen.getByText('Salad Bowl')).toBeInTheDocument();
    const filterSelect = document.querySelector('select') as HTMLSelectElement;
    fireEvent.change(filterSelect, { target: { value: 'c1' } });
    await waitFor(() => {
      expect(screen.queryByText('Salad Bowl')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Grilled Chicken')).toBeInTheDocument();
  });
});
