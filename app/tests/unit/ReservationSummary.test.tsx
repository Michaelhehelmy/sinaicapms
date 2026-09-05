import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReservationSummary from '@/components/public/ReservationSummary';

vi.mock('@/lib/api', () => ({
  createPublicReservation: vi.fn(),
  saveLead: vi.fn().mockResolvedValue({}),
}));

import * as api from '@/lib/api';
const mockCreatePublicReservation = vi.mocked(api.createPublicReservation);
const mockSaveLead = vi.mocked(api.saveLead);

const mockItems = [
  {
    roomType: { id: 'r1', name: 'Deluxe Tent', capacity: 4, basePrice: 100 },
    guests: 2,
    checkIn: '2026-08-01',
    checkOut: '2026-08-03',
    nights: 2,
    price: 200,
  },
  {
    roomType: { id: 'r2', name: 'Family Suite', capacity: 6, basePrice: 200 },
    guests: 3,
    checkIn: '2026-08-01',
    checkOut: '2026-08-03',
    nights: 2,
    price: 400,
  },
];

const defaultProps = {
  tenantId: 't1',
  tenantName: 'Test Camp',
  primaryColor: '#22c55e',
  whatsappNumber: '201234567890',
};

describe('ReservationSummary', () => {
  beforeEach(() => {
    localStorage.clear();
    mockCreatePublicReservation.mockReset();
    mockSaveLead.mockClear();
  });

  it('shows empty state when no items in localStorage', () => {
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText('No rooms in your reservation.')).toBeInTheDocument();
  });

  it('displays room items from localStorage', () => {
    localStorage.setItem('sc_reservation', JSON.stringify(mockItems));
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText('Deluxe Tent')).toBeInTheDocument();
    expect(screen.getByText('Family Suite')).toBeInTheDocument();
  });

  it('total amount is calculated correctly', () => {
    localStorage.setItem('sc_reservation', JSON.stringify(mockItems));
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText(/600.*EGP/)).toBeInTheDocument();
  });

  it('whatsapp button opens correct URL', async () => {
    localStorage.setItem('sc_reservation', JSON.stringify([mockItems[0]]));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<ReservationSummary {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
      target: { value: 'Ahmed' },
    });

    fireEvent.click(screen.getByText('Send Booking via WhatsApp'));

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledTimes(1);
      const url = openSpy.mock.calls[0][0] as string;
      expect(url).toContain('wa.me/201234567890');
      expect(url).toContain('text=');
    });

    openSpy.mockRestore();
  });

  it('recovers from corrupted stored reservation JSON', () => {
    localStorage.setItem('sc_reservation', '{not-valid-json');
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText('No rooms in your reservation.')).toBeInTheDocument();
  });

  it('removes an item via the Remove button', async () => {
    localStorage.setItem('sc_reservation', JSON.stringify(mockItems));
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText('Deluxe Tent')).toBeInTheDocument();

    fireEvent.click(screen.getAllByText('Remove')[0]);

    await waitFor(() => {
      expect(screen.queryByText('Deluxe Tent')).not.toBeInTheDocument();
      expect(JSON.parse(localStorage.getItem('sc_reservation') || '[]')).toHaveLength(1);
      expect(screen.getAllByText(/400.*EGP/).length).toBeGreaterThan(0);
    });
  });

  it('copies the booking summary to the clipboard and shows a toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    localStorage.setItem('sc_reservation', JSON.stringify([mockItems[0]]));

    render(<ReservationSummary {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy Booking Summary' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Copied to clipboard!')).toBeInTheDocument();
    });
  });

  it('navigates back to the camp from the empty state', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'http://localhost:3000/' },
      configurable: true,
      writable: true,
    });
    render(<ReservationSummary {...defaultProps} />);
    fireEvent.click(screen.getByText('Back to Camp'));
    expect(window.location.href).toContain('/camp/t1');
  });

  it('uses the campUrl prop for the empty-state back action when provided', () => {
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'http://localhost:3000/' },
      configurable: true,
      writable: true,
    });
    render(<ReservationSummary {...defaultProps} campUrl="/" />);
    fireEvent.click(screen.getByText('Back to Camp'));
    expect(window.location.href).toContain('/');
    expect(window.location.href).not.toContain('/camp/t1');
  });

  it('renders meal plans inside a room card', () => {
    const itemWithMeals = {
      ...mockItems[0],
      mealPlans: [{ productId: 'm1', name: 'Half Board', pricePerDay: 20, quantity: 2 }],
    };
    localStorage.setItem('sc_reservation', JSON.stringify([itemWithMeals]));
    render(<ReservationSummary {...defaultProps} />);
    expect(screen.getByText(/Half Board/)).toBeInTheDocument();
    // meal plan price = 20 * 2 * 2 nights = 80
    expect(screen.getByText(/80.*EGP/)).toBeInTheDocument();
  });

  it('disables online payment when there are multiple rooms', async () => {
    localStorage.setItem('sc_reservation', JSON.stringify(mockItems));
    render(<ReservationSummary {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
      target: { value: 'Ali' },
    });
    const payBtn = screen.getByText('Confirm & Pay Online').closest('button');
    expect(payBtn).toBeDisabled();
    await waitFor(() => {
      expect(mockCreatePublicReservation).not.toHaveBeenCalled();
    });
  });

  it('redirects to Paymob when paymob is enabled and returns a client secret', async () => {
    mockCreatePublicReservation.mockResolvedValue({
      paymobEnabled: true,
      publicKey: 'pk_test',
      paymobIntention: { clientSecret: 'cs_123' },
    });
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'http://localhost:3000/' },
      configurable: true,
      writable: true,
    });
    localStorage.setItem('sc_reservation', JSON.stringify([mockItems[0]]));
    render(<ReservationSummary {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
      target: { value: 'Ali' },
    });
    fireEvent.click(screen.getByText('Confirm & Pay Online'));
    await waitFor(() => {
      expect(mockCreatePublicReservation).toHaveBeenCalled();
    });
    expect(window.location.href).toContain('https://accept.paymob.com/unifiedcheckout/');
  });

  it('shows room unavailable and captures lead on 409 error', async () => {
    mockCreatePublicReservation.mockRejectedValue(new Error('409 room unavailable'));
    localStorage.setItem('sc_reservation', JSON.stringify([mockItems[0]]));
    render(<ReservationSummary {...defaultProps} apiBase="/api" />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
      target: { value: 'Ali' },
    });
    fireEvent.click(screen.getByText('Confirm & Pay Online'));
    await waitFor(() => {
      expect(screen.getByText(/no longer available/)).toBeInTheDocument();
    });
    expect(mockSaveLead).toHaveBeenCalled();
  });

  it('shows generic payment error and captures lead on other errors', async () => {
    mockCreatePublicReservation.mockRejectedValue(new Error('network down'));
    localStorage.setItem('sc_reservation', JSON.stringify([mockItems[0]]));
    render(<ReservationSummary {...defaultProps} apiBase="/api" />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
      target: { value: 'Ali' },
    });
    fireEvent.click(screen.getByText('Confirm & Pay Online'));
    await waitFor(() => {
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
    expect(mockSaveLead).toHaveBeenCalled();
  });

  it('does not fire online payment when guest name is empty', async () => {
    localStorage.setItem('sc_reservation', JSON.stringify([mockItems[0]]));
    render(<ReservationSummary {...defaultProps} />);
    fireEvent.click(screen.getByText('Confirm & Pay Online'));
    await waitFor(() => {
      expect(mockCreatePublicReservation).not.toHaveBeenCalled();
    });
  });

  it('surfaces an error and captures the lead when paymob is disabled on success', async () => {
    mockCreatePublicReservation.mockResolvedValue({ paymobEnabled: false });
    localStorage.setItem('sc_reservation', JSON.stringify([mockItems[0]]));
    render(<ReservationSummary {...defaultProps} apiBase="/api" />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
      target: { value: 'Ali' },
    });
    fireEvent.click(screen.getByText('Confirm & Pay Online'));
    await waitFor(() => {
      expect(screen.getByText(/Online payment is not available/)).toBeInTheDocument();
    });
    expect(mockSaveLead).toHaveBeenCalled();
  });

  it('disables the WhatsApp button when no whatsapp number is set', () => {
    localStorage.setItem('sc_reservation', JSON.stringify([mockItems[0]]));
    render(<ReservationSummary {...defaultProps} whatsappNumber="" />);
    const sendBtn = screen.getByText('Send Booking via WhatsApp').closest('button');
    expect(sendBtn).toBeDisabled();
    expect(screen.getByText(/WhatsApp not available/)).toBeInTheDocument();
  });

  it('captures a lead as part of the WhatsApp handoff', async () => {
    localStorage.setItem('sc_reservation', JSON.stringify([mockItems[0]]));
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ReservationSummary {...defaultProps} apiBase="/api" />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
      target: { value: 'Ahmed' },
    });
    fireEvent.change(screen.getByPlaceholderText('+20 1XX XXX XXXX'), {
      target: { value: '01012345678' },
    });
    fireEvent.click(screen.getByText('Send Booking via WhatsApp'));
    await waitFor(() => {
      expect(mockSaveLead).toHaveBeenCalled();
    });
    openSpy.mockRestore();
  });

  it('includes meal plan lines in the copied WhatsApp summary', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const itemWithMeals = {
      ...mockItems[0],
      mealPlans: [
        { productId: 'm1', name: 'Half Board', pricePerDay: 20, quantity: 2 },
        { productId: 'm2', name: 'Full Board', pricePerDay: 40, quantity: 1 },
      ],
    };
    localStorage.setItem('sc_reservation', JSON.stringify([itemWithMeals]));

    render(<ReservationSummary {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
      target: { value: 'Ahmed' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Booking Summary' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    // meal plan lines: 2 x Half Board @ 20 x 2 nights = 80 ; 1 x Full Board @ 40 x 2 nights = 80
    const message = writeText.mock.calls[0][0] as string;
    expect(message).toContain('2× Half Board: 80 EGP');
    expect(message).toContain('1× Full Board: 80 EGP');
  });

  it('passes meal plan items to the public reservation API', async () => {
    mockCreatePublicReservation.mockRejectedValue(new Error('409 room unavailable'));
    const itemWithMeals = {
      ...mockItems[0],
      mealPlans: [
        { productId: 'm1', name: 'Half Board', pricePerDay: 20, quantity: 2 },
        { productId: 'm2', name: 'Dinner', pricePerDay: 15, quantity: 1 },
      ],
    };
    localStorage.setItem('sc_reservation', JSON.stringify([itemWithMeals]));
    render(<ReservationSummary {...defaultProps} apiBase="/api" />);
    fireEvent.change(screen.getByPlaceholderText('Enter your full name'), {
      target: { value: 'Ali' },
    });
    fireEvent.click(screen.getByText('Confirm & Pay Online'));
    await waitFor(() => {
      expect(mockCreatePublicReservation).toHaveBeenCalled();
    });
    expect(mockCreatePublicReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          { productId: 'm1', quantity: 2 },
          { productId: 'm2', quantity: 1 },
        ],
      }),
    );
  });
});
