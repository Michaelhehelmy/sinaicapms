import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/Accordion';

function AccordionTest({ type, defaultValue }: { type?: 'single' | 'multiple'; defaultValue?: string[] }) {
  return (
    <Accordion type={type} defaultValue={defaultValue}>
      <AccordionItem value="a">
        <AccordionTrigger value="a">Section A</AccordionTrigger>
        <AccordionContent value="a">Content A</AccordionContent>
      </AccordionItem>
      <AccordionItem value="b">
        <AccordionTrigger value="b">Section B</AccordionTrigger>
        <AccordionContent value="b">Content B</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

describe('Accordion', () => {
  it('renders trigger buttons', () => {
    render(<AccordionTest />);
    expect(screen.getByRole('button', { name: 'Section A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Section B' })).toBeInTheDocument();
  });

  it('starts with all items closed by default', () => {
    render(<AccordionTest />);
    expect(screen.getByText('Section A')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('Section B')).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens an item on click and closes it on second click', () => {
    render(<AccordionTest />);
    const trigger = screen.getByText('Section A');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Content A')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('respects defaultValue to start with an item open', () => {
    render(<AccordionTest defaultValue={['a']} />);
    expect(screen.getByText('Section A')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Content A')).toBeInTheDocument();
    expect(screen.getByText('Section B')).toHaveAttribute('aria-expanded', 'false');
  });

  it('single mode: opening one item closes the other', () => {
    render(<AccordionTest type="single" defaultValue={['a']} />);
    expect(screen.getByText('Content A')).toBeInTheDocument();
    expect(screen.getByText('Section A')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByText('Section B'));
    expect(screen.getByText('Section B')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText('Content A')).not.toBeInTheDocument();
  });

  it('multiple mode: opening one item does not close the other', () => {
    render(<AccordionTest type="multiple" defaultValue={['a']} />);
    fireEvent.click(screen.getByText('Section B'));
    expect(screen.getByText('Content A')).toBeInTheDocument();
    expect(screen.getByText('Content B')).toBeInTheDocument();
  });

  it('sets aria-controls on trigger pointing to content id', () => {
    render(<AccordionTest />);
    const trigger = screen.getByText('Section A');
    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBe('a-content');
  });

  it('content region has aria-labelledby pointing to trigger', () => {
    render(<AccordionTest defaultValue={['a']} />);
    const region = screen.getByRole('region', { name: 'Section A' });
    expect(region).toHaveAttribute('aria-labelledby', 'a-trigger');
  });

  it('content is hidden when closed', () => {
    render(<AccordionTest />);
    const region = document.getElementById('a-content');
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute('hidden');
  });

  it('content is visible when open', () => {
    render(<AccordionTest defaultValue={['a']} />);
    const region = document.getElementById('a-content');
    expect(region).toBeInTheDocument();
    expect(region).not.toHaveAttribute('hidden');
    expect(screen.getByText('Content A')).toBeInTheDocument();
  });

  it('multiple mode: closing an already-open item removes it', () => {
    render(<AccordionTest type="multiple" defaultValue={['a', 'b']} />);
    expect(screen.getByText('Content A')).toBeInTheDocument();
    expect(screen.getByText('Content B')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Section A'));
    expect(screen.queryByText('Content A')).not.toBeInTheDocument();
    expect(screen.getByText('Content B')).toBeInTheDocument();
  });

  it('throws when AccordionTrigger is used outside Accordion', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(
        <AccordionTrigger value="x">Orphan</AccordionTrigger>
      );
    }).toThrow('Accordion components must be used within <Accordion>');
    spy.mockRestore();
  });
});
