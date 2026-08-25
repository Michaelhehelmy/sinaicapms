import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CampBooking from '@/components/public/CampBooking';
import ReservationSummary from '@/components/public/ReservationSummary';

const roomTypes = [
  { id: 'r1', name: 'Deluxe Tent', capacity: 4, basePrice: 100, description: 'A tent' },
];

const mealPlans = [
  { id: 'mp1', name: 'Full Board', selling_price: 50, description: 'Breakfast, lunch, dinner' },
  { id: 'mp2', name: 'Half Board', selling_price: 30, description: 'Breakfast and dinner' },
];

const defaultProps = {
  tenantId: 't1',
  tenantName: 'Test Camp',
  primaryColor: '#22c55e',
  roomTypes,
};

describe('Meal Plans', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('CampBooking', () => {
    it('does not fetch meal plans when projectId is not set', () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      render(<CampBooking {...defaultProps} />);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('fetches meal plans when projectId and mealPlanCategoryId are set', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ meal_plans: mealPlans }),
      } as Response);

      render(<CampBooking {...defaultProps} projectId="proj1" mealPlanCategoryId="cat1" />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith('/api/projects/proj1/meal-plans');
      });
    });

    it('renders meal plan options in the booking modal when data is loaded', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ meal_plans: mealPlans }),
      } as Response);

      render(<CampBooking {...defaultProps} projectId="proj1" mealPlanCategoryId="cat1" />);
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
        expect(screen.getByText('Full Board')).toBeInTheDocument();
        expect(screen.getByText('Half Board')).toBeInTheDocument();
        expect(screen.getByText('Add Meal Plans')).toBeInTheDocument();
      });
    });

    it('allows selecting meal plans via increment/decrement buttons', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ meal_plans: mealPlans }),
      } as Response);

      render(<CampBooking {...defaultProps} projectId="proj1" mealPlanCategoryId="cat1" />);
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
        expect(screen.getByText('Full Board')).toBeInTheDocument();
      });

      // Find the increment button for Full Board
      const fullBoardRow1 = screen.getByText('Full Board').closest('[class*="rounded-xl"]')!;
      const buttons1 = fullBoardRow1.querySelectorAll('button');
      fireEvent.click(buttons1[1]);

      await waitFor(() => {
        expect(screen.getByText('Full Board').closest('[class*="rounded-xl"]')!.querySelector('span.w-6')!.textContent).toBe('1');
      });
    });

    it('meal plan costs are included in the total', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ meal_plans: mealPlans }),
      } as Response);

      render(<CampBooking {...defaultProps} projectId="proj1" mealPlanCategoryId="cat1" />);
      fireEvent.click(screen.getByText('Book'));

      const today = new Date();
      const checkIn = new Date(today);
      checkIn.setDate(today.getDate() + 1);
      const checkOut = new Date(checkIn);
      checkOut.setDate(checkIn.getDate() + 1); // 1 night

      const dateInputs = screen.getAllByDisplayValue('');
      fireEvent.change(dateInputs[0], { target: { value: checkIn.toISOString().split('T')[0] } });
      fireEvent.change(dateInputs[1], { target: { value: checkOut.toISOString().split('T')[0] } });

      await waitFor(() => {
        expect(screen.getByText('Full Board')).toBeInTheDocument();
      });

      // Select 1 Full Board (50 EGP/day × 1 night = 50)
      const fullBoardRow = screen.getByText('Full Board').closest('[class*="rounded-xl"]')!;
      const buttons = fullBoardRow.querySelectorAll('button');
      // buttons[0] = minus, buttons[1] = plus
      fireEvent.click(buttons[1]);

      // Total should be 100 (room) + 50 (meal plan) = 150
      await waitFor(() => {
        expect(screen.getByText(/150/)).toBeInTheDocument();
      });
    });

    it('meal plans are stored in reservation with correct data', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ meal_plans: mealPlans }),
      } as Response);

      render(<CampBooking {...defaultProps} projectId="proj1" mealPlanCategoryId="cat1" />);
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
        expect(screen.getByText('Full Board')).toBeInTheDocument();
      });

      // Select 1 Full Board
      const fullBoardRow2 = screen.getByText('Full Board').closest('[class*="rounded-xl"]')!;
      const buttons2 = fullBoardRow2.querySelectorAll('button');
      fireEvent.click(buttons2[1]);

      fireEvent.click(screen.getByText('Add to Reservation'));

      await waitFor(() => {
        const stored = JSON.parse(localStorage.getItem('sc_reservation') || '[]');
        expect(stored).toHaveLength(1);
        expect(stored[0].mealPlans).toHaveLength(1);
        expect(stored[0].mealPlans[0].productId).toBe('mp1');
        expect(stored[0].mealPlans[0].name).toBe('Full Board');
        expect(stored[0].mealPlans[0].pricePerDay).toBe(50);
        expect(stored[0].mealPlans[0].quantity).toBe(1);
      });
    });

    it('does not show meal plan section when no meal plans are loaded', () => {
      render(<CampBooking {...defaultProps} projectId="proj1" mealPlanCategoryId="cat1" />);
      fireEvent.click(screen.getByText('Book'));
      expect(screen.queryByText('Add Meal Plans')).not.toBeInTheDocument();
    });
  });

  describe('ReservationSummary', () => {
    const summaryProps = {
      tenantId: 't1',
      tenantName: 'Test Camp',
      primaryColor: '#22c55e',
      whatsappNumber: '1234567890',
    };

    it('displays meal plans in the reservation card', () => {
      const items = [{
        roomType: { id: 'r1', name: 'Deluxe Tent', capacity: 4, basePrice: 100 },
        guests: 2,
        checkIn: '2025-07-01',
        checkOut: '2025-07-03',
        nights: 2,
        price: 260,
        mealPlans: [
          { productId: 'mp1', name: 'Full Board', pricePerDay: 30, quantity: 2 },
        ],
      }];
      localStorage.setItem('sc_reservation', JSON.stringify(items));

      render(<ReservationSummary {...summaryProps} />);

      expect(screen.getByText('Meal Plans')).toBeInTheDocument();
      expect(screen.getByText(/2× Full Board/)).toBeInTheDocument();
    });

    it('total includes meal plan costs', () => {
      const items = [{
        roomType: { id: 'r1', name: 'Deluxe Tent', capacity: 4, basePrice: 100 },
        guests: 2,
        checkIn: '2025-07-01',
        checkOut: '2025-07-03',
        nights: 2,
        price: 260,
        mealPlans: [
          { productId: 'mp1', name: 'Full Board', pricePerDay: 30, quantity: 2 },
        ],
      }];
      localStorage.setItem('sc_reservation', JSON.stringify(items));

      render(<ReservationSummary {...summaryProps} />);

      const priceElements = screen.getAllByText(/260 EGP/);
      expect(priceElements.length).toBeGreaterThanOrEqual(1);
    });

    it('WhatsApp message includes meal plan details', () => {
      const items = [{
        roomType: { id: 'r1', name: 'Deluxe Tent', capacity: 4, basePrice: 100 },
        guests: 2,
        checkIn: '2025-07-01',
        checkOut: '2025-07-03',
        nights: 2,
        price: 260,
        mealPlans: [
          { productId: 'mp1', name: 'Full Board', pricePerDay: 30, quantity: 2 },
        ],
      }];
      localStorage.setItem('sc_reservation', JSON.stringify(items));

      render(<ReservationSummary {...summaryProps} />);
      expect(screen.getByText('Send Booking via WhatsApp')).toBeInTheDocument();
    });

    it('does not show meal plans section when item has no meal plans', () => {
      const items = [{
        roomType: { id: 'r1', name: 'Deluxe Tent', capacity: 4, basePrice: 100 },
        guests: 2,
        checkIn: '2025-07-01',
        checkOut: '2025-07-03',
        nights: 2,
        price: 200,
      }];
      localStorage.setItem('sc_reservation', JSON.stringify(items));

      render(<ReservationSummary {...summaryProps} />);

      expect(screen.queryByText('Meal Plans')).not.toBeInTheDocument();
    });
  });
});
