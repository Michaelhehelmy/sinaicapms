import type { Meta, StoryObj } from '@storybook/react';
import { StatCard } from '@/components/ui/StatCard';

const meta: Meta<typeof StatCard> = {
  title: 'UI/StatCard',
  component: StatCard,
  tags: ['autodocs'],
  argTypes: {
    color: {
      control: 'select',
      options: ['green', 'blue', 'yellow', 'red', 'purple'],
    },
  },
};

export default meta;
type Story = StoryObj<typeof StatCard>;

export const Green: Story = {
  args: {
    title: 'Total Revenue',
    value: '$45,231.89',
    color: 'green',
    trend: { value: 20.1, label: 'from last month' },
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
};

export const Blue: Story = {
  args: {
    title: 'Active Users',
    value: '2,350',
    color: 'blue',
    trend: { value: 12, label: 'from last week' },
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
};

export const Yellow: Story = {
  args: {
    title: 'Pending Reservations',
    value: '42',
    color: 'yellow',
    trend: { value: -5, label: 'from yesterday' },
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
};

export const WithoutTrend: Story = {
  args: {
    title: 'Total Camps',
    value: '156',
    color: 'green',
    icon: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
};

export const WithoutIcon: Story = {
  args: {
    title: 'Conversion Rate',
    value: '3.2%',
    color: 'blue',
    trend: { value: 1.5, label: 'from last month' },
  },
};

export const AllColors: Story = {
  render: () => (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <StatCard
        title="Green"
        value="$45k"
        color="green"
        trend={{ value: 10, label: 'up' }}
      />
      <StatCard
        title="Blue"
        value="2,350"
        color="blue"
        trend={{ value: 5, label: 'up' }}
      />
      <StatCard
        title="Yellow"
        value="42"
        color="yellow"
        trend={{ value: -3, label: 'down' }}
      />
      <StatCard
        title="Red"
        value="12"
        color="red"
        trend={{ value: -8, label: 'down' }}
      />
      <StatCard
        title="Purple"
        value="89%"
        color="purple"
        trend={{ value: 2, label: 'up' }}
      />
    </div>
  ),
};
