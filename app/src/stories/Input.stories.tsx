import type { Meta, StoryObj } from '@storybook/react';
import { Input } from '@/components/ui/Input';

const meta: Meta<typeof Input> = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    disabled: { control: 'boolean' },
    error: { control: 'text' },
    helperText: { control: 'text' },
    label: { control: 'text' },
    type: { control: 'text' },
    placeholder: { control: 'text' },
  },
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: {
    placeholder: 'Enter text...',
  },
};

export const WithLabel: Story = {
  args: {
    label: 'Email Address',
    type: 'email',
    placeholder: 'you@example.com',
  },
};

export const WithError: Story = {
  args: {
    label: 'Password',
    type: 'password',
    error: 'Password must be at least 8 characters',
    placeholder: 'Enter password',
  },
};

export const WithHelperText: Story = {
  args: {
    label: 'Username',
    helperText: 'This will be your public display name',
    placeholder: 'johndoe',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Field',
    disabled: true,
    value: 'Cannot edit this',
  },
};

export const WithLeftIcon: Story = {
  render: () => (
    <Input
      label="Search"
      placeholder="Search..."
      leftIcon={
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      }
    />
  ),
};

export const WithBothIcons: Story = {
  render: () => (
    <Input
      label="Email"
      type="email"
      placeholder="you@example.com"
      leftIcon={
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
        </svg>
      }
      rightIcon={
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      }
    />
  ),
};
