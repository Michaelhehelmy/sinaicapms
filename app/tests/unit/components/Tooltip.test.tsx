import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Tooltip } from '@/components/ui/Tooltip';

function TriggerButton() {
  return <button>Trigger</button>;
}

describe('Tooltip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not render tooltip content initially', () => {
    render(
      <Tooltip content="Help text">
        <TriggerButton />
      </Tooltip>,
    );
    expect(screen.queryByText('Help text')).not.toBeInTheDocument();
  });

  it('shows tooltip after delay on mouse enter', () => {
    render(
      <Tooltip content="Help text" delay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 'Trigger' });
    act(() => {
      fireEvent.mouseEnter(btn);
    });
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText('Help text')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', () => {
    render(
      <Tooltip content="Help text" delay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 'Trigger' });
    act(() => {
      fireEvent.mouseEnter(btn);
    });
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText('Help text')).toBeInTheDocument();
    act(() => {
      fireEvent.mouseLeave(btn);
    });
    expect(screen.queryByText('Help text')).not.toBeInTheDocument();
  });

  it('shows tooltip on focus', () => {
    render(
      <Tooltip content="Focus tip" delay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Trigger' }));
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText('Focus tip')).toBeInTheDocument();
  });

  it('hides tooltip on blur', () => {
    render(
      <Tooltip content="Focus tip" delay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 'Trigger' });
    fireEvent.focus(btn);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText('Focus tip')).toBeInTheDocument();
    fireEvent.blur(btn);
    expect(screen.queryByText('Focus tip')).not.toBeInTheDocument();
  });

  it('tooltip element has role="tooltip"', () => {
    render(
      <Tooltip content="Info" delay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Trigger' }));
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Info');
  });

  it('sets aria-describedby on trigger when visible', () => {
    render(
      <Tooltip content="Info" delay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 'Trigger' });
    fireEvent.mouseEnter(btn);
    act(() => vi.advanceTimersByTime(0));
    const describedBy = btn.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent('Info');
  });

  it('removes aria-describedby when hidden', () => {
    render(
      <Tooltip content="Info" delay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 'Trigger' });
    expect(btn).not.toHaveAttribute('aria-describedby');
  });

  it('hides tooltip on Escape key', () => {
    render(
      <Tooltip content="Info" delay={0}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 'Trigger' });
    fireEvent.focus(btn);
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByText('Info')).toBeInTheDocument();
    fireEvent.keyDown(btn, { key: 'Escape' });
    expect(screen.queryByText('Info')).not.toBeInTheDocument();
  });

  it('cancels pending show timer on mouse leave before delay', () => {
    render(
      <Tooltip content="Info" delay={500}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const btn = screen.getByRole('button', { name: 'Trigger' });
    fireEvent.mouseEnter(btn);
    act(() => vi.advanceTimersByTime(200));
    fireEvent.mouseLeave(btn);
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByText('Info')).not.toBeInTheDocument();
  });
});
