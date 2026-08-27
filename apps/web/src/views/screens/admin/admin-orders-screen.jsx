'use client';

/**
 * @file Live orders monitor and dispute tools (FR-G3).
 *
 * @module views/screens/admin/admin-orders-screen
 */

import { useEffect, useState } from 'react';
import { ORDER_STATUS } from '@hungry-ju/shared/enums';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Money,
  PageHeader,
  Spinner,
} from '../../ui/primitives.jsx';
import { Select } from '../../ui/form.jsx';

/**
 * The live orders monitor.
 *
 * Stuck orders are pulled to the top and flagged. An order nobody has collected for
 * twenty minutes is the failure mode risk R1 predicts, and an admin who has to compare
 * timestamps to find it will not find it in time.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function AdminOrdersScreen() {
  const registry = useRegistry();
  const state = useControllerState(registry.admin);
  const [status, setStatus] = useState('');

  useEffect(() => {
    void registry.admin.loadOrders({ status: status || undefined });
  }, [registry, status]);

  const orders = /** @type {import('../../../models/order-model.js').OrderModel[]} */ (
    state.orders
  );
  const sorted = [...orders].sort((left, right) => Number(right.isStuck) - Number(left.isStuck));

  return (
    <div>
      <PageHeader
        title="Live orders"
        subtitle="Everything in flight, with stuck orders first."
        action={
          <div className="w-44">
            <Select
              id="order-status"
              name="status"
              value={status}
              onChange={setStatus}
              options={[
                { value: '', label: 'All statuses' },
                ...Object.values(ORDER_STATUS).map((value) => ({ value, label: value })),
              ]}
            />
          </div>
        }
      />

      <Alert>{state.error}</Alert>

      {state.loading && orders.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading orders…" />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState title="No orders to show" />
      ) : (
        sorted.map((order) => (
          <Card key={order.id} className={`mb-3 ${order.isStuck ? 'border-bad' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  {order.reference}
                  <span className="ml-2">
                    <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
                  </span>
                  {order.isStuck ? (
                    <span className="ml-2">
                      <Badge tone="failure">Stuck</Badge>
                    </span>
                  ) : null}
                </p>
                <p className="text-ink-soft mt-1 text-sm">
                  {order.shop?.shopName ?? '—'} → {order.destination}
                </p>
                <p className="text-ink-soft text-sm">
                  {order.placedAt?.toLocaleString() ?? ''} ·{' '}
                  {order.delivery?.riderUserId ? 'rider assigned' : 'no rider yet'}
                </p>
              </div>
              <Money amount={order.total} bold />
            </div>

            {!order.isFinal ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  busy={Boolean(state.loading)}
                  onClick={() => registry.admin.resolveOrder(order.id, 'reassign')}
                >
                  Return to the delivery pool
                </Button>
                <Button
                  variant="danger"
                  busy={Boolean(state.loading)}
                  onClick={() =>
                    registry.admin.resolveOrder(
                      order.id,
                      'cancel',
                      'Cancelled by an admin after a dispute.'
                    )
                  }
                >
                  Force cancel
                </Button>
              </div>
            ) : null}
          </Card>
        ))
      )}
    </div>
  );
}
