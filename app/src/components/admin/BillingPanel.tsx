import React from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

const PLANS = [
  { name: 'Free', price: '$0', period: '/mo', features: ['100 orders/mo', '1 GB storage', '2 POS users', 'Basic reports', 'Email support'], limits: { orders: 100, storage: '1 GB', posUsers: 2 } },
  { name: 'Starter', price: '$49', period: '/mo', features: ['2,000 orders/mo', '10 GB storage', '5 POS users', 'Advanced analytics', 'Priority support'], limits: { orders: 2000, storage: '10 GB', posUsers: 5 } },
  { name: 'Pro', price: '$149', period: '/mo', features: ['Unlimited orders', '100 GB storage', '20 POS users', 'Custom branding', 'API access', 'Dedicated support'], limits: { orders: Infinity, storage: '100 GB', posUsers: 20 } },
  { name: 'Enterprise', price: 'Custom', period: '', features: ['Everything in Pro', 'Unlimited storage', 'Unlimited POS users', 'SSO / SAML', 'SLA guarantee', 'On-site setup'], limits: { orders: Infinity, storage: 'Unlimited', posUsers: Infinity } },
];

const USAGE = {
  currentPlan: 'Starter',
  ordersUsed: 847,
  ordersLimit: 2000,
  storageUsed: 3.2,
  storageLimit: 10,
  posUsersUsed: 3,
  posUsersLimit: 5,
};

function UsageBar({ label, used, limit, unit = '' }: { label: string; used: number; limit: number; unit?: string }) {
  const pct = limit === Infinity ? 0 : Math.min((used / limit) * 100, 100);
  const color = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-500">
          {limit === Infinity ? `${used.toLocaleString()}${unit} (unlimited)` : `${used.toLocaleString()}${unit} / ${limit.toLocaleString()}${unit}`}
        </span>
      </div>
      {limit !== Infinity && (
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function BillingPanel() {
  return (
    <div data-testid="billing-panel">
      <h2 className="text-xl font-bold text-gray-800 mb-1">Billing & Plans</h2>
      <p className="text-sm text-gray-500 mb-6">Manage your subscription and usage.</p>

      {/* Current Plan */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-bold text-gray-800">Current Plan</h3>
        </CardHeader>
        <div className="px-6 pb-4">
          <div className="flex items-center gap-4">
            <div className="bg-brand-50 border border-brand-200 rounded-lg px-4 py-2">
              <span className="text-lg font-bold text-brand-700">{USAGE.currentPlan}</span>
              <span className="text-sm text-brand-600 ml-2">$49/mo</span>
            </div>
            <div className="text-sm text-gray-500">Next billing date: <span className="font-medium text-gray-700">Sept 1, 2026</span></div>
          </div>
        </div>
      </Card>

      {/* Usage Meters */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-bold text-gray-800">Usage This Month</h3>
        </CardHeader>
        <div className="px-6 pb-4 space-y-4">
          <UsageBar label="Orders" used={USAGE.ordersUsed} limit={USAGE.ordersLimit} />
          <UsageBar label="Storage" used={USAGE.storageUsed} limit={USAGE.storageLimit} unit=" GB" />
          <UsageBar label="POS Users" used={USAGE.posUsersUsed} limit={USAGE.posUsersLimit} />
        </div>
      </Card>

      {/* Plan Comparison */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-bold text-gray-800">Compare Plans</h3>
        </CardHeader>
        <div className="px-6 pb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 pr-4 font-semibold text-gray-700">Feature</th>
                {PLANS.map((plan) => (
                  <th key={plan.name} className={`text-center py-3 px-3 font-semibold ${plan.name === USAGE.currentPlan ? 'text-brand-700' : 'text-gray-700'}`}>
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2.5 pr-4 text-gray-600">Price</td>
                {PLANS.map((plan) => (
                  <td key={plan.name} className="text-center py-2.5 px-3 font-medium text-gray-800">
                    {plan.price}{plan.period}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2.5 pr-4 text-gray-600">Monthly Orders</td>
                {PLANS.map((plan) => (
                  <td key={plan.name} className="text-center py-2.5 px-3 text-gray-700">
                    {plan.limits.orders === Infinity ? 'Unlimited' : plan.limits.orders.toLocaleString()}
                  </td>
                ))}
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2.5 pr-4 text-gray-600">Storage</td>
                {PLANS.map((plan) => (
                  <td key={plan.name} className="text-center py-2.5 px-3 text-gray-700">{plan.limits.storage}</td>
                ))}
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2.5 pr-4 text-gray-600">POS Users</td>
                {PLANS.map((plan) => (
                  <td key={plan.name} className="text-center py-2.5 px-3 text-gray-700">
                    {plan.limits.posUsers === Infinity ? 'Unlimited' : plan.limits.posUsers}
                  </td>
                ))}
              </tr>
              {PLANS.map((plan, i) => {
                if (i !== 0) return null;
                const featureRows = plan.features.filter((_, fi) => PLANS.every((p) => p.features.includes(plan.features[fi])));
                return featureRows.length === 0 ? null : null;
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Contact CTA */}
      <div className="flex justify-end">
        <Button variant="success" size="lg">
          <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Contact Sales
        </Button>
      </div>
    </div>
  );
}
