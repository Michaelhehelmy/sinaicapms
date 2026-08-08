import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs';

function SimpleTabs({
  defaultValue = 'tab1',
  onChange,
}: {
  defaultValue?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <Tabs defaultValue={defaultValue} onChange={onChange}>
      <TabList>
        <Tab value="tab1" label="First Tab" />
        <Tab value="tab2" label="Second Tab" />
        <Tab value="tab3" label="Third Tab" />
      </TabList>
      <TabPanel value="tab1">Content 1</TabPanel>
      <TabPanel value="tab2">Content 2</TabPanel>
      <TabPanel value="tab3">Content 3</TabPanel>
    </Tabs>
  );
}

describe('Tabs', () => {
  it('renders all tabs', () => {
    render(<SimpleTabs />);
    expect(screen.getByRole('tab', { name: 'First Tab' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Second Tab' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Third Tab' })).toBeInTheDocument();
  });

  it('renders default active tab panel', () => {
    render(<SimpleTabs />);
    expect(screen.getByText('Content 1')).toBeInTheDocument();
    expect(screen.queryByText('Content 2')).not.toBeInTheDocument();
  });

  it('switches tab on click', () => {
    render(<SimpleTabs />);
    fireEvent.click(screen.getByRole('tab', { name: 'Second Tab' }));
    expect(screen.getByText('Content 2')).toBeInTheDocument();
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
  });

  it('calls onChange when tab is clicked', () => {
    const onChange = vi.fn();
    render(<SimpleTabs onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Second Tab' }));
    expect(onChange).toHaveBeenCalledWith('tab2');
  });

  it('sets correct aria attributes', () => {
    render(<SimpleTabs />);
    const tab1 = screen.getByRole('tab', { name: 'First Tab' });
    expect(tab1).toHaveAttribute('aria-selected', 'true');
    expect(tab1).toHaveAttribute('role', 'tab');
    const tab2 = screen.getByRole('tab', { name: 'Second Tab' });
    expect(tab2).toHaveAttribute('aria-selected', 'false');
  });

  it('shows correct tabpanel', () => {
    render(<SimpleTabs />);
    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveAttribute('id', 'tabpanel-tab1');
    expect(panel).toHaveAttribute('aria-labelledby', 'tab-tab1');
  });

  it('supports controlled mode', () => {
    function ControlledTabs() {
      const [val, setVal] = React.useState('tab2');
      return (
        <div>
          <button onClick={() => setVal('tab3')}>Go to tab3</button>
          <Tabs value={val} onChange={setVal}>
            <TabList>
              <Tab value="tab1" label="First" />
              <Tab value="tab2" label="Second" />
              <Tab value="tab3" label="Third" />
            </TabList>
            <TabPanel value="tab1">Panel 1</TabPanel>
            <TabPanel value="tab2">Panel 2</TabPanel>
            <TabPanel value="tab3">Panel 3</TabPanel>
          </Tabs>
        </div>
      );
    }
    render(<ControlledTabs />);
    expect(screen.getByText('Panel 2')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Go to tab3'));
    expect(screen.getByText('Panel 3')).toBeInTheDocument();
    expect(screen.queryByText('Panel 2')).not.toBeInTheDocument();
  });

  it('renders tab with icon', () => {
    render(
      <Tabs defaultValue="t1">
        <TabList>
          <Tab value="t1" label="With Icon" icon={<span data-testid="icon">🎯</span>} />
        </TabList>
        <TabPanel value="t1">Content</TabPanel>
      </Tabs>,
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('disables a tab', () => {
    render(
      <Tabs defaultValue="t1">
        <TabList>
          <Tab value="t1" label="Active" />
          <Tab value="t2" label="Disabled" disabled />
        </TabList>
        <TabPanel value="t1">Content 1</TabPanel>
        <TabPanel value="t2">Content 2</TabPanel>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'Disabled' })).toBeDisabled();
  });

  it('navigates tabs with ArrowRight', () => {
    render(<SimpleTabs />);
    const tab1 = screen.getByRole('tab', { name: 'First Tab' });
    fireEvent.keyDown(tab1, { key: 'ArrowRight' });
    // Focus moves to second tab
    expect(screen.getByRole('tab', { name: 'Second Tab' })).toHaveFocus();
  });

  it('navigates tabs with ArrowLeft', () => {
    render(<SimpleTabs />);
    const tab2 = screen.getByRole('tab', { name: 'Second Tab' });
    fireEvent.click(tab2);
    fireEvent.keyDown(tab2, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'First Tab' })).toHaveFocus();
  });

  it('navigates to Home key', () => {
    render(<SimpleTabs />);
    const tab3 = screen.getByRole('tab', { name: 'Third Tab' });
    fireEvent.click(tab3);
    fireEvent.keyDown(tab3, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'First Tab' })).toHaveFocus();
  });

  it('navigates to End key', () => {
    render(<SimpleTabs />);
    const tab1 = screen.getByRole('tab', { name: 'First Tab' });
    fireEvent.keyDown(tab1, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Third Tab' })).toHaveFocus();
  });

  it('throws when Tab is used outside Tabs context', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      render(<Tab value="t1" label="Orphan" />);
    }).toThrow('Tabs compound components must be used within <Tabs>');
    consoleError.mockRestore();
  });

  it('wraps around ArrowRight from last tab', () => {
    render(<SimpleTabs />);
    const tab3 = screen.getByRole('tab', { name: 'Third Tab' });
    fireEvent.click(tab3);
    fireEvent.keyDown(tab3, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'First Tab' })).toHaveFocus();
  });

  it('wraps around ArrowLeft from first tab', () => {
    render(<SimpleTabs />);
    const tab1 = screen.getByRole('tab', { name: 'First Tab' });
    fireEvent.keyDown(tab1, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Third Tab' })).toHaveFocus();
  });

  it('navigates with ArrowDown (same as ArrowRight)', () => {
    render(<SimpleTabs />);
    const tab1 = screen.getByRole('tab', { name: 'First Tab' });
    fireEvent.keyDown(tab1, { key: 'ArrowDown' });
    expect(screen.getByRole('tab', { name: 'Second Tab' })).toHaveFocus();
  });

  it('navigates with ArrowUp (same as ArrowLeft)', () => {
    render(<SimpleTabs />);
    const tab2 = screen.getByRole('tab', { name: 'Second Tab' });
    fireEvent.click(tab2);
    fireEvent.keyDown(tab2, { key: 'ArrowUp' });
    expect(screen.getByRole('tab', { name: 'First Tab' })).toHaveFocus();
  });

  it('applies custom className to Tabs', () => {
    const { container } = render(
      <Tabs defaultValue="t1" className="custom-tabs">
        <TabList>
          <Tab value="t1" label="Tab 1" />
        </TabList>
        <TabPanel value="t1">Content</TabPanel>
      </Tabs>,
    );
    expect(container.firstChild).toHaveClass('custom-tabs');
  });

  it('ignores non-navigation keys', () => {
    render(<SimpleTabs />);
    const tab1 = screen.getByRole('tab', { name: 'First Tab' });
    tab1.focus();
    fireEvent.keyDown(tab1, { key: 'a' });
    expect(screen.getByRole('tab', { name: 'First Tab' })).toHaveFocus();
    expect(screen.getByText('Content 1')).toBeInTheDocument();
  });
});
