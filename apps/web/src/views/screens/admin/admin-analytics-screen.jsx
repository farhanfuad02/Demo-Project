'use client';

/**
 * @file Platform analytics and the audit trail (FR-G5, NFR-13).
 *
 * @module views/screens/admin/admin-analytics-screen
 */

import { useEffect } from 'react';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Card, EmptyState, Money, PageHeader, Spinner, Stat } from '../../ui/primitives.jsx';

/**
 * Renders one audit entry's change column.
 *
 * A status move reads as `placed → accepted`; anything else falls back to its fields. An
 * entry with nothing to show — a sign-in, say — gets a dash rather than a literal `{}`,
 * which reads as a rendering fault rather than as "no change was recorded".
 *
 * @param {Record<string, unknown>} entry - Audit entry.
 * @returns {string} A human-readable summary of the change.
 */
function describeChange(entry) {
  const before = entry.oldValue ?? null;
  const after = entry.newValue ?? null;

  if (after?.status) {
    return before?.status ? `${before.status} → ${after.status}` : String(after.status);
  }
  const fields = Object.entries(after ?? {});
  if (fields.length === 0) {
    return '—';
  }
  return fields.map(([key, value]) => `${key}: ${value}`).join(', ');
}

/**
 * Platform-wide numbers, with the audit trail underneath them.
 *
 * The two belong on one screen because they answer the same question from two
 * directions: what is happening, and who did it.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function AdminAnalyticsScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.admin);

  useEffect(() => {
    void registry.admin.loadSummary();
    void registry.admin.loadAnalytics(7);
    void registry.admin.loadAuditLog();
  }, [registry]);

  const summary = /** @type {Record<string, number> | null} */ (state.summary);
  const analytics = /** @type {Record<string, any> | null} */ (state.analytics);
  const auditLog = /** @type {Array<Record<string, any>>} */ (state.auditLog);

  if (!summary || !analytics) {
    return (
      <div className="flex justify-center py-16">
        {state.error ? <Alert>{state.error}</Alert> : <Spinner label="Loading analytics…" />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Platform analytics" subtitle="Last 7 days, plus lifetime totals." />

      <Alert>{state.error}</Alert>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={summary.students} hint="Verified accounts" />
        <Stat
          label="Vendors"
          value={summary.vendors}
          hint={`${summary.pendingShops} awaiting approval`}
        />
        <Stat label="Active orders" value={summary.activeOrders} hint="In flight right now" />
        <Stat label="Delivered" value={summary.deliveredOrders} hint="All time" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Orders this week" value={analytics.orderCount} />
        <Stat
          label="Gross order value"
          value={<Money amount={analytics.grossOrderValue} />}
          hint="Food plus delivery"
        />
        <Stat
          label="Paid to riders"
          value={<Money amount={analytics.riderEarnings} />}
          hint="Delivery fees kept by partners"
        />
        <Stat
          label="Cancellation rate"
          value={`${analytics.cancellationRate}%`}
          hint={`Average delivery ${analytics.averageDeliveryMinutes} min`}
        />
      </div>

      <Card title="Orders per day">
        <ul className="space-y-2">
          {analytics.ordersByDay.map((entry) => {
            const peak = Math.max(...analytics.ordersByDay.map((day) => day.count), 1);
            return (
              <li key={entry.date} className="flex items-center gap-3 text-sm">
                <span className="text-ink-soft w-20 shrink-0">{entry.date.slice(5)}</span>
                <span className="bg-surface-soft h-3 flex-1 overflow-hidden rounded-full">
                  <span
                    className="bg-brand-500 block h-full rounded-full"
                    style={{ width: `${(entry.count / peak) * 100}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right font-medium">{entry.count}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Audit trail">
        {auditLog.length === 0 ? (
          <EmptyState title="Nothing recorded yet" />
        ) : (
          <div className="scroll-x">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-ink-soft text-xs tracking-wide uppercase">
                <tr>
                  <th className="pr-3 pb-2">When</th>
                  <th className="pr-3 pb-2">Entity</th>
                  <th className="pr-3 pb-2">Action</th>
                  <th className="pb-2">Change</th>
                </tr>
              </thead>
              <tbody className="divide-line divide-y">
                {auditLog.map((entry) => (
                  <tr key={entry.id}>
                    <td className="text-ink-soft py-2 pr-3">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2 pr-3">{entry.entityType}</td>
                    <td className="py-2 pr-3">{entry.action}</td>
                    <td className="text-ink-soft py-2">{describeChange(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
