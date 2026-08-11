import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ReservationSummary from '@/components/public/ReservationSummary';

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
});
