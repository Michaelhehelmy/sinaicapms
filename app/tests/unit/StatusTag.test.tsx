import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusTag } from '@/components/ui/StatusTag';

describe('StatusTag', () => {
  it('renders confirmed status', () => {
    render(<StatusTag status="confirmed" />);
    expect(screen.getByText('confirmed')).toBeInTheDocument();
  });

  it('renders pending status', () => {
    render(<StatusTag status="pending" />);
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('renders cancelled status', () => {
    render(<StatusTag status="cancelled" />);
    expect(screen.getByText('cancelled')).toBeInTheDocument();
  });

  it('renders with green classes for confirmed', () => {
    render(<StatusTag status="confirmed" />);
    const tag = screen.getByText('confirmed');
    expect(tag.className).toContain('bg-green-100');
    expect(tag.className).toContain('text-green-800');
  });

  it('renders with yellow classes for pending', () => {
    render(<StatusTag status="pending" />);
    const tag = screen.getByText('pending');
    expect(tag.className).toContain('bg-yellow-100');
    expect(tag.className).toContain('text-yellow-800');
  });

  it('renders with red classes for cancelled', () => {
    render(<StatusTag status="cancelled" />);
    const tag = screen.getByText('cancelled');
    expect(tag.className).toContain('bg-red-100');
    expect(tag.className).toContain('text-red-800');
  });

  it('applies md size classes', () => {
    render(<StatusTag status="active" size="md" />);
    const tag = screen.getByText('active');
    expect(tag.className).toContain('px-3');
    expect(tag.className).toContain('text-sm');
  });

  it('applies sm size by default', () => {
    render(<StatusTag status="active" />);
    const tag = screen.getByText('active');
    expect(tag.className).toContain('px-2');
    expect(tag.className).toContain('text-xs');
  });

  it('uses default gray for unknown status', () => {
    render(<StatusTag status="unknown" />);
    const tag = screen.getByText('unknown');
    expect(tag.className).toContain('bg-gray-100');
    expect(tag.className).toContain('text-gray-600');
  });
});
