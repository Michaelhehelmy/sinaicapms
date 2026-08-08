import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabList, Tab, TabPanel } from '@/components/ui/Tabs';

const meta: Meta<typeof Tabs> = {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <TabList>
        <Tab value="overview" label="Overview" />
        <Tab value="details" label="Details" />
      </TabList>
      <TabPanel value="overview">
        <p className="text-gray-600">This is the overview content panel.</p>
      </TabPanel>
      <TabPanel value="details">
        <p className="text-gray-600">This is the details content panel.</p>
      </TabPanel>
    </Tabs>
  ),
};

export const WithFourTabs: Story = {
  render: () => (
    <Tabs defaultValue="general">
      <TabList>
        <Tab value="general" label="General" />
        <Tab value="security" label="Security" />
        <Tab value="notifications" label="Notifications" />
        <Tab value="billing" label="Billing" />
      </TabList>
      <TabPanel value="general">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">General Settings</h3>
          <p className="text-gray-600">Manage your general account settings and preferences.</p>
        </div>
      </TabPanel>
      <TabPanel value="security">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Security Settings</h3>
          <p className="text-gray-600">Configure your password, two-factor authentication, and session management.</p>
        </div>
      </TabPanel>
      <TabPanel value="notifications">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Notification Preferences</h3>
          <p className="text-gray-600">Choose how and when you want to be notified.</p>
        </div>
      </TabPanel>
      <TabPanel value="billing">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Billing Information</h3>
          <p className="text-gray-600">Manage your payment methods and view invoices.</p>
        </div>
      </TabPanel>
    </Tabs>
  ),
};

export const WithDisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="active">
      <TabList>
        <Tab value="active" label="Active" />
        <Tab value="disabled" label="Disabled" disabled />
        <Tab value="another" label="Another" />
      </TabList>
      <TabPanel value="active">
        <p className="text-gray-600">This tab is active and clickable.</p>
      </TabPanel>
      <TabPanel value="another">
        <p className="text-gray-600">This is another available tab.</p>
      </TabPanel>
    </Tabs>
  ),
};

export const Controlled: Story = {
  render: () => {
    const [value, setValue] = React.useState('tab1');
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">Current tab: <strong>{value}</strong></p>
        <Tabs value={value} onChange={setValue}>
          <TabList>
            <Tab value="tab1" label="Tab 1" />
            <Tab value="tab2" label="Tab 2" />
            <Tab value="tab3" label="Tab 3" />
          </TabList>
          <TabPanel value="tab1">
            <p className="text-gray-600">Content for Tab 1</p>
          </TabPanel>
          <TabPanel value="tab2">
            <p className="text-gray-600">Content for Tab 2</p>
          </TabPanel>
          <TabPanel value="tab3">
            <p className="text-gray-600">Content for Tab 3</p>
          </TabPanel>
        </Tabs>
      </div>
    );
  },
};

// Need to import React for the controlled story
import React from 'react';
