import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RadioGroup, RadioItem } from '@/components/ui/Radio';

describe('RadioGroup', () => {
  it('renders a radiogroup container', () => {
    render(
      <RadioGroup name="color">
        <RadioItem value="r" label="Red" />
      </RadioGroup>,
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
  });

  it('renders all radio items', () => {
    render(
      <RadioGroup name="color">
        <RadioItem value="r" label="Red" />
        <RadioItem value="g" label="Green" />
        <RadioItem value="b" label="Blue" />
      </RadioGroup>,
    );
    expect(screen.getByLabelText('Red')).toBeInTheDocument();
    expect(screen.getByLabelText('Green')).toBeInTheDocument();
    expect(screen.getByLabelText('Blue')).toBeInTheDocument();
  });

  it('all radios share the same name', () => {
    render(
      <RadioGroup name="size">
        <RadioItem value="s" label="Small" />
        <RadioItem value="l" label="Large" />
      </RadioGroup>,
    );
    const radios = screen.getAllByRole('radio');
    radios.forEach((radio) => {
      expect(radio).toHaveAttribute('name', 'size');
    });
  });

  it('controlled mode: reflects the value prop', () => {
    render(
      <RadioGroup name="fruit" value="apple">
        <RadioItem value="apple" label="Apple" />
        <RadioItem value="banana" label="Banana" />
      </RadioGroup>,
    );
    expect(screen.getByLabelText('Apple')).toBeChecked();
    expect(screen.getByLabelText('Banana')).not.toBeChecked();
  });

  it('controlled mode: onChange is called with the selected value', () => {
    const onChange = vi.fn();
    render(
      <RadioGroup name="fruit" onChange={onChange}>
        <RadioItem value="apple" label="Apple" />
        <RadioItem value="banana" label="Banana" />
      </RadioGroup>,
    );
    fireEvent.click(screen.getByLabelText('Banana'));
    expect(onChange).toHaveBeenCalledWith('banana');
  });

  it('uncontrolled mode: defaultValue selects an option', () => {
    render(
      <RadioGroup name="fruit" defaultValue="banana">
        <RadioItem value="apple" label="Apple" />
        <RadioItem value="banana" label="Banana" />
      </RadioGroup>,
    );
    expect(screen.getByLabelText('Apple')).not.toBeChecked();
    expect(screen.getByLabelText('Banana')).toBeChecked();
  });

  it('uncontrolled mode: clicking an option changes selection', () => {
    render(
      <RadioGroup name="fruit" defaultValue="apple">
        <RadioItem value="apple" label="Apple" />
        <RadioItem value="banana" label="Banana" />
      </RadioGroup>,
    );
    fireEvent.click(screen.getByLabelText('Banana'));
    expect(screen.getByLabelText('Apple')).not.toBeChecked();
    expect(screen.getByLabelText('Banana')).toBeChecked();
  });

  it('renders description for a radio item', () => {
    render(
      <RadioGroup name="plan">
        <RadioItem value="free" label="Free" description="No cost" />
      </RadioGroup>,
    );
    expect(screen.getByText('No cost')).toBeInTheDocument();
  });

  it('sets aria-describedby when description is present', () => {
    render(
      <RadioGroup name="plan">
        <RadioItem value="pro" label="Pro" description="Premium plan" />
      </RadioGroup>,
    );
    const radio = screen.getByLabelText('Pro');
    const describedBy = radio.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Premium plan');
  });

  it('disables all radios when group is disabled', () => {
    render(
      <RadioGroup name="color" disabled>
        <RadioItem value="r" label="Red" />
        <RadioItem value="g" label="Green" />
      </RadioGroup>,
    );
    expect(screen.getByLabelText('Red')).toBeDisabled();
    expect(screen.getByLabelText('Green')).toBeDisabled();
  });

  it('disables individual radio item', () => {
    render(
      <RadioGroup name="color">
        <RadioItem value="r" label="Red" disabled />
        <RadioItem value="g" label="Green" />
      </RadioGroup>,
    );
    expect(screen.getByLabelText('Red')).toBeDisabled();
    expect(screen.getByLabelText('Green')).not.toBeDisabled();
  });
});
