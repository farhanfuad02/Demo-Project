'use client';

/**
 * @file Deliver Mode: the open feed and the active delivery (Epic D).
 *
 * @module views/screens/deliver/deliver-screen
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useControllerState, useRegistry, useSession } from '../../providers/app-provider.jsx';
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
import { Input, Toggle } from '../../ui/form.jsx';

/**
 * One claimable job in the feed.
 *
 * The card leads with what a rider decides on — where to collect, where to take it, and
 * what it pays — because deciding takes a second and walking takes ten minutes.
 *
 * @param {object} props - Component props.
 * @param {import('../../../models/order-model.js').DeliveryModel} props.delivery - The job.
 * @param {boolean} props.busy - Whether a claim is in flight.
 * @param {(deliveryId: string) => void} props.onAccept - Claims the job.
 * @returns {import('react').ReactNode} The card.
 */
function FeedCard({ delivery, busy, onAccept }) {
  return (
    <Card className="mb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{delivery.pickup?.shopName ?? 'Bot Tola'}</p>
          <p className="text-ink-soft text-sm">Collect at {delivery.pickup?.location ?? '—'}</p>
          <p className="mt-2 text-sm">
            <span className="text-ink-soft">Drop off:</span> {delivery.dropOff?.hall},{' '}
            {delivery.dropOff?.room}
          </p>
          <p className="text-ink-soft text-sm">
            {delivery.order?.itemCount ?? 0} item
            {(delivery.order?.itemCount ?? 0) === 1 ? '' : 's'} · collect{' '}
            <Money amount={delivery.order?.total ?? 0} /> in cash
          </p>
        </div>
        <div className="text-right">
          <p className="text-ink-soft text-xs tracking-wide uppercase">You earn</p>
          <p className="text-ok text-xl font-bold">
            <Money amount={delivery.earning} />
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Button busy={busy} onClick={() => onAccept(delivery.id)} full>
          Accept this delivery
        </Button>
      </div>
    </Card>
  );
}

/**
 * The rider's current job, with its one next action.
 *
 * @param {object} props - Component props.
 * @param {import('../../../models/order-model.js').DeliveryModel} props.delivery - The job.
 * @returns {import('react').ReactNode} The panel.
 */
function ActiveDeliveryPanel({ delivery }) {
  const registry = useRegistry();
  const state = useControllerState(registry.deliver);
  const [pin, setPin] = useState('');
  const next = delivery.nextStep;

  return (
    <Card title="Your active delivery">
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-ink-soft">Collect from</dt>
          <dd className="font-medium">
            {delivery.pickup?.shopName} — {delivery.pickup?.location}
            {delivery.pickup?.phone ? (
              <a href={`tel:${delivery.pickup.phone}`} className="text-brand-600 ml-2 underline">
                call
              </a>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-ink-soft">Deliver to</dt>
          <dd className="font-medium">
            {delivery.customer?.fullName} — {delivery.dropOff?.hall}, {delivery.dropOff?.room}
            {delivery.customer?.phone ? (
              <a href={`tel:${delivery.customer.phone}`} className="text-brand-600 ml-2 underline">
                call
              </a>
            ) : null}
          </dd>
        </div>
        {delivery.dropOff?.note ? (
          <div>
            <dt className="text-ink-soft">Note</dt>
            <dd>“{delivery.dropOff.note}”</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-ink-soft">Collect in cash</dt>
          <dd className="font-semibold">
            <Money amount={delivery.order?.total ?? 0} /> — you keep{' '}
            <Money amount={delivery.earning} />
          </dd>
        </div>
      </dl>

      <Alert>{state.error}</Alert>

      <div className="mt-4 space-y-3">
        {next ? (
          <Button
            full
            busy={Boolean(state.loading)}
            onClick={() => registry.deliver.advance(delivery.id, next.status)}
          >
            {next.label}
          </Button>
        ) : null}

        {delivery.awaitsConfirmation ? (
          <form
            className="space-y-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const done = await registry.deliver.complete(delivery.id, pin);
              if (done) {
                setPin('');
              }
            }}
          >
            <p className="text-ink-soft text-sm">
              Ask the customer for their 4-digit PIN. It is the only way to close a delivery.
            </p>
            <Input
              id="confirm-pin"
              name="confirmPin"
              value={pin}
              onChange={setPin}
              placeholder="1234"
              inputMode="numeric"
            />
            <Button type="submit" full busy={Boolean(state.loading)}>
              Complete delivery
            </Button>
          </form>
        ) : null}

        {delivery.isReleasable ? (
          <Button variant="ghost" full onClick={() => registry.deliver.release(delivery.id)}>
            I cannot finish this — release it
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/**
 * The Deliver Mode screen.
 *
 * @returns {import('react').ReactNode} The screen.
 */
export function DeliverScreen() {
  const registry = useRegistry();
  const { user } = useSession();
  const state = useControllerState(registry.deliver);
  const sessionState = useControllerState(registry.session);

  const deliverModeOn = Boolean(user?.deliverModeOn);

  useEffect(() => {
    if (!deliverModeOn) {
      registry.deliver.stopFeed();
      return undefined;
    }
    void registry.deliver.loadActive();
    registry.deliver.startFeed();
    return () => registry.deliver.stopFeed();
  }, [registry, deliverModeOn]);

  const active = /** @type {import('../../../models/order-model.js').DeliveryModel | null} */ (
    state.active
  );
  const available = /** @type {import('../../../models/order-model.js').DeliveryModel[]} */ (
    state.available
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Deliver mode"
        subtitle="Pick up an order on your way and keep the delivery fee."
        action={
          <Link href="/deliver/earnings" className="text-brand-600 text-sm hover:underline">
            Earnings →
          </Link>
        }
      />

      <Card>
        <Toggle
          label={deliverModeOn ? 'You are online' : 'Go online to see deliveries'}
          hint="You can go offline once your current delivery is finished."
          checked={deliverModeOn}
          disabled={Boolean(sessionState.loading) || Boolean(active)}
          onChange={(enabled) => registry.session.setDeliverMode(enabled)}
        />
        <Alert>{sessionState.error}</Alert>
      </Card>

      {state.lostRace ? (
        <Alert
          tone="pending"
          action={
            <Button variant="ghost" onClick={() => registry.deliver.dismissLostRace()}>
              Dismiss
            </Button>
          }
        >
          {state.lostRace}
        </Alert>
      ) : null}

      {active ? <ActiveDeliveryPanel delivery={active} /> : null}

      {deliverModeOn && !active ? (
        <section>
          <h2 className="text-ink-soft mb-3 text-sm font-semibold tracking-wide uppercase">
            Available now
          </h2>
          <Alert>{state.error}</Alert>
          {state.loading && available.length === 0 ? (
            <div className="flex justify-center py-8">
              <Spinner label="Looking for orders…" />
            </div>
          ) : available.length === 0 ? (
            <EmptyState
              title="No orders waiting"
              hint="This list refreshes on its own. Lunchtime is busiest."
            />
          ) : (
            available.map((delivery) => (
              <FeedCard
                key={delivery.id}
                delivery={delivery}
                busy={Boolean(state.loading)}
                onAccept={(id) => registry.deliver.accept(id)}
              />
            ))
          )}
        </section>
      ) : null}

      {!deliverModeOn ? (
        <EmptyState
          title="You are offline"
          hint="Turn on deliver mode to see orders waiting for a partner."
        />
      ) : null}

      {active ? (
        <p className="text-ink-soft text-center text-xs">
          <Badge tone="progress">One delivery at a time</Badge>
        </p>
      ) : null}
    </div>
  );
}
