import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DateRangePicker } from '@/components/ui/DateRangePicker';

vi.mock('@/lib/utils', () => ({
  cn: (...c: (string | undefined | false | null)[]) => c.filter(Boolean).join(' '),
}));

describe('DateRangePicker', () => {
  it('renders all preset buttons', () => {
    const { getByText } = render(
      <DateRangePicker value={{ startDate: '', endDate: '' }} onChange={vi.fn()} />
    );
    expect(getByText('Today')).toBeTruthy();
    expect(getByText('Last 7 Days')).toBeTruthy();
    expect(getByText('Last 30 Days')).toBeTruthy();
    expect(getByText('Last 90 Days')).toBeTruthy();
    expect(getByText('Custom')).toBeTruthy();
  });

  it('calls onChange with Today range', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <DateRangePicker value={{ startDate: '', endDate: '' }} onChange={onChange} />
    );
    fireEvent.click(getByText('Today'));
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    const today = new Date().toISOString().slice(0, 10);
    expect(arg.startDate).toBe(today);
    expect(arg.endDate).toBe(today);
  });

  it('calls onChange with Last 7 Days range', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <DateRangePicker value={{ startDate: '', endDate: '' }} onChange={onChange} />
    );
    fireEvent.click(getByText('Last 7 Days'));
    expect(onChange).toHaveBeenCalled();
    const arg = onChange.mock.calls[0][0];
    expect(arg.startDate).toBeTruthy();
    expect(arg.endDate).toBeTruthy();
  });

  it('calls onChange with Last 30 Days range', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <DateRangePicker value={{ startDate: '', endDate: '' }} onChange={onChange} />
    );
    fireEvent.click(getByText('Last 30 Days'));
    expect(onChange).toHaveBeenCalled();
  });

  it('calls onChange with Last 90 Days range', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <DateRangePicker value={{ startDate: '', endDate: '' }} onChange={onChange} />
    );
    fireEvent.click(getByText('Last 90 Days'));
    expect(onChange).toHaveBeenCalled();
  });

  it('toggles custom mode on/off', () => {
    const { getByText, queryByDisplayValue } = render(
      <DateRangePicker value={{ startDate: '', endDate: '' }} onChange={vi.fn()} />
    );
    // Initially no custom inputs
    expect(queryByDisplayValue('')).toBeNull();
    fireEvent.click(getByText('Custom'));
    // Now custom date inputs appear
    expect(document.querySelectorAll('input[type="date"]').length).toBe(2);
    // Click custom again to toggle off
    fireEvent.click(getByText('Custom'));
    expect(document.querySelectorAll('input[type="date"]').length).toBe(0);
  });

  it('calls onChange when custom start date changes', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <DateRangePicker value={{ startDate: '2025-01-01', endDate: '2025-12-31' }} onChange={onChange} />
    );
    fireEvent.click(getByText('Custom'));
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2025-06-01' } });
    expect(onChange).toHaveBeenCalledWith({ startDate: '2025-06-01', endDate: '2025-12-31' });
  });

  it('calls onChange when custom end date changes', () => {
    const onChange = vi.fn();
    const { getByText } = render(
      <DateRangePicker value={{ startDate: '2025-01-01', endDate: '2025-12-31' }} onChange={onChange} />
    );
    fireEvent.click(getByText('Custom'));
    const dateInputs = document.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[1], { target: { value: '2025-06-30' } });
    expect(onChange).toHaveBeenCalledWith({ startDate: '2025-01-01', endDate: '2025-06-30' });
  });

  it('clicking a preset while in custom mode closes custom', () => {
    const { getByText } = render(
      <DateRangePicker value={{ startDate: '', endDate: '' }} onChange={vi.fn()} />
    );
    fireEvent.click(getByText('Custom'));
    expect(document.querySelectorAll('input[type="date"]').length).toBe(2);
    fireEvent.click(getByText('Last 7 Days'));
    expect(document.querySelectorAll('input[type="date"]').length).toBe(0);
  });

  it('applies custom className', () => {
    const { container } = render(
      <DateRangePicker value={{ startDate: '', endDate: '' }} onChange={vi.fn()} className="my-custom-class" />
    );
    expect(container.firstChild).toBeTruthy();
  });
});
