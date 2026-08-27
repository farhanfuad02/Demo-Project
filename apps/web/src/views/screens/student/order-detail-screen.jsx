'use client';

/**
 * @file Live order tracking, cancellation, and rating (FR-E1, UC-03, FR-C9).
 *
 * @module views/screens/student/order-detail-screen
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RATING_TARGET } from '@hungry-ju/shared/enums';
import { useControllerState, useRegistry } from '../../providers/app-provider.jsx';
import { Alert, Badge, Button, Card, Modal, Money, Spinner } from '../../ui/primitives.jsx';
import { Field, Select, Textarea } from '../../ui/form.jsx';

/**
 * The status stepper (FR-E1).
 *
 * @param {object} props - Component props.
 * @param {import('../../../models/order-model.js').OrderModel} props.order - Order to draw.
 * @returns {import('react').ReactNode} The tracker.
 */
function StatusTracker({ order }) {
  if (order.stage === 0) {
    return (
      <Alert tone="failure">
        {order.statusLabel}
        {order.cancellationReason ? ` — ${order.cancellationReason}` : ''}
      </Alert>
    );
  }

  return (
    <ol className="space-y-3">
      {order.timeline().map((stage) => (
        <li key={stage.status} className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${stage.reached ? 'bg-brand-600 text-white' : 'border-line text-ink-soft border'}`}
            aria-hidden="true"
          >
            {stage.reached ? '✓' : ''}
          </span>
          <div>
            <p className={stage.reached ? 'font-medium' : 'text-ink-soft'}>{stage.label}</p>
            {stage.at ? (
              <p className="text-ink-soft text-xs">{new Date(stage.at).toLocaleTimeString()}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/**
 * The rating form shown after delivery (FR-C9, BR-08).
 *
 * @param {object} props - Component props.
 * @param {string} props.orderId - Order being rated.
 * @param {boolean} props.hasRider - Whether a delivery partner can be rated.
 * @returns {import('react').ReactNode} The form.
 */
function RatingForm({ orderId, hasRider }) {
  const registry = useRegistry();
  const state = useControllerState(registry.orders);
  const [targetType, setTargetType] = useState(RATING_TARGET.SHOP);
  const [stars, setStars] = useState('5');
  const [comment, setComment] = useState('');

  const alreadyRated = registry.orders.hasRated(targetType);
  const targets = [
    { value: RATING_TARGET.SHOP, label: 'The shop' },
    ...(hasRider ? [{ value: RATING_TARGET.RIDER, label: 'The delivery partner' }] : []),
  ];

  /**
   * Submits the rating.
   *
   * @param {import('react').FormEvent} event - Submit event.
   * @returns {Promise<void>} Resolves once stored.
   */
  const submit = async (event) => {
    event.preventDefault();
    const stored = await registry.orders.rate(orderId, {
      targetType,
      stars: Number(stars),
      comment: comment || undefined,
    });
    if (stored) {
      setComment('');
    }
  };

  return (
    <Card title="How did it go?">
      <form onSubmit={submit} noValidate>
        <Field label="Rate">
          {(id) => (
            <Select
              id={id}
              name="targetType"
              value={targetType}
              onChange={setTargetType}
              options={targets}
            />
          )}
        </Field>

        <Field label="Stars">
          {(id) => (
            <Select
              id={id}
              name="stars"
              value={stars}
              onChange={setStars}
              options={[5, 4, 3, 2, 1].map((value) => ({
                value: String(value),
                label: `${'★'.repeat(value)} (${value})`,
              }))}
            />
          )}
        </Field>

        <Field label="Comment" hint="Optional.">
          {(id) => (
            <Textarea id={id} name="comment" value={comment} onChange={setComment} rows={2} />
          )}
        </Field>

        {alreadyRated ? (
          <Alert tone="success">You have already rated this. Thanks.</Alert>
        ) : (
          <Button type="submit" busy={Boolean(state.loading)} full>
            Submit rating
          </Button>
        )}
      </form>
    </Card>
  );
}

/**
 * The tracking screen for one order.
 *
 * @param {object} props - Component props.
 * @param {string} props.orderId - Order to track.
 * @returns {import('react').ReactNode} The screen.
 */
export function OrderDetailScreen({ orderId }) {
  const registry = useRegistry();
  const state = useControllerState(registry.orders);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    registry.orders.startTracking(orderId);
    return () => registry.orders.stopTracking();
  }, [registry, orderId]);

  const order = /** @type {import('../../../models/order-model.js').OrderModel | null} */ (
    state.order
  );

  if (!order) {
    return (
      <div className="flex justify-center py-16">
        {state.error ? <Alert>{state.error}</Alert> : <Spinner label="Loading your order…" />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/orders" className="text-brand-600 text-sm hover:underline">
        ← All orders
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{order.reference}</h1>
          <Badge tone={order.statusTone}>{order.statusLabel}</Badge>
        </div>
        <p className="text-ink-soft mt-1 text-sm">
          {order.shop?.shopName ?? 'Bot Tola'} · {order.destination}
        </p>
      </header>

      <Alert>{state.error}</Alert>

      <Card title="Progress">
        <StatusTracker order={order} />
        {order.delivery?.riderUserId ? (
          <p className="bg-info-soft text-info mt-4 rounded-lg px-3 py-2 text-sm">
            A delivery partner has your order. Have your PIN ready when they arrive.
          </p>
        ) : null}
      </Card>

      <Card title="Items">
        <ul className="divide-line divide-y">
          {order.items.map((line) => (
            <li key={line.id} className="flex justify-between py-2 text-sm">
              <span>
                {line.quantity}× {line.itemName}
              </span>
              <Money amount={line.lineTotal} />
            </li>
          ))}
        </ul>
        <dl className="border-line mt-3 space-y-1.5 border-t pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-soft">Subtotal</dt>
            <dd>
              <Money amount={order.subtotal} />
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-soft">Delivery fee</dt>
            <dd>
              <Money amount={order.deliveryFee} />
            </dd>
          </div>
          <div className="flex justify-between text-base">
            <dt className="font-semibold">Total (cash on delivery)</dt>
            <dd>
              <Money amount={order.total} bold />
            </dd>
          </div>
        </dl>
        {order.note ? (
          <p className="text-ink-soft mt-3 text-sm">Your note: “{order.note}”</p>
        ) : null}
      </Card>

      {order.isCancellable ? (
        <Button variant="danger" onClick={() => setConfirming(true)}>
          Cancel this order
        </Button>
      ) : null}

      {order.isDelivered ? (
        <RatingForm orderId={order.id} hasRider={Boolean(order.delivery?.riderUserId)} />
      ) : null}

      <Modal
        open={confirming}
        title="Cancel this order?"
        onDismiss={() => setConfirming(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              busy={Boolean(state.loading)}
              onClick={async () => {
                await registry.orders.cancel(order.id);
                setConfirming(false);
              }}
            >
              Cancel order
            </Button>
          </>
        }
      >
        Cancelling is free before the vendor starts preparing. Once they begin cooking, the order
        can no longer be cancelled.
      </Modal>
    </div>
  );
}
