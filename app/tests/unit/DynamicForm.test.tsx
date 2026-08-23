import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DynamicForm, { isValidJson } from '@/components/admin/DynamicForm';
import { campProjectType } from '@/lib/project-types';
import { BUSINESS_TYPES } from '@/lib/business-types';

const onChange = vi.fn();
const onMetaChange = vi.fn();

function renderCampForm(overrides: Partial<Parameters<typeof DynamicForm>[0]> = {}) {
  return render(
    <DynamicForm
      schema={campProjectType}
      values={{}}
      metaValues={{}}
      onChange={onChange}
      onMetaChange={onMetaChange}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('section rendering', () => {
  it('renders core and custom-field sections from the schema', () => {
    renderCampForm();
    expect(screen.getByRole('heading', { name: /camp details/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /custom fields/i })).toBeInTheDocument();
  });

  it('renders every core field the schema requests', () => {
    renderCampForm();
    for (const key of campProjectType.coreFields) {
      expect(screen.getByTestId(`form-field-${key}`)).toBeInTheDocument();
    }
  });

  it('renders every meta field the schema requests', () => {
    renderCampForm();
    for (const field of campProjectType.metaFields) {
      expect(screen.getByTestId(`form-meta-${field.key}`)).toBeInTheDocument();
    }
  });

  it('marks required fields with an asterisk', () => {
    const { container } = render(
      <DynamicForm
        schema={campProjectType}
        values={{}}
        metaValues={{}}
        onChange={onChange}
        onMetaChange={onMetaChange}
      />,
    );
    // Name is a required core field; asterisk lives inside its label.
    const nameLabel = container.querySelector('label[for$="-core-name"]');
    expect(nameLabel?.textContent).toContain('*');
  });

  it('renders help text when provided', () => {
    renderCampForm();
    expect(screen.getByText(/Comma-separated list of activities/)).toBeInTheDocument();
  });

  it('renders a placeholder message when a schema has no fields at all', () => {
    render(
      <DynamicForm
        schema={{ type: 'empty', label: 'Empty', icon: '·', description: '', coreFields: [], metaFields: [] }}
        values={{}}
        metaValues={{}}
        onChange={onChange}
        onMetaChange={onMetaChange}
      />,
    );
    expect(screen.getByText(/no editable fields/i)).toBeInTheDocument();
  });

  it('accepts a BusinessTypeSchema and renders its meta fields only', () => {
    render(
      <DynamicForm
        schema={BUSINESS_TYPES.hotel}
        values={{}}
        metaValues={{}}
        onChange={onChange}
        onMetaChange={onMetaChange}
      />,
    );
    // Business schemas carry no core project columns…
    expect(screen.queryByTestId('form-field-name')).not.toBeInTheDocument();
    expect(screen.queryByText('Hotel Details')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /custom fields/i })).toBeInTheDocument();
    // …only their business-level meta (phone/email/website/star_rating/amenities).
    for (const field of BUSINESS_TYPES.hotel.metaFields) {
      expect(screen.getByTestId(`form-meta-${field.key}`)).toBeInTheDocument();
    }
  });
});

describe('fields prop (section filtering)', () => {
  it('fields="meta" hides the core section entirely', () => {
    renderCampForm({ fields: 'meta' });
    expect(screen.getByRole('heading', { name: /custom fields/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /camp details/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-field-name')).not.toBeInTheDocument();
    for (const field of campProjectType.metaFields) {
      expect(screen.getByTestId(`form-meta-${field.key}`)).toBeInTheDocument();
    }
  });

  it('fields="core" hides the custom-fields section entirely', () => {
    renderCampForm({ fields: 'core' });
    expect(screen.getByRole('heading', { name: /camp details/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /custom fields/i })).not.toBeInTheDocument();
    for (const field of campProjectType.metaFields) {
      expect(screen.queryByTestId(`form-meta-${field.key}`)).not.toBeInTheDocument();
    }
  });

  it('defaults to rendering both sections', () => {
    renderCampForm();
    expect(screen.getByRole('heading', { name: /camp details/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /custom fields/i })).toBeInTheDocument();
  });

  it('shows the empty-state message when fields="meta" but the schema has no meta fields', () => {
    render(
      <DynamicForm
        schema={{ type: 'bare', label: 'Bare', icon: '·', description: '', coreFields: ['name'], metaFields: [] }}
        values={{}}
        metaValues={{}}
        onChange={onChange}
        onMetaChange={onMetaChange}
        fields="meta"
      />,
    );
    expect(screen.getByText(/no editable fields/i)).toBeInTheDocument();
  });
});

describe('excludeMetaKeys prop', () => {
  it('hides excluded meta fields while keeping the rest visible', () => {
    renderCampForm({ excludeMetaKeys: ['notes'] });
    expect(screen.queryByTestId('form-meta-notes')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-meta-activities')).toBeInTheDocument();
    expect(screen.getByTestId('form-meta-accommodation_type')).toBeInTheDocument();
  });

  it('excludes multiple keys at once', () => {
    renderCampForm({ excludeMetaKeys: ['notes', 'activities'] });
    expect(screen.queryByTestId('form-meta-notes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-meta-activities')).not.toBeInTheDocument();
    expect(screen.getByTestId('form-meta-check_in_time')).toBeInTheDocument();
  });

  it('still renders the section when only some keys are excluded', () => {
    renderCampForm({ excludeMetaKeys: campProjectType.metaFields.map((f) => f.key).slice(0, -1) });
    const last = campProjectType.metaFields[campProjectType.metaFields.length - 1];
    expect(screen.getByTestId(`form-meta-${last.key}`)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /custom fields/i })).toBeInTheDocument();
  });
});

describe('core field interactions', () => {
  it('emits text changes through onChange with the core column name', () => {
    renderCampForm();
    fireEvent.change(screen.getByTestId('form-field-name'), { target: { value: 'Acacia Camp' } });
    expect(onChange).toHaveBeenCalledWith('name', 'Acacia Camp');
  });

  it('coerces number input to a number and accepts clearing back to empty', () => {
    // Stateful harness so each keystroke round-trips through controlled state
    // (a static-values render would dedupe the second identical-value event).
    function Harness() {
      const [values, setValues] = useState<Record<string, any>>({ capacity: 5 });
      return (
        <DynamicForm
          schema={campProjectType}
          values={values}
          metaValues={{}}
          onChange={(f, v) => setValues((prev) => ({ ...prev, [f]: v }))}
          onMetaChange={onMetaChange}
        />
      );
    }
    render(<Harness />);
    const input = screen.getByTestId('form-field-capacity') as HTMLInputElement;
    expect(input.value).toBe('5');

    fireEvent.change(input, { target: { value: '42' } });
    expect((screen.getByTestId('form-field-capacity') as HTMLInputElement).value).toBe('42');

    fireEvent.change(screen.getByTestId('form-field-capacity'), { target: { value: '' } });
    expect((screen.getByTestId('form-field-capacity') as HTMLInputElement).value).toBe('');
  });

  it('renders status as a select with the four lifecycle options', () => {
    renderCampForm();
    const select = screen.getByTestId('form-field-status') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(expect.arrayContaining(['active', 'inactive', 'planning', 'completed']));
    fireEvent.change(select, { target: { value: 'planning' } });
    expect(onChange).toHaveBeenCalledWith('status', 'planning');
  });

  it('renders date inputs for start_date/end_date', () => {
    renderCampForm();
    expect((screen.getByTestId('form-field-start_date') as HTMLInputElement).type).toBe('date');
    expect((screen.getByTestId('form-field-end_date') as HTMLInputElement).type).toBe('date');
  });

  it('shows core field errors passed via the errors map', () => {
    renderCampForm({ errors: { name: 'Name is required' } });
    expect(screen.getByText('Name is required')).toBeInTheDocument();
    expect(screen.getByTestId('form-field-name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('disables controls when disabled is set', () => {
    renderCampForm({ disabled: true });
    expect(screen.getByTestId('form-field-name')).toBeDisabled();
    expect(screen.getByTestId('form-meta-notes')).toBeDisabled();
  });
});

describe('meta field types', () => {
  it('text: emits raw strings', () => {
    renderCampForm();
    fireEvent.change(screen.getByTestId('form-meta-check_in_time'), { target: { value: '14:00' } });
    expect(onMetaChange).toHaveBeenCalledWith('check_in_time', '14:00');
  });

  it('textarea: emits raw strings', () => {
    renderCampForm();
    fireEvent.change(screen.getByTestId('form-meta-notes'), { target: { value: 'Bring water' } });
    expect(onMetaChange).toHaveBeenCalledWith('notes', 'Bring water');
  });

  it('number: coerces numeric strings to numbers', () => {
    const schema = {
      ...campProjectType,
      metaFields: [{ key: 'seats', label: 'Seats', type: 'number' as const }],
    };
    render(<DynamicForm schema={schema} values={{}} metaValues={{}} onChange={onChange} onMetaChange={onMetaChange} />);
    fireEvent.change(screen.getByTestId('form-meta-seats'), { target: { value: '12' } });
    expect(onMetaChange).toHaveBeenCalledWith('seats', 12);
  });

  it('date: emits ISO date strings', () => {
    const schema = {
      ...campProjectType,
      metaFields: [{ key: 'opens_on', label: 'Opens On', type: 'date' as const }],
    };
    render(<DynamicForm schema={schema} values={{}} metaValues={{}} onChange={onChange} onMetaChange={onMetaChange} />);
    fireEvent.change(screen.getByTestId('form-meta-opens_on'), { target: { value: '2026-09-01' } });
    expect(onMetaChange).toHaveBeenCalledWith('opens_on', '2026-09-01');
  });

  it('select: renders options and emits the chosen value', () => {
    renderCampForm();
    const select = screen.getByTestId('form-meta-accommodation_type') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toContain('cabin');
    fireEvent.change(select, { target: { value: 'tent' } });
    expect(onMetaChange).toHaveBeenCalledWith('accommodation_type', 'tent');
  });

  it('tags: displays arrays joined by commas and splits input back into arrays', () => {
    renderCampForm({ metaValues: { activities: ['Hiking', 'Stargazing'] } });
    const input = screen.getByTestId('form-meta-activities') as HTMLInputElement;
    expect(input.value).toBe('Hiking, Stargazing');

    fireEvent.change(input, { target: { value: 'Hiking, Diving , Hiking, Diving' } });
    expect(onMetaChange).toHaveBeenCalledWith('activities', ['Hiking', 'Diving']);
  });

  it('tags: tolerates legacy comma-string values in state', () => {
    renderCampForm({ metaValues: { activities: 'Hiking, Yoga' } });
    expect((screen.getByTestId('form-meta-activities') as HTMLInputElement).value).toBe(
      'Hiking, Yoga',
    );
  });

  it('image-gallery: one URL per line becomes a trimmed array', () => {
    const schema = {
      ...campProjectType,
      metaFields: [
        { key: 'gallery', label: 'Gallery', type: 'image-gallery' as const },
      ],
    };
    render(
      <DynamicForm
        schema={schema}
        values={{}}
        metaValues={{ gallery: ['https://a.example/1.jpg'] }}
        onChange={onChange}
        onMetaChange={onMetaChange}
      />,
    );
    const ta = screen.getByTestId('form-meta-gallery') as HTMLTextAreaElement;
    expect(ta.value).toBe('https://a.example/1.jpg');

    fireEvent.change(ta, {
      target: { value: 'https://a.example/1.jpg\n\n https://b.example/2.jpg \n' },
    });
    expect(onMetaChange).toHaveBeenCalledWith('gallery', [
      'https://a.example/1.jpg',
      'https://b.example/2.jpg',
    ]);
  });

  it('json: shows objects pretty-printed and emits raw text edits', () => {
    const schema = {
      ...campProjectType,
      metaFields: [{ key: 'config', label: 'Config', type: 'json' as const }],
    };
    render(
      <DynamicForm
        schema={schema}
        values={{}}
        metaValues={{ config: { tier: 'gold', seats: 4 } }}
        onChange={onChange}
        onMetaChange={onMetaChange}
      />,
    );
    const ta = screen.getByTestId('form-meta-config') as HTMLTextAreaElement;
    expect(JSON.parse(ta.value)).toEqual({ tier: 'gold', seats: 4 });

    fireEvent.change(ta, { target: { value: '{"tier":"silver"}' } });
    expect(onMetaChange).toHaveBeenCalledWith('config', '{"tier":"silver"}');
  });

  it('json: flags invalid JSON without blocking the edit', () => {
    const schema = {
      ...campProjectType,
      metaFields: [{ key: 'config', label: 'Config', type: 'json' as const }],
    };
    render(
      <DynamicForm
        schema={schema}
        values={{}}
        metaValues={{ config: '{ broken' }}
        onChange={onChange}
        onMetaChange={onMetaChange}
      />,
    );
    expect(screen.getByText('Invalid JSON')).toBeInTheDocument();
    expect(screen.getByTestId('form-meta-config')).toHaveAttribute('aria-invalid', 'true');
    // The change still propagates — validation display only.
    fireEvent.change(screen.getByTestId('form-meta-config'), { target: { value: '{ still bad' } });
    expect(onMetaChange).toHaveBeenCalledWith('config', '{ still bad');
  });

  it('shows meta errors keyed plain or with the meta. prefix', () => {
    const { rerender } = renderCampForm({ errors: { activities: 'Pick at least one' } });
    expect(screen.getByText('Pick at least one')).toBeInTheDocument();

    rerender(
      <DynamicForm
        schema={campProjectType}
        values={{}}
        metaValues={{}}
        onChange={onChange}
        onMetaChange={onMetaChange}
        errors={{ 'meta.activities': 'Prefixed lookup wins' }}
      />,
    );
    expect(screen.getByText('Prefixed lookup wins')).toBeInTheDocument();
  });
});

describe('isValidJson helper', () => {
  it('accepts empty strings, valid JSON, and rejects malformed text', () => {
    expect(isValidJson('')).toBe(true);
    expect(isValidJson('   ')).toBe(true);
    expect(isValidJson('{"a":1}')).toBe(true);
    expect(isValidJson('[1,2,3]')).toBe(true);
    expect(isValidJson('{nope}')).toBe(false);
  });
});
