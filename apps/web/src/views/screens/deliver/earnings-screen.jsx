'use client';

/**
 * @file Rider earnings and delivery history (FR-D7).
 *
 * @module views/screens/deliver/earnings-screen
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Card, EmptyState, Money, PageHeader, Spinner, Stat } from '../../ui/primitives.jsx';

/**
 * The earnings summary and recent deliveries.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function EarningsScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.deliver);

  useEffect(() => {
    void registry.deliver.loadEarnings();
  }, [registry]);

  const earnings = /** @type {Record<string, any> | null} */ (state.earnings);

  if (!earnings) {
    return (
      <div className="flex justify-center py-16">
        {state.error ? <Alert>{state.error}</Alert> : <Spinner label="Loading earnings…" />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Your earnings"
        subtitle="Under cash on delivery, the fee you collect is yours to keep."
        action={
          <Link href="/deliver" className="text-brand-600 text-sm hover:underline">
            ← Deliver
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Today"
          value={<Money amount={earnings.today.earnings} />}
          hint={`${earnings.today.count} deliveries`}
        />
        <Stat
          label="Last 7 days"
          value={<Money amount={earnings.week.earnings} />}
          hint={`${earnings.week.count} deliveries`}
        />
        <Stat
          label="All time"
          value={<Money amount={earnings.allTime.earnings} />}
          hint={`${earnings.allTime.count} deliveries`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat
          label="Your rating"
          value={earnings.riderRating > 0 ? earnings.riderRating.toFixed(1) : '—'}
          hint={`${earnings.riderRatingCount} ratings from students`}
        />
        <Stat
          label="Reliability"
          value={`${earnings.reliabilityScore}%`}
          hint="Releasing an accepted order costs points"
        />
      </div>

      <Card title="Recent deliveries">
        {earnings.history.length === 0 ? (
          <EmptyState
            title="No completed deliveries yet"
            hint="Accept an order from the deliver feed to get started."
          />
        ) : (
          <ul className="divide-line divide-y">
            {earnings.history.map((delivery) => (
              <li key={delivery.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-medium">{delivery.pickup?.shopName ?? 'Bot Tola'}</p>
                  <p className="text-ink-soft text-sm">
                    {delivery.dropOff?.hall}
                    {delivery.raw.deliveredAt
                      ? ` · ${new Date(delivery.raw.deliveredAt).toLocaleString()}`
                      : ''}
                  </p>
                </div>
                <span className="text-ok shrink-0 font-semibold">
                  +<Money amount={delivery.earning} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
