'use client';

/**
 * @file Vendor sales analytics (FR-B6).
 *
 * @module views/screens/vendor/vendor-analytics-screen
 */

import { useEffect, useState } from 'react';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Card, EmptyState, Money, PageHeader, Spinner, Stat } from '../../ui/primitives.jsx';
import { Select } from '../../ui/form.jsx';

/**
 * A bar chart drawn with plain elements.
 *
 * A charting library would add a large dependency to render a dozen bars, and this
 * scales with the container, works without JavaScript re-layout, and reads correctly to
 * a screen reader through the table-like labels beside it.
 *
 * @param {object} props - Component props.
 * @param {Array<{ label: string, value: number }>} props.data - Bars to draw.
 * @param {string} [props.emptyLabel] - Shown when every value is zero.
 * @returns {import('react').ReactNode} The chart.
 */
function BarChart({ data, emptyLabel = 'No activity in this period.' }) {
  const peak = Math.max(...data.map((entry) => entry.value), 0);
  if (peak === 0) {
    return <p className="text-ink-soft py-4 text-center text-sm">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2">
      {data.map((entry) => (
        <li key={entry.label} className="flex items-center gap-3 text-sm">
          <span className="text-ink-soft w-24 shrink-0">{entry.label}</span>
          <span className="bg-surface-soft h-3 flex-1 overflow-hidden rounded-full">
            <span
              className="bg-brand-500 block h-full rounded-full"
              style={{ width: `${(entry.value / peak) * 100}%` }}
            />
          </span>
          <span className="w-10 shrink-0 text-right font-medium">{entry.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The vendor analytics screen.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function VendorAnalyticsScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.vendor);
  const [days, setDays] = useState('7');

  useEffect(() => {
    void (async () => {
      const shop = await registry.vendor.loadShop();
      if (shop) {
        await registry.vendor.loadAnalytics(Number(days));
      }
    })();
  }, [registry, days]);

  const analytics = /** @type {Record<string, any> | null} */ (state.analytics);

  if (!state.loaded || (!analytics && state.loading)) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Crunching the numbers…" />
      </div>
    );
  }

  if (!analytics) {
    return <EmptyState title="No analytics yet" hint="They appear once you have orders." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        subtitle="Delivered orders only — cancelled ones never became money."
        action={
          <div className="w-40">
            <Select
              id="analytics-window"
              name="days"
              value={days}
              onChange={setDays}
              options={[
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: '90', label: 'Last 90 days' },
              ]}
            />
          </div>
        }
      />

      <Alert>{state.error}</Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Orders"
          value={analytics.orderCount}
          hint={`${analytics.deliveredCount} delivered`}
        />
        <Stat label="Revenue" value={<Money amount={analytics.revenue} />} hint="Food price only" />
        <Stat label="Average order" value={<Money amount={analytics.averageOrderValue} />} />
        <Stat
          label="Cancellation rate"
          value={`${analytics.cancellationRate}%`}
          hint={`${analytics.cancelledCount} cancelled or rejected`}
        />
      </div>

      <Card title="Orders per day">
        <BarChart
          data={analytics.ordersByDay.map((entry) => ({
            label: entry.date.slice(5),
            value: entry.count,
          }))}
        />
      </Card>

      <Card title="Busiest hours">
        <BarChart
          data={analytics.ordersByHour
            .filter((entry) => entry.count > 0)
            .map((entry) => ({ label: `${entry.hour}:00`, value: entry.count }))}
          emptyLabel="No orders in this period."
        />
      </Card>

      <Card title="Top dishes">
        {analytics.topItems.length === 0 ? (
          <p className="text-ink-soft py-4 text-center text-sm">Nothing sold yet.</p>
        ) : (
          <ul className="divide-line divide-y">
            {analytics.topItems.map((item) => (
              <li key={item.itemName} className="flex justify-between py-2 text-sm">
                <span>
                  {item.itemName}
                  <span className="text-ink-soft ml-2">×{item.quantity}</span>
                </span>
                <Money amount={item.revenue} bold />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
