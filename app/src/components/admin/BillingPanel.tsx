import React from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useTenantBillingQuery } from '@/hooks/useQueryHooks';

function UsageBar({ label, used, limit, unit = '' }: { label: string; used: number; limit: number; unit?: string }) {
  const isUnlimited = limit === 0 || limit === Infinity;
  const pct = isUnlimited ? 0 : Math.min((used / limit) * 100, 100);
  const color = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700 font-medium">{label}</span>
        <span className="text-gray-500">
          {isUnlimited ? `${used.toLocaleString()}${unit} (unlimited)` : `${used.toLocaleString()}${unit} / ${limit.toLocaleString()}${unit}`}
        </span>
      </div>
      {!isUnlimited && (
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function BillingSkeleton() {
  return (
    <div data-testid="billing-panel" className="animate-pulse space-y-4">
      <div>
        <div className="h-5 bg-gray-200 rounded w-40 mb-1" />
        <div className="h-3 bg-gray-100 rounded w-60" />
      </div>
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <div className="p-6 space-y-3">
            <div className="h-4 bg-gray-200 rounded w-32" />
            <div className="h-3 bg-gray-100 rounded w-full" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function BillingPanel() {
  const { data, isLoading, error } = useTenantBillingQuery();

  if (isLoading) return <BillingSkeleton />;

  if (error) {
    return (
      <div data-testid="billing-panel">
        <h2 className="text-xl font-bold text-gray-800 mb-1">Billing & Plans</h2>
        <p className="text-sm text-gray-500 mb-6">Manage your subscription and usage.</p>
        <Card>
          <div className="px-6 py-8 text-center">
            <p className="text-gray-500">Unable to load billing information. Please try again later.</p>
          </div>
        </Card>
      </div>
    );
  }

  const { subscription, usage, plans, billingHistory } = data!;
  const currentPlan = plans?.find((p) => p.name.toLowerCase() === subscription.plan) || plans?.[0];

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
              <span className="text-lg font-bold text-brand-700">{subscription.planLabel}</span>
              <span className="text-sm text-brand-600 ml-2">
                {subscription.price > 0 ? `$${subscription.price}/mo` : 'Free'}
              </span>
            </div>
            <div className="text-sm text-gray-500">
              Status: <span className={`font-medium ${subscription.status === 'active' ? 'text-green-700' : 'text-red-600'}`}>{subscription.status}</span>
            </div>
            {subscription.currentPeriodEnd && (
              <div className="text-sm text-gray-500">
                Next billing: <span className="font-medium text-gray-700">{new Date(subscription.currentPeriodEnd).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Usage Meters */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-bold text-gray-800">Usage This Month</h3>
        </CardHeader>
        <div className="px-6 pb-4 space-y-4">
          <UsageBar label="Bookings" used={usage.bookings} limit={usage.bookingsLimit} />
          <UsageBar label="POS Users" used={usage.posUsers} limit={usage.posUsersLimit} />
        </div>
      </Card>

      {/* Plan Comparison */}
      {plans && plans.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-base font-bold text-gray-800">Compare Plans</h3>
          </CardHeader>
          <div className="px-6 pb-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 pr-4 font-semibold text-gray-700">Feature</th>
                  {plans.map((plan) => (
                    <th key={plan.name} className={`text-center py-3 px-3 font-semibold ${plan.name.toLowerCase() === subscription.plan ? 'text-brand-700' : 'text-gray-700'}`}>
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 text-gray-600">Price</td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-2.5 px-3 font-medium text-gray-800">
                      {plan.price}{plan.period}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 text-gray-600">Monthly Bookings</td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-2.5 px-3 text-gray-700">
                      {plan.bookingsLimit ? plan.bookingsLimit.toLocaleString() : 'Unlimited'}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 text-gray-600">Storage</td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-2.5 px-3 text-gray-700">{plan.storageLimit}</td>
                  ))}
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="py-2.5 pr-4 text-gray-600">POS Users</td>
                  {plans.map((plan) => (
                    <td key={plan.name} className="text-center py-2.5 px-3 text-gray-700">
                      {plan.posUsersLimit ? plan.posUsersLimit : 'Unlimited'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Billing History */}
      {billingHistory && billingHistory.length > 0 && (
        <Card>
          <CardHeader>
            <h3 className="text-base font-bold text-gray-800">Billing History</h3>
          </CardHeader>
          <div className="px-6 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 font-semibold text-gray-700">Date</th>
                  <th className="text-left py-2 font-semibold text-gray-700">Description</th>
                  <th className="text-right py-2 font-semibold text-gray-700">Amount</th>
                  <th className="text-right py-2 font-semibold text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {billingHistory.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100">
                    <td className="py-2 text-gray-600">{new Date(entry.date).toLocaleDateString()}</td>
                    <td className="py-2 text-gray-700">{entry.description}</td>
                    <td className="py-2 text-right font-medium text-gray-800">${entry.amount}</td>
                    <td className={`py-2 text-right font-medium ${entry.status === 'active' ? 'text-green-700' : 'text-gray-500'}`}>{entry.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

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
