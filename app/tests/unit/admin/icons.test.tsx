import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  IconPassword,
  IconPos,
} from '@/components/admin/icons';

describe('Admin icons', () => {
  it('renders IconPassword', () => {
    const { container } = render(<IconPassword />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders IconPos', () => {
    const { container } = render(<IconPos />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
