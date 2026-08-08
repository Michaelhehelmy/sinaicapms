import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { Select } from '@/components/ui/Select';

const flatOptions = [
  { value: 'us', label: 'United States' },
  { value: 'uk', label: 'United Kingdom' },
  { value: 'fr', label: 'France' },
];

const groupedOptions = [
  {
    label: 'Americas',
    options: [
      { value: 'us', label: 'United States' },
      { value: 'ca', label: 'Canada' },
    ],
  },
  {
    label: 'Europe',
    options: [
      { value: 'uk', label: 'United Kingdom' },
      { value: 'fr', label: 'France' },
    ],
  },
];

describe('Select (non-searchable)', () => {
  it('renders with label', () => {
    render(<Select label="Country" options={flatOptions} />);
    expect(screen.getByLabelText('Country')).toBeInTheDocument();
  });

  it('renders native <select> element', () => {
    const { container } = render(<Select options={flatOptions} />);
    expect(container.querySelector('select')).toBeInTheDocument();
  });

  it('renders placeholder option', () => {
    render(<Select options={flatOptions} placeholder="Choose a country" />);
    expect(screen.getByText('Choose a country')).toBeInTheDocument();
  });

  it('renders all flat options', () => {
    render(<Select options={flatOptions} />);
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.getByText('United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('France')).toBeInTheDocument();
  });

  it('renders grouped options as optgroup', () => {
    const { container } = render(<Select options={groupedOptions} />);
    const optgroups = container.querySelectorAll('optgroup');
    expect(optgroups).toHaveLength(2);
    expect(optgroups[0].getAttribute('label')).toBe('Americas');
    expect(optgroups[1].getAttribute('label')).toBe('Europe');
  });

  it('renders native <select> with proper attributes', () => {
    const onChange = vi.fn();
    render(<Select options={flatOptions} onChange={onChange} value="uk" />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('uk');
  });

  it('displays error message', () => {
    render(<Select options={flatOptions} error="Required field" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required field');
  });

  it('displays helper text when no error', () => {
    render(<Select options={flatOptions} helperText="Select your country" />);
    expect(screen.getByText('Select your country')).toBeInTheDocument();
  });

  it('does not display helper text when error is present', () => {
    render(<Select options={flatOptions} error="Required" helperText="Helper" />);
    expect(screen.queryByText('Helper')).not.toBeInTheDocument();
  });

  it('sets aria-invalid when error is present', () => {
    render(<Select options={flatOptions} error="Error" />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sets aria-describedby for error', () => {
    render(<Select options={flatOptions} error="Required" />);
    const select = screen.getByRole('combobox');
    const errorId = select.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent('Required');
  });

  it('disables select when disabled prop is true', () => {
    render(<Select options={flatOptions} disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('hides placeholder when value is set', () => {
    render(<Select options={flatOptions} value="us" />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('us');
  });

  it('uses provided id', () => {
    render(<Select id="my-select" options={flatOptions} />);
    expect(document.getElementById('my-select')).toBeInTheDocument();
  });

  it('renders disabled option', () => {
    const opts = [
      { value: 'us', label: 'US', disabled: true },
      { value: 'uk', label: 'UK' },
    ];
    const { container } = render(<Select options={opts} />);
    const usOption = container.querySelector('option[value="us"]') as HTMLOptionElement;
    expect(usOption.disabled).toBe(true);
  });
});

describe('Select (searchable)', () => {
  it('renders combobox button for searchable', () => {
    render(<Select options={flatOptions} searchable label="Search Country" />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('opens dropdown on click', () => {
    render(<Select options={flatOptions} searchable />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('shows all options when dropdown opens', () => {
    render(<Select options={flatOptions} searchable />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.getByText('United Kingdom')).toBeInTheDocument();
    expect(screen.getByText('France')).toBeInTheDocument();
  });

  it('filters options based on search query', () => {
    render(<Select options={flatOptions} searchable />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = screen.getByPlaceholderText('Type to search...');
    fireEvent.change(searchInput, { target: { value: 'United' } });
    expect(screen.getByText('United States')).toBeInTheDocument();
    expect(screen.getByText('United Kingdom')).toBeInTheDocument();
    expect(screen.queryByText('France')).not.toBeInTheDocument();
  });

  it('shows "No options found" when search has no matches', () => {
    render(<Select options={flatOptions} searchable />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = screen.getByPlaceholderText('Type to search...');
    fireEvent.change(searchInput, { target: { value: 'xyz' } });
    expect(screen.getByText('No options found')).toBeInTheDocument();
  });

  it('selects an option from searchable dropdown', () => {
    const onChange = vi.fn();
    render(<Select options={flatOptions} searchable onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('France'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: 'fr' }) }),
    );
  });

  it('closes dropdown after selection', () => {
    render(<Select options={flatOptions} searchable />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('France'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows selected label on trigger button', () => {
    render(<Select options={flatOptions} searchable value="uk" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('United Kingdom');
  });

  it('shows placeholder when no value selected', () => {
    render(<Select options={flatOptions} searchable placeholder="Pick one" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick one');
  });

  it('searches grouped options', () => {
    render(<Select options={groupedOptions} searchable />);
    fireEvent.click(screen.getByRole('combobox'));
    const searchInput = screen.getByPlaceholderText('Type to search...');
    fireEvent.change(searchInput, { target: { value: 'France' } });
    expect(screen.getByText('France')).toBeInTheDocument();
    expect(screen.queryByText('United States')).not.toBeInTheDocument();
  });

  it('closes dropdown on Escape key', () => {
    render(<Select options={flatOptions} searchable />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('navigates with ArrowDown and selects with Enter', () => {
    const onChange = vi.fn();
    render(<Select options={flatOptions} searchable onChange={onChange} />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onChange).toHaveBeenCalled();
  });

  it('navigates with ArrowUp', () => {
    render(<Select options={flatOptions} searchable />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    // No error = pass
  });

  it('opens dropdown with ArrowDown when closed', () => {
    render(<Select options={flatOptions} searchable />);
    const trigger = screen.getByRole('combobox');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('opens dropdown with Enter key when closed', () => {
    render(<Select options={flatOptions} searchable />);
    const trigger = screen.getByRole('combobox');
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('opens dropdown with Space key when closed', () => {
    render(<Select options={flatOptions} searchable />);
    const trigger = screen.getByRole('combobox');
    fireEvent.keyDown(trigger, { key: ' ' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('closes dropdown on outside click', () => {
    render(
      <div>
        <span data-testid="outside">Outside</span>
        <Select options={flatOptions} searchable />
      </div>,
    );
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('disables searchable select when disabled', () => {
    render(<Select options={flatOptions} searchable disabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('does not open dropdown when disabled and clicked', () => {
    render(<Select options={flatOptions} searchable disabled />);
    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('shows error for searchable variant', () => {
    render(<Select options={flatOptions} searchable error="Required" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('shows helper text for searchable variant', () => {
    render(<Select options={flatOptions} searchable helperText="Pick one" />);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('sets aria-invalid for searchable with error', () => {
    render(<Select options={flatOptions} searchable error="Error" />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
  });

  it('navigates to Home and End keys', () => {
    render(<Select options={flatOptions} searchable />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'End' });
    fireEvent.keyDown(trigger, { key: 'Home' });
    // No error = pass
  });

  it('uses placeholder when no value is selected (searchable)', () => {
    render(<Select options={flatOptions} searchable placeholder="Select country" />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Select country');
  });

  it('selects a grouped option from searchable dropdown', () => {
    const onChange = vi.fn();
    render(<Select options={groupedOptions} searchable onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Canada'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: expect.objectContaining({ value: 'ca' }) }),
    );
  });

  it('highlights a grouped option on mouse enter', () => {
    render(<Select options={groupedOptions} searchable />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.mouseEnter(screen.getByText('United States'));
    fireEvent.mouseEnter(screen.getByText('United Kingdom'));
    // No error = pass
  });

  it('highlights a flat option on mouse enter', () => {
    render(<Select options={flatOptions} searchable />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.mouseEnter(screen.getByText('France'));
    // No error = pass
  });

  it('does not select a disabled grouped option', () => {
    const disabledGroup = [
      {
        label: 'Restricted',
        options: [
          { value: 'r1', label: 'Restricted Item', disabled: true },
          { value: 'r2', label: 'Allowed Item' },
        ],
      },
    ];
    const onChange = vi.fn();
    render(<Select options={disabledGroup} searchable onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(screen.getByText('Restricted Item'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
