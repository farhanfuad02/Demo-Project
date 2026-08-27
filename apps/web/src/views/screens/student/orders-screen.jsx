'use client';

/**
 * @file Order history (FR-C8).
 *
 * @module views/screens/student/orders-screen
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
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

/**
 * One row of the history.
 *
 * @param {object} props - Component props.
 * @param {import('../../../models/order-model.js').OrderModel} props.order - Order to show.
 * @param {(orderId: string) => void} props.onReorder - Refills the cart from this order.
 * @param {boolean} props.busy - Whether an action is in flight.
 * @returns {import('react').ReactNode} The card.
 */
function OrderRow({ order, onReorder, busy }) {
  return (
    <Card className="mb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold">{order.reference}</p>
            <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
          </div>
          <p className="text-ink-soft mt-1 text-sm">
            {order.itemCount} item{order.itemCount === 1 ? '' : 's'} ·{' '}
            {order.placedAt?.toLocaleString() ?? ''}
          </p>
          <p className="text-ink-soft mt-1 text-sm">
            {order.items.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}
          </p>
        </div>
        <Money amount={order.total} bold />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href={`/orders/${order.id}`}
          className="border-line rounded-lg border px-3 py-1.5 text-sm font-medium"
        >
          {order.isFinal ? 'View' : 'Track'}
        </Link>
        <Button variant="ghost" busy={busy} onClick={() => onReorder(order.id)}>
          Reorder
        </Button>
      </div>
    </Card>
  );
}

/**
 * The student's order history, with one-tap reorder.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function OrdersScreen() {
  const registry = useRegistry();
  const router = useRouter();
  const state = useControllerState(registry.orders);

  useEffect(() => {
    void registry.orders.loadHistory();
  }, [registry]);

  /**
   * Refills the cart from a past order and goes to the cart to confirm today's prices.
   *
   * @param {string} orderId - Order to repeat.
   * @returns {Promise<void>} Resolves once the navigation is queued.
   */
  const reorder = async (orderId) => {
    const cart = await registry.orders.reorder(orderId);
    if (cart) {
      registry.cart.adopt(cart);
      router.push('/cart');
    }
  };

  const orders = /** @type {import('../../../models/order-model.js').OrderModel[]} */ (
    state.orders
  );

  return (
    <div>
      <PageHeader title="Your orders" subtitle="Everything you have ordered, newest first." />
      <Alert>{state.error}</Alert>

      {state.loading && orders.length === 0 ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading your orders…" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          title="No orders yet"
          hint="Your first order from Bot Tola will show up here."
          action={
            <Link
              href="/shops"
              className="bg-brand-600 rounded-lg px-4 py-2 text-sm font-semibold text-white"
            >
              Browse shops
            </Link>
          }
        />
      ) : (
        orders.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            busy={Boolean(state.loading)}
            onReorder={reorder}
          />
        ))
      )}
    </div>
  );
}
