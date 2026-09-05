import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CampBooking from '@/components/public/CampBooking';

vi.mock('@/lib/api', () => ({
  getProjectMealPlans: vi.fn(),
  getTenantId: vi.fn().mockReturnValue('t1'),
}));

import { getProjectMealPlans } from '@/lib/api';

const mockedGetProjectMealPlans = getProjectMealPlans as unknown as ReturnType<typeof vi.fn>;

const roomTypes = [
  { id: 'r1', name: 'Deluxe Tent', capacity: 4, basePrice: 100, description: 'A tent' },
  { id: 'r2', name: 'Family Suite', capacity: 6, basePrice: 250, description: 'A suite' },
];

const defaultProps = {
  tenantId: 't1',
  tenantName: 'Test Camp',
  primaryColor: '#22c55e',
  roomTypes,
};

describe('CampBooking', () => {
  beforeEach(() => {
    localStorage.clear();
    mockedGetProjectMealPlans.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders room cards for each roomType', () => {
    render(<CampBooking {...defaultProps} />);
    expect(screen.getByText('Deluxe Tent')).toBeInTheDocument();
    expect(screen.getByText('Family Suite')).toBeInTheDocument();
  });

  it('shows empty state when roomTypes is empty', () => {
    render(<CampBooking {...defaultProps} roomTypes={[]} />);
    expect(screen.getByText('No rooms available.')).toBeInTheDocument();
  });

  it('price calculation is correct (nights × basePrice)', async () => {
    render(<CampBooking {...defaultProps} roomTypes={[roomTypes[0]]} />);
    fireEvent.click(screen.getByText('Book'));

    const today = new Date();
    const checkIn = new Date(today);
    checkIn.setDate(today.getDate() + 1);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkIn.getDate() + 3);

    const checkInStr = checkIn.toISOString().split('T')[0];
    const checkOutStr = checkOut.toISOString().split('T')[0];

    const dateInputs = screen.getAllByDisplayValue('');
    fireEvent.change(dateInputs[0], { target: { value: checkInStr } });
    fireEvent.change(dateInputs[1], { target: { value: checkOutStr } });

    await waitFor(() => {
      expect(screen.getByText(/300/)).toBeInTheDocument();
    });
  });

  it('adds item to reservation and shows in bar', async () => {
    render(<CampBooking {...defaultProps} roomTypes={[roomTypes[0]]} />);
    fireEvent.click(screen.getByText('Book'));

    const today = new Date();
    const checkIn = new Date(today);
    checkIn.setDate(today.getDate() + 1);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkIn.getDate() + 2);

    const checkInStr = checkIn.toISOString().split('T')[0];
    const checkOutStr = checkOut.toISOString().split('T')[0];

    const dateInputs = screen.getAllByDisplayValue('');
    fireEvent.change(dateInputs[0], { target: { value: checkInStr } });
    fireEvent.change(dateInputs[1], { target: { value: checkOutStr } });

    await waitFor(() => {
      expect(screen.getByText('Add to Reservation')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add to Reservation'));

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('sc_reservation') || '[]');
      expect(stored).toHaveLength(1);
      expect(stored[0].roomType.name).toBe('Deluxe Tent');
      expect(screen.getByText(/1 room\(s\) in reservation/)).toBeInTheDocument();
    });
  });

  it('checkout button navigates to correct URL', async () => {
    render(<CampBooking {...defaultProps} roomTypes={[roomTypes[0]]} />);
    fireEvent.click(screen.getByText('Book'));

    const today = new Date();
    const checkIn = new Date(today);
    checkIn.setDate(today.getDate() + 1);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkIn.getDate() + 2);

    const checkInStr = checkIn.toISOString().split('T')[0];
    const checkOutStr = checkOut.toISOString().split('T')[0];

    const dateInputs = screen.getAllByDisplayValue('');
    fireEvent.change(dateInputs[0], { target: { value: checkInStr } });
    fireEvent.change(dateInputs[1], { target: { value: checkOutStr } });

    await waitFor(() => {
      expect(screen.getByText('Add to Reservation')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Add to Reservation'));

    await waitFor(() => {
      const link = screen.getByText('View Summary');
      expect(link).toHaveAttribute('href', '/camp/t1/book');
    });
  });

  it('recovers from corrupted stored reservation JSON', () => {
    localStorage.setItem('sc_reservation', '{not-valid-json');
    render(<CampBooking {...defaultProps} />);
    expect(screen.queryByTestId('reservation-bar')).not.toBeInTheDocument();
  });

  it('loads a stored reservation on mount', () => {
    localStorage.setItem('sc_reservation', JSON.stringify([
      { roomType: roomTypes[0], guests: 2, checkIn: '2025-07-01', checkOut: '2025-07-03', nights: 2, price: 200 },
    ]));
    render(<CampBooking {...defaultProps} />);
    expect(screen.getByTestId('reservation-bar')).toBeInTheDocument();
  });

  it('clears the reservation via the clear button', async () => {
    render(<CampBooking {...defaultProps} roomTypes={[roomTypes[0]]} />);
    fireEvent.click(screen.getByText('Book'));

    const today = new Date();
    const checkIn = new Date(today);
    checkIn.setDate(today.getDate() + 1);
    const checkOut = new Date(checkIn);
    checkOut.setDate(checkIn.getDate() + 2);

    const dateInputs = screen.getAllByDisplayValue('');
    fireEvent.change(dateInputs[0], { target: { value: checkIn.toISOString().split('T')[0] } });
    fireEvent.change(dateInputs[1], { target: { value: checkOut.toISOString().split('T')[0] } });

    await waitFor(() => {
      expect(screen.getByText('Add to Reservation')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Add to Reservation'));

    await waitFor(() => {
      expect(screen.getByTestId('reservation-bar')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Clear'));

    await waitFor(() => {
      expect(screen.queryByTestId('reservation-bar')).not.toBeInTheDocument();
      expect(localStorage.getItem('sc_reservation')).toBe('[]');
    });
  });

  it('closes the booking modal via backdrop click and close button', () => {
    render(<CampBooking {...defaultProps} roomTypes={[roomTypes[0]]} />);
    fireEvent.click(screen.getByText('Book'));
    expect(screen.getByTestId('booking-form')).toBeInTheDocument();

    const backdrop = document.querySelector('[class*="bg-black/50"]');
    fireEvent.click(backdrop as Element);
    expect(screen.queryByTestId('booking-form')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Book'));
    fireEvent.click(screen.getByText('✕'));
    expect(screen.queryByTestId('booking-form')).not.toBeInTheDocument();
  });

  it('adjusts guest count within capacity bounds', () => {
    render(<CampBooking {...defaultProps} roomTypes={[roomTypes[0]]} />);
    fireEvent.click(screen.getByText('Book'));
    expect(screen.getByTestId('guest-count').textContent).toBe('2');

    fireEvent.click(screen.getByLabelText('Increase guests'));
    expect(screen.getByTestId('guest-count').textContent).toBe('3');
    fireEvent.click(screen.getByLabelText('Increase guests'));
    expect(screen.getByTestId('guest-count').textContent).toBe('4');
    fireEvent.click(screen.getByLabelText('Increase guests'));
    expect(screen.getByTestId('guest-count').textContent).toBe('4');

    fireEvent.click(screen.getByLabelText('Decrease guests'));
    fireEvent.click(screen.getByLabelText('Decrease guests'));
    fireEvent.click(screen.getByLabelText('Decrease guests'));
    fireEvent.click(screen.getByLabelText('Decrease guests'));
    expect(screen.getByTestId('guest-count').textContent).toBe('1');
  });

  it('defaults the View Summary link to /camp/{tenantId}/book', () => {
    localStorage.setItem(
      'sc_reservation',
      JSON.stringify([{ roomType: roomTypes[0], guests: 2, checkIn: '2026-08-01', checkOut: '2026-08-03', nights: 2, price: 200 }]),
    );
    render(<CampBooking {...defaultProps} />);
    expect(screen.getByText('View Summary').closest('a')).toHaveAttribute('href', '/camp/t1/book');
  });

  it('uses the bookUrl prop for the View Summary link when provided', () => {
    localStorage.setItem(
      'sc_reservation',
      JSON.stringify([{ roomType: roomTypes[0], guests: 2, checkIn: '2026-08-01', checkOut: '2026-08-03', nights: 2, price: 200 }]),
    );
    render(<CampBooking {...defaultProps} bookUrl="/book" />);
    expect(screen.getByText('View Summary').closest('a')).toHaveAttribute('href', '/book');
  });

  it('loads meal plans through the shared api client, not a raw fetch', async () => {
    mockedGetProjectMealPlans.mockResolvedValue([
      { id: 'mp1', name: 'Full Board', sellingPrice: 50, description: 'Three meals' },
    ]);

    render(
      <CampBooking
        {...defaultProps}
        roomTypes={[roomTypes[0]]}
        projectId="p1"
        mealPlanCategoryId="c1"
      />,
    );

    // The shared client helper must be invoked with the project id.
    await waitFor(() => {
      expect(mockedGetProjectMealPlans).toHaveBeenCalledWith('p1');
    });

    // The fetched meal plan surfaces in the booking modal.
    fireEvent.click(screen.getByText('Book'));
    fireEvent.change(screen.getByTestId('checkin-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('checkout-date'), { target: { value: '2026-09-03' } });
    await waitFor(() => {
      expect(screen.getByText('Full Board')).toBeInTheDocument();
      expect(screen.getByText(/50 EGP\/day/)).toBeInTheDocument();
    });
  });

  it('recovers when the meal plan fetch rejects', async () => {
    mockedGetProjectMealPlans.mockRejectedValue(new Error('boom'));
    render(
      <CampBooking
        {...defaultProps}
        roomTypes={[roomTypes[0]]}
        projectId="p1"
        mealPlanCategoryId="c1"
      />,
    );
    await waitFor(() => {
      expect(mockedGetProjectMealPlans).toHaveBeenCalledWith('p1');
    });
    // The failed fetch must not crash the component — no meal plans render.
    fireEvent.click(screen.getByText('Book'));
    fireEvent.change(screen.getByTestId('checkin-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('checkout-date'), { target: { value: '2026-09-03' } });
    await waitFor(() => {
      expect(screen.queryByText('Add Meal Plans')).not.toBeInTheDocument();
    });
  });

  it('selects a meal plan, adds the item, and auto-closes the modal', async () => {
    mockedGetProjectMealPlans.mockResolvedValue([
      { id: 'mp1', name: 'Full Board', sellingPrice: 50, description: 'Three meals' },
    ]);

    render(
      <CampBooking
        {...defaultProps}
        roomTypes={[roomTypes[0]]}
        projectId="p1"
        mealPlanCategoryId="c1"
      />,
    );

    fireEvent.click(screen.getByText('Book'));
    fireEvent.change(screen.getByTestId('checkin-date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByTestId('checkout-date'), { target: { value: '2026-09-03' } });
    await waitFor(() => {
      expect(screen.getByText('Full Board')).toBeInTheDocument();
    });

    // Guests both increment and decrement via the guest stepper.
    fireEvent.click(screen.getByLabelText('Increase guests'));
    fireEvent.click(screen.getByLabelText('Increase guests'));
    expect(screen.getByTestId('guest-count')).toHaveTextContent('4');
    fireEvent.click(screen.getByLabelText('Decrease guests'));
    expect(screen.getByTestId('guest-count')).toHaveTextContent('3');

    // Meal plan + (increment) then − (decrement) buttons.
    fireEvent.click(screen.getAllByText('+')[1]);
    fireEvent.click(screen.getAllByText('+')[1]);
    fireEvent.click(screen.getAllByText('−')[1]);

    // Switch to fake timers so the modal auto-close (800ms) can be advanced.
    vi.useFakeTimers();
    fireEvent.click(screen.getByText('Add to Reservation'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    const stored = JSON.parse(localStorage.getItem('sc_reservation') || '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].mealPlans).toEqual([
      { productId: 'mp1', name: 'Full Board', pricePerDay: 50, quantity: 1 },
    ]);
    // The modal closed after the timer fired.
    expect(screen.queryByText('Add to Reservation')).not.toBeInTheDocument();
  });
});
